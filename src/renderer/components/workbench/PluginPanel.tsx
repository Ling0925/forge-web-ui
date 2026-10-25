import type { PluginHealth, PluginRecord } from "@forge/core/shared/plugins";
import {
  ArrowClockwise,
  CheckCircle,
  FileDoc,
  Globe,
  Info,
  Lock,
  Pulse,
  PuzzlePiece,
  ShieldCheck,
  SlidersHorizontal,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { OperationScope } from "../../state/operation-scope";
import {
  BROWSER_PLUGIN_ID,
  type ConfigSchemaProperty,
  OFFICECLI_PLUGIN_ID,
  OFFICECLI_TIMEOUT_SECONDS,
  type OfficeCliConfigDraft,
  type PluginConfigDraft,
  browserConfigFromDraft,
  checkPlugin,
  configSchemaProperties,
  configurePlugin,
  listPlugins,
  officeCliConfigFromDraft,
  pluginCapabilityLabel,
  pluginDraftDirty,
  pluginDraftFor,
  pluginManagementAvailable,
  pluginStatusLabel,
} from "../../state/plugins";
import { Button } from "../primitives/Button";
import { Field } from "../primitives/Field";
import { Input } from "../primitives/Input";
import "./plugin-panel.css";

type PluginDraft = PluginConfigDraft | OfficeCliConfigDraft;

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
      <div className="plugin-config-paths">
        <Field
          id="plugin-browser-executable"
          label="agent-browser 可执行路径"
          helper="默认 agent-browser 使用 Core 锁定的可选依赖；也可填写已安装程序的路径，不会自动安装。"
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
      </div>
      <div className="plugin-config-domains">
        <Field
          id="plugin-browser-domains"
          label="允许访问的主机名"
          helper="每行一个主机名，可写 *.example.com；填写 * 允许全部网站（含本机和局域网）。不含协议、路径或凭据；空列表不能启用。先保存配置，再启用插件。"
        >
          <textarea
            id="plugin-browser-domains"
            className="form-textarea form-input-mono plugin-domain-input"
            rows={3}
            placeholder={"example.com\n*.trusted.example"}
            value={draft.allowedDomains}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...draft, allowedDomains: event.target.value })
            }
          />
        </Field>
      </div>
      {error && (
        <p className="form-error" role="alert">
          <WarningCircle size={14} weight="bold" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

function OfficeCliConfigEditor({
  draft,
  error,
  disabled,
  onChange,
}: {
  readonly draft: OfficeCliConfigDraft;
  readonly error: string;
  readonly disabled: boolean;
  readonly onChange: (value: OfficeCliConfigDraft) => void;
}) {
  return (
    <div className="plugin-config">
      <div className="plugin-config-paths">
        <Field
          id="plugin-officecli-executable"
          label="OfficeCLI 可执行路径"
          helper="默认 officecli（在本机 PATH 中查找）；也可填写绝对路径。Forge 不会自动安装、下载或升级 OfficeCLI。"
        >
          <Input
            id="plugin-officecli-executable"
            isMono
            value={draft.executablePath}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...draft, executablePath: event.target.value })
            }
          />
        </Field>
        <Field
          id="plugin-officecli-timeout"
          label="单次执行超时（秒）"
          helper={`${OFFICECLI_TIMEOUT_SECONDS.min}–${OFFICECLI_TIMEOUT_SECONDS.max} 秒，最多 ${OFFICECLI_TIMEOUT_SECONDS.decimals} 位小数（精确到毫秒），默认 120；只限制单次 OfficeCLI 调用。`}
        >
          <Input
            id="plugin-officecli-timeout"
            type="number"
            inputMode="decimal"
            min={OFFICECLI_TIMEOUT_SECONDS.min}
            max={OFFICECLI_TIMEOUT_SECONDS.max}
            step={OFFICECLI_TIMEOUT_SECONDS.step}
            isMono
            value={draft.timeoutSeconds}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...draft, timeoutSeconds: event.target.value })
            }
          />
        </Field>
      </div>
      {error && (
        <p className="form-error" role="alert">
          <WarningCircle size={14} weight="bold" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

function ConfigSchemaDetails({
  schema,
}: {
  readonly schema: readonly ConfigSchemaProperty[];
}) {
  if (schema.length === 0) return null;
  return (
    <details className="plugin-schema">
      <summary>Core 配置 schema（{schema.length} 个字段）</summary>
      <ul>
        {schema.map((property) => (
          <li key={property.name}>
            <code>{property.name}</code>
            {property.type && (
              <span className="plugin-schema-type">{property.type}</span>
            )}
            {property.description && (
              <span className="plugin-schema-desc">{property.description}</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Per-plugin approval wording; enabling never implies installation or a new model. */
function safetyNote(id: string): string {
  if (id === OFFICECLI_PLUGIN_ID)
    return "不绕过审批：workspace 下 Agent 的 OfficeCLI 调用逐次请求批准；可执行文件是本机受信程序，不是 OS 沙箱。文档内容是不可信数据，不改变模型或 provider。只读模式下 OfficeCLI 调用被拒绝。";
  return "不绕过审批：workspace 下 Agent 的浏览器调用逐次请求批准；人工动作由你的点击授权。两者均受当前权限和允许域名限制，只读模式下浏览器动作被拒绝。";
}

function PluginIcon({ id }: { readonly id: string }) {
  if (id === OFFICECLI_PLUGIN_ID) return <FileDoc size={20} weight="duotone" />;
  if (id === BROWSER_PLUGIN_ID) return <Globe size={20} weight="duotone" />;
  return <PuzzlePiece size={20} weight="duotone" />;
}

export function PluginPanel() {
  const [plugins, setPlugins] = useState<readonly PluginRecord[]>([]);
  const [drafts, setDrafts] = useState<Readonly<Record<string, PluginDraft>>>(
    {},
  );
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
      const next: Record<string, PluginDraft> = {};
      for (const record of records) {
        const id = record.manifest.id;
        const previous = old[id];
        const current =
          previous && pluginDraftDirty(id, previous, record.config)
            ? previous
            : pluginDraftFor(id, record.config);
        if (current) next[id] = current;
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
      const parsed =
        id === OFFICECLI_PLUGIN_ID
          ? officeCliConfigFromDraft(draft as OfficeCliConfigDraft)
          : browserConfigFromDraft(draft as PluginConfigDraft);
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
        id === OFFICECLI_PLUGIN_ID
          ? "OfficeCLI 插件配置已保存。status=configured 只表示配置已持久化，不代表依赖可用。"
          : "浏览器插件配置已保存。status=configured 只表示配置已持久化，不代表依赖可用。",
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
          ? id === OFFICECLI_PLUGIN_ID
            ? "OfficeCLI 插件已启用。不会自动安装 OfficeCLI；下一次运行时才会注册 officecli_* 工具，并沿用当前模型与 provider。"
            : "插件已启用。启用不启动浏览器，也不绕过审批；下一次运行时才会创建隔离会话。"
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

  const enabledCount = plugins.filter((item) => item.enabled).length;

  return (
    <section className="plugin-panel" aria-label="插件管理">
      {error && (
        <p role="alert" className="form-error">
          <WarningCircle size={14} weight="bold" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {notice && (
        <output className="plugin-notice">
          <CheckCircle size={14} weight="bold" aria-hidden="true" />
          <span>{notice}</span>
        </output>
      )}
      <div className="plugin-panel-head">
        <div className="plugin-panel-intro">
          <div className="plugin-panel-summary-row">
            <span className="plugin-panel-kicker">
              <PuzzlePiece size={12} weight="bold" aria-hidden="true" />
              Core 插件清单
            </span>
            {!loading && plugins.length > 0 && (
              <span className="plugin-panel-count-pill">
                共 {plugins.length} 项 · 已启用 {enabledCount}
              </span>
            )}
          </div>
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
        const isOfficeCli = id === OFFICECLI_PLUGIN_ID;
        const editable = isBrowser || isOfficeCli;
        const draft = drafts[id];
        const draftError = draftErrors[id] ?? "";
        const dirty =
          draft && editable
            ? pluginDraftDirty(id, draft, record.config)
            : false;
        const healthView = health[id];
        const schema = configSchemaProperties(record.manifest.configSchema);
        const storedDomains =
          record.config &&
          Array.isArray(
            (record.config as { allowedDomains?: unknown }).allowedDomains,
          )
            ? ((record.config as { allowedDomains: string[] }).allowedDomains ??
              [])
            : [];
        return (
          <article
            key={id}
            className={`plugin-card${record.enabled ? " is-enabled" : ""}${record.status === "running" ? " is-running" : ""}`}
            aria-label={`插件 ${record.manifest.name}`}
          >
            <div className="plugin-card-head">
              <div className="plugin-title">
                <span className="plugin-card-icon" aria-hidden="true">
                  <PluginIcon id={id} />
                </span>
                <div className="plugin-title-body">
                  <div className="plugin-title-row">
                    <strong>{record.manifest.name}</strong>
                    <div className="plugin-meta">
                      <code className="plugin-meta-pill">{id}</code>
                      <span className="plugin-meta-pill">
                        v{record.manifest.version}
                      </span>
                      <span className="plugin-meta-pill">
                        API v{record.manifest.apiVersion}
                      </span>
                      {record.manifest.builtin && (
                        <span className="plugin-meta-pill is-builtin">
                          内置
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="plugin-description">
                    {record.manifest.description}
                  </p>
                </div>
              </div>
              <div className="plugin-card-status-group">
                {dirty && <span className="plugin-dirty-pill">配置未保存</span>}
                <span
                  className={`plugin-status ${
                    record.status === "running"
                      ? "is-running"
                      : record.enabled
                        ? "is-enabled"
                        : "is-disabled"
                  }`}
                >
                  <span className="plugin-status-dot" aria-hidden="true" />
                  {pluginStatusLabel(record)}
                </span>
              </div>
            </div>

            <div className="plugin-subpanel plugin-capabilities">
              <div className="plugin-subpanel-head">
                <span className="plugin-section-label">
                  <ShieldCheck size={14} weight="bold" aria-hidden="true" />
                  声明的能力（不是已授予的权限）
                </span>
                <span className="plugin-subpanel-badge">
                  {record.manifest.capabilities.length} 项声明
                </span>
              </div>
              <ul>
                {record.manifest.capabilities.map((capability) => {
                  const item = pluginCapabilityLabel(capability);
                  return (
                    <li key={capability}>
                      <div className="plugin-capability-head">
                        <strong>{item.label}</strong>
                        <code>{capability}</code>
                      </div>
                      <span>{item.description}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="plugin-safety">
                <Lock size={14} weight="bold" aria-hidden="true" />
                <span>{safetyNote(id)}</span>
              </p>
            </div>

            {isOfficeCli && draft ? (
              <div className="plugin-subpanel plugin-config-panel">
                <div className="plugin-subpanel-head">
                  <span className="plugin-section-label">
                    <SlidersHorizontal
                      size={14}
                      weight="bold"
                      aria-hidden="true"
                    />
                    OfficeCLI 执行路径与超时
                  </span>
                  <span className="plugin-subpanel-badge">
                    {record.enabled ? "已启用" : "未启用"}
                  </span>
                </div>

                <div className="plugin-config-note">
                  <p className="plugin-hint is-inline">
                    <strong>预览附件</strong>
                    ：officecli_preview 生成不可变的 HTML
                    快照附件，在隔离、断网的 HTML 预览中查看；它不是 Office
                    像素级渲染，也不是实时预览。
                    修改文档后需要重新生成预览，原文件仍用 publish_file 下载。
                  </p>
                  <p className="plugin-hint">
                    依赖需由你自行安装并保持可执行；Forge
                    不自动安装、不下载、不升级，也不会改用其它 Office
                    后端。启用只影响新的运行，当前会话与已启动的运行不热更新；不会修改模型或
                    provider。
                  </p>
                </div>

                <OfficeCliConfigEditor
                  draft={draft as OfficeCliConfigDraft}
                  error={draftError}
                  disabled={busy}
                  onChange={(value) =>
                    setDrafts((old) => ({ ...old, [id]: value }))
                  }
                />

                <ConfigSchemaDetails schema={schema} />
              </div>
            ) : isBrowser && draft ? (
              <div className="plugin-subpanel plugin-config-panel">
                <div className="plugin-subpanel-head">
                  <span className="plugin-section-label">
                    <SlidersHorizontal
                      size={14}
                      weight="bold"
                      aria-hidden="true"
                    />
                    运行路径与域名访问控制
                  </span>
                  <span
                    className={`plugin-subpanel-badge ${
                      storedDomains.length > 0 ? "is-configured" : ""
                    }`}
                  >
                    {storedDomains.includes("*")
                      ? "已放行全部网站"
                      : storedDomains.length > 0
                        ? `已生效 ${storedDomains.length} 条域名规则`
                        : "尚未配置允许域名"}
                  </span>
                </div>

                <div className="plugin-domain-summary">
                  <div className="plugin-domain-summary-head">
                    <span className="plugin-section-label">域名限制</span>
                    {storedDomains.length > 0 ? (
                      <ul className="plugin-domains">
                        {storedDomains.map((domain) => (
                          <li key={domain}>
                            <code>
                              {domain === "*" ? "全部网站（*）" : domain}
                            </code>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="plugin-hint is-inline">
                        尚未允许任何域名。不允许即无法导航；空列表不能启用。
                      </p>
                    )}
                  </div>
                  <p className="plugin-hint">
                    具体主机名限制访问范围；填写 *
                    关闭域名限制。导航仍只接受不含凭据的 HTTP(S)
                    URL。浏览器使用运行级隔离会话，不导入个人浏览器配置或持久登录态。
                  </p>
                </div>

                <BrowserConfigEditor
                  draft={draft as PluginConfigDraft}
                  error={draftError}
                  disabled={busy}
                  onChange={(value) =>
                    setDrafts((old) => ({ ...old, [id]: value }))
                  }
                />

                <ConfigSchemaDetails schema={schema} />
              </div>
            ) : (
              <p className="plugin-hint">
                当前版本不提供该插件的可视化配置编辑器；配置由 Core
                维护，页面不会注入任意插件脚本。
              </p>
            )}

            <div className="plugin-card-footer">
              <div className="plugin-footer-status">
                <p className="plugin-hint">
                  {record.status === "configured"
                    ? isOfficeCli
                      ? "status=configured 仅表示配置已保存；未执行依赖检查前不能视为 ready。检查只执行 officecli --version，不安装依赖、不转换文档。"
                      : "status=configured 仅表示配置已保存；未执行依赖检查前不能视为 ready。检查只探测 agent-browser 工具协议，不安装依赖、不启动网站访问。"
                    : record.status === "running"
                      ? isOfficeCli
                        ? `有 ${record.activeSessions} 个活动会话正在使用 OfficeCLI；运行结束后工具随之卸载。`
                        : `有 ${record.activeSessions} 个活动会话正在使用该插件；运行结束后浏览器会关闭。`
                      : "插件已禁用。禁用不会启动、安装或下载任何组件。"}
                </p>
                <HealthLine view={healthView} />
                {healthView?.state === "done" && healthView.health && (
                  <p className="plugin-hint">
                    {isOfficeCli
                      ? "检查成功只代表 officecli 能启动并输出版本，不代表文档转换或 HTML 渲染可用；请用一个真实文档验证。"
                      : "检查成功只代表工具协议可用，不代表 Chrome 能启动或已获得站点访问权限。"}
                  </p>
                )}
              </div>

              <div className="plugin-actions">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Pulse size={13} weight="bold" />}
                  disabled={busy || record.status === "running"}
                  title={
                    record.status === "running"
                      ? "运行中的会话正在使用该插件，结束后再检查。"
                      : isOfficeCli
                        ? "显式执行 officecli --version，不会安装或转换文档。"
                        : "显式探测依赖，不会安装或启动浏览器窗口。"
                  }
                  onClick={() => void runCheck(record)}
                >
                  检查依赖健康
                </Button>
                {editable && draft && (
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
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
