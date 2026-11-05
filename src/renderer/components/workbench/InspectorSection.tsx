import { CaretRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Collapsible } from "../primitives/Collapsible";

export interface InspectorSectionProps {
  readonly id: string;
  readonly title: string;
  /** One-line state shown beside the title whether or not the body is open. */
  readonly summary?: ReactNode;
  readonly open: boolean;
  readonly onToggle: (open: boolean) => void;
  /** Header-level action (e.g. 压缩上下文); kept outside the toggle button. */
  readonly action?: ReactNode;
  readonly tone?: "default" | "attention";
  readonly children: ReactNode;
}

/**
 * 会话详情的单列分区：标题行（展开箭头 + 标题 + 一行摘要 + 可选操作），
 * 正文用 Collapsible 平滑展开。
 */
export function InspectorSection({
  id,
  title,
  summary,
  open,
  onToggle,
  action,
  tone = "default",
  children,
}: InspectorSectionProps) {
  const bodyId = `inspector-section-${id}`;
  return (
    <section
      className={`inspector-sec${open ? " is-open" : ""}${tone === "attention" ? " is-attention" : ""}`}
      aria-label={title}
      data-section={id}
    >
      <div className="inspector-sec-head">
        <button
          type="button"
          className="inspector-sec-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onToggle(!open)}
        >
          <CaretRight
            size={11}
            weight="bold"
            className="inspector-sec-caret"
            aria-hidden="true"
          />
          <span className="inspector-sec-title">{title}</span>
          {summary !== undefined && summary !== null && (
            <span className="inspector-sec-summary">{summary}</span>
          )}
        </button>
        {action && <div className="inspector-sec-action">{action}</div>}
      </div>
      <Collapsible open={open} id={bodyId}>
        <div className="inspector-sec-body">{children}</div>
      </Collapsible>
    </section>
  );
}
