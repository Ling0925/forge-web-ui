import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 2a-v2 (design A "light inline") contract tests. Pure Node: server
// rendering + stylesheet assertions, no browser.

const store = vi.hoisted(() => {
  // web-host.ts reads location at import time (SessionActions imports it).
  Reflect.set(globalThis, "location", { protocol: "http:" });
  return { state: {} as Record<string, unknown> };
});

vi.mock("../../src/renderer/state/workbench-store", () => ({
  shallowEqual: (a: unknown, b: unknown) => a === b,
  // Every action is a no-op spy; rendering never calls them.
  useWorkbenchActions: () =>
    new Proxy({}, { get: () => () => undefined }) as never,
  useWorkbenchSelector: <T,>(selector: (c: { state: unknown }) => T) =>
    selector({ state: store.state }),
}));

// Super-agent group reads its own external store; out of scope here.
vi.mock("../../src/renderer/components/workbench/SuperAgentSessions", () => ({
  SuperAgentSessions: () => null,
}));

const { relativeTime, greeting, dateEyebrow } = await import(
  "../../src/renderer/lib/relative-time"
);
const { spring } = await import("../../src/renderer/lib/springs");
const { Welcome } = await import(
  "../../src/renderer/components/workbench/Welcome"
);
const { SessionListItem } = await import(
  "../../src/renderer/components/workbench/SessionListItem"
);
const { Sidebar } = await import(
  "../../src/renderer/components/workbench/Sidebar"
);
const { ModelPicker } = await import(
  "../../src/renderer/components/workbench/ModelPicker"
);

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const uiCss = read("src/renderer/styles/ui.css");
const tokensCss = read("src/renderer/styles/tokens.css");
const themeCss = read("src/renderer/styles/workspace-theme.css");
const sidebarCss = read("src/renderer/styles/surfaces/sidebar.css");
const composerCss = read("src/renderer/styles/surfaces/composer.css");
const workbenchCss = read("src/renderer/components/workbench/workbench.css");
const headerCss = read(
  "src/renderer/components/workbench/workbench-header.css",
);

const summary = (id: string, extra: Record<string, unknown> = {}) => ({
  version: 1,
  id,
  title: `任务 ${id}`,
  workspace: `/home/me/projects/${id}-repo`,
  model: "provider/model-id",
  status: "completed",
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  archived: false,
  ...extra,
});

const baseState = () => ({
  activeRuns: {},
  activeSessionId: undefined,
  isNewSessionOpen: true,
  isMobileSidebarOpen: false,
  isSessionsLoading: false,
  sessions: [],
  settings: undefined,
});

beforeEach(() => {
  store.state = baseState();
});

describe("design A tokens", () => {
  it("defines the type roles, 4px spacing steps, radius and shadow tiers", () => {
    for (const [name, value] of [
      ["--text-ui", "14px"],
      ["--text-body", "15px"],
      ["--text-meta", "13px"],
      ["--text-caption", "12px"],
      ["--space-7", "28px"],
      ["--space-9", "36px"],
      ["--radius-control", "8px"],
      ["--radius-item", "10px"],
      ["--radius-surface", "20px"],
    ])
      expect(tokensCss).toContain(`${name}: ${value};`);
    expect(tokensCss).toContain("--radius-composer: var(--radius-surface);");
    // Elevation + washes are colours, so they live in the theme (both themes).
    for (const name of [
      "--shadow-hairline",
      "--shadow-raised",
      "--shadow-floating",
      "--hairline",
      "--hover-wash",
    ])
      expect(themeCss.split(`${name}:`).length - 1).toBe(2);
    // ui.css only maps names; values stay out of it.
    expect(uiCss).toContain("--text-ui: var(--text-ui);");
    expect(uiCss).toContain("--radius-surface: var(--radius-surface);");
    expect(uiCss).toContain("--shadow-raised: var(--shadow-raised);");
    expect(uiCss).toContain("--color-hairline: var(--hairline);");
  });

  it("exports the four spring presets from spec.md", () => {
    expect(spring.snappy).toMatchObject({ stiffness: 520, damping: 40 });
    expect(spring.smooth).toMatchObject({ stiffness: 300, damping: 32 });
    expect(spring.bouncy).toMatchObject({ stiffness: 420, damping: 22 });
    expect(spring.gentle).toMatchObject({ stiffness: 180, damping: 26 });
  });
});

