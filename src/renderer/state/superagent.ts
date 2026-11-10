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

type SuperAgentLoadStatus =
  | "idle"
  | "loading"
  | "success"
  | "error"
  | "not-supported";

export interface SuperAgentView {
  readonly status: "unknown" | "disabled" | "not-supported" | "enabled";
  readonly requests: Readonly<
    Record<
      "state" | "workItems" | "suggestions" | "outbox",
      SuperAgentLoadStatus
    >
  >;
  readonly routerSessionId: string | null;
  readonly workItems: readonly WorkItem[];
  readonly suggestions: readonly Suggestion[];
  readonly outbox: readonly OutboxItem[];
}

const IDLE_REQUESTS: SuperAgentView["requests"] = {
  state: "idle",
  workItems: "idle",
  suggestions: "idle",
  outbox: "idle",
};
const EMPTY: SuperAgentView = Object.freeze({
  status: "unknown",
  requests: IDLE_REQUESTS,
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
  let scope = {};
  let currentHost: Bridge | undefined;
  let workspace: string | undefined;
  const listeners = new Set<() => void>();
  const set = (next: SuperAgentView) => {
    view = next;
    for (const listener of listeners) listener();
  };
  let changes: {
    workItems: readonly WorkItem[];
    suggestions: readonly Suggestion[];
    outbox: readonly OutboxItem[];
  } | null = null;

  async function read<T>(call: (() => Promise<readonly T[]>) | undefined) {
    if (!call) return { status: "not-supported" as const, items: null };
    try {
      return { status: "success" as const, items: await call() };
    } catch {
      return { status: "error" as const, items: null };
    }
  }

  async function load(): Promise<void> {
    const host = bridge();
    if (host && currentHost && host !== currentHost) reset();
    if (host) currentHost = host;
    const run = ++generation;
    const live: NonNullable<typeof changes> = {
      workItems: [],
      suggestions: [],
      outbox: [],
    };
    changes = live;
    set({ ...view, requests: { ...view.requests, state: "loading" } });
    const getState = host?.getSuperAgentState;
    if (!host || !getState) {
      if (host) reset();
      changes = null;
      set({
        ...view,
        status: host ? "not-supported" : view.status,
        requests: { ...IDLE_REQUESTS, state: host ? "not-supported" : "error" },
      });
      return;
    }
    let state: Awaited<ReturnType<NonNullable<Bridge["getSuperAgentState"]>>>;
    try {
      state = await getState.call(host);
    } catch (error) {
      if (run !== generation) return;
      changes = null;
      const disabled =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "not_found";
      if (disabled) reset();
      set({
        ...view,
        status: disabled ? "disabled" : view.status,
        requests: disabled
          ? { ...IDLE_REQUESTS, state: "success" }
          : { ...view.requests, state: "error" },
      });
      return;
    }
    if (run !== generation) return;
    const sameWorkspace =
      workspace === undefined || workspace === state.workspace;
    if (!sameWorkspace) scope = {};
    workspace = state.workspace;
    set({
      ...(sameWorkspace ? view : { ...EMPTY, ...live }),
      status: "enabled",
      routerSessionId: state.routerSessionId,
      requests: {
        state: "success",
        workItems: "loading",
        suggestions: "loading",
        outbox: "loading",
      },
    });
    const listSuggestions = host.listSuggestions?.bind(host);
    const listOutbox = host.listOutbox?.bind(host);
    const [workItems, suggestions, outbox] = await Promise.all([
      read(host.listWorkItems?.bind(host)),
      read(listSuggestions && (() => listSuggestions("pending"))),
      read(listOutbox && (() => listOutbox("pending"))),
    ]);
    if (run !== generation) return;
    changes = null;
    // Only updates received during this read may override its snapshot.
    const merge = <T extends { readonly id: string }>(
      items: readonly T[] | null,
      previous: readonly T[],
      updates: readonly T[],
    ) => (items === null ? previous : updates.reduce(upsert, items));
    set({
      ...view,
      requests: {
        state: "success",
        workItems: workItems.status,
        suggestions: suggestions.status,
        outbox: outbox.status,
      },
      workItems: merge(workItems.items, view.workItems, live.workItems),
      suggestions: merge(suggestions.items, view.suggestions, live.suggestions),
      outbox: merge(outbox.items, view.outbox, live.outbox),
    });
  }

  function updateOutbox(item: OutboxItem) {
    if (changes) changes.outbox = upsert(changes.outbox, item);
    set({ ...view, outbox: upsert(view.outbox, item) });
  }

  function updateSuggestion(suggestion: Suggestion) {
    if (changes) changes.suggestions = upsert(changes.suggestions, suggestion);
    set({ ...view, suggestions: upsert(view.suggestions, suggestion) });
  }

  function apply(event: SuperAgentEvent): void {
    const needsState =
      view.status !== "enabled" && view.requests.state !== "loading";
    switch (event.type) {
      case "superagent_work":
        if (changes) changes.workItems = upsert(changes.workItems, event.work);
        set({ ...view, workItems: upsert(view.workItems, event.work) });
        break;
      case "superagent_suggestion":
        updateSuggestion(event.suggestion);
        break;
      case "superagent_outbox":
        updateOutbox(event.item);
        break;
      default:
        // Triggers, catch-up and board-stream status are not shown yet.
        return;
    }
    if (view.status !== "enabled") set({ ...view, status: "enabled" });
    if (needsState) void load();
  }

  async function decideOutbox(id: string, approve: boolean) {
    const host = bridge();
    if (!host?.decideOutbox) throw new Error("当前服务不支持发送队列审批。");
    const decidingScope = scope;
    const item = await host.decideOutbox(id, approve);
    if (decidingScope === scope) updateOutbox(item);
    return item;
  }

  async function decideSuggestion(id: string, accept: boolean) {
    const host = bridge();
    if (!host?.decideSuggestion) throw new Error("当前服务不支持处理建议。");
    const decidingScope = scope;
    const suggestion = await host.decideSuggestion(id, accept);
    if (decidingScope === scope) updateSuggestion(suggestion);
    return suggestion;
  }

  function reset() {
    generation++;
    scope = {};
    currentHost = undefined;
    workspace = undefined;
    changes = null;
    set(EMPTY);
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
    reset,
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
