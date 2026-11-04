import { ArrowUpRight, ClockCounterClockwise } from "@phosphor-icons/react";
import { isPrimarySession } from "@forge/core/shared/sessions";
import { useWorkbench } from "../../state/workbench-context";
import { ForgeMark } from "../primitives/ForgeMark";

const greeting = (hour: number) =>
  hour < 5 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";

const relative = (iso: string, now: number) => {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
};

export function Welcome() {
  const { state, selectSession } = useWorkbench();
  const now = Date.now();
  const recent = state.sessions
    .filter((session) => isPrimarySession(session) && !session.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);

  return (
    <div className="wb-new-session-scroll" role="region" aria-label="欢迎与最近任务">
      <section className="wb-new-session-intro" aria-labelledby="welcome-title">
        <div className="welcome-hero">
          <div className="welcome-heading">
            <span className="welcome-mark-wrap" aria-hidden="true">
              <ForgeMark className="welcome-mark" />
            </span>
            <div className="welcome-heading-text">
              <span className="welcome-eyebrow">{greeting(new Date(now).getHours())}</span>
              <h2 id="welcome-title">今天，想做点什么？</h2>
            </div>
          </div>
          <p>继续之前的工作，或开始一项新任务。</p>
        </div>
        <section
          className="welcome-recent"
          aria-labelledby="recent-tasks-title"
          aria-busy={state.isSessionsLoading}
        >
          <h3 id="recent-tasks-title">
            <ClockCounterClockwise size={14} aria-hidden="true" />
            最近任务
          </h3>
          {recent.length > 0 ? (
            <ul className="welcome-task-list">
              {recent.map((session, index) => {
                const workspace =
                  session.workspace.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || session.workspace;
                return (
                  <li key={session.id} style={{ "--i": index } as React.CSSProperties}>
                    <button
                      className="welcome-task"
                      type="button"
                      onClick={() => void selectSession(session.id)}
                    >
                      <span className="welcome-task-content">
                        <span className="welcome-task-title">{session.title}</span>
                        <span className="welcome-task-meta">
                          <span className="welcome-task-workspace" title={session.workspace}>
                            {workspace}
                          </span>
                          <time dateTime={session.updatedAt}>{relative(session.updatedAt, now)}</time>
                        </span>
                      </span>
                      <span className="welcome-task-go" aria-hidden="true">
                        <ArrowUpRight size={16} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="welcome-empty">
              {state.isSessionsLoading
                ? "正在读取最近任务…"
                : "还没有历史任务，从下方开始。"}
            </p>
          )}
        </section>
      </section>
    </div>
  );
}
