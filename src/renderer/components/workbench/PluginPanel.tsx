import type { PluginHealth, PluginRecord } from "@forge/core/shared/plugins";
import {
  ArrowClockwise,
  CheckCircle,
  Globe,
  Info,
  Lock,
  ShieldCheck,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { OperationScope } from "../../state/operation-scope";
import {
  type PluginConfigDraft,
  browserConfigDraft,
  browserConfigFromDraft,
  checkPlugin,
  configDraftDirty,
  configSchemaProperties,
  configurePlugin,
  listPlugins,
  pluginCapabilityLabel,
  pluginManagementAvailable,
  pluginStatusLabel,
} from "../../state/plugins";
import { Button } from "../primitives/Button";
import { Field } from "../primitives/Field";
import { Input } from "../primitives/Input";
import "./plugin-panel.css";

const BROWSER_PLUGIN_ID = "browser";

interface HealthView {
  readonly state: "idle" | "checking" | "done";
  readonly health?: PluginHealth;
  readonly error?: string;
}

function HealthLine({ view }: { readonly view: HealthView | undefined }) {
  if (!view || view.state === "idle") return null;
  if (view.state === "checking")
    return (
      <output className="plugin-health is-pending">正在显式检查依赖…</output>
    );
  if (view.error)
    return (
      <p className="plugin-health is-error" role="alert">
        <WarningCircle size={13} weight="bold" aria-hidden="true" />
        检查失败：{view.error}
      </p>
    );
  const health = view.health;
  if (!health) return null;
  return (
    <output
      className={`plugin-health ${health.status === "ready" ? "is-ready" : "is-error"}`}
    >
      {health.status === "ready" ? (
        <CheckCircle size={13} weight="bold" aria-hidden="true" />
      ) : (
        <WarningCircle size={13} weight="bold" aria-hidden="true" />
      )}
      <span>
        {health.status === "ready" ? "依赖检查通过" : "依赖不可用"} ·{" "}
        {health.message}
      </span>
    </output>
  );
}

function BrowserConfigEditor({
  draft,
  error,
  disabled,
  onChange,
}: {
  readonly draft: PluginConfigDraft;
  readonly error: string;
  readonly disabled: boolean;
  readonly onChange: (value: PluginConfigDraft) => void;
}) {
  return (
    <div className="plugin-config">
      <Field
        id="plugin-browser-executable"
        label="agent-browser 可执行路径"
        helper="Core 用它在隔离会话里启动 agent-browser。留空使用默认 agent-browser；不会自动安装。"
      >
        <Input
          id="plugin-browser-executable"
          isMono
          value={draft.executablePath}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, executablePath: event.target.value })
          }
        />
      </Field>
      <Field
        id="plugin-browser-chrome"
        label="Chrome/Chromium 可执行路径（可选）"
        helper="留空使用主机默认浏览器安装；不会自动下载或安装浏览器。"
      >
        <Input
          id="plugin-browser-chrome"
          isMono
          placeholder="/usr/bin/google-chrome-stable"
          value={draft.browserExecutablePath}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, browserExecutablePath: event.target.value })
          }
        />
      </Field>
      <Field
        id="plugin-browser-domains"
        label="允许访问的主机名"
        helper="每行一个主机名，可写 *.example.com 子域通配；不是 origin，不接受协议、路径或凭据。空列表不能启用。"
      >
        <textarea
          id="plugin-browser-domains"
          className="form-textarea form-input-mono plugin-domain-input"
          rows={4}
          placeholder={"example.com\n*.trusted.example"}
          value={draft.allowedDomains}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, allowedDomains: event.target.value })
          }
        />
      </Field>
      {error && (
        <p className="form-error" role="alert">
          <WarningCircle size={14} weight="bold" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export function PluginPanel() {
  const [plugins, setPlugins] = useState<readonly PluginRecord[]>([]);
  const [drafts, setDrafts] = useState<
    Readonly<Record<string, PluginConfigDraft>>
  >({});
  const [draftErrors, setDraftErrors] = useState<
    Readonly<Record<string, string>>
  >({});
  const [health, setHealth] = useState<Readonly<Record<string, HealthView>>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const scope = useRef(new OperationScope());
  const available = pluginManagementAvailable();

  const adopt = useCallback((records: readonly PluginRecord[]) => {
    setPlugins(records);
    setDrafts((old) => {
      const next: Record<string, PluginConfigDraft> = {};
      for (const record of records) {
        const id = record.manifest.id;
        const previous = old[id];
        next[id] =
          previous && configDraftDirty(previous, record.config)
            ? previous
            : browserConfigDraft(record.config).draft;
      }
      return next;
    });
    setDraftErrors((old) => {
      const next: Record<string, string> = {};
      for (const record of records) {
        const current = old[record.manifest.id];
        if (current) next[record.manifest.id] = current;
      }
      return next;
    });
  }, []);

  const load = useCallback(
    async (valid: () => boolean = () => true) => {
      if (!available) {
        setLoading(false);
        setError(
          "当前连接的 Core 尚未提供插件 RPC。插件管理只在已连接且已更新 Core 的客户端可用。",
        );
        return;
      }
      try {
        const records = await listPlugins();
        if (!valid()) return;
        adopt(records);
        setError("");
      } catch (err) {
        if (valid())
          setError(err instanceof Error ? err.message : "读取插件失败。");
      } finally {
        if (valid()) setLoading(false);
      }
    },
    [adopt, available],
  );

  useEffect(() => {
    scope.current = new OperationScope();
    const valid = scope.current.begin();
    void load(valid);
    return () => {
      scope.current.close();
    };
  }, [load]);

  const action = async (
    id: string,
    operation: (valid: () => boolean) => Promise<void>,
  ) => {
    const valid = scope.current.begin();
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      await operation(valid);
    } catch (err) {
      if (valid())
        setError(err instanceof Error ? err.message : "插件操作失败。");
    } finally {
      if (valid()) setBusyId("");
    }
  };

  /** Explicit user action only: page mount and saves never probe dependencies. */
  const runCheck = (record: PluginRecord) =>
    action(record.manifest.id, async (valid) => {
      const id = record.manifest.id;
      setHealth((old) => ({ ...old, [id]: { state: "checking" } }));
      try {
        const result = await checkPlugin(id);
        if (!valid()) return;
        setHealth((old) => ({
          ...old,
          [id]: { state: "done", health: result },
        }));
      } catch (err) {
        if (!valid()) return;
        setHealth((old) => ({
          ...old,
          [id]: {
            state: "done",
            error: err instanceof Error ? err.message : "检查失败。",
          },
        }));
      }
    });

  const save = (record: PluginRecord) =>
    action(record.manifest.id, async (valid) => {
      const id = record.manifest.id;
      const draft = drafts[id];
      if (!draft) return;
      const parsed = browserConfigFromDraft(draft);
      if (parsed.error) {
        setDraftErrors((old) => ({ ...old, [id]: parsed.error }));
        setNotice("");
        return;
      }
      setDraftErrors((old) => ({ ...old, [id]: "" }));
      const next = await configurePlugin({
        pluginId: id,
        config: parsed.config,
      });
      if (!valid()) return;
      adopt([...plugins.filter((item) => item.manifest.id !== id), next]);
      // A saved configuration is not a successful dependency check.
      setHealth((old) => ({ ...old, [id]: { state: "idle" } }));
      setNotice(
        "浏览器插件配置已保存。status=configured 只表示配置已持久化，不代表依赖可用。",
      );
    });

  const toggle = (record: PluginRecord) =>
    action(record.manifest.id, async (valid) => {
      const id = record.manifest.id;
      const next = await configurePlugin({
        pluginId: id,
        enabled: !record.enabled,
      });
      if (!valid()) return;
      adopt([...plugins.filter((item) => item.manifest.id !== id), next]);
      setHealth((old) => ({ ...old, [id]: { state: "idle" } }));
      setNotice(
        next.enabled
          ? "插件已启用。启用不启动浏览器，也不绕过审批；下一次运行时才会创建隔离会话。"
          : "插件已禁用，新运行不会再注册它的工具。已启动的运行由 Core 按配置变更处理。",
      );
    });

  if (!available) {
    return (
      <section className="plugin-panel" aria-label="插件管理">
        <output className="plugin-gate">
          <Info size={14} weight="bold" aria-hidden="true" />
          <span>
            当前客户端连接的 Core 未提供插件管理接口。插件状态由 Core
            持有，只有已连接并已更新 Core 的 Web 客户端才能读取和修改。
          </span>
        </output>
      </section>
    );
  }

  return (
    <section className="plugin-panel" aria-label="插件管理">
      {error && (
        <p role="alert" className="form-error">
          <WarningCircle size={14} weight="bold" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {notice && <output className="plugin-notice">{notice}</output>}
      <div className="plugin-panel-head">
        <div>
          <h3>插件</h3>
          <p className="wb-muted">
            插件由 Core 注册并持有状态；这里只展示 Core
            返回的清单和配置。启用能力不等于授予权限，运行仍按会话权限与审批执行。
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={<ArrowClockwise size={13} />}
          disabled={loading || Boolean(busyId)}
          onClick={() =>
            void action("", async (valid) => {
              await load(valid);
            })
          }
        >
          重新读取
        </Button>
      </div>
      {loading && !plugins.length && (
        <output className="plugin-gate">正在读取插件清单…</output>
      )}
      {!loading && !plugins.length && !error && (
        <p className="plugin-gate">Core 未注册任何插件。</p>
      )}
      {plugins.map((record) => {
        const id = record.manifest.id;
        const busy = busyId === id;
        const isBrowser = id === BROWSER_PLUGIN_ID;
        const draft = drafts[id];
        const draftError = draftErrors[id] ?? "";
        const dirty = draft ? configDraftDirty(draft, record.config) : false;
        const healthView = health[id];
        const schema = configSchemaProperties(record.manifest.configSchema);
        return (
          <article
            key={id}
            className={`plugin-card${record.enabled ? " is-enabled" : ""}`}
            aria-label={`插件 ${record.manifest.name}`}
          >
            <div className="plugin-card-head">
              <div className="plugin-title">
                <Globe size={18} weight="duotone" aria-hidden="true" />
                <div>
                  <strong>{record.manifest.name}</strong>
                  <p className="plugin-meta">
                    <code>{id}</code> · v{record.manifest.version} · API v
                    {record.manifest.apiVersion}
                    {record.manifest.builtin ? " · 内置" : ""}
                  </p>
                </div>
              </div>
              <span
                className={`plugin-status ${record.enabled ? "is-enabled" : "is-disabled"}`}
              >
                <span className="plugin-status-dot" aria-hidden="true" />
                {pluginStatusLabel(record)}
              </span>
            </div>
            <p className="plugin-description">{record.manifest.description}</p>

            <div className="plugin-capabilities">
              <span className="plugin-section-label">
                <ShieldCheck size={13} weight="bold" aria-hidden="true" />
                声明的能力（不是已授予的权限）
              </span>
              <ul>
                {record.manifest.capabilities.map((capability) => {
                  const item = pluginCapabilityLabel(capability);
                  return (
                    <li key={capability}>
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <p className="plugin-safety">
              <Lock size={13} weight="bold" aria-hidden="true" />
              <span>
                不绕过审批：workspace / readonly 仍按当前运行权限拦截，workspace
                下的导航与页面操作会逐次请求批准。只读模式下浏览器动作被拒绝。
              </span>
            </p>

            {isBrowser && draft ? (
              <>
                <div className="plugin-domain-summary">
                  <span className="plugin-section-label">域名限制</span>
                  {record.config &&
                  Array.isArray(
                    (record.config as { allowedDomains?: unknown })
                      .allowedDomains,
                  ) &&
                  (record.config as { allowedDomains: unknown[] })
                    .allowedDomains.length > 0 ? (
                    <ul className="plugin-domains">
                      {(
                        record.config as { allowedDomains: string[] }
                      ).allowedDomains.map((domain) => (
                        <li key={domain}>
                          <code>{domain}</code>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="plugin-hint">
                      尚未允许任何域名。不允许即无法导航；空列表不能启用。
                    </p>
                  )}
                  <p className="plugin-hint">
                    仅允许 HTTP(S) 主机名，不含协议与路径；不接受凭据
                    URL。浏览器使用运行级隔离会话，不导入个人浏览器配置或持久登录态。
                  </p>
                </div>
                <BrowserConfigEditor
                  draft={draft}
                  error={draftError}
                  disabled={busy}
                  onChange={(value) =>
                    setDrafts((old) => ({ ...old, [id]: value }))
                  }
                />
                {schema.length > 0 && (
                  <details className="plugin-schema">
                    <summary>Core 配置 schema</summary>
                    <ul>
                      {schema.map((property) => (
                        <li key={property.name}>
                          <code>{property.name}</code>
                          {property.type ? ` · ${property.type}` : ""}
                          {property.description
                            ? ` — ${property.description}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <p className="plugin-hint">
                当前版本不提供该插件的可视化配置编辑器；配置由 Core
                维护，页面不会注入任意插件脚本。
              </p>
            )}

            <div className="plugin-actions">
              {isBrowser && draft && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || !dirty}
                  loading={busy && dirty}
                  onClick={() => void save(record)}
                >
                  保存配置
                </Button>
              )}
              <Button
                size="sm"
                variant={record.enabled ? "secondary" : "primary"}
                disabled={busy}
                onClick={() => void toggle(record)}
              >
                {record.enabled ? "禁用插件" : "启用插件"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Warning size={13} />}
                disabled={busy || record.status === "running"}
                title={
                  record.status === "running"
                    ? "运行中的会话正在使用该插件，结束后再检查。"
                    : "显式探测依赖，不会安装或启动浏览器窗口。"
                }
                onClick={() => void runCheck(record)}
              >
                检查依赖健康
              </Button>
            </div>
            <p className="plugin-hint">
              {record.status === "configured"
                ? "status=configured 仅表示配置已保存；未执行依赖检查前不能视为 ready。检查只探测 agent-browser 工具协议，不安装依赖、不启动网站访问。"
                : record.status === "running"
                  ? `有 ${record.activeSessions} 个活动会话正在使用该插件；运行结束后浏览器会关闭。`
                  : "插件已禁用。禁用不会启动、安装或下载任何组件。"}
            </p>
            <HealthLine view={healthView} />
            {healthView?.state === "done" && healthView.health && (
              <p className="plugin-hint">
                检查成功只代表工具协议可用，不代表 Chrome
                能启动或已获得站点访问权限。
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}
