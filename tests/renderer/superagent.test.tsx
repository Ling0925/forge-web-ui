import type { OutboxItem, Suggestion, WorkItem } from "@forge/core/shared";
import { hostEventSchema } from "@forge/core/shared/ipc";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  OUTBOX_PENDING_TEXT,
  SUPER_AGENT_TOOL_LABELS,
  superAgentToolSummary,
} from "../../src/renderer/components/primitives/tool-disclosure/superagent";
import { SuperAgentAttention } from "../../src/renderer/components/workbench/SuperAgentAttention";
import { SuperAgentWorkList } from "../../src/renderer/components/workbench/SuperAgentWorkList";
import {
  type SuperAgentView,
  createSuperAgentStore,
  groupAgentSessions,
  isRunEvent,
  pendingOutbox,
  pendingSuggestions,
  workItemsForRouter,
} from "../../src/renderer/state/superagent";
import { parseSuperAgentDelivery } from "../../src/renderer/state/superagent-delivery";

const T = "2026-10-01T00:00:00.000Z";
const SESSION = "11111111-1111-4111-8111-111111111111";
const ROUTER = "22222222-2222-4222-8222-222222222222";
const WORKER = "33333333-3333-4333-8333-333333333333";

const work = (patch: Partial<WorkItem> = {}): WorkItem => ({
  id: "wrk_1",
  status: "running",
  pendingStatus: null,
  title: "修复登录",
  brief: "修复登录页报错",
  threadIds: ["gh:o/r#1"],
  workerSessionId: WORKER,
  routerSessionId: ROUTER,
  profileId: "default" as WorkItem["profileId"],
  worktree: null,
  progress: "已定位问题",
  createdAt: T,
  updatedAt: T,
  claimedBy: null,
  ...patch,
});
const outbox = (patch: Partial<OutboxItem> = {}): OutboxItem =>
  ({
    id: "out_1",
    workId: "wrk_1",
    state: "pending",
    error: null,
    createdAt: T,
    decidedAt: null,
    sentAt: null,
    kind: "comment",
    target: { thread: "gh:o/r#1" },
    body: { text: "已修复" },
    ...patch,
  }) as OutboxItem;
const suggestion = (patch: Partial<Suggestion> = {}): Suggestion => ({
  id: "sug_1",
  threadIds: ["gh:o/r#2"],
  brief: "处理 #2",
  triggerIds: ["trg_1"],
  state: "pending",
  workId: null,
  ...patch,
});
const runEvent = {
  runId: "44444444-4444-4444-8444-444444444444",
  event: { type: "text_delta", sessionId: SESSION, timestamp: T, text: "hi" },
};

describe("host event parsing", () => {
  // Same shape as web-host's batch schema: a mixed batch must parse whole.
  const batch = z.object({
    cursor: z.number(),
    events: z.array(hostEventSchema),
  });
  it("accepts a batch mixing run and super-agent events", () => {
    const parsed = batch.parse({
      cursor: 3,
      events: [
        runEvent,
        { type: "superagent_work", work: work() },
        { type: "superagent_outbox", item: outbox() },
        {
          type: "superagent_catch_up",
          catchUp: { at: T, error: "rate limited" },
        },
      ],
    });
    expect(parsed.events).toHaveLength(4);
    expect(parsed.events.map(isRunEvent)).toEqual([true, false, false, false]);
  });
});

function bridge(overrides: Record<string, unknown> = {}) {
  return {
    getSuperAgentState: vi.fn(async () => ({
      enabled: true as const,
      workspace: "/w",
      routerSessionId: ROUTER,
    })),
    listWorkItems: vi.fn(async () => [work()]),
    listSuggestions: vi.fn(async () => [suggestion()]),
    listOutbox: vi.fn(async () => [outbox()]),
    decideOutbox: vi.fn(async (id: string, approve: boolean) =>
      outbox({ id, state: approve ? "sent" : "rejected" }),
    ),
    decideSuggestion: vi.fn(async (id: string, accept: boolean) =>
      suggestion({ id, state: accept ? "accepted" : "rejected" }),
    ),
    ...overrides,
  };
}

