import { CaretRight, Robot } from "@phosphor-icons/react";
import type { SessionSummary } from "../../shared-types";
import {
  WORK_STATUS_LABELS,
  type WorkerEntry,
  groupAgentSessions,
  superAgentStore,
  useSuperAgent,
} from "../../state/superagent";
import { Tag } from "../primitives/Tag";
import { SessionListItem } from "./SessionListItem";
import { SuperAgentLoadState } from "./SuperAgentLoadState";
import "./superagent.css";

function WorkerRow({ entry }: { readonly entry: WorkerEntry<SessionSummary> }) {
  const { session, work } = entry;
  return (
    <SessionListItem
      session={session}
      displayTitle={work?.title || undefined}
      badge={
        <Tag
          tone="muted"
          className="superagent-role-tag"
          title={
            work
              ? `Worker · 工作项 ${work.id} · ${WORK_STATUS_LABELS[work.status]}`
              : `Worker · 工作项 ${session.agentRole?.ownerId ?? ""}`
          }
        >
          {work ? WORK_STATUS_LABELS[work.status] : "Worker"}
        </Tag>
      }
    />
  );
}

/**
 * Super-agent Router and Worker sessions (core `agentRole`), kept out of the
 * workspace folders: Workers live in per-session worktrees, so folder grouping
 * would scatter them.
 */
export function SuperAgentSessions({
  sessions,
  collapsed,
  onToggle,
}: {
  readonly sessions: readonly SessionSummary[];
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}) {
  const view = useSuperAgent();
  if (
    sessions.length === 0 &&
    (view.status === "disabled" || view.status === "not-supported") &&
    view.requests.state !== "loading" &&
    view.requests.state !== "error"
  )
    return null;
  const loadState = (
    <SuperAgentLoadState
      view={view}
      onRetry={() => void superAgentStore.load()}
    />
  );
  if (sessions.length === 0) return loadState;
  const { routers, unassigned } = groupAgentSessions(sessions, view);
  const bodyId = "sidebar-folder-superagent";
  return (
    <section className="session-folder superagent-folder">
      <div className="session-folder-header-row">
        <button
          type="button"
          className={`session-folder-header${collapsed ? " is-collapsed" : ""}`}
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          title="Super-agent 的 Router 与 Worker 会话"
        >
          <CaretRight
            size={11}
            weight="bold"
            className="session-folder-caret"
            aria-hidden="true"
          />
          <Robot
            size={13}
            weight="regular"
            className="session-folder-icon"
            aria-hidden="true"
          />
          <span className="session-folder-name">Super-agent</span>
          <span className="session-folder-count">{sessions.length}</span>
        </button>
      </div>
      {loadState}
      <div
        className={`session-folder-collapse${collapsed ? " is-collapsed" : ""}`}
        id={bodyId}
        aria-hidden={collapsed}
      >
        <div className="session-folder-body">
          {routers.map(({ router, workers }) => (
            <div key={router.id} className="superagent-router-group">
              <SessionListItem
                session={router}
                badge={
                  <Tag
                    tone="accent"
                    className="superagent-role-tag"
                    title="Router：只负责分派工作"
                  >
                    Router
                  </Tag>
                }
              />
              {workers.length > 0 && (
                <ul className="superagent-workers" aria-label="Worker 会话">
                  {workers.map((entry) => (
                    <li key={entry.session.id}>
                      <WorkerRow entry={entry} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {unassigned.length > 0 && (
            <ul
              className="superagent-workers is-unassigned"
              aria-label="未关联 Router 的 Worker 会话"
            >
              {unassigned.map((entry) => (
                <li key={entry.session.id}>
                  <WorkerRow entry={entry} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
