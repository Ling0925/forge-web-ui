import { existsSync, readFileSync } from "node:fs";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 2a (composer / new-session redesign) contract tests. Pure Node:
// server rendering + stylesheet assertions, no browser.

const store = vi.hoisted(() => ({
  state: {
    isSessionsLoading: false,
    sessions: [] as Record<string, unknown>[],
  },
  selectSession: vi.fn(),
}));

vi.mock("../../src/renderer/state/workbench-store", () => ({
  shallowEqual: (a: unknown, b: unknown) => a === b,
  useWorkbenchActions: () => ({ selectSession: store.selectSession }),
  useWorkbenchSelector: <T,>(selector: (c: { state: unknown }) => T) =>
    selector({ state: store.state }),
}));

const { ComposerDropdown } = await import(
  "../../src/renderer/components/workbench/ComposerDropdown"
);
const { ModelPicker } = await import(
  "../../src/renderer/components/workbench/ModelPicker"
);
const { WelcomeHero, WelcomeRecent } = await import(
  "../../src/renderer/components/workbench/Welcome"
);
// Design A: App.tsx renders the greeting, the composer and the recent list
// in one flow wrapper; the welcome parts are rendered together here.
const Welcome = () => (
  <>
    <WelcomeHero />
    <WelcomeRecent />
  </>
);
const { useSlashCommands } = await import(
  "../../src/renderer/components/workbench/useSlashCommands"
);

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const composerCss = read("src/renderer/styles/surfaces/composer.css");
const uiCss = read("src/renderer/styles/ui.css");

const session = (id: string, updatedAt: string, extra = {}) => ({
  id,
  title: `任务 ${id}`,
  workspace: `/home/me/projects/${id}-repo/`,
  updatedAt,
  createdAt: updatedAt,
  archived: false,
  ...extra,
});

describe("ComposerDropdown", () => {
  const options = [
    { value: "agent", label: "执行", sub: "直接修改" },
    { value: "plan", label: "计划", sub: "只读规划" },
  ] as const;

  it("keeps the trigger contract: menu popup, collapsed, label as text", () => {
    const html = renderToStaticMarkup(
      <ComposerDropdown
        value="plan"
        onChange={() => {}}
        options={options}
        ariaLabel="任务模式"
      />,
    );
    expect(html).toContain('class="composer-dropdown-trigger');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(
      /<span class="composer-dropdown-label[^"]*">计划<\/span>/,
    );
    // Closed menus are not rendered (the keyboard test opens them).
    expect(html).not.toContain('role="menu"');
  });

  it("icon-only triggers stay named and are disabled when asked", () => {
    const html = renderToStaticMarkup(
      <ComposerDropdown
        value="agent"
        onChange={() => {}}
        options={options}
        ariaLabel="任务模式"
        iconOnly
        disabled
      />,
    );
    expect(html).toContain("is-icon-only");
    expect(html).toMatch(/aria-label="任务模式：执行"|title="[^"]*执行/);
    expect(html).toContain("disabled");
  });
});

describe("ModelPicker summary", () => {
  it("keeps details/summary hooks, title and the effort meter label", () => {
    const html = renderToStaticMarkup(
      <ModelPicker
        value="grok-4"
        models={["grok-4"]}
        onSelect={() => {}}
        onRefresh={() => {}}
        loading={false}
        error=""
        sourceLabel="xAI"
        reasoning={{
          value: "high",
          options: ["low", "medium", "high"],
          disabled: false,
          onChange: () => {},
        }}
      />,
    );
    expect(html).toMatch(/^<details[^>]*class="[^"]*composer-model-picker/);
    expect(html).toMatch(/<summary class="[^"]*composer-model-summary"/);
    expect(html).toContain('class="composer-model-icon" aria-hidden="true"');
    expect(html).toContain('<span class="composer-model-source"');
    expect(html).toMatch(/aria-label="思考等级：[^"]+，3\/3"/);
    expect(html.match(/class="is-filled"/g)).toHaveLength(3);
    expect(html).toContain("composer-model-caret");
    // Panel only mounts when opened.
    expect(html).not.toContain("composer-model-panel");
  });
});

