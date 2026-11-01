import type {
  OutboxItem,
  Suggestion,
  SuperAgentEvent,
  WorkItem,
} from "@forge/core/shared";
import type { ForgeBridge, HostEvent, RunEvent } from "@forge/core/shared/ipc";
import type { SessionSummary } from "@forge/core/shared/schemas";
import { useSyncExternalStore } from "react";

/** Host events are run events (`{ runId, event }`) or flat super-agent events. */
export const isRunEvent = (event: HostEvent): event is RunEvent =>
  "event" in event;

export interface SuperAgentView {
  /**
   * `unknown` until probed. `disabled` covers every "not available" case: an
   * older host without the RPCs, super-agent turned off (`not_found`) or any
   * probe failure. Nothing super-agent related renders unless `enabled`.
   */
  readonly status: "unknown" | "disabled" | "enabled";
  readonly routerSessionId: string | null;
  readonly workItems: readonly WorkItem[];
  readonly suggestions: readonly Suggestion[];
  readonly outbox: readonly OutboxItem[];
}

const EMPTY: SuperAgentView = Object.freeze({
  status: "unknown",
  routerSessionId: null,
  workItems: [],
  suggestions: [],
  outbox: [],
});

type Bridge = Pick<
  ForgeBridge,
  | "getSuperAgentState"
  | "listWorkItems"
  | "listSuggestions"
  | "listOutbox"
  | "decideOutbox"
  | "decideSuggestion"
>;

function upsert<T extends { readonly id: string }>(
  list: readonly T[],
  item: T,
): readonly T[] {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index < 0) return [...list, item];
  const next = list.slice();
  next[index] = item;
  return next;
}

export function createSuperAgentStore(bridge: () => Bridge | undefined) {
  let view = EMPTY;
  let generation = 0;
  const listeners = new Set<() => void>();
  const set = (next: SuperAgentView) => {
    view = next;
    for (const listener of listeners) listener();
  };
  const quiet = <T>(call: (() => Promise<T>) | undefined, fallback: T) =>
    call ? call().catch(() => fallback) : Promise.resolve(fallback);

  async function load(): Promise<void> {
    const host = bridge();
    const run = ++generation;
    const getState = host?.getSuperAgentState;
    if (!host || !getState) {
      set({ ...EMPTY, status: "disabled" });
      return;
    }
    let routerSessionId: string | null;
    try {
      routerSessionId = (await getState.call(host)).routerSessionId;
    } catch {
      // `not_found` (disabled), an older host rejecting the method, or a
      // transport failure: all mean "no super-agent UI", never an error.
      if (run === generation) set({ ...EMPTY, status: "disabled" });
      return;
    }
    const listWorkItems = host.listWorkItems?.bind(host);
    const listSuggestions = host.listSuggestions?.bind(host);
    const listOutbox = host.listOutbox?.bind(host);
    const [workItems, suggestions, outbox] = await Promise.all([
      quiet(listWorkItems && (() => listWorkItems()), []),
      quiet(listSuggestions && (() => listSuggestions("pending")), []),
      quiet(listOutbox && (() => listOutbox("pending")), []),
    ]);
    if (run !== generation) return;
    // Events that raced the lists are newer than the list snapshot.
    const merge = <T extends { readonly id: string }>(
      base: readonly T[],
      live: readonly T[],
    ) => live.reduce(upsert, base);
    set({
      status: "enabled",
      routerSessionId,
      workItems: merge(workItems, view.workItems),
      suggestions: merge(suggestions, view.suggestions),
      outbox: merge(outbox, view.outbox),
    });
  }

  function apply(event: SuperAgentEvent): void {
    switch (event.type) {
      case "superagent_work":
        set({ ...view, workItems: upsert(view.workItems, event.work) });
        break;
      case "superagent_suggestion":
        set({
          ...view,
          suggestions: upsert(view.suggestions, event.suggestion),
        });
        break;
      case "superagent_outbox":
        set({ ...view, outbox: upsert(view.outbox, event.item) });
        break;
      default:
        // Triggers, catch-up and board-stream status are not shown yet.
        return;
    }
    // An event proves super-agent is running even if the probe lost a race.
    if (view.status !== "enabled") void load();
  }

  async function decideOutbox(id: string, approve: boolean) {
    const host = bridge();
    if (!host?.decideOutbox) throw new Error("当前服务不支持发送队列审批。");
    const item = await host.decideOutbox(id, approve);
    set({ ...view, outbox: upsert(view.outbox, item) });
    return item;
  }

  async function decideSuggestion(id: string, accept: boolean) {
    const host = bridge();
    if (!host?.decideSuggestion) throw new Error("当前服务不支持处理建议。");
    const suggestion = await host.decideSuggestion(id, accept);
    set({ ...view, suggestions: upsert(view.suggestions, suggestion) });
    return suggestion;
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => view,
    load,
    apply,
    decideOutbox,
    decideSuggestion,
    reset: () => {
      generation++;
      set(EMPTY);
    },
  };
}

