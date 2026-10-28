import { runIdSchema } from "@forge/core/shared/ipc";
import { sessionIdSchema } from "@forge/core/shared/schemas";
const sessionA = sessionIdSchema.parse("11111111-1111-4111-8111-111111111111");
const sessionB = sessionIdSchema.parse("22222222-2222-4222-8222-222222222222");
const runA = runIdSchema.parse("33333333-3333-4333-8333-333333333333");
import { describe, expect, it } from "vitest";
import type { SessionSnapshot } from "../../src/renderer/shared-types";
import type { WorkbenchState } from "../../src/renderer/state/workbench-reducer";
import {
  initialWorkbenchState,
  workbenchReducer,
} from "../../src/renderer/state/workbench-reducer";
const snapshot: SessionSnapshot = {
  version: 1,
  id: sessionA,
  title: "Task",
  workspace: "/tmp/task",
  model: "model",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
  status: "running",
  messages: [],
  events: [],
  changes: [],
};
describe("workbench authority", () => {
  it("resets only the failed live attempt and keeps earlier unsynchronized output", () => {
    const previous = { id: "prior", text: "prior completed response", afterMessage: 0, truncated: false };
    let state: WorkbenchState = { ...initialWorkbenchState, activeSessionId: sessionA, activeSnapshot: snapshot,
      activeRuns: { [sessionA]: { sessionId: sessionA, runId: runA, status: "running" as const,
        streamingText: "failed text", streamingReasoning: "failed thought", streamingTruncated: true,
        reasoningTruncated: true, pendingOutputs: [previous], pendingReasoning: [previous] } } };
    const timestamp = "2026-01-01T00:00:02.000Z";
    state = workbenchReducer(state, { type: "RUN_EVENT_RECEIVED", event: { runId: runA, event: { type: "retry_reset", sessionId: sessionA, timestamp } } });
    expect(state.activeRuns[sessionA]?.streamingText).toBe("");
    expect(state.activeRuns[sessionA]?.streamingReasoning).toBe("");
    expect(state.activeRuns[sessionA]?.pendingOutputs).toEqual([previous]);
    expect(state.activeRuns[sessionA]?.pendingReasoning).toEqual([previous]);
    expect(state.activeSnapshot).toBe(snapshot);
    state = workbenchReducer(state, { type: "RUN_EVENT_RECEIVED", event: { runId: runA, event: { type: "provider_retry", attempt: 2, maxAttempts: 5, reason: "protocol", sessionId: sessionA, timestamp } } });
    expect(state.activeRuns[sessionA]?.providerRetry).toBe(2);
    expect(state.activeSnapshot?.messages).toBe(snapshot.messages);
    expect(state.activeSnapshot?.events).toEqual([
      { type: "provider_retry", attempt: 2, maxAttempts: 5, reason: "protocol", sessionId: sessionA, timestamp },
    ]);
  });
  it("restores cached history immediately when switching back and accepts background updates", () => {
    let state = workbenchReducer(initialWorkbenchState, { type: "SELECT_SESSION", sessionId: sessionA });
    state = workbenchReducer(state, { type: "SET_ACTIVE_SNAPSHOT", snapshot });
    state = workbenchReducer(state, { type: "SELECT_SESSION", sessionId: sessionB });
    const updated: SessionSnapshot = { ...snapshot, messages: [{ role: "assistant", content: "new output" }] };
    state = workbenchReducer(state, { type: "SET_ACTIVE_SNAPSHOT", snapshot: updated });
    expect(state.activeSessionId).toBe(sessionB);
    expect(state.activeSnapshot).toBeNull();
    state = workbenchReducer(state, { type: "SELECT_SESSION", sessionId: sessionA });
    expect(state.isSnapshotLoading).toBe(false);
    expect(state.activeSnapshot?.messages).toEqual(updated.messages);
  });
  it("replaces cached messages when a newer persisted revision shortens history", () => {
    let state = workbenchReducer(initialWorkbenchState, { type: "SELECT_SESSION", sessionId: sessionA });
    state = workbenchReducer(state, { type: "SET_ACTIVE_SNAPSHOT", snapshot: {
      ...snapshot, messages: [{ role: "user", content: "old history" }],
    } });
    state = workbenchReducer(state, { type: "SELECT_SESSION", sessionId: sessionB });
    state = workbenchReducer(state, { type: "SET_ACTIVE_SNAPSHOT", snapshot: {
      ...snapshot, updatedAt: "2026-01-01T00:00:02.000Z", messages: [],
    } });
    state = workbenchReducer(state, { type: "SELECT_SESSION", sessionId: sessionA });
    expect(state.activeSnapshot?.messages).toEqual([]);
  });
  it("updates live permission and clears only root pending approvals", () => {
    const root = { id: "root", sessionId: sessionA, toolCallId: "tool", toolName: "run_command", description: "test" };
    const child = { ...root, id: "child", childSessionId: sessionB };
    const state = { ...initialWorkbenchState, activeRuns: { [sessionA]: {
      sessionId: sessionA, runId: runA, status: "awaiting_approval" as const, streamingText: "", pendingApproval: root, approvalQueue: [root, child],
    } } };
    const next = workbenchReducer(state, { type: "RUN_EVENT_RECEIVED", event: { runId: runA, event: {
      type: "permission_changed", sessionId: sessionA, timestamp: snapshot.updatedAt, permission: "unrestricted",
    } } });
    expect(next.activeRuns[sessionA]?.permission).toBe("unrestricted");
    expect(next.activeRuns[sessionA]?.approvalQueue).toEqual([child]);
    expect(next.activeRuns[sessionA]?.pendingApproval).toEqual(child);
  });
  it("reconciles terminal desktop controllers with a newer CLI run", () => {
    const state = {
      ...initialWorkbenchState,
      activeSessionId: snapshot.id,
      activeRuns: {
        [snapshot.id]: {
          sessionId: snapshot.id,
          status: "completed" as const,
          streamingText: "",
        },
      },
    };
    const listed = workbenchReducer(state, {
      type: "SET_SESSIONS",
      sessions: [snapshot],
    });
    expect(listed.sessions[0]?.status).toBe("running");
    const reconciled = workbenchReducer(listed, {
      type: "SET_ACTIVE_SNAPSHOT",
      snapshot,
    });
    expect(reconciled.activeRuns[snapshot.id]).toBeUndefined();
    expect(reconciled.activeSnapshot?.status).toBe("running");
  });
  it("keeps a live local controller authoritative over stale disk status", () => {
    const started = workbenchReducer(initialWorkbenchState, {
      type: "START_RUN_INITIATED",
      sessionId: snapshot.id,
    });
    const listed = workbenchReducer(started, {
      type: "SET_SESSIONS",
      sessions: [{ ...snapshot, status: "completed" }],
    });
    expect(listed.sessions[0]?.status).toBe("running");
    expect(
      workbenchReducer(listed, {
        type: "SET_ACTIVE_SNAPSHOT",
        snapshot: { ...snapshot, status: "completed" },
      }).activeRuns[snapshot.id]?.status,
    ).toBe("running");
  });
  it("does not treat a transport handle as prompt acceptance", () => {
    const started = workbenchReducer(initialWorkbenchState, {
      type: "START_RUN_INITIATED",
      sessionId: snapshot.id,
    });
    const handled = workbenchReducer(started, {
      type: "START_RUN_RESOLVED",
      runHandle: { sessionId: snapshot.id, runId: runA },
    });
    expect(handled.activeRuns[snapshot.id]?.accepted).toBeUndefined();
    const accepted = workbenchReducer(handled, {
      type: "RUN_EVENT_RECEIVED",
      event: {
        runId: runA,
        event: {
          type: "run_started",
          sessionId: snapshot.id,
          timestamp: snapshot.updatedAt,
          model: "model",
          permission: "readonly",
        },
      },
    });
    expect(accepted.activeRuns[snapshot.id]?.accepted).toBe(true);
  });
  it("settles a successful older-disk read after reselect without discarding fresher transcript", () => {
    // Idle disk at t1; run handle; failed run_finished at t2 before persistence.
    const seeded = workbenchReducer(
      workbenchReducer(initialWorkbenchState, {
        type: "SELECT_SESSION",
        sessionId: snapshot.id,
      }),
      {
        type: "SET_ACTIVE_SNAPSHOT",
        snapshot: { ...snapshot, status: "idle" },
      },
    );
    expect(seeded.activeSnapshot?.updatedAt).toBe("2026-01-01T00:00:01.000Z");
    const started = workbenchReducer(seeded, {
      type: "START_RUN_INITIATED",
      sessionId: snapshot.id,
    });
    const failed = workbenchReducer(started, {
      type: "RUN_EVENT_RECEIVED",
      event: {
        runId: runA,
        event: {
          type: "run_finished",
          sessionId: snapshot.id,
          timestamp: "2026-01-01T00:00:02.000Z",
          status: "failed",
          turns: 0,
          toolCalls: 0,
        },
      },
    });
    expect(failed.activeSnapshot?.updatedAt).toBe("2026-01-01T00:00:02.000Z");
    expect(failed.activeSnapshot?.status).toBe("failed");
    // Reselect same session, then deliver the unchanged older idle disk snapshot.
    const reselected = workbenchReducer(failed, {
      type: "SELECT_SESSION",
      sessionId: snapshot.id,
    });
    expect(reselected.isSnapshotLoading).toBe(false);
    const settled = workbenchReducer(reselected, {
      type: "SET_ACTIVE_SNAPSHOT",
      snapshot: { ...snapshot, status: "idle" },
    });
    expect(settled.isSnapshotLoading).toBe(false);
    expect(settled.activeRuns[snapshot.id]).toBeUndefined();
    // The fresher transient transcript is protected, not replaced by older disk.
    expect(settled.activeSnapshot?.updatedAt).toBe("2026-01-01T00:00:02.000Z");
    expect(settled.activeSnapshot?.status).toBe("failed");
  });
  it("ignores another session's late snapshot and settles loading on failure", () => {
    const selected = workbenchReducer(initialWorkbenchState, {
      type: "SELECT_SESSION",
      sessionId: sessionB,
    });
    const late = workbenchReducer(selected, {
      type: "SET_ACTIVE_SNAPSHOT",
      snapshot,
    });
    expect(late.activeSnapshot).toBeNull();
    expect(late.isSnapshotLoading).toBe(true);
    expect(
      workbenchReducer(late, { type: "SET_SNAPSHOT_LOADING", isLoading: false })
        .isSnapshotLoading,
    ).toBe(false);
  });
});

