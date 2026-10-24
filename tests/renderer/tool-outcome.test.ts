import { describe, expect, it } from "vitest";
import type { SessionSnapshot } from "../../src/renderer/shared-types";
import { reduceTimeline } from "../../src/renderer/state/timeline";
import { sessionIdSchema } from "@forge/core/shared/schemas";
const snapshot: SessionSnapshot = {
  version: 1,
  id: sessionIdSchema.parse("11111111-1111-4111-8111-111111111111"),
  title: "Approval task",
  workspace: "/tmp/task",
  model: "model",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
  status: "cancelled",
  messages: [{ role: "assistant", content: null, tool_calls: [{
    id: "command-1", type: "function", function: { name: "run_command", arguments: "{}" },
  }] }],
  events: [],
  changes: [],
};
function persisted(content: string): SessionSnapshot {
  return {
    ...snapshot,
    messages: [...snapshot.messages, { role: "tool", tool_call_id: "command-1", content }],
  };
}
const tool = (value: SessionSnapshot) => reduceTimeline(value).find(item => item.kind === "tool");
describe("persisted tool outcomes", () => {
  it.each(["Cancelled before execution", "Permission denied by user"])(
    "does not claim completion for %s without tool_finished",
    (content) => {
      const saved = persisted(JSON.stringify({ content, isError: true }));
      expect(tool(saved)).toMatchObject({
        status: "failed",
        output: content,
      });
      expect(saved.events).toEqual([]);
    },
  );
  it("recognizes validated successful persisted results after reload", () => {
    expect(
      tool(persisted(JSON.stringify({ content: "exit code 0", isError: false }))),
    ).toMatchObject({ status: "completed", output: "exit code 0" });
  });
  it.each([
    '{"content":"cancelled"}',
    '{"content":"ok","isError":"false"}',
    '{"content":42,"isError":false}',
    '{"isError":false}',
  ])("does not treat malformed result envelope %s as success", (content) => {
    expect(tool(persisted(content))).toMatchObject({ status: "failed", output: content });
  });
  it.each(["not JSON", '{"count":2}', '["file.ts"]'])("preserves native output %s without requiring an envelope", content => {
    expect(tool(persisted(content))).toMatchObject({ status: "completed", output: content });
  });
  it("does not erase a confirmed execution failure with a successful stored envelope", () => {
    const saved: SessionSnapshot = {
      ...persisted(JSON.stringify({ content: "older", isError: false })),
      events: [
        {
          type: "tool_finished",
          sessionId: snapshot.id,
          timestamp: snapshot.updatedAt,
          toolCallId: "command-1",
          result: { content: "execution failed", isError: true },
        },
      ],
    };
    const before = JSON.stringify(saved);
    expect(tool(saved)).toMatchObject({
      status: "failed",
      output: "older",
    });
    expect(JSON.stringify(saved)).toBe(before);
  });
  it("does not invent execution evidence for a saved call without tool events", () => {
    expect(tool(snapshot)?.status).toBe("unexecuted");
    expect(tool({ ...snapshot, status: "awaiting_approval" })?.status).toBe("unexecuted");
  });
});
