import {
  ArrowClockwise,
  CheckCircle,
  Clock,
  Question,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { SessionStatus } from "../../shared-types";
import "./status-badge.css";

export type BadgeStatus = SessionStatus | "queued" | "unknown";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "muted";

export interface StatusBadgeProps {
  readonly status: BadgeStatus | string;
  readonly label?: string;
  readonly className?: string;
}

export interface ToneBadgeProps {
  readonly tone: BadgeTone;
  readonly children: ReactNode;
  /** `mono` 用于计数类内容（如 3/5），使用等宽数字。 */
  readonly mono?: boolean;
  readonly className?: string;
}

const STATUS_CONFIG: Record<
  BadgeStatus,
  {
    readonly text: string;
    readonly icon: typeof CheckCircle;
    readonly spin?: boolean;
  }
> = {
  idle: { text: "空闲", icon: Clock },
  queued: { text: "已排队", icon: Clock },
  running: { text: "运行中", icon: ArrowClockwise, spin: true },
  awaiting_approval: { text: "待批准", icon: WarningCircle },
  completed: { text: "完成", icon: CheckCircle },
  failed: { text: "失败", icon: XCircle },
  cancelled: { text: "已取消", icon: Clock },
  interrupted: { text: "已中断，检查后重试", icon: WarningCircle },
  unknown: { text: "状态未知", icon: Question },
};

/** 会话/运行状态徽标：图标 + 文案，带 `状态：…` 可访问名称。 */
export function StatusBadge({
  status,
  label,
  className = "",
}: StatusBadgeProps) {
  const isKnown = status in STATUS_CONFIG;
  const config = isKnown
    ? STATUS_CONFIG[status as BadgeStatus]
    : STATUS_CONFIG.unknown;
  const Icon = config.icon;
  const displayText = label ?? config.text;
  const statusClass = isKnown
    ? `status-badge-${status}`
    : "status-badge-unknown";

  return (
    <output
      className={`status-badge ${statusClass} ${className}`.trim()}
      aria-label={`状态：${displayText}`}
    >
      <Icon
        size={13}
        weight="bold"
        aria-hidden="true"
        className={config.spin ? "status-spin" : undefined}
      />
      <span>{displayText}</span>
    </output>
  );
}

/**
 * 语义色调徽标：用于计划进度、请求结果、顾问请求等"状态胶囊"，
 * 统一替代各面板自绘的 `*-badge is-xxx` / `*-status is-xxx` 样式。
 */
export function ToneBadge({
  tone,
  children,
  mono = false,
  className = "",
}: ToneBadgeProps) {
  const classes = [
    "status-badge",
    "status-badge-compact",
    `status-badge-tone-${tone}`,
    mono ? "status-badge-mono" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <span className={classes}>{children}</span>;
}