describe("super-agent store", () => {
  it("loads pending items and routes flat events into the store", async () => {
    const host = bridge();
    const store = createSuperAgentStore(() => host as never);
    await store.load();
    expect(host.listSuggestions).toHaveBeenCalledWith("pending");
    expect(host.listOutbox).toHaveBeenCalledWith("pending");
    let view = store.getSnapshot();
    expect(view.status).toBe("enabled");
    expect(pendingOutbox(view)).toHaveLength(1);
    store.apply({
      type: "superagent_work",
      work: work({ status: "ready" }),
    });
    store.apply({
      type: "superagent_outbox",
      item: outbox({
        id: "out_2",
        kind: "push",
        target: {},
        body: { branch: "fix" },
      } as never),
    });
    view = store.getSnapshot();
    expect(view.workItems[0]?.status).toBe("ready");
    expect(pendingOutbox(view).map((item) => item.id)).toEqual([
      "out_1",
      "out_2",
    ]);
  });

  it("approves or rejects outbox items and suggestions through the bridge", async () => {
    const host = bridge();
    const store = createSuperAgentStore(() => host as never);
    await store.load();
    await store.decideOutbox("out_1", true);
    expect(host.decideOutbox).toHaveBeenCalledWith("out_1", true);
    expect(pendingOutbox(store.getSnapshot())).toEqual([]);
    await store.decideSuggestion("sug_1", false);
    expect(host.decideSuggestion).toHaveBeenCalledWith("sug_1", false);
    expect(pendingSuggestions(store.getSnapshot())).toEqual([]);
  });

  it("distinguishes disabled from missing optional RPCs", async () => {
    const off = bridge({
      getSuperAgentState: vi.fn(async () => {
        throw Object.assign(new Error("Super-agent is disabled"), {
          code: "not_found",
        });
      }),
    });
    const store = createSuperAgentStore(() => off as never);
    await store.load();
    expect(store.getSnapshot().status).toBe("disabled");
    expect(off.listOutbox).not.toHaveBeenCalled();

    const old = createSuperAgentStore(() => ({}) as never);
    await old.load();
    const view = old.getSnapshot();
    expect(view.status).toBe("not-supported");
    expect(view.requests.state).toBe("not-supported");
    expect(pendingOutbox(view)).toEqual([]);
    expect(pendingSuggestions(view)).toEqual([]);
    await expect(old.decideOutbox("out_1", true)).rejects.toThrow(
      "当前服务不支持",
    );
  });

  it("keeps live events and stays enabled when a list call fails", async () => {
    const host = bridge({
      listOutbox: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const store = createSuperAgentStore(() => host as never);
    await store.load();
    expect(store.getSnapshot().status).toBe("enabled");
    expect(store.getSnapshot().outbox).toEqual([]);
    expect(store.getSnapshot().requests.outbox).toBe("error");
  });
});

describe("super-agent tool labels", () => {
  it("labels every super-agent tool in Chinese", () => {
    for (const name of [
      "superagent_read",
      "superagent_list",
      "superagent_route",
      "superagent_report",
      "superagent_follow",
      "superagent_unfollow",
      "superagent_handback",
      "superagent_send",
    ])
      expect(SUPER_AGENT_TOOL_LABELS[name]).toMatch(/[\u4e00-\u9fff]/);
  });

  it("marks completed sends as queued for approval, not sent", () => {
    const send = {
      kind: "comment",
      target: { thread: "gh:o/r#1" },
      body: { text: "已修复" },
    };
    expect(
      superAgentToolSummary("superagent_send", send, "completed"),
    ).toContain(OUTBOX_PENDING_TEXT);
    expect(
      superAgentToolSummary("superagent_send", send, "running"),
    ).not.toContain(OUTBOX_PENDING_TEXT);
  });

  it("summarizes route and report arguments and ignores other tools", () => {
    expect(
      superAgentToolSummary(
        "superagent_route",
        {
          decisions: [{ type: "new" }, { type: "ignore" }, { type: "ignore" }],
        },
        "completed",
      ),
    ).toBe("新建 1 · 忽略 2");
    expect(
      superAgentToolSummary(
        "superagent_report",
        { status: "blocked", progress: "缺少权限" },
        "completed",
      ),
    ).toContain("缺少权限");
    expect(superAgentToolSummary("read_file", { path: "a" }, "completed")).toBe(
      undefined,
    );
  });
});

describe("router/worker grouping", () => {
  const session = (id: string, agentRole: unknown, createdAt = T) =>
    ({ id, title: id, createdAt, agentRole }) as never;
  const view: SuperAgentView = {
    status: "enabled",
    requests: {
      state: "success",
      workItems: "success",
      suggestions: "success",
      outbox: "success",
    },
    routerSessionId: ROUTER,
    workItems: [work()],
    suggestions: [],
    outbox: [],
  };
  it("nests workers under the router recorded on their work item", () => {
    const groups = groupAgentSessions(
      [
        session(WORKER, { kind: "worker", ownerId: "wrk_1" }),
        session(ROUTER, { kind: "router", ownerId: "/w" }),
        session("orphan", { kind: "worker", ownerId: "wrk_gone" }),
      ],
      view,
    );
    expect(groups.routers).toHaveLength(1);
    expect(groups.routers[0]?.workers.map((entry) => entry.work?.id)).toEqual([
      "wrk_1",
    ]);
    expect(groups.unassigned.map((entry) => entry.session)).toHaveLength(1);
    expect(workItemsForRouter(view, ROUTER)).toHaveLength(1);
  });

  it("shows workers as unassigned when work items are unavailable", () => {
    const groups = groupAgentSessions(
      [session(WORKER, { kind: "worker", ownerId: "wrk_1" })],
      { ...view, status: "disabled", workItems: [] },
    );
    expect(groups.routers).toEqual([]);
    expect(groups.unassigned).toHaveLength(1);
  });

  it("renders router work items with status and an open action", () => {
    const html = renderToStaticMarkup(
      <SuperAgentWorkList items={[work()]} onOpen={() => {}} />,
    );
    expect(html).toContain("修复登录");
    expect(html).toContain("进行中");
    expect(html).toContain("打开 Worker");
  });
});

describe("super-agent delivery marker", () => {
  const data = (value: unknown) =>
    `<untrusted_data>\n${JSON.stringify(value).replaceAll("<", "\\u003c")}\n</untrusted_data>`;
  const trigger = {
    id: "trg_1",
    source: "github",
    kind: "issue_comment",
    actor: "alice",
    explicit: true,
    threadId: "gh:o/r#1",
    summary: "<b>please</b> fix",
    payload: {},
    receivedAt: T,
    disposition: null,
    reason: null,
  };
  const thread = {
    id: "gh:o/r#1",
    title: "Login broken",
    url: "https://github.com/o/r/issues/1",
    state: "open",
    lastTriggerAt: T,
  };
  const triggers = { triggers: [trigger], threads: [thread] };
  const marked = (content: string, superagent: unknown) => ({
    content,
    origin: "superagent" as const,
    superagent,
  });

  it("maps each valid marker kind to its card kind, workId and details", () => {
    expect(
      parseSuperAgentDelivery(
        marked(`Route this batch:\n${data(triggers)}`, {
          kind: "route_batch",
          triggerIds: ["trg_1"],
        }),
      ),
    ).toMatchObject({
      kind: "batch",
      triggers: [{ summary: "<b>please</b> fix" }],
      threads: [{ id: "gh:o/r#1" }],
    });
    expect(
      parseSuperAgentDelivery(
        marked(`Work item: wrk_1\nBrief:\n修复登录\n\n${data(triggers)}`, {
          kind: "work_brief",
          workId: "wrk_1",
        }),
      ),
    ).toMatchObject({
      kind: "assignment",
      workId: "wrk_1",
      brief: "修复登录",
      triggers: [{ id: "trg_1" }],
    });
    expect(
      parseSuperAgentDelivery(
        marked(`Updates for wrk_1:\n${data(triggers)}`, {
          kind: "work_updates",
          workId: "wrk_1",
        }),
      ),
    ).toMatchObject({ kind: "updates", workId: "wrk_1" });
    expect(
      parseSuperAgentDelivery(
        marked(`Worker report:\n${data(work())}`, {
          kind: "worker_report",
          workId: "wrk_1",
        }),
      ),
    ).toMatchObject({ kind: "report", work: { id: "wrk_1" } });
    expect(
      parseSuperAgentDelivery(
        marked(`Work item changed:\n${data(work())}`, {
          kind: "work_changed",
          workId: "wrk_1",
        }),
      ),
    ).toMatchObject({ kind: "work_changed", work: { id: "wrk_1" } });
  });

  it("falls back to a detail-less card when the content block is missing or invalid", () => {
    expect(
      parseSuperAgentDelivery(
        marked(
          "Route this batch:\n<untrusted_data>\n{not json\n</untrusted_data>",
          {
            kind: "route_batch",
          },
        ),
      ),
    ).toEqual({ kind: "batch" });
    expect(
      parseSuperAgentDelivery(
        marked(
          "Work item: wrk_1\nBrief:\n修复登录\n\n<untrusted_data>\n{nope\n</untrusted_data>",
          { kind: "work_brief", workId: "wrk_1" },
        ),
      ),
    ).toEqual({ kind: "assignment", workId: "wrk_1", brief: "修复登录" });
    expect(
      parseSuperAgentDelivery(
        marked("Worker report:\n(no block)", {
          kind: "worker_report",
          workId: "wrk_1",
        }),
      ),
    ).toEqual({ kind: "report", workId: "wrk_1" });
    expect(
      parseSuperAgentDelivery(
        marked(
          'Work item changed:\n<untrusted_data>\n{"id":"wrk_1"}\n</untrusted_data>',
          { kind: "work_changed", workId: "wrk_1" },
        ),
      ),
    ).toEqual({ kind: "work_changed", workId: "wrk_1" });
  });

  it("ignores look-alike content without a marker", () => {
    for (const content of [
      `Route this batch:\n${data(triggers)}`,
      `Work item: wrk_1\nBrief:\n修复登录\n\n${data(triggers)}`,
      `Updates for wrk_1:\n${data(triggers)}`,
      `Worker report:\n${data(work())}`,
      `Work item changed:\n${data(work())}`,
    ])
      expect(parseSuperAgentDelivery({ content })).toBeNull();
    expect(
      parseSuperAgentDelivery({
        content: `Route this batch:\n${data(triggers)}`,
        origin: "agent_reconciliation",
        superagent: { kind: "route_batch" },
      }),
    ).toBeNull();
  });

  it("rejects invalid markers", () => {
    for (const superagent of [
      { kind: "nope" },
      { kind: "route_batch", extra: true },
      { kind: "route_batch", workId: "" },
      {},
      null,
    ])
      expect(
        parseSuperAgentDelivery({
          content: `Route this batch:\n${data(triggers)}`,
          origin: "superagent",
          superagent,
        }),
      ).toBeNull();
  });
});

describe("inspector attention", () => {
  const view: SuperAgentView = {
    status: "enabled",
    requests: {
      state: "success",
      workItems: "success",
      suggestions: "success",
      outbox: "success",
    },
    routerSessionId: ROUTER,
    workItems: [work()],
    suggestions: [suggestion()],
    outbox: [outbox()],
  };
  it("lists pending sends and suggestions with their actions", () => {
    const html = renderToStaticMarkup(
      <SuperAgentAttention
        view={view}
        outbox={pendingOutbox(view)}
        suggestions={pendingSuggestions(view)}
      />,
    );
    expect(html).toContain("发送队列 · 评论");
    expect(html).toContain("批准…");
    expect(html).toContain("接受并开始");
    expect(html).toContain("修复登录");
  });
  it("renders nothing when super-agent is disabled", () => {
    const disabled = { ...view, status: "disabled" as const };
    expect(
      renderToStaticMarkup(
        <SuperAgentAttention
          view={disabled}
          outbox={pendingOutbox(disabled)}
          suggestions={pendingSuggestions(disabled)}
        />,
      ),
    ).toBe("");
  });
  it("keeps known decisions visible after a probe refresh fails", () => {
    const failed: SuperAgentView = {
      ...view,
      requests: { ...view.requests, state: "error" },
    };
    const html = renderToStaticMarkup(
      <SuperAgentAttention
        view={failed}
        outbox={pendingOutbox(failed)}
        suggestions={pendingSuggestions(failed)}
      />,
    );
    expect(html).toContain("发送队列 · 评论");
    expect(html).toContain("批准…");
    expect(html).toContain("接受并开始");
  });
});
