import {
  Brain,
  Code,
  DeviceMobile,
  HardDrives,
  Lock,
  Plugs,
  PuzzlePiece,
  ShieldCheck,
  ShieldWarning,
  SlidersHorizontal,
  Users,
} from "@phosphor-icons/react";
import type { SettingsDraft } from "../../../state/settings-draft";

export const GLOBAL_REASONING_EFFORT_OPTIONS: readonly {
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
    label: "关闭",
    shortLabel: "关闭",
    desc: "显式关闭深度思考，追求最快首字响应与最低 Token 消耗。",
    bars: 0,
  },
  {
    value: "minimal",
    label: "极低",
    shortLabel: "极低",
    desc: "仅保留极轻量内部校验，适合简单问答、格式转换与快速补全。",
    bars: 1,
  },
  {
    value: "low",
    label: "低",
    shortLabel: "低",
    desc: "轻量级思考预算，适合常规代码修改、检索总结与日常指令。",
    bars: 2,
  },
  {
    value: "medium",
    label: "中",
    shortLabel: "中",
    desc: "均衡速度与推理深度，适合大多数多步编码与问题排查任务。",
    bars: 3,
  },
  {
    value: "high",
    label: "高",
    shortLabel: "高",
    desc: "投入充足思考预算，适合复杂架构设计、棘手 Bug 诊断与重构。",
    bars: 4,
  },
  {
    value: "xhigh",
    label: "超高",
    shortLabel: "超高",
    desc: "深度多步推演与自检，适合高难度算法、严密逻辑与长链路规划。",
    bars: 5,
  },
  {
    value: "max",
    label: "最大",
    shortLabel: "最大",
    desc: "解锁模型允许的最大推理深度预算，耗时与 Token 消耗最高。",
    bars: 5,
  },
];

