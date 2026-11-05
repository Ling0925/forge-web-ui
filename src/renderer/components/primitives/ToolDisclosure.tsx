import { CaretRight } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { Collapsible } from "./Collapsible";
import { StatusGlyph } from "./tool-disclosure/common";
import { ToolDisclosureContent } from "./tool-disclosure/content";
import { createToolDisclosureModel } from "./tool-disclosure/model";
import { formatDuration, getToolIcon } from "./tool-disclosure/presentation";
import { type ToolDisclosureProps } from "./tool-disclosure/types";
import "./tool-disclosure.css";
export type { ToolDisclosureProps } from "./tool-disclosure/types";
export { friendlyLabel, getToolIcon } from "./tool-disclosure/presentation";
export {
  extractPlanData,
  PlanStepsList,
  type PlanItemData,
  type PlanStepItem,
} from "./tool-disclosure/plans";

/**
 * The single tool-call row for every lifecycle state (generating → awaiting
 * approval → running → completed / failed / cancelled). The DOM structure
 * never changes between states: only `data-status` does, so colour, glyph and
 * details transition in place instead of one component replacing another.
 */
export function ToolDisclosure(props: ToolDisclosureProps) {
  const {
    toolName,
    status,
    durationMs,
    defaultExpanded,
    autoCollapsed = false,
    className = "",
    detail,
    meta,
    footer,
  } = props;
  // Arguments that are still streaming have nothing to disclose yet.
  const expandable = status !== "generating";
  const model = createToolDisclosureModel(props);
  const {
    writesFiles,
    label,
    readPath,
    displayTarget,
    diffTotals,
    statusLabel,
    clock,
    stamp,
  } = model;

  // File modifications and failed tools open by default. Read-only queries and
  // terminal commands default to collapsed quiet rows from start to finish,
  // preventing jarring momentary expand/collapse jitter as fast tools complete.
  const initialExpanded =
    defaultExpanded !== undefined
      ? defaultExpanded
      : writesFiles || status === "failed";
  const [expanded, setExpanded] = useState(initialExpanded);
  const manuallyToggled = useRef(false);
  const detailsId = useId();

  useEffect(() => {
    if (
      defaultExpanded !== undefined ||
      manuallyToggled.current ||
      autoCollapsed
    )
      return;
    // Auto-reveal on failure so errors are prominently displayed. Never
    // auto-collapse tools upon completion (which caused sudden collapse jumps).
    if (status === "failed") {
      setExpanded(true);
    }
  }, [status, defaultExpanded, autoCollapsed]);

  // Phases fold once when they pass into history. Remember which phase already
  // folded so a manual reopen is respected until the item enters a new phase.
  const foldedPhase = useRef(false);
  useEffect(() => {
    if (autoCollapsed && !foldedPhase.current) {
      foldedPhase.current = true;
      if (!manuallyToggled.current) setExpanded(false);
    } else if (!autoCollapsed) {
      foldedPhase.current = false;
    }
  }, [autoCollapsed]);

  return (
    <section
      className={`tool-disclosure ${className}`.trim()}
      aria-label={`工具调用：${toolName}`}
      data-status={status}
      data-tool={toolName}
      data-expanded={expanded ? "true" : "false"}
    >
      <button
        type="button"
        className="tool-disclosure-header"
        disabled={!expandable}
        onClick={() => {
          manuallyToggled.current = true;
          setExpanded((value) => !value);
        }}
        aria-expanded={expandable ? expanded : undefined}
        aria-controls={expandable ? detailsId : undefined}
      >
        <div className="tool-disclosure-summary">
          <span className="tool-disclosure-icon" aria-hidden="true">
            {getToolIcon(toolName)}
          </span>
          <span className="tool-disclosure-label">{label}</span>
          {detail !== undefined ? (
            <span className="tool-disclosure-target">{detail}</span>
          ) : (
            displayTarget && (
              <span
                className="tool-disclosure-target"
                title={readPath || displayTarget}
              >
                {displayTarget}
              </span>
            )
          )}
        </div>
        <div className="tool-disclosure-meta">
          {status === "failed" && (
            <span className="tool-disclosure-failure">失败</span>
          )}
          {meta}
          {diffTotals.added > 0 && (
            <span className="tool-diff-stat tool-diff-added">
              +{diffTotals.added}
            </span>
          )}
          {diffTotals.removed > 0 && (
            <span className="tool-diff-stat tool-diff-removed">
              -{diffTotals.removed}
            </span>
          )}
          {(durationMs !== undefined || clock) && (
            <span
              className="tool-disclosure-time"
              {...(stamp === undefined ? {} : { title: stamp })}
            >
              {durationMs !== undefined
                ? formatDuration(durationMs)
                : (clock ?? "")}
            </span>
          )}
          <StatusGlyph status={status} label={statusLabel} />
          <span
            className={`tool-disclosure-chevron ${expanded ? "is-expanded" : ""}`}
            aria-hidden="true"
          >
            <CaretRight size={13} weight="bold" />
          </span>
        </div>
      </button>

      {footer}
      <Collapsible open={expandable && expanded} id={detailsId}>
        <ToolDisclosureContent props={props} model={model} />
      </Collapsible>
    </section>
  );
}

/** Canonical name: the transcript's one tool-call component. */
export const ToolCall = ToolDisclosure;