describe("Welcome", () => {
  beforeEach(() => {
    store.state = { isSessionsLoading: false, sessions: [] };
  });

  it("empty state keeps the exact sentence and region names", () => {
    const html = renderToStaticMarkup(<Welcome />);
    // The scroll region (wb-new-session-scroll, "欢迎与最近任务") is the
    // App.tsx flow wrapper since design A; see design-a.test.tsx.
    expect(html).toContain('aria-labelledby="welcome-title"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toMatch(
      /<section class="welcome-empty[^"]*" aria-label="还没有历史任务，从下方开始。">/,
    );
    expect(html).toContain('<p class="m-0">还没有历史任务，从下方开始。</p>');
  });

  it("loading state keeps its exact text and aria-busy", () => {
    store.state = { isSessionsLoading: true, sessions: [] };
    const html = renderToStaticMarkup(<Welcome />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(
      /<p class="welcome-empty[^>]*>(<svg.*?<\/svg>)正在读取最近任务…<\/p>/,
    );
  });

  it("lists the four newest primary, non-archived sessions as buttons", () => {
    store.state = {
      isSessionsLoading: false,
      sessions: [
        session("a", "2026-11-01T00:00:00Z"),
        session("b", "2026-11-05T00:00:00Z"),
        session("c", "2026-11-03T00:00:00Z", { archived: true }),
        session("d", "2026-11-04T00:00:00Z"),
        session("e", "2026-11-02T00:00:00Z"),
        session("f", "2026-10-01T00:00:00Z"),
      ],
    };
    const html = renderToStaticMarkup(<Welcome />);
    const titles = [...html.matchAll(/welcome-task-title[^>]*>([^<]+)</g)].map(
      (match) => match[1],
    );
    expect(titles).toEqual(["任务 b", "任务 d", "任务 e", "任务 a"]);
    expect(html.match(/<button class="welcome-task /g)).toHaveLength(4);
    expect(html).toContain('type="button"');
    // Workspace shown by folder name, full path kept in the title.
    expect(html).toContain('title="/home/me/projects/b-repo/"');
    expect(html).toContain(">b-repo<");
    expect(html).toContain('dateTime="2026-11-05T00:00:00Z"');
  });
});

describe("slash command menu", () => {
  function Harness({ prompt }: { prompt: string }) {
    const slash = useSlashCommands({
      prompt,
      draftId: "new",
      input: createRef<HTMLTextAreaElement>(),
      setPrompt: () => {},
      host: {} as never,
      busy: false,
    });
    return (
      <div>
        <textarea {...slash.inputProps} />
        {slash.view}
      </div>
    );
  }

  it("keeps listbox/option roles, ids and the active descendant", () => {
    const html = renderToStaticMarkup(<Harness prompt="/" />);
    expect(html).toContain('class="composer-slash-menu');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-label="Forge 命令"');
    expect(html).toContain(
      'id="slash-new-0" role="option" aria-selected="true"',
    );
    expect(html).toContain('aria-activedescendant="slash-new-0"');
    expect(html).toContain('aria-controls="slash-new"');
    expect(html).toContain("<kbd");
  });

  it("stays closed for normal text", () => {
    const html = renderToStaticMarkup(<Harness prompt="hello" />);
    expect(html).not.toContain('role="listbox"');
    expect(html).toContain('aria-expanded="false"');
  });
});

describe("composer surface stylesheet", () => {
  it("is imported into ui.css so it lands above the legacy layer", () => {
    expect(uiCss).toMatch(/@import\s+"\.\/surfaces\/composer\.css"/);
    expect(composerCss).toMatch(/@layer components\s*\{/);
    for (const file of ["Welcome", "ComposerDropdown", "useSlashCommands"])
      expect(uiCss).toContain(`${file}.tsx`);
  });

  it("keeps the geometry the mounted layout tests rely on", () => {
    // Continuing composer textarea starts at 36px; fresh composer at 100px.
    expect(composerCss).toMatch(/min-height:\s*36px/);
    expect(composerCss).toMatch(/min-height:\s*100px/);
    // Send / stop hit area stays at the 44px touch minimum.
    expect(composerCss).toMatch(
      /\.composer-submit-col \.btn,[\s\S]*?\{[^}]*width: 44px;[^}]*height: 44px;/,
    );
  });

  it("uses theme tokens for colour and honours reduced motion", () => {
    const code = composerCss.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    // Only neutral white/black alpha is allowed (gloss highlight, thumb shadow).
    for (const match of code.matchAll(/\brgba?\(([^)]*)\)/g))
      expect(match[1]).toMatch(/^(255 255 255|0 0 0) \/ \d+%$/);
    expect(code).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("removed the replaced legacy rules (subtract before add)", () => {
    expect(
      existsSync(
        new URL(
          "../../src/renderer/components/workbench/slash-menu.css",
          import.meta.url,
        ),
      ),
    ).toBe(false);
    const legacy = [
      "src/renderer/components/workbench/app.css",
      "src/renderer/components/workbench/composer-layout.css",
      "src/renderer/styles/workspace-theme.css",
    ]
      .map(read)
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const selector of [
      ".composer-surface",
      ".composer-run",
      ".composer-dropdown-menu",
      ".welcome-task",
      ".composer-model-summary",
    ])
      expect(legacy).not.toContain(selector);
  });
});
