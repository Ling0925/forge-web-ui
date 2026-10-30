import type {
  BrowserCommand,
  BrowserResponse,
} from "@forge/core/shared/plugins";
import {
  ArrowClockwise,
  ArrowsLeftRight,
  Camera,
  CheckCircle,
  CursorClick,
  Globe,
  Info,
  Keyboard,
  Lock,
  NavigationArrow,
  Scroll as ScrollIcon,
  TextAa,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  browserCommandMutatesPage,
  browserImageDataUrl,
  browserPanelAvailable,
  browserPermissionNotice,
  browserResultView,
  browserSnapshotRefs,
  executeBrowserCommand,
  readBrowserStatus,
  setBrowserTakeover,
} from "../../state/browser-session";
import { OperationScope } from "../../state/operation-scope";
import { Button } from "../primitives/Button";
import { Field } from "../primitives/Field";
import { Input } from "../primitives/Input";
import "./browser-panel.css";

type Permission = "readonly" | "workspace" | "unrestricted";
type ManualAction = "navigate" | "click" | "fill" | "press" | "scroll";

export function BrowserPanel({
  sessionId,
  permission,
  active,
}: {
  readonly sessionId: string | undefined;
  readonly permission: Permission | undefined;
  /** The owning subtab is visible. Status probes never run in the background. */
  readonly active: boolean;
}) {
  const [status, setStatus] = useState<BrowserResponse | undefined>(undefined);
  const [probing, setProbing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<
    | {
        readonly kind: "snapshot";
        readonly text: string;
        readonly refs: readonly string[];
        readonly fresh: boolean;
      }
    | {
        readonly kind: "text";
        readonly text: string;
        readonly isError: boolean;
      }
    | {
        readonly kind: "image";
        /** The session the frame came from; another session must never show it. */
        readonly sessionId: string;
        readonly dataUrl: string;
        readonly mimeType: string;
      }
    | undefined
  >(undefined);
  const [action, setAction] = useState<ManualAction>("navigate");
  const [url, setUrl] = useState("https://");
  const [selector, setSelector] = useState("");
  const [fillText, setFillText] = useState("");
  const [key, setKey] = useState("Enter");
  const [direction, setDirection] = useState<"up" | "down" | "left" | "right">(
    "down",
  );
  const scope = useRef(new OperationScope());
  const operationInFlight = useRef(false);
  const supported = browserPanelAvailable();

  useEffect(() => {
    scope.current = new OperationScope();
    return () => scope.current.close();
  }, []);

  /**
   * `status` is read-only metadata: it reports whether the agent's run has
   * opened a browser for this exact session. It never opens, installs or
   * navigates a browser, and it is only requested when this panel is visible
   * or when the user asks again — never on workbench load and never on a timer.
   */
  const probeStatus = useCallback(
    async (surface: boolean) => {
      // Reopening a hidden tab must not invalidate an in-flight action's completion.
      if (operationInFlight.current) return;
      if (!supported || !sessionId) {
        setStatus(undefined);
        return;
      }
      const valid = scope.current.begin();
      if (surface) setProbing(true);
      try {
        const response = await readBrowserStatus(sessionId);
        if (!valid()) return;
        // Discard a late probe that answers for a previously bound session.
        if (response.sessionId !== sessionId) return;
        setStatus(response);
        if (surface) setError("");
      } catch (err) {
        if (!valid()) return;
        setStatus(undefined);
        if (surface)
          setError(err instanceof Error ? err.message : "无法读取浏览器状态。");
      } finally {
        if (surface && valid()) setProbing(false);
      }
    },
    [sessionId, supported],
  );

  // Re-binding to another session must never keep the previous session's frame,
  // snapshot, takeover banner or in-flight busy flag on screen, even if a caller
  // omits the key. Clearing `busy` is required: the abandoned operation will
  // intentionally skip its own `setBusy(false)` once the scope is stale.
  const boundSession = useRef(sessionId);
  useEffect(() => {
    if (boundSession.current === sessionId) return;
    boundSession.current = sessionId;
    scope.current.close();
    scope.current = new OperationScope();
    operationInFlight.current = false;
    setBusy(false);
    setProbing(false);
    setStatus(undefined);
    setView(undefined);
    setNotice("");
    setError("");
    setSelector("");
    setFillText("");
  }, [sessionId]);

  // Reset the session generation before starting its visible metadata probe.
  useEffect(() => {
    if (active) void probeStatus(true);
  }, [active, probeStatus]);

  const run = async (
    operation: (valid: () => boolean) => Promise<void>,
    surfaceError = true,
  ) => {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    const valid = scope.current.begin();
    setProbing(false);
    setBusy(true);
    if (surfaceError) setError("");
    setNotice("");
    try {
      await operation(valid);
    } catch (err) {
      if (valid() && surfaceError)
        setError(err instanceof Error ? err.message : "浏览器操作失败。");
    } finally {
      if (valid()) {
        operationInFlight.current = false;
        setBusy(false);
      }
    }
  };

  const ownsStatus = status?.sessionId === sessionId;
  const unavailable = !ownsStatus || !status?.available;
  const takeover = ownsStatus && status?.takeover === true;
  // Defence in depth: only a frame recorded for the bound session may render.
  const sessionImage =
    view?.kind === "image" && view.sessionId === sessionId ? view : undefined;

  const changeTakeover = (enabled: boolean) =>
    run(async (valid) => {
      if (!sessionId) return;
      const response = await setBrowserTakeover(sessionId, enabled);
      if (!valid()) return;
      if (response.sessionId !== sessionId) return;
      setStatus(response);
      setNotice(
        enabled
          ? "已请求接管。Core 会串行化并等待当前动作释放；接管期间 Agent 的页面动作会等待，或在权限下降时被拒绝。"
          : "已归还控制权。Agent 可以继续；它必须重新获取 snapshot，旧 refs 不会被沿用。",
      );
    });

  /** Explicit user click only; this is a single frame, not a live stream. */
  const refreshScreenshot = () =>
    run(async (valid) => {
      if (!sessionId) return;
      const response = await executeBrowserCommand(sessionId, {
        action: "screenshot",
      });
      if (!valid()) return;
      // Discard a response for a session this panel is no longer bound to.
      if (response.sessionId !== sessionId) return;
      setStatus(response);
      const result = browserResultView(response);
      const dataUrl = result?.image
        ? browserImageDataUrl(result.image)
        : undefined;
      if (!dataUrl || !result?.image) {
        setView({
          kind: "text",
          text: result?.text || "Core 未返回可渲染的截图图像。",
          isError: true,
        });
        return;
      }
      setView({
        kind: "image",
        sessionId,
        dataUrl,
        mimeType: result.image.mimeType,
      });
      setNotice(
        result.isError
          ? "截图返回了错误标记；预览可能是旧画面，请检查页面状态。"
          : "已刷新截图。这是点击时的单帧快照，不是实时视频。",
      );
    });

  const manualCommand = (): BrowserCommand | undefined => {
    switch (action) {
      case "navigate":
        return url.trim() ? { action: "navigate", url: url.trim() } : undefined;
      case "click":
        return selector.trim()
          ? { action: "click", selector: selector.trim() }
          : undefined;
      case "fill":
        return selector.trim()
          ? { action: "fill", selector: selector.trim(), text: fillText }
          : undefined;
      case "press":
        return key.trim() ? { action: "press", key: key.trim() } : undefined;
      case "scroll":
        return { action: "scroll", direction, pixels: 500 };
      default:
        return undefined;
    }
  };

  const execute = (next: BrowserCommand) =>
    run(async (valid) => {
      if (!sessionId) return;
      const response = await executeBrowserCommand(sessionId, next);
      if (!valid()) return;
      if (response.sessionId !== sessionId) return;
      setStatus(response);
      const result = browserResultView(response);
      if (!result || result.isError) {
        setView({
          kind: "text",
          text: result?.text || "Core 未返回操作结果。",
          isError: true,
        });
        setNotice("Core 报告操作失败；未自动重试，请检查当前页面状态。");
        return;
      }
      if (next.action === "snapshot") {
        const text = result?.text ?? "";
        setView({
          kind: "snapshot",
          text,
          refs: browserSnapshotRefs(text),
          fresh: true,
        });
        setNotice("已读取最新页面快照；其文本与 refs 只用于辅助输入。");
        return;
      }
      if (result)
        setView({ kind: "text", text: result.text, isError: result.isError });
      // A page mutation invalidates both old @refs and the last screenshot.
      if (browserCommandMutatesPage(next))
        setView((current) =>
          current?.kind === "snapshot" ? { ...current, fresh: false } : current,
        );
      setNotice(
        "动作已由 Core 串行执行。页面内容是不可信数据，请刷新快照后再交互。",
      );
    });

  if (!supported) {
    return (
      <section className="browser-panel" aria-label="浏览器预览与接管">
        <output className="browser-gate">
          <Info size={14} weight="bold" aria-hidden="true" />
          <span>
            当前宿主未提供浏览器 RPC。浏览器状态由 Core
            持有；只有连接支持该接口的 Core 时才能预览或接管。
          </span>
        </output>
      </section>
    );
  }

  return (
    <section className="browser-panel" aria-label="浏览器预览与接管">
      <div className="browser-overview-card">
        <div className="browser-panel-head">
          <div className="browser-title">
            <span className="browser-title-icon" aria-hidden="true">
              <Globe size={15} weight="duotone" />
            </span>
            <div className="browser-title-main">
              <span className="browser-title-text">会话浏览器</span>
              <span
                className={`browser-state ${takeover ? "is-takeover" : unavailable ? "is-idle" : "is-available"}`}
              >
                <span className="browser-state-dot" aria-hidden="true" />
                {takeover
                  ? "人工接管中"
                  : unavailable
                    ? "未可用"
                    : "会话浏览器可用"}
              </span>
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={<ArrowClockwise size={13} />}
            loading={probing}
            disabled={busy || !sessionId}
            onClick={() => void probeStatus(true)}
            title="只读查询本会话的浏览器元数据，不会启动浏览器"
          >
            查询状态
          </Button>
        </div>

        {!unavailable && (
          <div
            className={`browser-takeover-row${takeover ? " is-takeover" : ""}`}
          >
            <div className="browser-takeover-copy">
              <strong>
                {takeover ? "你正在操作页面" : "Agent 持有控制权"}
              </strong>
              <p className="browser-hint">
                {takeover
                  ? "接管期间 Agent 页面动作会等待；归还后 Agent 需重新读取 snapshot。"
                  : "截图预览无需接管；人工导航、快照、点击、填入、按键与滚动需先显式接管。"}
              </p>
            </div>
            <Button
              size="sm"
              variant={takeover ? "primary" : "secondary"}
              icon={<ArrowsLeftRight size={13} />}
              disabled={busy || !sessionId}
              onClick={() => void changeTakeover(!takeover)}
            >
              {takeover ? "归还控制权" : "显式接管"}
            </Button>
          </div>
        )}

        <p className="browser-permission">
          <Lock size={13} weight="bold" aria-hidden="true" />
          <span>{browserPermissionNotice(permission)}</span>
        </p>
      </div>

      {error && (
        <p className="form-error" role="alert">
          <WarningCircle size={14} weight="bold" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {notice && (
        <output className="browser-status-line">
          <CheckCircle size={14} weight="bold" aria-hidden="true" />
          <span>{notice}</span>
        </output>
      )}
      {!probing && unavailable && (
        <output className="browser-gate">
          <Info size={14} weight="bold" aria-hidden="true" />
          <div>
            <strong>本会话当前没有活动浏览器</strong>
            <span>
              只有 Agent
              在当前运行中首次调用浏览器工具后才会开启，运行结束或取消时自动关闭；此面板不会替你启动或安装浏览器。
            </span>
          </div>
        </output>
      )}

      {!unavailable && (
        <>
          <div className="browser-preview">
            <div className="browser-preview-head">
              <div className="browser-card-title">
                <Camera size={14} weight="bold" aria-hidden="true" />
                <span>画面快照预览</span>
                <span className="browser-card-badge">单帧快照</span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                icon={<Camera size={13} />}
                disabled={busy || !sessionId}
                onClick={() => void refreshScreenshot()}
              >
                刷新截图
              </Button>
            </div>
            {sessionImage ? (
              <figure className="browser-shot">
                <div className="browser-shot-stage">
                  <img
                    src={sessionImage.dataUrl}
                    alt="当前浏览器页面截图"
                    data-mime-type={sessionImage.mimeType}
                  />
                </div>
                <figcaption>
                  <span>截图时间点画面</span>
                  <code>{sessionImage.mimeType}</code>
                  <span>点击刷新时单帧抓取，不随页面实时更新</span>
                </figcaption>
              </figure>
            ) : (
              <output className="browser-shot-empty">
                尚未刷新截图。点击右上角「刷新截图」获取当前单帧画面，或在消息流中查看
                Agent 的 browser_screenshot 附件。
              </output>
            )}
          </div>

          <div className="browser-manual">
            <div className="browser-preview-head">
              <div className="browser-card-title">
                <CursorClick size={14} weight="bold" aria-hidden="true" />
                <span>人工操作</span>
              </div>
              <span
                className={`browser-card-badge${takeover ? " is-active" : ""}`}
              >
                {takeover ? "已接管 · 串行执行" : "需要先显式接管"}
              </span>
            </div>
            <p className="browser-hint">
              通过 Core 契约串行执行动作；不注入插件脚本，快照按纯文本展示。
            </p>
            <fieldset className="browser-action-tabs" aria-label="人工动作">
              {(
                [
                  ["navigate", "导航", NavigationArrow],
                  ["click", "点击", CursorClick],
                  ["fill", "填入", TextAa],
                  ["press", "按键", Keyboard],
                  ["scroll", "滚动", ScrollIcon],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  className={`browser-action-tab${action === id ? " is-active" : ""}`}
                  aria-pressed={action === id}
                  onClick={() => setAction(id)}
                >
                  <Icon size={12} weight="bold" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </fieldset>
            <div className="browser-action-fields">
              {action === "navigate" && (
                <Field
                  id="browser-navigate-url"
                  label="URL（必须匹配 allowedDomains）"
                >
                  <Input
                    id="browser-navigate-url"
                    value={url}
                    isMono
                    disabled={!takeover || busy}
                    onChange={(event) => setUrl(event.target.value)}
                  />
                </Field>
              )}
              {(action === "click" || action === "fill") && (
                <Field
                  id="browser-selector"
                  label="选择器或 snapshot ref"
                  helper="优先使用刚读取的 ref；页面变化后旧 ref 可能失效。"
                >
                  <Input
                    id="browser-selector"
                    value={selector}
                    isMono
                    disabled={!takeover || busy}
                    placeholder="@e12 或 button[type=submit]"
                    onChange={(event) => setSelector(event.target.value)}
                  />
                </Field>
              )}
              {action === "fill" && (
                <Field id="browser-fill-text" label="填入文本">
                  <Input
                    id="browser-fill-text"
                    value={fillText}
                    disabled={!takeover || busy}
                    onChange={(event) => setFillText(event.target.value)}
                  />
                </Field>
              )}
              {action === "press" && (
                <Field id="browser-press-key" label="按键">
                  <Input
                    id="browser-press-key"
                    value={key}
                    disabled={!takeover || busy}
                    onChange={(event) => setKey(event.target.value)}
                  />
                </Field>
              )}
              {action === "scroll" && (
                <Field id="browser-scroll-direction" label="方向">
                  <div
                    id="browser-scroll-direction"
                    className="browser-direction-group"
                    role="radiogroup"
                    aria-label="方向"
                  >
                    {(
                      [
                        ["down", "向下"],
                        ["up", "向上"],
                        ["left", "向左"],
                        ["right", "向右"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={direction === value}
                        className={`browser-direction-pill${direction === value ? " is-active" : ""}`}
                        disabled={!takeover || busy}
                        onClick={() => setDirection(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              <div className="browser-action-buttons">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!takeover || busy || !manualCommand()}
                  onClick={() => {
                    const next = manualCommand();
                    if (next) void execute(next);
                  }}
                >
                  执行人工动作
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!takeover || busy}
                  onClick={() => void execute({ action: "snapshot" })}
                >
                  读取页面快照
                </Button>
              </div>
            </div>
          </div>

          {view?.kind === "snapshot" && (
            <div className="browser-snapshot">
              <div className="browser-preview-head">
                <div className="browser-card-title">
                  <span>页面快照（纯文本）</span>
                </div>
                <span
                  className={`browser-card-badge${view.fresh ? " is-ready" : ""}`}
                >
                  {view.fresh
                    ? "最新快照"
                    : "页面已变化：请重新读取快照，避免使用旧 ref"}
                </span>
              </div>
              {view.refs.length > 0 && (
                <div className="browser-refs">
                  <span className="browser-refs-label">可用 refs：</span>
                  {view.refs.map((ref) => (
                    <button
                      key={ref}
                      type="button"
                      className="browser-ref"
                      disabled={!takeover || busy}
                      onClick={() => {
                        setAction("click");
                        setSelector(ref);
                      }}
                    >
                      {ref}
                    </button>
                  ))}
                </div>
              )}
              <pre className="browser-snapshot-text">
                {view.text || "快照为空。"}
              </pre>
            </div>
          )}

          {view?.kind === "text" && (
            <pre
              className={`browser-result-text${view.isError ? " is-error" : ""}`}
            >
              {view.text || "Core 未返回文本。"}
            </pre>
          )}
        </>
      )}
    </section>
  );
}
