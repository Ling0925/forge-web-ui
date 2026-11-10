import { isPrimarySession } from "@forge/core/shared";
import {
  ArrowUpRight,
  ChatCircleText,
  ClockCounterClockwise,
  FolderSimple,
  Sparkle,
} from "@phosphor-icons/react";
import * as m from "motion/react-m";
import { useId, useState } from "react";
import { cn } from "#lib/utils";
import { Badge } from "#ui/badge";
import { Skeleton } from "#ui/skeleton";
import { Spinner } from "#ui/spinner";
import {
  shallowEqual,
  useWorkbenchActions,
  useWorkbenchSelector,
} from "../../state/workbench-store";
import { ForgeMark } from "../primitives/ForgeMark";

/** Same column the composer uses below, so hero, list and input line up. */
const column =
  "mx-auto w-[min(var(--reading-measure),calc(100%-2*var(--space-8)))] max-[1000px]:w-[calc(100%-2*var(--space-4))]";

const listShell =
  "m-0 grid list-none gap-0.5 rounded-xl border border-border bg-card/80 p-1 shadow-xs backdrop-blur-sm";

const workspaceName = (workspace: string) =>
  workspace
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop() || workspace;

export function Welcome() {
  const { selectSession } = useWorkbenchActions();
  const state = useWorkbenchSelector(
    ({ state }) => ({
      isSessionsLoading: state.isSessionsLoading,
      sessions: state.sessions,
    }),
    shallowEqual,
  );
  const recent = state.sessions
    .filter((session) => isPrimarySession(session) && !session.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4);
  // One shared highlight glides between rows on hover / keyboard focus.
  const highlightId = useId();
  const [active, setActive] = useState<string | null>(null);

  return (
    <div
      className="wb-new-session-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain"
      role="region"
      aria-label="欢迎与最近任务"
    >
      <section
        className={cn(
          "wb-new-session-intro my-auto flex shrink-0 flex-col py-8 max-[1000px]:py-4 [@media(max-height:700px)]:py-4",
          "fade-in-0 slide-in-from-bottom-2 animate-in duration-300 ease-out",
          column,
        )}
        aria-labelledby="welcome-title"
      >
        <div className="welcome-heading flex flex-col items-center gap-4 text-center">
          <div className="relative">
            <span
              aria-hidden="true"
              className="-inset-5 absolute rounded-full bg-brand/25 blur-2xl"
            />
            <span className="relative flex size-14 items-center justify-center rounded-xl border border-border bg-card shadow-card">
              <ForgeMark className="welcome-mark size-9" />
            </span>
          </div>
          <h2
            id="welcome-title"
            className="m-0 text-balance font-semibold text-2xl text-foreground tracking-tight max-[640px]:text-xl"
          >
            今天，想做点什么？
          </h2>
        </div>
        <p className="mx-auto mt-2 mb-0 max-w-[36ch] text-balance text-center text-secondary-text text-sm">
          继续之前的工作，或开始一项新任务。
        </p>
        <section
          className="welcome-recent mt-8 max-[640px]:mt-6"
          aria-labelledby="recent-tasks-title"
          aria-busy={state.isSessionsLoading}
        >
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <h3
              id="recent-tasks-title"
              className="m-0 inline-flex items-center gap-1.5 font-medium text-secondary-text text-xs"
            >
              <ClockCounterClockwise size={14} aria-hidden="true" />
              最近任务
            </h3>
            {recent.length > 0 && (
              <Badge variant="secondary" aria-hidden="true">
                {recent.length}
              </Badge>
            )}
          </div>
          {recent.length > 0 ? (
            <ul
              className={cn("welcome-task-list", listShell)}
              onPointerLeave={() => setActive(null)}
            >
              {recent.map((session, index) => (
                <li
                  key={session.id}
                  className="relative fade-in-0 slide-in-from-bottom-1 animate-in fill-mode-backwards duration-200 ease-out"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  {active === session.id && (
                    <m.span
                      layoutId={highlightId}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-lg bg-accent"
                    />
                  )}
                  <button
                    className={cn(
                      "welcome-task group relative flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 py-2.5 text-left font-[inherit] text-foreground",
                      "outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus-ring)]",
                    )}
                    type="button"
                    onPointerEnter={() => setActive(session.id)}
                    onFocus={() => setActive(session.id)}
                    onBlur={() => setActive(null)}
                    onClick={() => void selectSession(session.id)}
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand transition-transform duration-[var(--duration-normal)] ease-out group-hover:scale-105"
                    >
                      <ChatCircleText size={18} weight="duotone" />
                    </span>
                    <span className="welcome-task-content min-w-0 flex-1">
                      <span className="welcome-task-title line-clamp-2 font-medium text-sm [overflow-wrap:anywhere]">
                        {session.title}
                      </span>
                      <span className="welcome-task-meta mt-0.5 flex min-w-0 items-center gap-3 text-muted-foreground text-xs">
                        <span
                          className="inline-flex min-w-0 items-center gap-1"
                          title={session.workspace}
                        >
                          <FolderSimple
                            size={12}
                            aria-hidden="true"
                            className="shrink-0"
                          />
                          <span className="truncate">
                            {workspaceName(session.workspace)}
                          </span>
                        </span>
                        <time className="shrink-0" dateTime={session.updatedAt}>
                          {new Date(session.updatedAt).toLocaleDateString(
                            "zh-CN",
                            { month: "numeric", day: "numeric" },
                          )}
                        </time>
                      </span>
                    </span>
                    <ArrowUpRight
                      size={16}
                      aria-hidden="true"
                      className="shrink-0 text-muted-foreground transition-[color,transform] duration-[var(--duration-normal)] ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand group-focus-visible:text-brand"
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : state.isSessionsLoading ? (
            <div className={listShell}>
              <p className="welcome-empty m-0 flex min-h-11 items-center gap-2 px-3 text-muted-foreground text-xs">
                <Spinner className="size-3.5" />
                正在读取最近任务…
              </p>
              {[0, 1].map((row) => (
                <div
                  key={row}
                  aria-hidden="true"
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <Skeleton className="size-9 rounded-lg" />
                  <div className="grid flex-1 gap-1.5">
                    <Skeleton className="h-3 w-3/5" />
                    <Skeleton className="h-2.5 w-2/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <section
              className="welcome-empty flex items-center gap-3 rounded-xl border border-border border-dashed bg-card/60 px-4 py-3 text-secondary-text text-sm"
              aria-label="还没有历史任务，从下方开始。"
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
              >
                <Sparkle size={18} weight="duotone" />
              </span>
              <p className="m-0">还没有历史任务，从下方开始。</p>
            </section>
          )}
        </section>
      </section>
    </div>
  );
}
