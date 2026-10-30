import {
  Code,
  Cpu,
  DeviceMobile,
  Lock,
  Palette,
  Plugs,
  PuzzlePiece,
  ShieldCheck,
  ShieldWarning,
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
    id: "connection",
    title: "模型连接",
    description: "连接你的模型服务，选择协议与默认模型。",
    keywords:
      "API 端点 密钥 model reasoning 思考强度 默认思考等级 路由组 导入来源",
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
    id: "agents",
    title: "智能体",
    description: "配置子代理角色、模型绑定与权限工具边界。",
    keywords:
      "智能体 agent profile 角色 模板 探索 前端 后端 审查 隔离 worktree 工具组",
    icon: Users,
  },
  {
    id: "context",
    title: "上下文与记忆",
    description: "控制输入预算与模型窗口，平衡连续性和成本。",
    keywords: "token 压缩 compact 字符预算 模型窗口",
    icon: Cpu,
  },
  {
    id: "language",
    title: "语言服务",
    description: "配置本机 LSP 服务器，为代码提供智能诊断与语义能力。",
    keywords: "LSP 命令 参数 扩展名",
    icon: Code,
  },
  {
    id: "plugins",
    title: "插件",
    description: "显式启用、配置并检查 Core 注册的插件，例如隔离浏览器。",
    keywords: "plugin 浏览器 browser 插件 启用 配置 依赖 检查 域名 权限",
    icon: PuzzlePiece,
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
export const mobilePairingSection = {
  id: "pairing",
  title: "服务器连接",
  description: "查看当前服务器地址，编辑或更换 Android 应用连接的服务器。",
  keywords: "当前服务器 编辑 更换 扫码 二维码 最近连接 地址 Android",
  icon: DeviceMobile,
} as const;

export type Section = (typeof sections)[number]["id"];
export type TextKey = {
  [K in keyof SettingsDraft]: SettingsDraft[K] extends string ? K : never;
}[keyof SettingsDraft];