export const EXECUTION_PERMISSION_OPTIONS = [
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
    subtitle: "命令直接执行，不在沙箱内",
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

export const REQUEST_TIMEOUT_PRESETS = [
  { value: "15000", label: "15 秒", desc: "快速响应" },
  { value: "30000", label: "30 秒", desc: "轻量任务" },
  { value: "60000", label: "1 分钟", desc: "推荐默认" },
  { value: "120000", label: "2 分钟", desc: "深度推理" },
  { value: "300000", label: "5 分钟", desc: "长链思考" },
  { value: "600000", label: "10 分钟", desc: "最大上限" },
] as const;

export const CONTEXT_BUDGET_PRESETS = [
  { value: "", label: "自动 (80%)", desc: "随模型窗口缩放" },
  { value: "32000", label: "32K", desc: "紧凑低成本" },
  { value: "64000", label: "64K", desc: "常规编码会话" },
  { value: "128000", label: "128K", desc: "中型代码库" },
  { value: "200000", label: "200K", desc: "深度多步排查" },
  { value: "400000", label: "400K", desc: "超长上下文" },
] as const;

export const MODEL_WINDOW_PRESETS = [
  { value: "", label: "自动" },
  { value: "64000", label: "64K" },
  { value: "128000", label: "128K" },
  { value: "200000", label: "200K" },
  { value: "400000", label: "400K" },
  { value: "1000000", label: "1M" },
] as const;

export function formatTokenShort(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (tokens >= 1_000) {
    const k = tokens / 1_000;
    return `${Number.isInteger(k) ? k : k.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(tokens);
}

export function formatContextBudgetBadge(raw: string): {
  readonly text: string;
  readonly tone: "auto" | "custom" | "invalid";
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { text: "自动 · 窗口 80%", tone: "auto" };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { text: "请输入整数", tone: "invalid" };
  }
  if (n < 4096 || n > 10_000_000) {
    return { text: "超出范围 (4,096–10M)", tone: "invalid" };
  }
  return { text: `手动上限 · ${formatTokenShort(n)} tokens`, tone: "custom" };
}

export function formatModelWindowSummary(raw: string): {
  readonly text: string;
  readonly valid: boolean;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { text: "自动解析 · 未知按 300K (80% ≈ 240K)", valid: true };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 4096) {
    return { text: "需 ≥ 4,096 的整数 tokens", valid: false };
  }
  const threshold = Math.round(n * 0.8);
  return {
    text: `窗口 ${formatTokenShort(n)} · 80% 压缩阈值 ≈ ${formatTokenShort(threshold)}`,
    valid: true,
  };
}

export function formatTimeoutDuration(raw: string): {
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

export const sections = [
  {
    id: "general",
    group: "常规",
    title: "通用",
    description: "外观与新运行的默认行为。修改即时保存，不影响正在进行的运行。",
    keywords: "主题 深色 浅色 系统 外观 权限 只读 工作区 无限制 超时 theme",
    icon: SlidersHorizontal,
  },
  {
    id: "models",
    group: "模型",
    title: "模型服务",
    description: "连接模型服务、选择默认模型，并按模型调整参数。",
    keywords:
      "API 端点 地址 密钥 凭据 来源 模型 协议 上下文窗口 最大输出 路由组 导入",
    icon: Plugs,
  },
  {
    id: "reasoning",
    group: "模型",
    title: "推理与上下文",
    description: "全局思考等级与上下文压缩预算，作用于所有模型。",
    keywords: "思考 推理 reasoning token 压缩 compact 预算 字符",
    icon: Brain,
  },
  {
    id: "agents",
    group: "代理与工具",
    title: "智能体",
    description: "配置子代理角色、模型绑定与权限工具边界。",
    keywords:
      "智能体 agent profile 角色 模板 探索 前端 后端 审查 隔离 worktree 工具组",
    icon: Users,
  },
  {
    id: "mcp",
    group: "代理与工具",
    title: "MCP 服务器",
    description: "外部工具服务器，对所有工作区生效。",
    keywords: "MCP stdio HTTP 服务器 工具 注册",
    icon: HardDrives,
  },
  {
    id: "plugins",
    group: "代理与工具",
    title: "插件",
    description: "启用、配置并检查内置插件，例如隔离浏览器。",
    keywords: "plugin 浏览器 browser 插件 启用 配置 依赖 检查 域名 权限",
    icon: PuzzlePiece,
  },
  {
    id: "language",
    group: "代理与工具",
    title: "语言服务",
    description: "配置本机 LSP 服务器，为代码提供诊断与语义能力。",
    keywords: "LSP 语言服务器 命令 参数 扩展名",
    icon: Code,
  },
  {
    id: "pairing",
    group: "连接",
    title: "手机连接",
    description: "在同一局域网公开当前核心，让 Android 扫码配对。",
    keywords: "手机 Android 扫码 二维码 局域网 LAN 配对 端口 地址",
    icon: DeviceMobile,
  },
] as const;

export const SECTION_GROUPS = ["常规", "模型", "代理与工具", "连接"] as const;

/**
 * Individual settings that search can jump to. `id` matches the
 * `SettingRow id` (rendered as `#setting-row-<id>`); entries without a row
 * land on the page itself.
 */
export const SETTING_INDEX: readonly {
  readonly id: string;
  readonly section: Section;
  readonly label: string;
  readonly keywords: string;
}[] = [
  {
    id: "theme",
    section: "general",
    label: "主题",
    keywords: "外观 深色 浅色 跟随系统 theme dark light",
  },
  {
    id: "defaultPermission",
    section: "general",
    label: "新运行的默认权限",
    keywords:
      "权限 只读 工作区 无限制 审批 命令 readonly workspace unrestricted",
  },
  {
    id: "requestTimeoutMs",
    section: "general",
    label: "请求空闲超时",
    keywords: "超时 timeout 流式 空闲 等待",
  },
  {
    id: "defaultModel",
    section: "models",
    label: "默认模型",
    keywords: "默认 模型 model 来源",
  },
  {
    id: "sources",
    section: "models",
    label: "模型来源",
    keywords: "来源 API 地址 密钥 凭据 key endpoint 协议 添加来源",
  },
  {
    id: "modelCards",
    section: "models",
    label: "模型参数（上下文窗口、最大输出、思考档位）",
    keywords:
      "上下文窗口 窗口 token 最大输出 协议 思考档位 覆盖 context window",
  },
  {
    id: "routeGroups",
    section: "models",
    label: "路由组",
    keywords: "路由 回退 轮询 route group",
  },
  {
    id: "import",
    section: "models",
    label: "导入来源",
    keywords: "导入 JSON 链接 import",
  },
  {
    id: "reasoningEffort",
    section: "reasoning",
    label: "默认思考等级",
    keywords: "思考 推理 reasoning effort 等级",
  },
  {
    id: "contextBudgetTokens",
    section: "reasoning",
    label: "上下文压缩预算",
    keywords: "上下文 token 压缩 预算 compact budget",
  },
  {
    id: "contextBudgetChars",
    section: "reasoning",
    label: "旧版字符预算",
    keywords: "兼容 字符 chars legacy",
  },
  {
    id: "agents",
    section: "agents",
    label: "智能体列表",
    keywords: "智能体 agent 角色 模板 子代理",
  },
  {
    id: "mcp",
    section: "mcp",
    label: "MCP 服务器",
    keywords: "MCP 工具 服务器 stdio http",
  },
  {
    id: "plugins",
    section: "plugins",
    label: "插件",
    keywords: "插件 浏览器 browser office 依赖",
  },
  {
    id: "lspServers",
    section: "language",
    label: "语言服务器",
    keywords: "LSP 语言 诊断 命令 扩展名",
  },
  {
    id: "pairing",
    section: "pairing",
    label: "手机配对",
    keywords: "手机 Android 扫码 局域网 配对",
  },
];

/** Android shell variant of the same `pairing` section: no LAN controls. */
export const mobilePairingSection = {
  id: "pairing",
  group: "连接",
  title: "服务器连接",
  description: "查看当前服务器地址，编辑或更换 Android 应用连接的服务器。",
  keywords: "当前服务器 编辑 更换 扫码 二维码 最近连接 地址 Android",
  icon: DeviceMobile,
} as const;

export type Section = (typeof sections)[number]["id"];
export type TextKey = {
  [K in keyof SettingsDraft]: SettingsDraft[K] extends string ? K : never;
}[keyof SettingsDraft];

const SECTION_EVENT = "forge:settings-section";
// Settings loads lazily, so a request made before it mounts is kept here.
let requestedSection: Section | null = null;

/** Ask Settings to show a page; used by links from outside Settings. */
export function requestSettingsSection(section: Section): void {
  requestedSection = section;
  window.dispatchEvent(new CustomEvent(SECTION_EVENT, { detail: section }));
}

/** The page requested before Settings mounted, if any (read once). */
export function takeRequestedSettingsSection(): Section | null {
  const section = requestedSection;
  requestedSection = null;
  return section;
}

export function subscribeSettingsSection(
  listener: (section: Section) => void,
): () => void {
  const handler = (event: Event) => {
    const section = (event as CustomEvent<unknown>).detail;
    if (sections.some((item) => item.id === section)) {
      requestedSection = null;
      listener(section as Section);
    }
  };
  window.addEventListener(SECTION_EVENT, handler);
  return () => window.removeEventListener(SECTION_EVENT, handler);
}
