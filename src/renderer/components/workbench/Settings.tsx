import { defaultPublicSettings } from "@forge/core/shared/schemas";
import {
  ArrowLeft,
  Check,
  Clock,
  Code,
  Cpu,
  DeviceMobile,
  Gear,
  Globe,
  Lock,
  MagnifyingGlass,
  Palette,
  Plugs,
  Plus,
  PuzzlePiece,
  ShieldCheck,
  ShieldWarning,
  Trash,
  Warning,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { isMobileAppHost } from "../../state/mobile-connection";
import { permissionLabels } from "../../state/permission-labels";
import {
  type SettingsDraft,
  buildSettingsUpdate,
  createSettingsDraft,
} from "../../state/settings-draft";
import { useWorkbench } from "../../state/workbench-context";
import { Button } from "../primitives/Button";
import { Field } from "../primitives/Field";
import { Input } from "../primitives/Input";
import { Select } from "../primitives/Select";
import { McpPanel } from "./McpPanel";
import { EffortBars } from "./ModelAccessPanels";
import { PhonePairing } from "./PhonePairing";
import { ProviderSources } from "./ProviderSources";
import { ServerConnection } from "./ServerConnection";
import "./settings-page.css";
import "../../styles/settings-models.css";

const GLOBAL_REASONING_EFFORT_OPTIONS: readonly {
  readonly value: SettingsDraft["reasoningEffort"];
  readonly label: string;
  readonly shortLabel: string;
  readonly desc: string;
  readonly bars: number;
}[] = [
  {
    value: "default",
    label: "模型默认",
    shortLabel: "默认",
    desc: "不额外指定推理强度参数，沿用模型或服务端原生默认设定。",
    bars: 0,
  },
  {
    value: "none",
    label: "关闭 (none)",
    shortLabel: "关闭",
    desc: "显式关闭深度思考，追求最快首字响应与最低 Token 消耗。",
    bars: 0,
  },
  {
    value: "minimal",
    label: "极低 (minimal)",
    shortLabel: "minimal",
    desc: "仅保留极轻量内部校验，适合简单问答、格式转换与快速补全。",
    bars: 1,
  },
  {
    value: "low",
    label: "低 (low)",
    shortLabel: "low",
    desc: "轻量级思考预算，适合常规代码修改、检索总结与日常指令。",
    bars: 2,
  },
  {
    value: "medium",
    label: "中 (medium)",
    shortLabel: "medium",
    desc: "均衡速度与推理深度，适合大多数多步编码与问题排查任务。",
    bars: 3,
  },
  {
    value: "high",
    label: "高 (high)",
    shortLabel: "high",
    desc: "投入充足思考预算，适合复杂架构设计、棘手 Bug 诊断与重构。",
    bars: 4,
  },
  {
    value: "xhigh",
    label: "超高 (xhigh)",
    shortLabel: "xhigh",
    desc: "深度多步推演与自检，适合高难度算法、严密逻辑与长链路规划。",
    bars: 5,
  },
  {
    value: "max",
    label: "MAX",
    shortLabel: "MAX",
    desc: "解锁模型允许的最大推理深度预算，耗时与 Token 消耗最高。",
    bars: 5,
  },
];

const EXECUTION_PERMISSION_OPTIONS = [
  {
    value: "readonly",
    title: "只读模式",
    subtitle: "不修改文件或执行命令",
    badge: "安全只读",
    tone: "readonly",
    icon: Lock,
    description:
      "仅允许读取文件、检索代码与规划分析，拦截一切文件修改与系统命令执行。",
    capabilities: [
      { label: "文件读取", state: "允许", tone: "allow" },
      { label: "工作区写入", state: "禁止", tone: "deny" },
      { label: "系统命令", state: "禁止", tone: "deny" },
    ],
  },
  {
    value: "workspace",
    title: "工作区模式",
    subtitle: "工作区文件 · 命令逐次批准",
    badge: "推荐默认",
    tone: "workspace",
    icon: ShieldCheck,
    description:
      "允许在当前工作区目录内自由读写文件；终端命令与越界操作须经人工逐次批准。",
    capabilities: [
      { label: "文件读取", state: "允许", tone: "allow" },
      { label: "工作区写入", state: "允许", tone: "allow" },
      { label: "系统命令", state: "逐次批准", tone: "ask" },
    ],
  },
  {
    value: "unrestricted",
    title: "无限制模式",
    subtitle: "可执行命令（非 OS 沙箱）",
    badge: "高权限",
    tone: "unrestricted",
    icon: ShieldWarning,
    description:
      "直接放行文件读写与终端命令执行，不设逐次审批弹窗，仅在完全信任当前任务时使用。",
    capabilities: [
      { label: "文件读取", state: "允许", tone: "allow" },
      { label: "工作区写入", state: "允许", tone: "allow" },
      { label: "系统命令", state: "直接执行", tone: "warn" },
    ],
  },
] as const;

const REQUEST_TIMEOUT_PRESETS = [
  { value: "15000", label: "15 秒", desc: "快速响应" },
  { value: "30000", label: "30 秒", desc: "轻量任务" },
  { value: "60000", label: "1 分钟", desc: "推荐默认" },
  { value: "120000", label: "2 分钟", desc: "深度推理" },
  { value: "300000", label: "5 分钟", desc: "长链思考" },
  { value: "600000", label: "10 分钟", desc: "最大上限" },
] as const;

function formatTimeoutDuration(raw: string): {
  readonly text: string;
  readonly valid: boolean;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { text: "未设置", valid: false };
  const ms = Number(trimmed);
  if (!Number.isFinite(ms) || !Number.isInteger(ms)) {
    return { text: "请输入整数毫秒", valid: false };
  }
  if (ms < 1000 || ms > 600000) {
    return { text: "超出范围 (1,000–600,000 ms)", valid: false };
  }
  const seconds = ms / 1000;
  if (ms % 60000 === 0) {
    return { text: `${ms / 60000} 分钟 (${seconds} 秒)`, valid: true };
  }
  if (ms >= 60000) {
    const minutes = (ms / 60000).toFixed(1).replace(/\.0$/, "");
    const secText = Number.isInteger(seconds)
      ? `${seconds}`
      : seconds.toFixed(1);
    return { text: `约 ${minutes} 分钟 (${secText} 秒)`, valid: true };
  }
  return {
    text: `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} 秒`,
    valid: true,
  };
}

const sections = [
  {
    id: "connection",
    title: "模型连接",
    description: "连接你的模型服务，选择协议与默认模型。",
    keywords: "API 端点 密钥 model reasoning 思考强度 默认思考等级 路由组 导入来源",
    icon: Plugs,
  },
  {
    id: "appearance",
    title: "外观",
    description: "让工作台适应你的使用习惯与色彩偏好。",
    keywords: "主题 深色 浅色 系统 theme",
    icon: Palette,
  },
  {
    id: "execution",
    title: "执行与权限",
    description: "为新的运行设置权限边界与请求超时。",
    keywords: "只读 工作区 无限制 工具调用 子代理 不限 超时",
    icon: ShieldCheck,
  },
  {
    id: "context",
    title: "上下文与记忆",
    description: "控制输入预算与模型窗口，平衡连续性和成本。",
    keywords: "token 压缩 compact 字符预算 模型窗口",
    icon: Cpu,
  },
  {
    id: "browser",
    title: "浏览器",
    description: "明确授权浏览器工具可以访问的网络来源与内核。",
    keywords: "origin Chromium 可执行路径 网络",
    icon: Globe,
  },
  {
    id: "language",
    title: "语言服务",
    description: "配置本机 LSP 服务器，为代码提供智能诊断与语义能力。",
    keywords: "LSP 命令 参数 扩展名",
    icon: Code,
  },
  {
    id: "mcp",
    title: "MCP 扩展",
    description: "管理外部工具服务器及其连接。",
    keywords: "stdio 服务器 工具 注册",
    icon: PuzzlePiece,
  },
  {
    id: "pairing",
    title: "手机连接",
    description: "在同一局域网公开当前核心，让 Android 扫码配对。",
    keywords: "手机 Android 扫码 二维码 局域网 LAN 配对 端口 地址",
    icon: DeviceMobile,
  },
] as const;

/** Android shell variant of the same `pairing` section: no LAN controls. */
const mobilePairingSection = {
  id: "pairing",
  title: "服务器连接",
  description: "查看当前服务器地址，编辑或更换 Android 应用连接的服务器。",
  keywords: "当前服务器 编辑 更换 扫码 二维码 最近连接 地址 Android",
  icon: DeviceMobile,
} as const;

type Section = (typeof sections)[number]["id"];
type TextKey = {
  [K in keyof SettingsDraft]: SettingsDraft[K] extends string ? K : never;
}[keyof SettingsDraft];

export function Settings() {
  const { state, updateSettings, openSettings } = useWorkbench();
  const initial = state.settings ?? defaultPublicSettings;
  const [original, setOriginal] = useState(initial);
  const [draft, setDraft] = useState(() => createSettingsDraft(initial));
  const [section, setSection] = useState<Section>("connection");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [listing, setListing] = useState(false);
  const [mobile] = useState(() => isMobileAppHost());
  const sourceBusy = useRef(false);
  const locked = useRef(false);
  const alive = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(createSettingsDraft(original));
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!dirtyRef.current && state.settings) {
      setOriginal(state.settings);
      setDraft(createSettingsDraft(state.settings));
    }
  }, [state.settings, state.isSettingsOpen]);

  useEffect(() => {
    if (!state.isSettingsOpen) return;
    const previous = document.activeElement;
    heading.current?.focus();
    return () => {
      if (previous instanceof HTMLElement)
        requestAnimationFrame(() => previous.focus());
    };
  }, [state.isSettingsOpen]);

  const close = () => {
    if (!locked.current && !sourceBusy.current) openSettings(false);
  };

  useEffect(() => {
    if (!state.isSettingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !document.querySelector("dialog[open]") &&
        !event.isComposing
      ) {
        event.preventDefault();
        if (!locked.current && !sourceBusy.current) openSettings(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.isSettingsOpen, openSettings]);

  const change = <K extends keyof SettingsDraft>(
    name: K,
    value: SettingsDraft[K],
  ) => {
    setDraft((old) => ({ ...old, [name]: value }));
    setNotice("");
    setError("");
  };

  const reset = () => {
    setOriginal(initial);
    setDraft(createSettingsDraft(initial));
    setError("");
    setNotice("");
  };

  const save = async () => {
    if (locked.current) return;
    setError("");
    setNotice("");
    try {
      const input = buildSettingsUpdate(draft, original, "", false);
      if (!Object.keys(input).length) {
        setNotice("没有需要保存的修改。");
        return;
      }
      locked.current = true;
      setBusy(true);
      const result = await updateSettings(input);
      if (!result.ok) throw Error(result.error);
      if (!alive.current) return;
      // Rebuild the draft from the authoritative settings the store returned so
      // server-side normalization and concurrent edits are reflected exactly.
      const next = result.settings;
      setOriginal(next);
      setDraft(createSettingsDraft(next));
      setNotice("设置已保存。执行配置用于新的运行；当前运行不会被中断。");
    } catch (err) {
      if (alive.current)
        setError(err instanceof Error ? err.message : "保存失败，草稿已保留。");
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const text = (
    name: TextKey,
    label: string,
    helper?: string,
    type = "text",
    placeholder?: string,
  ) => (
    <Field key={name} id={`setting-${name}`} label={label} helper={helper}>
      <Input
        id={`setting-${name}`}
        type={type}
        placeholder={placeholder}
        value={draft[name]}
        onChange={(e) => change(name, e.target.value)}
        aria-describedby={helper ? `setting-${name}-helper` : undefined}
      />
    </Field>
  );

  const select = (
    name: TextKey,
    label: string,
    options: { value: string; label: string }[],
    helper?: string,
  ) => (
    <Field id={`setting-${name}`} label={label} helper={helper}>
      <Select
        id={`setting-${name}`}
        value={draft[name]}
        onChange={(e) => change(name, e.target.value)}
        options={options}
      />
    </Field>
  );

  const catalog = mobile
    ? sections.map((item) =>
        item.id === "pairing" ? mobilePairingSection : item,
      )
    : sections;
  const matching = catalog.filter((item) =>
    `${item.title} ${item.keywords} ${item.description}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const selected = catalog.find((item) => item.id === section)!;
  const visible = (id: Section) =>
    query.trim() ? matching.some((item) => item.id === id) : section === id;

  return (
    <section
      className="settings-page"
      hidden={!state.isSettingsOpen}
      inert={!state.isSettingsOpen}
      style={!state.isSettingsOpen ? { display: "none" } : undefined}
      aria-label="设置工作区"
    >
      <aside className="settings-navigation">
        <div className="settings-nav-header">
          <Button
            variant="ghost"
            size="sm"
            className="settings-back-btn"
            icon={<ArrowLeft size={16} weight="bold" />}
            onClick={close}
            disabled={busy || listing}
          >
            返回工作台
          </Button>
          <div className="settings-brand">
            <div className="settings-brand-icon">
              <Gear size={20} weight="fill" />
            </div>
            <h1 ref={heading} tabIndex={-1}>
              设置
            </h1>
          </div>
        </div>

        <div className="settings-search">
          <MagnifyingGlass size={16} className="settings-search-icon" />
          <Input
            aria-label="搜索设置"
            placeholder="搜索设置…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="settings-search-clear"
              onClick={() => setQuery("")}
              aria-label="清空搜索"
            >
              <X size={13} weight="bold" />
            </button>
          )}
        </div>

        <nav aria-label="设置分类" className="settings-nav-menu">
          {catalog.map((item) => {
            const Icon = item.icon;
            const isCurrent = !query && section === item.id;
            return (
              <button
                type="button"
                key={item.id}
                className={`settings-nav-item ${isCurrent ? "is-active" : ""}`}
                aria-current={isCurrent ? "page" : undefined}
                onClick={() => {
                  setSection(item.id);
                  setQuery("");
                }}
              >
                <Icon
                  size={18}
                  weight={isCurrent ? "bold" : "regular"}
                  className="settings-nav-icon"
                />
                <span className="settings-nav-title">{item.title}</span>
              </button>
            );
          })}
        </nav>

        <div className="settings-local-note">
          <div className="settings-local-note-badge">本机配置</div>
          <p>配置与本机 CLI 共享 · 密钥受环境隔离保护，不会回显到页面。</p>
        </div>
      </aside>

      <div className="settings-body">
        <header className="settings-page-header">
          <div className="settings-header-meta">
            <small>偏好设置 / {query ? "搜索" : selected.title}</small>
            <h2>{query ? "搜索结果" : selected.title}</h2>
            <p>
              {query
                ? `找到 ${matching.length} 个相关分区`
                : selected.description}
            </p>
          </div>
          <div className="settings-status">
            <span
              className={`wb-status-dot ${initial.isConfigured ? "is-configured" : "is-pending"}`}
              data-status={initial.isConfigured ? "ready" : "awaiting_approval"}
            />
            <span>
              {initial.isConfigured ? "已配置模型服务" : "尚未配置模型服务"}
            </span>
          </div>
        </header>

        <div className="settings-page-scroll">
          {!state.settings && (
            <p role="status" className="settings-loading-status">
              设置尚未加载，加载完成后即可编辑。
            </p>
          )}
          {query && !matching.length && (
            <div className="settings-empty">
              没有找到相关设置，试试“模型”“token”或“权限”。
            </div>
          )}

          <div hidden={!visible("connection")}>
            <ProviderSources
              active={visible("connection")}
              onBusy={(value) => {
                sourceBusy.current = value;
                setListing(value);
              }}
            />
          </div>
          <form
            id="settings-page-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <fieldset
              disabled={busy || listing || !state.settings}
              className="settings-page-fields"
            >
              {visible("connection") && (
                <section className="settings-section" aria-label="推理设置">
                  <div className="provider-inference">
                    <div className="provider-inference-head">
                      <div className="provider-inference-info">
                        <div className="provider-inference-title-row">
                          <h3>默认思考等级</h3>
                          <span className="provider-tag">通用推理偏好</span>
                        </div>
                        <p>
                          适用于支持思考参数的模型；未单独定制思考等级的模型将跟随此设定，修改后通过底部保存设置。
                        </p>
                      </div>
                      <div className="provider-inference-status-wrap">
                        <span className="provider-inference-current-pill">
                          当前：
                          {GLOBAL_REASONING_EFFORT_OPTIONS.find(
                            (item) => item.value === draft.reasoningEffort,
                          )?.label ?? "模型默认"}
                        </span>
                        <div className="visually-hidden">
                          {select(
                            "reasoningEffort",
                            "默认思考强度",
                            GLOBAL_REASONING_EFFORT_OPTIONS.map((item) => ({
                              value: item.value,
                              label: item.label,
                            })),
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="provider-inference-card">
                      <fieldset
                        className="provider-inference-grid"
                        aria-label="全局默认思考等级快捷选择"
                      >
                        {GLOBAL_REASONING_EFFORT_OPTIONS.map((item) => {
                          const active = draft.reasoningEffort === item.value;
                          return (
                            <button
                              key={item.value}
                              type="button"
                              aria-pressed={active}
                              className={`provider-inference-option${active ? " is-active" : ""}`}
                              onClick={() =>
                                change("reasoningEffort", item.value)
                              }
                            >
                              <div className="provider-inference-option-top">
                                <span className="provider-inference-option-name">
                                  {item.shortLabel}
                                </span>
                                {item.bars > 0 ? (
                                  <EffortBars bars={item.bars} />
                                ) : (
                                  <span className="provider-inference-option-tag">
                                    {item.value === "default" ? "自动" : "0"}
                                  </span>
                                )}
                              </div>
                              <span className="provider-inference-option-label">
                                {item.label}
                              </span>
                            </button>
                          );
                        })}
                      </fieldset>
                      {(() => {
                        const activeOption =
                          GLOBAL_REASONING_EFFORT_OPTIONS.find(
                            (item) => item.value === draft.reasoningEffort,
                          ) ?? GLOBAL_REASONING_EFFORT_OPTIONS[0];
                        return (
                          <div className="provider-inference-summary">
                            <span className="provider-inference-summary-desc">
                              当前设定：
                              <strong>{activeOption.label}</strong> ·{" "}
                              {activeOption.desc}
                            </span>
                            <span className="provider-inference-summary-rule">
                              优先级：单模型覆盖 ＞ 全局默认 ＞ 模型默认
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </section>
              )}

              {visible("appearance") && (
                <section className="settings-section" aria-label="外观配置">
                  <div className="settings-flat-group">
                    <div className="settings-theme-options">
                      {[
                        { value: "system", label: "跟随系统" },
                        { value: "light", label: "浅色" },
                        { value: "dark", label: "深色" },
                      ].map((theme) => {
                        const active = draft.theme === theme.value;
                        return (
                          <button
                            type="button"
                            key={theme.value}
                            className={`settings-theme-card ${active ? "is-active" : ""}`}
                            aria-pressed={active}
                            onClick={() => change("theme", theme.value)}
                          >
                            <div
                              className={`settings-theme-preview preview-${theme.value}`}
                            >
                              <div className="preview-window-bar">
                                <span className="window-dot" />
                                <span className="window-dot" />
                                <span className="window-dot" />
                              </div>
                              <div className="preview-window-content">
                                <div className="preview-sidebar">
                                  <div className="preview-line sm" />
                                  <div className="preview-line xs" />
                                  <div className="preview-line sm" />
                                </div>
                                <div className="preview-main">
                                  <div className="preview-bubble received" />
                                  <div className="preview-bubble sent" />
                                </div>
                              </div>
                            </div>
                            <div className="settings-theme-footer">
                              <span className="settings-theme-label">
                                {theme.label}
                              </span>
                              {active && (
                                <span
                                  className="settings-theme-check"
                                  aria-hidden="true"
                                >
                                  <Check size={12} weight="bold" />
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <p className="settings-section-hint">
                      保存后立即应用，不影响正在进行的任务。
                    </p>
                  </div>
                </section>
              )}

              {visible("execution") && (
                <section className="settings-section" aria-label="执行配置">
                  <div className="settings-flat-group execution-settings-layout">
                    <div className="execution-panel-card">
                      <div className="execution-panel-head">
                        <div className="execution-panel-head-main">
                          <span
                            className="execution-panel-icon"
                            aria-hidden="true"
                          >
                            <ShieldCheck size={16} weight="duotone" />
                          </span>
                          <div className="execution-panel-title-wrap">
                            <div className="execution-panel-title-row">
                              <h3>默认权限</h3>
                              <span className="execution-panel-tag">
                                新建运行策略
                              </span>
                            </div>
                            <p>
                              为新建会话与后续发起的运行设定默认安全边界；切换默认策略不会自动提升当前正在运行的任务权限。
                            </p>
                          </div>
                        </div>
                        <span
                          className={`execution-active-pill is-${draft.defaultPermission}`}
                        >
                          {EXECUTION_PERMISSION_OPTIONS.find(
                            (opt) => opt.value === draft.defaultPermission,
                          )?.title ?? "工作区模式"}{" "}
                          · {draft.defaultPermission}
                        </span>
                      </div>

                      <div className="visually-hidden">
                        {select(
                          "defaultPermission",
                          "默认权限",
                          Object.entries(permissionLabels).map(
                            ([value, label]) => ({ value, label }),
                          ),
                        )}
                      </div>

                      <fieldset
                        className="execution-permission-grid"
                        aria-label="权限策略选择"
                      >
                        {EXECUTION_PERMISSION_OPTIONS.map((option) => {
                          const Icon = option.icon;
                          const active =
                            draft.defaultPermission === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={active}
                              className={`execution-permission-card is-${option.tone}${
                                active ? " is-active" : ""
                              }`}
                              onClick={() =>
                                change("defaultPermission", option.value)
                              }
                            >
                              <div className="execution-permission-top">
                                <span
                                  className={`execution-permission-icon is-${option.tone}`}
                                  aria-hidden="true"
                                >
                                  <Icon
                                    size={18}
                                    weight={active ? "fill" : "duotone"}
                                  />
                                </span>
                                <div className="execution-permission-badges">
                                  <span
                                    className={`execution-permission-badge is-${option.tone}`}
                                  >
                                    {option.badge}
                                  </span>
                                  {active && (
                                    <span
                                      className="execution-permission-check"
                                      aria-hidden="true"
                                    >
                                      <Check size={12} weight="bold" />
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="execution-permission-heading">
                                <div className="execution-permission-title-line">
                                  <span className="execution-permission-title">
                                    {option.title}
                                  </span>
                                  <code>{option.value}</code>
                                </div>
                                <span className="execution-permission-subtitle">
                                  {option.subtitle}
                                </span>
                              </div>

                              <p className="execution-permission-desc">
                                {option.description}
                              </p>

                              <div
                                className="execution-capability-list"
                                aria-hidden="true"
                              >
                                {option.capabilities.map((cap) => (
                                  <div
                                    key={cap.label}
                                    className="execution-capability-row"
                                  >
                                    <span className="execution-capability-label">
                                      {cap.label}
                                    </span>
                                    <span
                                      className={`execution-capability-state is-${cap.tone}`}
                                    >
                                      {cap.state}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </button>
                          );
                        })}
                      </fieldset>

                      {draft.defaultPermission === "unrestricted" && (
                        <div className="settings-warning execution-warning-banner">
                          <Warning
                            size={18}
                            weight="fill"
                            className="settings-warning-icon"
                          />
                          <span>
                            无限制模式允许直接执行命令，可能访问工作区以外的文件和网络。仅在信任任务时使用。
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="execution-panel-card">
                      {(() => {
                        const timeoutMeta = formatTimeoutDuration(
                          draft.requestTimeoutMs,
                        );
                        return (
                          <>
                            <div className="execution-panel-head">
                              <div className="execution-panel-head-main">
                                <span
                                  className="execution-panel-icon"
                                  aria-hidden="true"
                                >
                                  <Clock size={16} weight="duotone" />
                                </span>
                                <div className="execution-panel-title-wrap">
                                  <div className="execution-panel-title-row">
                                    <h3>请求空闲超时</h3>
                                    <span className="execution-panel-tag">
                                      流式保活阈值
                                    </span>
                                  </div>
                                  <p>
                                    限制单次模型请求在流式输出期间的最大静默等待时间；只中断单次请求的空闲，不限制任务总时长。
                                  </p>
                                </div>
                              </div>
                              <span
                                className={`execution-timeout-pill${
                                  timeoutMeta.valid ? "" : " is-invalid"
                                }`}
                              >
                                {timeoutMeta.text}
                              </span>
                            </div>

                            <fieldset
                              className="execution-timeout-presets"
                              aria-label="空闲超时快捷档位"
                            >
                              {REQUEST_TIMEOUT_PRESETS.map((preset) => {
                                const active =
                                  draft.requestTimeoutMs.trim() ===
                                  preset.value;
                                return (
                                  <button
                                    key={preset.value}
                                    type="button"
                                    aria-pressed={active}
                                    className={`execution-timeout-preset${
                                      active ? " is-active" : ""
                                    }`}
                                    onClick={() =>
                                      change("requestTimeoutMs", preset.value)
                                    }
                                  >
                                    <span className="execution-timeout-preset-label">
                                      {preset.label}
                                    </span>
                                    <span className="execution-timeout-preset-sub">
                                      {preset.desc}
                                    </span>
                                  </button>
                                );
                              })}
                            </fieldset>

                            <div className="execution-timeout-input-wrap">
                              {text(
                                "requestTimeoutMs",
                                "请求空闲超时（毫秒）",
                                "1000–600000；只中断单次请求的空闲，不限制任务总时长。",
                                "number",
                                "60000",
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    <div className="execution-panel-card execution-runtime-card">
                      <div className="execution-runtime-grid">
                        <div className="execution-runtime-item">
                          <span className="execution-runtime-badge">
                            主机直连执行
                          </span>
                          <strong>非 OS 容器沙箱</strong>
                          <span>
                            命令以当前系统用户环境直接执行，依赖权限档位与审批门控控制风险。
                          </span>
                        </div>
                        <div className="execution-runtime-item">
                          <span className="execution-runtime-badge">
                            长任务连续运行
                          </span>
                          <strong>轮次与总时长不设上限</strong>
                          <span>
                            不因工具调用次数、子代理累计次数或任务总耗时截断复杂工程任务。
                          </span>
                        </div>
                        <div className="execution-runtime-item">
                          <span className="execution-runtime-badge">
                            并发与中断控制
                          </span>
                          <strong>最多 4 路子代理并发</strong>
                          <span>
                            支持并行派发子代理协同执行，运行期间可随时手动取消当前任务。
                          </span>
                        </div>
                      </div>
                      <p className="settings-section-hint execution-runtime-footnote">
                        更改默认权限不会提升当前运行的权限。命令不在 OS
                        沙箱内执行；工具调用次数、子代理累计次数与任务总时长均不限（子代理最多同时活跃
                        4 个，可随时手动取消运行）。
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {visible("context") && (
                <section className="settings-section" aria-label="上下文配置">
                  <div className="settings-flat-group">
                    <p className="settings-section-hint">
                      自动压缩保留可检索的原始历史。压缩影响后续请求，不会删除聊天或清零累计用量。
                    </p>
                    {text(
                      "contextBudgetTokens",
                      "上下文 token 上限",
                      "可留空自动按模型窗口的 80% 计算；手动值范围 4096–10000000，仍受窗口限制。",
                      "number",
                    )}
                  </div>

                  <div className="settings-flat-group settings-flat-divider">
                    <div className="settings-subgroup-header">
                      <h4>逐模型窗口覆盖</h4>
                      <p>
                        填写精确模型
                        ID，适用于网关别名。留空窗口表示自动解析；未知模型当前按
                        300K 估算。
                      </p>
                    </div>
                    {draft.modelContextWindows.map((row, index) => (
                      <div className="settings-entry" key={index}>
                        <div className="settings-entry-content">
                          <div className="settings-columns">
                            <Field id={`window-model-${index}`} label="模型 ID">
                              <Input
                                id={`window-model-${index}`}
                                placeholder="例如 gpt-4o 或 custom-model"
                                value={row.model}
                                onChange={(e) =>
                                  change(
                                    "modelContextWindows",
                                    draft.modelContextWindows.map((v, i) =>
                                      i === index
                                        ? { ...v, model: e.target.value }
                                        : v,
                                    ),
                                  )
                                }
                              />
                            </Field>
                            <Field
                              id={`window-tokens-${index}`}
                              label="窗口 tokens"
                            >
                              <Input
                                id={`window-tokens-${index}`}
                                type="number"
                                placeholder="留空自动解析"
                                value={row.tokens}
                                onChange={(e) =>
                                  change(
                                    "modelContextWindows",
                                    draft.modelContextWindows.map((v, i) =>
                                      i === index
                                        ? { ...v, tokens: e.target.value }
                                        : v,
                                    ),
                                  )
                                }
                              />
                            </Field>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="settings-entry-remove"
                          icon={<Trash size={14} />}
                          onClick={() =>
                            change(
                              "modelContextWindows",
                              draft.modelContextWindows.filter(
                                (_, i) => i !== index,
                              ),
                            )
                          }
                        >
                          移除此窗口覆盖
                        </Button>
                      </div>
                    ))}
                    <div className="settings-card-action-row">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Plus size={14} />}
                        onClick={() =>
                          change("modelContextWindows", [
                            ...draft.modelContextWindows,
                            { model: "", tokens: "" },
                          ])
                        }
                      >
                        添加模型窗口
                      </Button>
                    </div>
                  </div>

                  <div className="settings-flat-group settings-flat-divider">
                    <details className="settings-legacy">
                      <summary>兼容性设置</summary>
                      <div className="settings-legacy-body">
                        {text(
                          "contextBudgetChars",
                          "旧版字符预算",
                          "仅用于无 token 窗口的兼容路径；当前默认 300K 窗口下不会作为压缩上限。",
                          "number",
                        )}
                      </div>
                    </details>
                  </div>
                </section>
              )}

              {visible("browser") && (
                <section className="settings-section" aria-label="浏览器配置">
                  <div className="settings-flat-group">
                    <p className="settings-section-hint">
                      空列表不启用浏览器工具。这里的配置用于主机浏览器，不是当前设置页面的连接。
                    </p>
                    <Field
                      id="setting-origins"
                      label="浏览器允许来源"
                      helper="每行一个精确 origin，例如 http://localhost:3000。不能含路径、通配符或凭据。"
                    >
                      <textarea
                        id="setting-origins"
                        className="form-textarea form-input-mono"
                        rows={5}
                        placeholder="http://localhost:3000&#10;http://127.0.0.1:8080"
                        value={draft.browserAllowedOrigins}
                        onChange={(e) =>
                          change("browserAllowedOrigins", e.target.value)
                        }
                      />
                    </Field>
                    {text(
                      "browserExecutablePath",
                      "Chromium 可执行路径",
                      "留空使用主机默认浏览器安装。不自动下载或安装。",
                      "text",
                      "/usr/bin/google-chrome-stable",
                    )}
                  </div>
                </section>
              )}

              {visible("language") && (
                <section className="settings-section" aria-label="语言服务配置">
                  <div className="settings-flat-group">
                    <p className="settings-section-hint">
                      最多 8 个服务。ID
                      和文件扩展名必须唯一；保存不安装服务。后续使用时会执行本机命令，请仅配置可信程序。
                    </p>
                    {!draft.lspServers.length && (
                      <div className="settings-empty">
                        尚未配置语言服务。添加已安装的语言服务器以启用代码诊断。
                      </div>
                    )}
                    {draft.lspServers.map((row, index) => (
                      <article className="settings-entry" key={index}>
                        <div className="settings-entry-header">
                          <h4>
                            语言服务 {index + 1}
                            {row.id ? ` · ${row.id}` : ""}
                          </h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Trash size={14} />}
                            onClick={() =>
                              change(
                                "lspServers",
                                draft.lspServers.filter((_, i) => i !== index),
                              )
                            }
                          >
                            移除此语言服务
                          </Button>
                        </div>
                        <div className="settings-columns">
                          <Field id={`lsp-${index}-id`} label="服务 ID">
                            <Input
                              id={`lsp-${index}-id`}
                              placeholder="例如 ts 或 pyright"
                              value={row.id}
                              onChange={(e) =>
                                change(
                                  "lspServers",
                                  draft.lspServers.map((v, i) =>
                                    i === index
                                      ? { ...v, id: e.target.value }
                                      : v,
                                  ),
                                )
                              }
                            />
                          </Field>
                          <Field id={`lsp-${index}-command`} label="启动命令">
                            <Input
                              id={`lsp-${index}-command`}
                              placeholder="例如 typescript-language-server"
                              value={row.command}
                              onChange={(e) =>
                                change(
                                  "lspServers",
                                  draft.lspServers.map((v, i) =>
                                    i === index
                                      ? { ...v, command: e.target.value }
                                      : v,
                                  ),
                                )
                              }
                            />
                          </Field>
                        </div>
                        <div className="settings-columns">
                          <Field
                            id={`lsp-${index}-args`}
                            label="参数（JSON 字符串数组）"
                          >
                            <Input
                              id={`lsp-${index}-args`}
                              placeholder='["--stdio"]'
                              value={row.args}
                              onChange={(e) =>
                                change(
                                  "lspServers",
                                  draft.lspServers.map((v, i) =>
                                    i === index
                                      ? { ...v, args: e.target.value }
                                      : v,
                                  ),
                                )
                              }
                            />
                          </Field>
                          <Field
                            id={`lsp-${index}-extensions`}
                            label="文件扩展名（逗号分隔）"
                          >
                            <Input
                              id={`lsp-${index}-extensions`}
                              placeholder=".ts, .tsx"
                              value={row.extensions}
                              onChange={(e) =>
                                change(
                                  "lspServers",
                                  draft.lspServers.map((v, i) =>
                                    i === index
                                      ? { ...v, extensions: e.target.value }
                                      : v,
                                  ),
                                )
                              }
                            />
                          </Field>
                        </div>
                      </article>
                    ))}
                    <div className="settings-card-action-row">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Plus size={14} />}
                        disabled={draft.lspServers.length >= 8}
                        onClick={() =>
                          change("lspServers", [
                            ...draft.lspServers,
                            { id: "", command: "", args: "[]", extensions: "" },
                          ])
                        }
                      >
                        添加语言服务
                      </Button>
                    </div>
                  </div>
                </section>
              )}
            </fieldset>
          </form>

          {visible("mcp") && (
            <section
              className="settings-section settings-section-mcp"
              aria-label="MCP 配置"
            >
              <McpPanel showHeader={false} />
            </section>
          )}

          {visible("pairing") &&
            (mobile ? (
              <section className="settings-section" aria-label="服务器连接配置">
                <ServerConnection dirty={dirty} />
              </section>
            ) : (
              <section className="settings-section" aria-label="手机连接配置">
                <PhonePairing />
              </section>
            ))}
        </div>

        <footer className="settings-save-bar">
          <div className="settings-save-status" aria-live="polite">
            {error ? (
              <p role="alert" className="form-error">
                <WarningCircle size={15} weight="bold" />
                <span>{error}</span>
              </p>
            ) : (
              <div className="settings-status-indicator">
                <span
                  className={`settings-save-dot ${
                    busy
                      ? "is-busy"
                      : notice
                        ? "is-notice"
                        : dirty
                          ? "is-dirty"
                          : "is-clean"
                  }`}
                />
                <p>
                  {busy
                    ? "正在保存…"
                    : notice || (dirty ? "有未保存的修改" : "所有设置已同步")}
                </p>
              </div>
            )}
            <small>返回工作台保留草稿；退出应用不保留草稿。</small>
          </div>
          <div className="settings-save-actions">
            <Button
              variant="ghost"
              disabled={busy || listing || !dirty}
              onClick={reset}
            >
              放弃未保存修改
            </Button>
            <Button
              type="submit"
              form="settings-page-form"
              variant="primary"
              loading={busy}
              disabled={listing || !state.settings || !dirty}
            >
              保存设置
            </Button>
          </div>
        </footer>
      </div>
    </section>
  );
}
