import { readFileSync } from "node:fs";
import { sessionSnapshotSchema } from "@forge/core/shared/schemas";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoredTranscript } from "../../src/renderer/components/workbench/Transcript";

// Phase 2b (design A "light inline") transcript contract. Pure Node:
// server rendering + stylesheet assertions, no browser.

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const uiCss = read("src/renderer/styles/ui.css");
const tokensCss = read("src/renderer/styles/tokens.css");
const themeCss = read("src/renderer/styles/workspace-theme.css");
const transcriptCss = stripComments(
  read("src/renderer/styles/surfaces/transcript.css"),
);
const transcriptTsx = read("src/renderer/components/workbench/Transcript.tsx");

const toolCall = {
  id: "call-1",
  type: "function" as const,
  function: { name: "read_file", arguments: '{"path":"main.ts"}' },
};

const snapshot = sessionSnapshotSchema.parse({
  version: 1,
  id: "33333333-3333-4333-8333-333333333333",
  title: "design test",
  workspace: "/tmp",
  model: "m",
  status: "completed",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  messages: [
    { role: "user", content: "修复日期测试" },
    { role: "assistant", content: "先读文件。", tool_calls: [toolCall] },
    { role: "tool", tool_call_id: "call-1", content: "ok" },
    {
      role: "assistant",
      content: "已修复。\n\n```ts\nconst a = 1;\n```",
    },
  ],
  events: [],
  changes: [],
});

describe("transcript surface stylesheet", () => {
  it("is imported by ui.css after the other surfaces, in the components layer", () => {
    const sidebar = uiCss.indexOf('@import "./surfaces/sidebar.css"');
    const transcript = uiCss.indexOf('@import "./surfaces/transcript.css"');
    expect(sidebar).toBeGreaterThan(-1);
    expect(transcript).toBeGreaterThan(sidebar);
    expect(transcriptCss.trimStart().startsWith("@layer components")).toBe(
      true,
    );
  });

  it("uses theme variables only (no literal colours)", () => {
    expect(transcriptCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(transcriptCss).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch)\(/);
  });

  it("keeps coarse pointers at 44px and honours reduced motion", () => {
    expect(transcriptCss).toMatch(/@media \(pointer: coarse\)/);
    expect(transcriptCss).toContain("var(--touch-min-target)");
    expect(transcriptCss).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it("right-aligns the request as a compact bubble without reordering the DOM", () => {
    const row = transcriptCss.match(/\.wb-app \.message-user \{[^}]*\}/);
    expect(row?.[0]).toContain("flex-direction: row-reverse");
    const card = transcriptCss.match(/\.wb-app \.message-user-card \{[^}]*\}/);
    expect(card?.[0]).toContain("max-width: var(--user-bubble-measure)");
    expect(tokensCss).toMatch(/--user-bubble-measure:\s*80%/);
    // Touch-only narrow screens stack the always-visible actions under
    // the bubble, still on the right.
    expect(transcriptCss).toMatch(
      /@media \(max-width: 640px\) and \(hover: none\)\s*\{\s*\.wb-app \.message-user \{[^}]*align-items: flex-end/,
    );
  });

  it("overlays the turn actions instead of reserving a gap beside the bubble", () => {
    const actions = transcriptCss.match(
      /\.wb-app \.message-user > \.transcript-turn-actions \{[^}]*\}/,
    )?.[0];
    expect(actions).toContain("width: 0");
    expect(actions).toContain("flex: 0 0 0");
    expect(actions).toContain("justify-content: flex-end");
    expect(actions).toContain("overflow: visible");
    const row = transcriptCss.match(/\.wb-app \.message-user \{[^}]*\}/)?.[0];
    expect(row).toContain("gap: 0");
  });

  it("draws the collapsed-turn notice with a solid hairline", () => {
    const borders = [
      ...transcriptCss.matchAll(
        /\.wb-app \.transcript-turn-collapsed-bar \{[^}]*\}/g,
      ),
    ]
      .map((match) => match[0])
      .filter((rule) => rule.includes("border:"));
    expect(borders).toHaveLength(1);
    expect(borders[0]).toMatch(/border: 1px solid var\(--hairline-strong\)/);
    expect(transcriptCss).not.toContain("dashed");
  });

  it("does not centre the latest pill with a transform Motion owns", () => {
    const block = transcriptCss.match(/\.transcript-latest\s*\{[^}]*\}/);
    expect(block?.[0]).toContain("transform: none");
  });
});

describe("reading tokens", () => {
  it("sets the 15px prose / 720px measure / transcript rhythm", () => {
    expect(tokensCss).toMatch(/--prose-size:\s*var\(--text-body\)/);
    expect(tokensCss).toMatch(/--prose-leading:\s*1\.7/);
    expect(tokensCss).toMatch(/--reading-measure:\s*720px/);
    expect(tokensCss).toMatch(/--transcript-block-gap:/);
    expect(tokensCss).toMatch(/--transcript-turn-gap:/);
    expect(tokensCss).toMatch(/--code-size:/);
  });

  it("defines code surface and syntax colours in both themes", () => {
    for (const name of [
      "--code-surface",
      "--syntax-keyword",
      "--syntax-string",
      "--syntax-number",
      "--syntax-comment",
      "--syntax-property",
      "--syntax-attribute",
    ]) {
      const hits = themeCss.match(new RegExp(`${name}:`, "g")) ?? [];
      expect(hits.length, name).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("transcript markup", () => {
  const html = renderToStaticMarkup(
    createElement(StoredTranscript, { snapshot }),
  );

  it("wraps the request in a bubble card and keeps the author label", () => {
    expect(html).toContain(
      '<article class="message message-user"><div class="message-header">你</div><div class="message-user-card">',
    );
    // Turn actions sit after the card, not inside it.
    const card = html.indexOf('class="message-user-card"');
    const actions = html.indexOf('class="transcript-turn-actions"');
    expect(actions).toBeGreaterThan(card);
  });

  it("labels assistant replies with the Forge mark, not a bubble", () => {
    expect(html).toContain("message-author-mark");
    expect(html).toContain('class="message-author-name">Forge</span>');
    expect(html).not.toContain("message-assistant-card");
  });

  it("keeps the tool row and code block hooks", () => {
    expect(html).toContain('class="tool-call-group"');
    expect(html).toContain("tool-disclosure-header");
    expect(html).toContain("code-block");
  });

  it("uses a shape-only status skeleton while a session loads", () => {
    expect(transcriptTsx).toContain('<output className="transcript-loading">');
    expect(transcriptTsx).toContain("正在读取会话…");
    expect(transcriptTsx).toContain('className="transcript-loading-line');
  });

  it("animates the jump-to-latest pill with the shared springs", () => {
    expect(transcriptTsx).toContain("<AnimatePresence>");
    expect(transcriptTsx).toContain("transition={spring.snappy}");
  });
});