describe("relative time", () => {
  const now = new Date(2026, 10, 10, 15, 30);
  it("formats real timestamps only", () => {
    expect(
      relativeTime(new Date(2026, 10, 10, 15, 29, 40).toISOString(), now),
    ).toBe("刚刚");
    expect(relativeTime(new Date(2026, 10, 10, 15, 5).toISOString(), now)).toBe(
      "25 分钟前",
    );
    expect(relativeTime(new Date(2026, 10, 10, 9, 7).toISOString(), now)).toBe(
      "09:07",
    );
    expect(relativeTime(new Date(2026, 10, 9, 23, 0).toISOString(), now)).toBe(
      "昨天",
    );
    expect(relativeTime(new Date(2026, 10, 6, 12, 0).toISOString(), now)).toBe(
      "周五",
    );
    expect(relativeTime(new Date(2026, 9, 2, 12, 0).toISOString(), now)).toBe(
      "10/2",
    );
    expect(relativeTime(new Date(2025, 0, 3, 12, 0).toISOString(), now)).toBe(
      "2025/1/3",
    );
    expect(relativeTime("not a date", now)).toBe("");
  });
  it("greets by the local clock without a user name", () => {
    expect(greeting(new Date(2026, 10, 10, 8))).toBe("早上好");
    expect(greeting(new Date(2026, 10, 10, 15))).toBe("下午好");
    expect(greeting(new Date(2026, 10, 10, 20))).toBe("晚上好");
    expect(greeting(new Date(2026, 10, 10, 2))).toBe("夜深了");
    expect(dateEyebrow(now)).toBe("11 月 10 日 · 周二");
  });
});

