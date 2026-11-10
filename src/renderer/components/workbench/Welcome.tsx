import { isPrimarySession } from "@forge/core/shared";
import {
  ArrowRight,
  CheckCircle,
  CircleNotch,
  FolderSimple,
  HandPalm,
  type Icon,
  Pause,
  Sparkle,
  StopCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import * as m from "motion/react-m";
import { useId, useState } from "react";
import { dateEyebrow, greeting, relativeTime } from "#lib/relative-time";
import { spring } from "#lib/springs";
import { cn } from "#lib/utils";
import { Skeleton } from "#ui/skeleton";
import { Spinner } from "#ui/spinner";
import type { SessionStatus } from "../../shared-types";
import {
  shallowEqual,
  useWorkbenchActions,
  useWorkbenchSelector,
} from "../../state/workbench-store";
import { ForgeMark } from "../primitives/ForgeMark";

/** Same column the composer uses below, so hero, list and input line up. */
const column =
  "mx-auto w-[min(var(--reading-measure),calc(100%-2*var(--space-8)))] max-[1000px]:w-[calc(100%-2*var(--space-4))]";

const workspaceName = (workspace: string) =>
  workspace
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop() || workspace;

/** Status tile for a recent row: icon, tint and the spoken label. */
const statusTile: Readonly<
  Record<SessionStatus, { icon: Icon; tone: string; label: string }>
> = {
  running: {
    icon: CircleNotch,
    tone: "bg-brand-soft text-brand",
    label: "执行中",
  },
  awaiting_approval: {
    icon: HandPalm,
    tone: "bg-warning-soft text-warning",
    label: "待批准",
  },
  completed: {
    icon: CheckCircle,
    tone: "bg-success-soft text-success",
    label: "完成",
  },
  failed: {
    icon: WarningCircle,
    tone: "bg-error-soft text-error",
    label: "失败",
  },
  cancelled: {
    icon: StopCircle,
    tone: "bg-muted text-muted-foreground",
    label: "已取消",
  },
  interrupted: {
    icon: Pause,
    tone: "bg-warning-soft text-warning",
    label: "中断",
  },
  idle: {
    icon: Sparkle,
    tone: "bg-muted text-muted-foreground",
    label: "空闲",
  },
};

/** Shared selection for the recent list. */
function useRecent() {
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
  return { isSessionsLoading: state.isSessionsLoading, recent };
}

/**
 * Design A welcome (design-v2/spec.md §3.A). The composer is docked below
 * this scroll region (App.tsx keeps it at one tree position), so greeting
 * and recent tasks are one block centred in the space above it: no empty
 * band between the headline and the input, whatever the list length.
 */
export function Welcome() {
  return (
    <div
      className="wb-new-session-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain"
      // biome-ignore lint/a11y/useSemanticElements: the scroll owner stays a named region div (composer-surface test contract); the intro inside it is a <section>.
      role="region"
      aria-label="欢迎与最近任务"
    >
      <section
        className={cn(
          "wb-new-session-intro my-auto flex min-w-0 shrink-0 flex-col py-10 max-[1000px]:py-6 [@media(max-height:700px)]:py-4",
          column,
        )}
        aria-labelledby="welcome-title"
      >
        <WelcomeHeading />
        <WelcomeRecent />
      </section>
    </div>
  );
}

/** Date eyebrow and the two-line greeting (local clock only; no user name). */
function WelcomeHeading() {
  const now = new Date();
  return (
    <div className="welcome-heading fade-in-0 slide-in-from-bottom-1 flex animate-in flex-col gap-3 duration-300 ease-out">
      <p className="m-0 inline-flex items-center gap-2 font-medium text-brand text-meta">
        <ForgeMark className="welcome-mark size-5" />
        <span>{dateEyebrow(now)}</span>
      </p>
      <h2
        id="welcome-title"
        className="m-0 text-balance font-semibold text-foreground text-hero max-[640px]:text-[length:var(--text-hero-narrow)] max-[640px]:leading-[var(--leading-hero-narrow)]"
      >
        {greeting(now)}。
        <br />
        <span className="text-tertiary-text">今天，想做点什么？</span>
      </h2>
    </div>
  );
}

/**
 * Hairline list of recent tasks. Each row shows the session's real status,
 * title, workspace and updatedAt.
 */
function WelcomeRecent() {
  const { selectSession } = useWorkbenchActions();
  const { isSessionsLoading, recent } = useRecent();
  // One shared highlight glides between rows on hover / keyboard focus.
  const highlightId = useId();
  const [active, setActive] = useState<string | null>(null);
  const now = new Date();
  return (
    <section
      className="welcome-recent mt-10 min-w-0 max-[640px]:mt-7 [@media(max-height:700px)]:mt-5"
      aria-labelledby="recent-tasks-title"
      aria-busy={isSessionsLoading}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2 px-3 max-[640px]:px-1">
        <h3
          id="recent-tasks-title"
          className="m-0 font-medium text-meta text-tertiary-text"
        >
          最近任务
        </h3>
        {recent.length > 0 && (
          <span
            aria-hidden="true"
            className="text-caption text-muted-foreground tabular-nums"
          >
            {recent.length}
          </span>
        )}
      </div>
      {recent.length > 0 ? (
        <ul
          className="welcome-task-list m-0 grid min-w-0 list-none grid-cols-[minmax(0,1fr)] p-0"
          onPointerLeave={() => setActive(null)}
        >
          {recent.map((session, index) => {
            const tile = statusTile[session.status] ?? statusTile.idle;
            const TileIcon = tile.icon;
            const when = relativeTime(session.updatedAt, now);
            return (
              <li
                key={session.id}
                className="relative min-w-0 fade-in-0 slide-in-from-bottom-1 animate-in fill-mode-backwards duration-200 ease-out"
                style={{ animationDelay: `${80 + index * 40}ms` }}
              >
                {active === session.id && (
                  <m.span
                    layoutId={highlightId}
                    transition={spring.snappy}
                    aria-hidden="true"
                    className="absolute inset-0 rounded-item bg-hover-wash"
                  />
                )}
                <button
                  className={cn(
                    "welcome-task group relative flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3.5 rounded-item border-0 bg-transparent px-3 py-3 text-left font-[inherit] text-foreground max-[640px]:px-1",
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
                    title={tile.label}
                    className={cn(
                      "welcome-task-status flex size-8 shrink-0 items-center justify-center rounded-control",
                      tile.tone,
                    )}
                  >
                    <TileIcon
                      size={15}
                      weight={session.status === "running" ? "bold" : "fill"}
                      className={
                        session.status === "running"
                          ? "motion-safe:animate-spin motion-safe:[animation-duration:1.6s]"
                          : undefined
                      }
                    />
                  </span>
                  <span className="welcome-task-content min-w-0 flex-1">
                    <span className="welcome-task-title block truncate font-medium text-ui max-[640px]:line-clamp-2 max-[640px]:whitespace-normal max-[640px]:[overflow-wrap:anywhere]">
                      {session.title}
                    </span>
                    <span className="welcome-task-meta mt-0.5 flex min-w-0 items-center gap-2 text-meta text-tertiary-text">
                      <span className="sr-only">{tile.label}，</span>
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
                    </span>
                  </span>
                  <time
                    className="shrink-0 text-caption text-muted-foreground tabular-nums"
                    dateTime={session.updatedAt}
                  >
                    {when}
                  </time>
                  <ArrowRight
                    size={15}
                    aria-hidden="true"
                    className="-translate-x-1 shrink-0 text-tertiary-text opacity-0 transition-[opacity,transform] duration-[var(--duration-normal)] ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 max-[640px]:hidden"
                  />
                </button>
                {index < recent.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 bottom-0 left-[58px] h-px bg-hairline max-[640px]:left-[46px]"
                  />
                )}
              </li>
            );
          })}
        </ul>
      ) : isSessionsLoading ? (
        <div>
          <p className="welcome-empty m-0 flex min-h-11 items-center gap-2 px-3 text-meta text-muted-foreground">
            <Spinner className="size-3.5" />
            正在读取最近任务…
          </p>
          {[72, 60, 48].map((width) => (
            <div
              key={width}
              aria-hidden="true"
              className="flex items-center gap-3.5 px-3 py-3"
            >
              <Skeleton className="size-8 rounded-control" />
              <div className="grid flex-1 gap-2">
                <Skeleton
                  className="h-3.5 rounded-full"
                  style={{ width: `${width}%` }}
                />
                <Skeleton className="h-3 w-2/5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <section
          className="welcome-empty flex items-center gap-4 rounded-card border border-hairline-strong border-dashed px-5 py-4 text-meta text-secondary-text"
          aria-label="还没有历史任务，从下方开始。"
        >
          <EmptyIllustration />
          <p className="m-0">还没有历史任务，从下方开始。</p>
        </section>
      )}
    </section>
  );
}

/** Inline empty-state illustration; tokens only, no external asset. */
function EmptyIllustration() {
  return (
    <svg
      width="66"
      height="54"
      viewBox="0 0 88 72"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect
        x="14"
        y="14"
        width="60"
        height="46"
        rx="10"
        fill="var(--surface-soft)"
        transform="rotate(-6 44 37)"
      />
      <rect
        x="12"
        y="10"
        width="64"
        height="48"
        rx="11"
        fill="var(--surface-elevated)"
        stroke="var(--hairline-strong)"
      />
      <rect
        x="22"
        y="22"
        width="26"
        height="5"
        rx="2.5"
        fill="var(--hairline-strong)"
      />
      <rect x="22" y="32" width="40" height="4" rx="2" fill="var(--hairline)" />
      <rect x="22" y="40" width="32" height="4" rx="2" fill="var(--hairline)" />
      <circle cx="70" cy="14" r="9" fill="var(--accent)" />
      <path
        d="M70 9.5v9M65.5 14h9"
        stroke="var(--on-accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