it("queues concurrent child approvals without overwriting and advances by UUID", () => {
  const approval = (id: string) => ({
    id,
    sessionId: sessionA,
    childSessionId: sessionB,
    toolCallId: id,
    toolName: "run_command",
    description: "child command",
    permission: "workspace" as const,
  });
  const first = approval("44444444-4444-4444-8444-444444444444");
  const second = approval("55555555-5555-4555-8555-555555555555");
  let state = initialWorkbenchState;
  for (const request of [first, second])
    state = workbenchReducer(state, {
      type: "RUN_EVENT_RECEIVED",
      event: {
        runId: runA,
        event: {
          type: "approval_requested",
          sessionId: sessionA,
          timestamp: snapshot.updatedAt,
          request,
        },
      },
    });
  expect(state.activeRuns[sessionA]?.pendingApproval?.id).toBe(first.id);
  expect(state.activeRuns[sessionA]?.approvalQueue).toHaveLength(2);
  state = workbenchReducer(state, {
    type: "APPROVAL_ANSWERED",
    sessionId: sessionA,
    approvalId: first.id,
  });
  expect(state.activeRuns[sessionA]?.pendingApproval?.id).toBe(second.id);
  expect(state.activeRuns[sessionA]?.approvalQueue).toHaveLength(1);
});

