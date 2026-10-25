import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { collectPublishedFiles } from "@forge/core/shared/published-files";
import { parseSessionId, sessionSnapshotSchema } from "@forge/core/shared/schemas";
import { publishesPublishedFiles } from "../../src/renderer/state/published-file-tools";
import { reduceTimeline } from "../../src/renderer/state/timeline";

it("projects OfficeCLI HTML attachments consistently in live, restored and host-authorized transcripts", () => {
  const id = parseSessionId(randomUUID());
  const timestamp = "2026-10-25T00:00:00.000Z";
  const file = { id: randomUUID(), name: "report.docx.preview.html", size: 72, sha256: "a".repeat(64), mimeType: "text/html", previewKind: "html", createdAt: timestamp };
  for (const [name, isError, accepted] of [
    ["officecli_preview", false, true], ["officecli_preview", true, false], ["officecli_run", false, false], ["mcp__office__preview", false, false],
  ] as const) {
    const call = { id: "office-preview", type: "function", function: { name, arguments: JSON.stringify({ path: "report.docx" }) } };
    const result = { content: JSON.stringify({ published: true, file }), isError, files: [file] };
    const saved = sessionSnapshotSchema.parse({
      version: 1, id, workspace: "/workspace", title: "Office preview", model: "fixture", status: "completed", createdAt: timestamp, updatedAt: timestamp, changes: [],
      messages: [
        { role: "user", content: "Preview the report" },
        { role: "assistant", content: null, tool_calls: [call] },
        { role: "tool", tool_call_id: call.id, content: JSON.stringify(result) },
        { role: "assistant", content: "Done" },
      ],
      events: [
        { type: "run_started", sessionId: id, timestamp, model: "fixture", permission: "unrestricted" },
        { type: "run_finished", sessionId: id, timestamp, status: "completed", turns: 2, toolCalls: 1 },
      ],
    });
    const live = sessionSnapshotSchema.parse({ ...saved, status: "running", messages: [{ role: "user", content: "Preview the report" }], events: [
      saved.events[0],
      { type: "tool_started", sessionId: id, timestamp, call },
      { type: "tool_finished", sessionId: id, timestamp, toolCallId: call.id, result },
    ] });
    for (const snapshot of [saved, live]) {
      const projected = reduceTimeline(snapshot).filter(item => item.kind === "tool").flatMap(item => item.kind === "tool" ? item.files ?? [] : []);
      expect(projected).toEqual(accepted ? [file] : []);
    }
    expect(collectPublishedFiles(saved.messages)).toEqual(accepted ? [file] : []);
  }
  expect(publishesPublishedFiles("officecli_preview")).toBe(true);
  expect(publishesPublishedFiles("officecli_run")).toBe(false);
});
