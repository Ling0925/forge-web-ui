import type { WorkItem } from "@forge/core/shared";
import { WORK_STATUS_LABELS } from "../../state/superagent";
import { Button } from "../primitives/Button";
import { Tag, type TagTone } from "../primitives/Tag";
import "./superagent.css";

const TONES: Readonly<Record<WorkItem["status"], TagTone>> = {
  queued: "muted",
  running: "accent",
  waiting: "warning",
  ready: "success",
  blocked: "warning",
  failed: "warning",
  stopped: "muted",
  done: "success",
};

/** Work items routed by this Router session (super-agent `routerSessionId`). */
export function SuperAgentWorkList({
  items,
  onOpen,
}: {
  readonly items: readonly WorkItem[];
  readonly onOpen: (workerSessionId: string) => void;
}) {
  const sorted = [...items].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
  return (
    <ul className="superagent-work-list" aria-label="工作项">
      {sorted.map((item) => (
        <li key={item.id} className="superagent-work-item">
          <div className="inspector-attention-meta">
            <span className="inspector-attention-title" title={item.brief}>
              {item.title || item.id}
            </span>
            <Tag tone={TONES[item.status]}>
              {WORK_STATUS_LABELS[item.status]}
              {item.pendingStatus ? " · 待审批" : ""}
            </Tag>
          </div>
          {item.progress && (
            <span className="wb-muted superagent-attention-sub">
              {item.progress}
            </span>
          )}
          {item.workerSessionId && (
            <div className="superagent-attention-actions">
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  item.workerSessionId && onOpen(item.workerSessionId)
                }
              >
                打开 Worker
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
