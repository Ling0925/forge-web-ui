import assert from "node:assert/strict";
import type { OutboxItem, Suggestion, WorkItem } from "@forge/core/shared";
import type { ForgeBridge } from "@forge/core/shared/ipc";
import { it } from "vitest";
import { createSuperAgentStore } from "../../src/renderer/state/superagent";

const time = "2026-11-07T00:00:00.000Z";
const work = (status: WorkItem["status"] = "running"): WorkItem => ({
  id: "wrk_1",
  status,
  pendingStatus: null,
  title: "任务",
  brief: "描述",
  threadIds: [],
  workerSessionId: null,
  routerSessionId: "router",
  profileId: "default" as WorkItem["profileId"],
  worktree: null,
  progress: "",
  createdAt: time,
  updatedAt: time,
  claimedBy: null,
});
const suggestion = (state: Suggestion["state"] = "pending"): Suggestion => ({
  id: "sug_1",
  threadIds: [],
  brief: "建议",
  triggerIds: [],
  state,
  workId: null,
});
const outbox = (state: OutboxItem["state"] = "pending"): OutboxItem => ({
  id: "out_1",
  workId: "wrk_1",
  state,
  error: null,
  createdAt: time,
  decidedAt: null,
  sentAt: null,
  kind: "comment",
  target: { thread: "gh:o/r#1" },
  body: { text: "结果" },
});
function host() {
  return {
    getSuperAgentState: async () => ({
      enabled: true as const,
      workspace: "/test",
      routerSessionId: "router",
    }),
    listWorkItems: async (): Promise<readonly WorkItem[]> => [work()],
    listSuggestions: async (): Promise<readonly Suggestion[]> => [suggestion()],
    listOutbox: async (): Promise<readonly OutboxItem[]> => [outbox()],
    decideOutbox: async (_id: string, approve: boolean) =>
      outbox(approve ? "sent" : "rejected"),
    decideSuggestion: async (_id: string, accept: boolean) =>
      suggestion(accept ? "accepted" : "rejected"),
  } satisfies Partial<ForgeBridge>;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it("replaces all pre-load objects with the next successful snapshot", async () => {
  const bridge = host();
  const store = createSuperAgentStore(() => bridge);
  await store.load();
  bridge.listWorkItems = async () => [work("done")];
  bridge.listSuggestions = async () => [suggestion("accepted")];
  bridge.listOutbox = async () => [outbox("sent")];
  await store.load();
  assert.equal(store.getSnapshot().workItems[0]?.status, "done");
  assert.equal(store.getSnapshot().suggestions[0]?.state, "accepted");
  assert.equal(store.getSnapshot().outbox[0]?.state, "sent");
  bridge.listWorkItems = async () => [];
  bridge.listSuggestions = async () => [];
  bridge.listOutbox = async () => [];
  await store.load();
  assert.deepEqual(store.getSnapshot().workItems, []);
  assert.deepEqual(store.getSnapshot().suggestions, []);
  assert.deepEqual(store.getSnapshot().outbox, []);
});

it("keeps events received during both probe and list reads", async () => {
  const bridge = host();
  const store = createSuperAgentStore(() => bridge);
  await store.load();
  const probe =
    deferred<Awaited<ReturnType<typeof bridge.getSuperAgentState>>>();
  const lists = deferred<readonly WorkItem[]>();
  const started = deferred<void>();
  bridge.getSuperAgentState = () => probe.promise;
  bridge.listWorkItems = () => {
    started.resolve();
    return lists.promise;
  };
  const loading = store.load();
  store.apply({ type: "superagent_work", work: work("ready") });
  store.apply({
    type: "superagent_suggestion",
    suggestion: suggestion("accepted"),
  });
  probe.resolve({
    enabled: true,
    workspace: "/test",
    routerSessionId: "router",
  });
  await started.promise;
  store.apply({ type: "superagent_outbox", item: outbox("sent") });
  lists.resolve([work()]);
  await loading;
  assert.equal(store.getSnapshot().workItems[0]?.status, "ready");
  assert.equal(store.getSnapshot().suggestions[0]?.state, "accepted");
  assert.equal(store.getSnapshot().outbox[0]?.state, "sent");
});

it("ignores an older load completing after a newer load", async () => {
  const bridge = host();
  const store = createSuperAgentStore(() => bridge);
  const old = deferred<readonly WorkItem[]>();
  const started = deferred<void>();
  bridge.listWorkItems = () => {
    started.resolve();
    return old.promise;
  };
  const first = store.load();
  await started.promise;
  bridge.listWorkItems = async () => [work("done")];
  await store.load();
  old.resolve([work()]);
  await first;
  assert.equal(store.getSnapshot().workItems[0]?.status, "done");
});

it("shows initial probe failure, loading and retry recovery", async () => {
  const bridge = host();
  const probe =
    deferred<Awaited<ReturnType<typeof bridge.getSuperAgentState>>>();
  bridge.getSuperAgentState = () => probe.promise;
  const store = createSuperAgentStore(() => bridge);
  const loading = store.load();
  assert.equal(store.getSnapshot().requests.state, "loading");
  probe.reject(new Error("private provider credential /home/private"));
  await loading;
  assert.equal(store.getSnapshot().status, "unknown");
  assert.equal(store.getSnapshot().requests.state, "error");
  assert.ok(!JSON.stringify(store.getSnapshot()).includes("private"));
  bridge.getSuperAgentState = host().getSuperAgentState;
  await store.load();
  assert.equal(store.getSnapshot().status, "enabled");
  assert.equal(store.getSnapshot().requests.state, "success");
  assert.equal(store.getSnapshot().requests.outbox, "success");
});

it("preserves all known data when a later probe fails", async () => {
  const bridge = host();
  const store = createSuperAgentStore(() => bridge);
  await store.load();
  const before = store.getSnapshot();
  bridge.getSuperAgentState = async () => {
    throw Object.assign(new Error("disabled"), { code: "internal" });
  };
  await store.load();
  const after = store.getSnapshot();
  assert.equal(after.status, "enabled");
  assert.equal(after.requests.state, "error");
  assert.equal(after.workItems, before.workItems);
  assert.equal(after.suggestions, before.suggestions);
  assert.equal(after.outbox, before.outbox);
  assert.equal(after.routerSessionId, before.routerSessionId);
});

for (const key of ["workItems", "suggestions", "outbox"] as const) {
  it(`retains ${key} on failure until a successful empty retry`, async () => {
    const bridge = host();
    const store = createSuperAgentStore(() => bridge);
    await store.load();
    const before = store.getSnapshot();
    const fail = async () => {
      throw new Error("private response");
    };
    if (key === "workItems") bridge.listWorkItems = fail;
    if (key === "suggestions") bridge.listSuggestions = fail;
    if (key === "outbox") bridge.listOutbox = fail;
    const changed = { ...work("done"), id: "wrk_2" };
    const loading = store.load();
    store.apply({ type: "superagent_work", work: changed });
    await loading;
    const after = store.getSnapshot();
    assert.equal(after.status, "enabled");
    assert.equal(after.requests[key], "error");
    if (key === "workItems")
      assert.deepEqual(after.workItems, [work(), changed]);
    else assert.equal(after[key], before[key]);
    for (const other of ["workItems", "suggestions", "outbox"] as const) {
      if (other !== key) assert.equal(after.requests[other], "success");
    }
    if (key === "workItems") bridge.listWorkItems = async () => [];
    if (key === "suggestions") bridge.listSuggestions = async () => [];
    if (key === "outbox") bridge.listOutbox = async () => [];
    await store.load();
    assert.equal(store.getSnapshot().requests[key], "success");
    assert.deepEqual(store.getSnapshot()[key], []);
  });
}

it("distinguishes first list failure from a successful empty list", async () => {
  const bridge = host();
  bridge.listOutbox = async () => {
    throw new Error("network");
  };
  bridge.listSuggestions = async () => [];
  const store = createSuperAgentStore(() => bridge);
  await store.load();
  assert.deepEqual(store.getSnapshot().outbox, []);
  assert.equal(store.getSnapshot().requests.outbox, "error");
  assert.deepEqual(store.getSnapshot().suggestions, []);
  assert.equal(store.getSnapshot().requests.suggestions, "success");
});

it("distinguishes not_found, missing methods and connection failure", async () => {
  const bridge = host();
  bridge.getSuperAgentState = async () => {
    throw Object.assign(new Error("off"), { code: "not_found" });
  };
  const store = createSuperAgentStore(() => bridge);
  await store.load();
  assert.equal(store.getSnapshot().status, "disabled");
  assert.equal(store.getSnapshot().requests.state, "success");
  bridge.getSuperAgentState = host().getSuperAgentState;
  await store.load();
  assert.equal(store.getSnapshot().status, "enabled");
  const optional: Partial<ReturnType<typeof host>> = {};
  const unsupported = createSuperAgentStore(() => optional);
  await unsupported.load();
  assert.equal(unsupported.getSnapshot().status, "not-supported");
  assert.equal(unsupported.getSnapshot().requests.state, "not-supported");
  Object.assign(optional, host());
  await unsupported.load();
  assert.equal(unsupported.getSnapshot().status, "enabled");
  const missingLists = createSuperAgentStore(() => ({
    getSuperAgentState: host().getSuperAgentState,
    listWorkItems: host().listWorkItems,
  }));
  await missingLists.load();
  assert.equal(missingLists.getSnapshot().status, "enabled");
  assert.equal(missingLists.getSnapshot().requests.workItems, "success");
  assert.equal(
    missingLists.getSnapshot().requests.suggestions,
    "not-supported",
  );
  assert.equal(missingLists.getSnapshot().requests.outbox, "not-supported");
  const disconnected = createSuperAgentStore(() => undefined);
  await disconnected.load();
  assert.equal(disconnected.getSnapshot().status, "unknown");
  assert.equal(disconnected.getSnapshot().requests.state, "error");
});

it("ignores an obsolete probe failure and a response after reset", async () => {
  const bridge = host();
  const old = deferred<Awaited<ReturnType<typeof bridge.getSuperAgentState>>>();
  bridge.getSuperAgentState = () => old.promise;
  const store = createSuperAgentStore(() => bridge);
  const first = store.load();
  bridge.getSuperAgentState = host().getSuperAgentState;
  await store.load();
  const current = store.getSnapshot();
  old.reject(Object.assign(new Error("off"), { code: "not_found" }));
  await first;
  assert.equal(store.getSnapshot(), current);
  const pending = deferred<readonly OutboxItem[]>();
  const started = deferred<void>();
  bridge.listOutbox = () => {
    started.resolve();
    return pending.promise;
  };
  const loading = store.load();
  await started.promise;
  store.reset();
  const reset = store.getSnapshot();
  pending.resolve([outbox()]);
  await loading;
  assert.equal(store.getSnapshot(), reset);
});

it("keeps initial-read events on probe failure without extra reads", async () => {
  const bridge = host();
  const probe =
    deferred<Awaited<ReturnType<typeof bridge.getSuperAgentState>>>();
  let probes = 0;
  bridge.getSuperAgentState = () => {
    probes++;
    return probe.promise;
  };
  const store = createSuperAgentStore(() => bridge);
  const loading = store.load();
  store.apply({ type: "superagent_work", work: work("done") });
  store.apply({ type: "superagent_outbox", item: outbox("sent") });
  store.apply({
    type: "superagent_suggestion",
    suggestion: suggestion("accepted"),
  });
  probe.reject(new Error("disconnected"));
  await loading;
  assert.equal(probes, 1);
  assert.equal(store.getSnapshot().status, "enabled");
  assert.equal(store.getSnapshot().requests.state, "error");
  assert.equal(store.getSnapshot().workItems[0]?.status, "done");
  assert.equal(store.getSnapshot().suggestions[0]?.state, "accepted");
  assert.equal(store.getSnapshot().outbox[0]?.state, "sent");
});

it("does not resurrect decisions completed during a list read", async () => {
  const bridge = host();
  const store = createSuperAgentStore(() => bridge);
  await store.load();
  const pending = deferred<readonly OutboxItem[]>();
  const started = deferred<void>();
  bridge.listOutbox = () => {
    started.resolve();
    return pending.promise;
  };
  const loading = store.load();
  await started.promise;
  await store.decideOutbox("out_1", true);
  await store.decideSuggestion("sug_1", true);
  pending.resolve([outbox()]);
  await loading;
  assert.equal(store.getSnapshot().outbox[0]?.state, "sent");
  assert.equal(store.getSnapshot().suggestions[0]?.state, "accepted");
});

it("never replays an uncertain approval during read retries", async () => {
  const bridge = host();
  let approvals = 0;
  let suggestions = 0;
  bridge.decideOutbox = async () => {
    approvals++;
    throw new Error("connection lost after submission");
  };
  bridge.decideSuggestion = async () => {
    suggestions++;
    throw new Error("connection lost after submission");
  };
  const store = createSuperAgentStore(() => bridge);
  await store.load();
  await assert.rejects(store.decideOutbox("out_1", true));
  await assert.rejects(store.decideSuggestion("sug_1", true));
  assert.equal(approvals, 1);
  assert.equal(suggestions, 1);
  await store.load();
  assert.equal(approvals, 1);
  assert.equal(suggestions, 1);
  assert.equal(store.getSnapshot().outbox[0]?.state, "pending");
  assert.equal(store.getSnapshot().suggestions[0]?.state, "pending");
});

it("leaves concurrent decisions to the existing host semantics", async () => {
  const bridge = host();
  let approvals = 0;
  const decision = deferred<OutboxItem>();
  bridge.decideOutbox = () => {
    approvals++;
    return decision.promise;
  };
  const store = createSuperAgentStore(() => bridge);
  const first = store.decideOutbox("out_1", true);
  const second = store.decideOutbox("out_1", true);
  assert.equal(approvals, 2);
  decision.resolve(outbox("sent"));
  await Promise.all([first, second]);
  assert.equal(approvals, 2);
  assert.equal(store.getSnapshot().outbox[0]?.state, "sent");
});

it("clears known data when the host explicitly disables super-agent", async () => {
  const bridge = host();
  const store = createSuperAgentStore(() => bridge);
  await store.load();
  bridge.getSuperAgentState = async () => {
    throw Object.assign(new Error("off"), { code: "not_found" });
  };
  await store.load();
  const disabled = store.getSnapshot();
  assert.equal(disabled.status, "disabled");
  assert.equal(disabled.routerSessionId, null);
  assert.deepEqual(disabled.workItems, []);
  assert.deepEqual(disabled.suggestions, []);
  assert.deepEqual(disabled.outbox, []);
  bridge.getSuperAgentState = host().getSuperAgentState;
  bridge.listOutbox = async () => {
    throw new Error("offline");
  };
  await store.load();
  assert.equal(store.getSnapshot().requests.outbox, "error");
  assert.deepEqual(store.getSnapshot().outbox, []);
});

it("clears known data when the state method is no longer supported", async () => {
  const bridge: Partial<ReturnType<typeof host>> = host();
  const store = createSuperAgentStore(() => bridge);
  await store.load();
  Reflect.deleteProperty(bridge, "getSuperAgentState");
  await store.load();
  assert.equal(store.getSnapshot().status, "not-supported");
  assert.equal(store.getSnapshot().routerSessionId, null);
  assert.deepEqual(store.getSnapshot().workItems, []);
  assert.deepEqual(store.getSnapshot().suggestions, []);
  assert.deepEqual(store.getSnapshot().outbox, []);
});

it("does not carry known data into a replacement host whose probe fails", async () => {
  let bridge = host();
  const store = createSuperAgentStore(() => bridge);
  await store.load();
  bridge = host();
  bridge.getSuperAgentState = async () => {
    throw new Error("workspace B offline");
  };
  await store.load();
  assert.equal(store.getSnapshot().status, "unknown");
  assert.equal(store.getSnapshot().requests.state, "error");
  assert.equal(store.getSnapshot().routerSessionId, null);
  assert.deepEqual(store.getSnapshot().workItems, []);
  assert.deepEqual(store.getSnapshot().suggestions, []);
  assert.deepEqual(store.getSnapshot().outbox, []);
});

it("retains only current-read events when the probe identifies a different workspace", async () => {
  const bridge = host();
  const store = createSuperAgentStore(() => bridge);
  await store.load();
  const probe =
    deferred<Awaited<ReturnType<typeof bridge.getSuperAgentState>>>();
  bridge.getSuperAgentState = () => probe.promise;
  const fail = async () => {
    throw new Error("workspace B list offline");
  };
  bridge.listWorkItems = fail;
  bridge.listSuggestions = fail;
  bridge.listOutbox = fail;
  const loading = store.load();
  const current = { ...work("done"), id: "workspace-b-work" };
  store.apply({ type: "superagent_work", work: current });
  probe.resolve({
    enabled: true,
    workspace: "/workspace-b",
    routerSessionId: "router-b",
  });
  await loading;
  assert.equal(store.getSnapshot().routerSessionId, "router-b");
  assert.deepEqual(store.getSnapshot().workItems, [current]);
  assert.deepEqual(store.getSnapshot().suggestions, []);
  assert.deepEqual(store.getSnapshot().outbox, []);
  assert.equal(store.getSnapshot().requests.outbox, "error");
});

for (const transition of ["reset", "disabled", "host", "workspace"] as const) {
  it(`ignores late decision responses after ${transition}`, async () => {
    let bridge = host();
    const store = createSuperAgentStore(() => bridge);
    await store.load();
    const outboxDecision = deferred<OutboxItem>();
    const suggestionDecision = deferred<Suggestion>();
    bridge.decideOutbox = () => outboxDecision.promise;
    bridge.decideSuggestion = () => suggestionDecision.promise;
    const decidingOutbox = store.decideOutbox("out_1", true);
    const decidingSuggestion = store.decideSuggestion("sug_1", true);
    if (transition === "reset") store.reset();
    if (transition === "disabled") {
      bridge.getSuperAgentState = async () => {
        throw Object.assign(new Error("off"), { code: "not_found" });
      };
      await store.load();
    }
    if (transition === "host") {
      bridge = host();
      await store.load();
    }
    if (transition === "workspace") {
      bridge.getSuperAgentState = async () => ({
        enabled: true,
        workspace: "/workspace-b",
        routerSessionId: "router-b",
      });
      await store.load();
    }
    const current = store.getSnapshot();
    outboxDecision.resolve(outbox("sent"));
    suggestionDecision.resolve(suggestion("accepted"));
    await Promise.all([decidingOutbox, decidingSuggestion]);
    assert.equal(store.getSnapshot(), current);
  });
}

it("applies an in-flight decision across a refresh in the same workspace", async () => {
  const bridge = host();
  const store = createSuperAgentStore(() => bridge);
  await store.load();
  const decision = deferred<OutboxItem>();
  bridge.decideOutbox = () => decision.promise;
  const deciding = store.decideOutbox("out_1", true);
  await store.load();
  decision.resolve(outbox("sent"));
  await deciding;
  assert.equal(store.getSnapshot().outbox[0]?.state, "sent");
});