describe("Welcome (design A)", () => {
  it("renders the greeting headline and keeps the question text", () => {
    const html = renderToStaticMarkup(<Welcome />);
    expect(html).toMatch(
      /<h2 id="welcome-title"[^>]*>(早上好|中午好|下午好|晚上好|夜深了)。<br\/>/,
    );
    expect(html).toContain("今天，想做点什么？");
    expect(html).toContain("text-hero");
    // No fabricated identity in the greeting.
    expect(html).not.toMatch(/好，[^<]+。/);
  });

  it("shows a status tile, workspace and relative time per recent row", () => {
    store.state = {
      ...baseState(),
      sessions: [
        summary("a", { status: "running", updatedAt: "2026-11-05T00:00:00Z" }),
        summary("b", { status: "failed", updatedAt: "2026-11-04T00:00:00Z" }),
      ],
    };
    const html = renderToStaticMarkup(<Welcome />);
    expect(html.match(/<button class="welcome-task /g)).toHaveLength(2);
    expect(html).toContain('class="sr-only">执行中，</span>');
    expect(html).toContain('class="sr-only">失败，</span>');
    expect(html).toContain("bg-error-soft text-error");
    expect(html).toContain('title="/home/me/projects/a-repo"');
    expect(html).toMatch(
      /<time [^>]*dateTime="2026-11-05T00:00:00Z">[^<]+<\/time>/,
    );
    // Hairline divider between rows, not after the last one.
    expect(html.match(/h-px bg-hairline/g)).toHaveLength(1);
  });
});

describe("Sidebar (design A)", () => {
  it("shows a dot only for states that need attention, in a fixed column", () => {
    const dot = (status: string) =>
      renderToStaticMarkup(
        <SessionListItem session={summary("x", { status }) as never} />,
      );
    for (const status of ["running", "failed", "cancelled", "interrupted"])
      expect(dot(status)).toContain(
        `<span class="session-item-dot"><span class="wb-status-dot" data-status="${status}" role="img"`,
      );
    for (const status of ["completed", "idle"])
      expect(dot(status)).toContain('<span class="session-item-dot"></span>');
  });

  it("adds the row time outside the row button", () => {
    const html = renderToStaticMarkup(
      <SessionListItem
        session={summary("x", { status: "running" }) as never}
      />,
    );
    expect(html).toContain('data-status="running"');
    expect(html).toMatch(
      /<\/button><time class="session-item-time" dateTime="2026-11-01T00:00:00Z" aria-hidden="true">[^<]+<\/time>/,
    );
    // The button's own text stays the title (plus the status dot image).
    expect(html).toMatch(
      /<span class="session-item-title">任务 x<\/span><\/button>/,
    );
  });

  it("keeps groups, search, footer controls and drops the folder icons", () => {
    store.state = { ...baseState(), sessions: [summary("a"), summary("b")] };
    const html = renderToStaticMarkup(<Sidebar />);
    expect(html).toContain('aria-label="会话与导航"');
    expect(html).toContain('aria-label="搜索会话"');
    expect(html.match(/class="session-folder"/g)).toHaveLength(2);
    expect(html).not.toContain("session-folder-icon");
    expect(html).toContain('class="sidebar-new-kbd" aria-hidden="true"');
    expect(html).toContain('aria-label="新建会话"');
    for (const label of ["用量看板", "设置", "刷新界面"])
      expect(html).toContain(`aria-label="${label}"`);
  });

  it("skin lands in the components layer, colours from tokens only", () => {
    expect(uiCss).toMatch(/@import\s+"\.\/surfaces\/sidebar\.css"/);
    expect(sidebarCss).toMatch(/@layer components\s*\{/);
    const code = stripComments(sidebarCss);
    expect(code).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(code).not.toMatch(/\brgba?\(/);
    // Row stays within the 30px the metadata test measures.
    expect(code).toMatch(/\.session-item-main \{[^}]*height: 30px;/);
    // Sizes use height so legacy min-height touch rules still win.
    expect(code).not.toMatch(/min-height/);
  });

  it("legacy sheet keeps structure and touch targets, not the skin", () => {
    const code = stripComments(workbenchCss);
    const sidebarPart = code.slice(
      0,
      code.indexOf(".session-actions-menu-dropdown"),
    );
    expect(sidebarPart).not.toMatch(
      /background-color:\s*var\(--surface-(hover|selected)\)/,
    );
    expect(sidebarPart).not.toContain(".session-item.is-active");
    expect(code).toMatch(
      /@media \(pointer: coarse\) \{\s*\.sidebar-footer button \{\s*min-height: var\(--touch-min-target\);\s*min-width: var\(--touch-min-target\);/,
    );
    expect(code).toContain("min-height: var(--touch-min-target);");
    expect(code).toContain(".session-folder-collapse.is-collapsed");
  });
});

describe("Header (design A)", () => {
  it("styles a breadcrumb and drops the raw shadows", () => {
    expect(headerCss).toContain(".wb-header-crumb");
    expect(headerCss).not.toMatch(/rgba\(/);
    expect(headerCss).toContain("height: var(--header-height);");
  });
});

describe("Composer skin (design A)", () => {
  it("anchors the model panel to the card, above the send button", () => {
    const code = stripComments(composerCss);
    expect(code).toMatch(
      /\.composer-card \.composer-model-picker:not\(\.composer-model-inline\) \{\s*position: static;/,
    );
    expect(code).toMatch(
      /\.composer-card\.composer-surface \{\s*@apply relative /,
    );
    expect(code).toMatch(
      /\.composer-model-panel \{[^}]*bottom: calc\(100% \+ 8px\);/,
    );
  });

  it("sweeps while sending and stays still for reduced motion", () => {
    const code = stripComments(composerCss);
    expect(code).toContain("@keyframes composer-sweep");
    expect(code).toMatch(/\.composer-cancel,\s*\.btn-busy-status/);
    const reduced = code.slice(
      code.lastIndexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(reduced).toContain("animation: none;");
  });

  it("shows a short model name on narrow screens", () => {
    const html = renderToStaticMarkup(
      <ModelPicker
        value="provider/model-id"
        models={[]}
        onSelect={() => {}}
        onRefresh={() => {}}
        loading={false}
        error=""
      />,
    );
    expect(html).toContain(
      '<span class="composer-model-name-full">provider/model-id</span>',
    );
    expect(html).toContain(
      '<span class="composer-model-name-short">model-id</span>',
    );
    expect(composerCss).toMatch(
      /@media \(max-width: 640px\) \{\s*\.composer-model-name-full \{\s*display: none;/,
    );
  });
});

describe("Design A structure (App / Composer)", () => {
  const app = read("src/renderer/components/workbench/App.tsx");
  const composer = read("src/renderer/components/workbench/Composer.tsx");

  it("docks the composer below the welcome scroll region at one tree position", () => {
    expect(app).toMatch(
      /\{isNew \? <Welcome \/> : <Transcript \/>\}\s*<Composer isNew=\{isNew\} \/>/,
    );
    expect(app).not.toContain("wb-main-flow");
    expect(composerCss).not.toContain("wb-main-flow");
    const welcome = read("src/renderer/components/workbench/Welcome.tsx");
    expect(welcome).toContain('role="region"');
    expect(welcome).toContain('aria-label="欢迎与最近任务"');
    expect(welcome).toMatch(/wb-new-session-scroll[^"]*overflow-x-hidden/);
    // Greeting + recent list are one block centred above the docked card.
    expect(welcome).toMatch(/wb-new-session-intro my-auto/);
    // 24px from the bottom edge, as before design A.
    expect(stripComments(composerCss)).toMatch(
      /\.wb-app \.wb-new-session \.composer-fresh \{\s*@apply relative z-20 mx-auto mt-0 mb-6 /,
    );
  });

  it("keeps recent titles inside the column at any width", () => {
    const welcome = read("src/renderer/components/workbench/Welcome.tsx");
    expect(welcome).toContain("grid-cols-[minmax(0,1fr)]");
    expect(welcome).toMatch(/"welcome-task group relative flex[^"]*min-w-0/);
    expect(welcome).toMatch(
      /welcome-task-title block truncate[^"]*line-clamp-2/,
    );
  });

  it("anchors every composer popover above the card top edge", () => {
    const code = stripComments(composerCss);
    const dropdown = read(
      "src/renderer/components/workbench/ComposerDropdown.tsx",
    );
    // The dropdown wrapper is not a positioning box, so its menu anchors to
    // the card (bottom: 100% + 8px of the card, not of the trigger).
    expect(dropdown).toContain('"composer-dropdown inline-flex"');
    expect(dropdown).toMatch(
      /composer-dropdown-menu absolute bottom-\[calc\(100%\+8px\)\] left-0[^"]*max-\[640px\]:right-0/,
    );
    expect(code).not.toMatch(
      /composer-model-panel \{[^}]*top: calc\(100% \+ 8px\)/,
    );
    expect(code).not.toMatch(/composer-model-panel \{\s*position: fixed/);
    expect(code).toMatch(
      /@media \(max-width: 640px\) \{\s*\.composer-card \.composer-model:not\(\.composer-model-inline\) > \.composer-model-panel \{\s*left: 0;\s*right: 0;\s*width: auto;/,
    );
    expect(code).toMatch(
      /\.composer-card \.composer-usage \{\s*position: static;/,
    );
    expect(code).toMatch(/\.usage-panel \{[^}]*bottom: calc\(100% \+ 8px\);/);
  });

  it("shows the context meter in the card header without alarm stripes", () => {
    const card = composer.slice(
      composer.indexOf('"composer-card composer-surface"'),
    );
    const header = card.slice(
      card.indexOf("composer-card-header"),
      card.indexOf("composer-input-row"),
    );
    expect(header).toContain("<UsagePopover");
    expect(composer.match(/<UsagePopover/g)).toHaveLength(1);
    const usage = read("src/renderer/components/workbench/UsagePopover.tsx");
    expect(usage).toContain('aria-label="上下文与用量"');
    expect(usage).toContain('className="usage-context-chip"');
    expect(usage).toContain('aria-label="用量详情"');
    const code = stripComments(composerCss);
    expect(code).toMatch(/--context-reserve-border: var\(--hairline-strong\);/);
    expect(code).not.toMatch(
      /--context-reserve-[a-z0-9-]+: [^;]*var\(--error\)/,
    );
  });

  it("puts the workspace and run timer in the card header, labels the toolbar", () => {
    const card = composer.slice(
      composer.indexOf('"composer-card composer-surface"'),
    );
    expect(card.indexOf("composer-card-header")).toBeLessThan(
      card.indexOf("composer-input-row"),
    );
    expect(card).toContain("<WorkspacePicker");
    expect(card).not.toContain("(isNew || (running && runStartedAt)) &&");
    expect(card).toContain("<RunTimer startedAt={runStartedAt} />");
    expect(composer).not.toContain("iconOnly");
    // Logic lives in the controller hook; the view only renders.
    expect(composer).toContain("useComposerController({ isNew })");
    expect(composer).not.toMatch(/\buse(State|Effect|Ref)\(/);
  });
});

describe("RunTimer", () => {
  it("formats elapsed time from the run_started timestamp", async () => {
    const { formatElapsed } = await import(
      "../../src/renderer/components/workbench/RunTimer"
    );
    const start = "2026-11-10T02:00:00.000Z";
    const at = (s: number) => Date.parse(start) + s * 1000;
    expect(formatElapsed(start, at(5))).toBe("0:05");
    expect(formatElapsed(start, at(125))).toBe("2:05");
    expect(formatElapsed(start, at(3725))).toBe("1:02:05");
    expect(formatElapsed(start, at(-3))).toBe("0:00");
    expect(formatElapsed("bad", at(1))).toBe("");
  });
});