it("applies live plans without waiting for a tool finish and keeps child selection separate", () => {
  const parent = {
    ...initialWorkbenchState,
    activeSessionId: sessionA,
    activeSnapshot: snapshot,
  };
  const plan = {
    explanation: "Investigate",
    steps: [{ step: "Read", status: "in_progress" as const }],
  };
  const updated = workbenchReducer(parent, {
    type: "RUN_EVENT_RECEIVED",
    event: {
      runId: runA,
      event: {
        type: "plan_updated",
        sessionId: sessionA,
        timestamp: snapshot.updatedAt,
        plan,
      },
    },
  });
  expect(updated.activeSnapshot?.plan).toEqual(plan);
  const child = workbenchReducer(
    workbenchReducer(updated, { type: "SELECT_SESSION", sessionId: sessionB }),
    {
      type: "SET_ACTIVE_SNAPSHOT",
      snapshot: {
        ...snapshot,
        id: sessionB,
        parentSessionId: sessionA,
        status: "completed",
        messages: [{ role: "assistant", content: "child result" }],
      },
    },
  );
  expect(child.activeSnapshot?.messages[0]?.content).toBe("child result");
  expect(child.activeSnapshot?.status).toBe("completed");
  expect(child.activeRuns[sessionA]?.status).toBe("running");
});
describe("inline new conversation navigation", () => {
  it("keeps the new view behind settings so closing settings does not lose it", () => {
    const settingsOpen = workbenchReducer(initialWorkbenchState, {
      type: "OPEN_SETTINGS",
      isOpen: true,
    });
    expect(settingsOpen.isSettingsOpen).toBe(true);
    const stacked = workbenchReducer(settingsOpen, {
      type: "OPEN_NEW_SESSION",
      isOpen: true,
    });
    expect(stacked.isNewSessionOpen).toBe(true);
    expect(stacked.isSettingsOpen).toBe(false);
    const andSettings = workbenchReducer(stacked, {
      type: "OPEN_SETTINGS",
      isOpen: true,
    });
    expect(andSettings.isSettingsOpen).toBe(true);
    expect(andSettings.isNewSessionOpen).toBe(true);
    const closed = workbenchReducer(andSettings, {
      type: "OPEN_SETTINGS",
      isOpen: false,
    });
    expect(closed.isSettingsOpen).toBe(false);
    expect(closed.isNewSessionOpen).toBe(true);
    const selected = workbenchReducer(closed, { type: "SELECT_SESSION", sessionId: sessionA });
    expect(selected.isNewSessionOpen).toBe(false);
    expect(selected.mobileTab).toBe("task");
  });
  it("closing one modal never closes the other on its own", () => {
    const newOpen = workbenchReducer(initialWorkbenchState, {
      type: "OPEN_NEW_SESSION",
      isOpen: true,
    });
    const untouched = workbenchReducer(newOpen, {
      type: "OPEN_SETTINGS",
      isOpen: false,
    });
    expect(untouched.isNewSessionOpen).toBe(true);
    expect(untouched.isSettingsOpen).toBe(false);
  });
});
describe("advisor_update event handling", () => {
  it("keeps the Core coordination ID distinct from the host transport run ID", () => {
    const rootRunId = "55555555-5555-4555-8555-555555555555";
    const started = { type: "run_started" as const, sessionId: sessionA,
      timestamp: "2026-01-01T00:00:00.000Z", model: "model", permission: "readonly" as const };
    let state = workbenchReducer(initialWorkbenchState, { type: "RUN_EVENT_RECEIVED", event: {
      runId: runA, event: { ...started, budget: {
        rootRunId, rootSessionId: sessionA, maxToolCalls: null, timeoutMs: null,
        startedAt: started.timestamp, deadlineAt: null, consumed: 0, reserved: 0, remaining: null,
        stopReason: null, sessions: [], usage: { basis: "reported", reportedRequests: 0, missingRequests: 0,
          promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedPromptTokens: 0, complete: true },
      } },
    } });
    expect(state.activeRuns[sessionA]?.runId).toBe(runA);
    expect(state.activeRuns[sessionA]?.rootRunId).toBe(rootRunId);
    // An old host without coordination metadata must not inherit a previous identity.
    state = workbenchReducer(state, { type: "RUN_EVENT_RECEIVED", event: { runId: runA, event: started } });
    expect(state.activeRuns[sessionA]?.rootRunId).toBeUndefined();
  });
  const req1 = {
    id: "44444444-4444-4444-8444-444444444444",
    parentSessionId: sessionA,
    parentRunId: runA,
    childSessionId: sessionB,
    toolCallId: "call_1",
    question: "兼容旧契约还是迁移到新契约？",
    status: "pending" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deadlineAt: "2026-01-01T00:10:00.000Z",
  };
  it("appends new advisor request to activeSnapshot and snapshotCache", () => {
    let state: WorkbenchState = {
      ...initialWorkbenchState,
      activeSessionId: sessionA,
      activeSnapshot: snapshot,
      snapshotCache: { [sessionA]: { snapshot, persistedAt: null } },
      sessions: [snapshot],
    };
    state = workbenchReducer(state, {
      type: "RUN_EVENT_RECEIVED",
      event: {
        runId: runA,
        event: {
          type: "advisor_update",
          sessionId: sessionA,
          request: req1,
          timestamp: "2026-01-01T00:00:01.000Z",
        },
      },
    });
    expect(state.activeSnapshot?.advisorRequests).toEqual([req1]);
    expect(state.snapshotCache[sessionA]?.snapshot.advisorRequests).toEqual([req1]);
    expect(state.sessions[0]?.updatedAt).toBe("2026-01-01T00:00:01.000Z");
  });
  it("replaces existing advisor request by ID idempotently without duplicates", () => {
    const answeredReq = {
      ...req1,
      status: "answered" as const,
      answer: "保留旧契约",
      nextInstruction: "继续运行现有测试",
      updatedAt: "2026-01-01T00:01:00.000Z",
    };
    let state: WorkbenchState = {
      ...initialWorkbenchState,
      activeSessionId: sessionA,
      activeSnapshot: { ...snapshot, advisorRequests: [req1] },
      snapshotCache: { [sessionA]: { snapshot: { ...snapshot, advisorRequests: [req1] }, persistedAt: null } },
    };
    state = workbenchReducer(state, {
      type: "RUN_EVENT_RECEIVED",
      event: {
        runId: runA,
        event: {
          type: "advisor_update",
          sessionId: sessionA,
          request: answeredReq,
          timestamp: "2026-01-01T00:01:00.000Z",
        },
      },
    });
    expect(state.activeSnapshot?.advisorRequests?.length).toBe(1);
    expect(state.activeSnapshot?.advisorRequests?.[0]).toEqual(answeredReq);
    expect(state.snapshotCache[sessionA]?.snapshot.advisorRequests?.length).toBe(1);
    expect(state.snapshotCache[sessionA]?.snapshot.advisorRequests?.[0]).toEqual(answeredReq);
  });
});
