import { Tray } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import "./states.css";

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly icon?: ReactNode;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly action?: ReactNode;
  readonly className?: string;
  /**
   * `default`：居中、带图标，用于整块区域为空；
   * `inline`：左对齐的虚线卡片，用于设置页列表/分组内的空状态；
   * `compact`：无边框、弱化文字，用于侧栏、详情面板、图表卡片等小区域。
   */
  readonly variant?: "default" | "inline" | "compact";
}

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  action,
  className = "",
  variant = "default",
}: EmptyStateProps) {
  const showIcon = variant === "default" || icon !== undefined;
  const Title = variant === "compact" ? "p" : "h3";
  return (
    <section
      className={`empty-state empty-state-${variant} ${className}`.trim()}
      aria-label={title}
    >
      {showIcon && (
        <div className="empty-state-icon" aria-hidden="true">
          {icon ?? <Tray size={24} weight="regular" />}
        </div>
      )}
      <div className="empty-state-body">
        <Title className="empty-state-title">{title}</Title>
        {description && (
          <p className="empty-state-description">{description}</p>
        )}
      </div>
      {(actionLabel || action) && (
        <div className="empty-state-action">
          {action ? (
            action
          ) : actionLabel && onAction ? (
            <Button variant="secondary" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
