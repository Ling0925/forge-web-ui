import type { HTMLAttributes, ReactNode } from "react";
import "./tag.css";

export type TagTone = "neutral" | "muted" | "accent" | "success" | "warning";

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** `neutral` 默认的元信息；`muted` 次要信息；其余为带语义色的强调标签。 */
  readonly tone?: TagTone;
  /** 等宽数字/标识符（版本号、ID、路径）。 */
  readonly mono?: boolean;
  readonly children?: ReactNode;
}

/**
 * 元信息标签（计数、模型名、凭据数、策略等）。
 * 状态语义（运行中 / 失败 / 已启用）请用 `StatusBadge` / `ToneBadge`。
 */
export function Tag({
  tone = "neutral",
  mono = false,
  className = "",
  children,
  ...rest
}: TagProps) {
  const classes = ["tag", `tag-${tone}`, mono ? "tag-mono" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
