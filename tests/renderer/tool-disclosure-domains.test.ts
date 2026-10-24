import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ToolDisclosure,
  type ToolDisclosureProps,
} from "../../src/renderer/components/primitives/ToolDisclosure";

const render = (props: ToolDisclosureProps) =>
  renderToStaticMarkup(
    createElement(ToolDisclosure, { defaultExpanded: true, ...props }),
  );

describe("tool-specific disclosure content", () => {
  it.each([false, true])(
    "renders a single agent report from an array=%s result",
    (array) => {
      const report = {
        id: "agent-12345678",
        status: "failed",
        content: "Checks stopped before delivery",
        error: "Permission denied",
        worktree: {
          repository: "/workspace/project",
          worktree: "/workspace/agent",
          baseRevision: "base-revision",
        },
      };
      const html = render({
        toolName: "get_agent_result",
        status: "completed",
        parameters: { id: report.id },
        output: JSON.stringify(array ? [report] : report),
      });
      expect(html).toContain('class="agent-report-card status-failed"');
      expect(html).toContain(report.content);
      expect(html).toContain(report.error);
      expect(html).toContain(report.worktree.worktree);
      expect(html).toContain(report.worktree.baseRevision);
    },
  );

  it("keeps a plain-text agent result readable", () => {
    const html = render({
      toolName: "get_agent_result",
      status: "completed",
      output: "Legacy report without a structured envelope",
    });
    expect(html).toContain("Legacy report without a structured envelope");
    expect(html).not.toContain('class="agent-reports-view"');
  });

  it("replaces a running agent snapshot placeholder without offering a report copy", () => {
    const html = render({
      toolName: "wait_agents",
      status: "running",
      output: JSON.stringify([
        {
          id: "agent-running",
          status: "running",
          summary: "No terminal snapshot",
        },
      ]),
    });
    expect(html).toContain("子任务正在后台自主执行中");
    expect(html).not.toContain("No terminal snapshot");
    expect(html).not.toContain('aria-label="复制报告"');
  });

  it.each([
    ["send_agent_message", "message", "agent-message-content"],
    ["resolve_agent", "resolution", "agent-resolve-content"],
  ])(
    "renders %s instructions separately from its single-line target",
    (toolName, key, contentClass) => {
      const text = `${"first ".repeat(14)}\nA second line with details`;
      const html = render({
        toolName,
        status: "completed",
        parameters: { id: "agent-target", [key]: text },
      });
      expect(html).toContain(
        `class="tool-disclosure-target" title="${text.slice(0, 60)}">${text.slice(0, 60)}</span>`,
      );
      expect(html).toContain(`class="${contentClass}">${text}</pre>`);
      expect(html).toContain("agent-target");
      expect(html).not.toContain("调用参数");
    },
  );

  it("uses the first task line as the spawn summary and retains the whole task", () => {
    const task = "Inspect runtime\nKeep business behavior unchanged";
    const html = render({
      toolName: "spawn_agent",
      status: "completed",
      parameters: { task },
    });
    expect(html).toContain(
      'class="tool-disclosure-target" title="Inspect runtime">Inspect runtime</span>',
    );
    expect(html).toContain(`class="agent-task-content">${task}</pre>`);
  });

  it("renders search citations and sources as links rather than raw result fields", () => {
    const html = render({
      toolName: "web_search",
      status: "completed",
      parameters: { queries: ["first query", "second query"] },
      output: JSON.stringify({
        citations: [
          { url: "https://example.com/reference", title: "Reference title" },
        ],
        sources: ["https://example.org/source"],
      }),
    });
    expect(html).toContain("first query; second query");
    expect(html).toContain('href="https://example.com/reference"');
    expect(html).toContain("Reference title");
    expect(html).toContain('href="https://example.org/source"');
    expect(html).toContain("引用来源（1）");
    expect(html).toContain("检索来源（1）");
    expect(html).not.toContain("&quot;citations&quot;");
  });

  it.each([
    ["running", "等待搜索返回…"],
    ["completed", "搜索未返回来源网页"],
  ] as const)("shows the %s search empty state", (status, message) => {
    expect(render({ toolName: "web_search", status })).toContain(message);
  });

  it("keeps scalar arrays as chips and plan-shaped argument values as steps", () => {
    const html = render({
      toolName: "custom_tool",
      status: "completed",
      parameters: {
        inputs: ["src/a.ts", 42, true],
        progress: [{ step: "Verify output", status: "in_progress" }],
      },
    });
    expect(html).toContain('class="tool-param-chips"');
    expect(html).toContain('class="tool-param-chip">src/a.ts</span>');
    expect(html).toContain('class="tool-param-chip">42</span>');
    expect(html).toContain('class="tool-plan-step tool-plan-step-in_progress"');
    expect(html).toContain("Verify output");
  });
});