export type SuperAgentStore = ReturnType<typeof createSuperAgentStore>;

export const superAgentStore = createSuperAgentStore(() =>
  typeof window === "undefined" ? undefined : window.forge,
);

export function useSuperAgent(store: SuperAgentStore = superAgentStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

/** Work items whose Worker session is `sessionId` or whose Router is it. */
export function workItemForWorker(
  view: SuperAgentView,
  sessionId: string,
): WorkItem | undefined {
  return view.workItems.find((item) => item.workerSessionId === sessionId);
}

export function workItemsForRouter(
  view: SuperAgentView,
  sessionId: string,
): readonly WorkItem[] {
  return view.workItems.filter((item) => item.routerSessionId === sessionId);
}

export const pendingOutbox = (view: SuperAgentView) =>
  view.status === "enabled"
    ? view.outbox.filter((item) => item.state === "pending")
    : [];
export const pendingSuggestions = (view: SuperAgentView) =>
  view.status === "enabled"
    ? view.suggestions.filter((item) => item.state === "pending")
    : [];

export const WORK_STATUS_LABELS: Readonly<Record<WorkItem["status"], string>> =
  {
    queued: "排队中",
    running: "进行中",
    waiting: "等待输入",
    ready: "待审阅",
    blocked: "受阻",
    failed: "失败",
    stopped: "已停止",
    done: "已完成",
  };

type RoleSession = Pick<
  SessionSummary,
  "id" | "agentRole" | "createdAt" | "title"
>;
export interface WorkerEntry<S extends RoleSession> {
  readonly session: S;
  readonly work: WorkItem | undefined;
}
export interface RouterGroup<S extends RoleSession> {
  readonly router: S;
  readonly workers: readonly WorkerEntry<S>[];
}

/**
 * Router/Worker sessions grouped by core's immutable `agentRole`, never by
 * title or workspace. A Worker belongs to the Router recorded on its work item
 * (`agentRole.ownerId` is the work id); Workers whose item is unknown (list
 * not loaded, RPCs unavailable) stay visible as unassigned rows.
 */
export function groupAgentSessions<S extends RoleSession>(
  sessions: readonly S[],
  view: SuperAgentView,
): {
  readonly routers: readonly RouterGroup<S>[];
  readonly unassigned: readonly WorkerEntry<S>[];
} {
  const newest = (a: RoleSession, b: RoleSession) =>
    b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
  const routers = sessions
    .filter((session) => session.agentRole?.kind === "router")
    .sort(newest);
  const workers = sessions
    .filter((session) => session.agentRole?.kind === "worker")
    .sort(newest)
    .map((session) => ({
      session,
      work: view.workItems.find(
        (item) =>
          item.id === session.agentRole?.ownerId ||
          item.workerSessionId === session.id,
      ),
    }));
  const routerIds = new Set<string>(routers.map((router) => router.id));
  return {
    routers: routers.map((router) => ({
      router,
      workers: workers.filter(
        (entry) => entry.work?.routerSessionId === router.id,
      ),
    })),
    unassigned: workers.filter(
      (entry) => !entry.work || !routerIds.has(entry.work.routerSessionId),
    ),
  };
}

export const isAgentRoleSession = (
  session: Pick<SessionSummary, "agentRole">,
) => session.agentRole !== undefined;
