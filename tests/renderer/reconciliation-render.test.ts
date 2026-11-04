import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { StoredTranscript } from "../../src/renderer/components/workbench/Transcript";
import { sessionSnapshotSchema } from "@forge/core/shared/schemas";

it("collapses only tagged internal messages while preserving identical human text", () => {
  const content = '子代理汇总：{"result":"real persisted evidence"}';
  const snapshot = sessionSnapshotSchema.parse({
    version: 1,
    id: "11111111-1111-4111-8111-111111111111",
    title: "test",
    workspace: "/tmp",
    model: "m",
    status: "completed",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    messages: [
      { role: "user", origin: "agent_reconciliation", content },
      { role: "user", content },
    ],
    events: [],
    changes: [],
  });
  const html = renderToStaticMarkup(
    createElement(StoredTranscript, { snapshot }),
  );
  // The tagged message folds into a closed internal disclosure…
  expect(html).toMatch(/<details class="message message-internal[^"]*">/);
  expect(html).toContain("子任务执行汇总");
  expect(html).not.toContain(" open=");
  // …while the identical human message stays a normal user request.
  expect(html).toContain('<article class="message message-user">');
  expect(html.match(/real persisted evidence/g)).toHaveLength(2);
});
