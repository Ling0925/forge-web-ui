import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Design A surface contract for migration phases 3–7. Pure Node:
// stylesheet and source assertions, no browser.

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const uiCss = read("src/renderer/styles/ui.css");
const tokensCss = read("src/renderer/styles/tokens.css");
const themeCss = read("src/renderer/styles/workspace-theme.css");
const surface = (name: string) =>
  stripComments(read(`src/renderer/styles/surfaces/${name}.css`));

const SURFACES = ["shell", "inspector", "settings", "usage"];

const ruleFor = (css: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...css.matchAll(new RegExp(`${escaped}\\s*\\{[^}]*\\}`, "g"))].map(
    (match) => match[0],
  );
};

describe.each(SURFACES)("surfaces/%s.css", (name) => {
  const css = surface(name);

  it("is imported by ui.css after the transcript surface", () => {
    const transcript = uiCss.indexOf('@import "./surfaces/transcript.css"');
    const own = uiCss.indexOf(`@import "./surfaces/${name}.css"`);
    expect(own).toBeGreaterThan(transcript);
  });

  it("lives in the components layer", () => {
    expect(css.trimStart().startsWith("@layer components")).toBe(true);
  });

  it("uses theme variables only (no literal colours)", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch)\(/);
  });

  it("keeps coarse pointers at 44px", () => {
    expect(css).toMatch(/@media \(pointer: coarse\)/);
    expect(css).toContain("var(--touch-min-target)");
  });

  it("turns animations off for reduced motion", () => {
    if (/animation:\s*[a-z]/.test(css))
      expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});

describe("phase 3 · shell", () => {
  const css = surface("shell");
  const palette = read("src/renderer/components/workbench/CommandPalette.tsx");

  it("defines the soft scrim in both themes", () => {
    expect(themeCss.match(/--overlay-bg-soft:/g)).toHaveLength(2);
    expect(css).toContain("var(--overlay-bg)");
    expect(css).toContain("var(--overlay-bg-soft)");
  });

  it("styles the command palette selection as a wash, not a primary button", () => {
    expect(palette).not.toContain('"primary"');
    expect(palette).toContain(
      'aria-current={selected === index ? "true" : undefined}',
    );
    const current = ruleFor(
      css,
      '.command-palette .command-action[aria-current="true"]',
    );
    expect(current[0]).toContain("var(--active-wash)");
  });

  it("gives the session menu a hairline card and 32px rows", () => {
    const menu = ruleFor(css, ".session-actions-menu-dropdown")[0];
    expect(menu).toContain("var(--menu-width)");
    expect(menu).toContain("var(--hairline-strong)");
    expect(
      ruleFor(css, ".session-actions-menu-dropdown .wb-menu-item")[0],
    ).toContain("var(--control-height-lg)");
    expect(tokensCss).toMatch(/--menu-width:\s*176px/);
  });

  it("restyles native dialogs with the surface radius", () => {
    expect(ruleFor(css, ".native-dialog")[0]).toContain(
      "var(--radius-surface)",
    );
    expect(tokensCss).toMatch(/--dialog-header-height:\s*52px/);
  });
});

describe("phase 4 · inspector + workspace", () => {
  const css = surface("inspector");

  it("puts the rail on the canvas plane with a 13px base and a 12px floor", () => {
    const rail = ruleFor(css, ".workspace-resources-content.wb-inspector")[0];
    expect(rail).toContain("--text-2xs: var(--text-caption)");
    expect(rail).toContain("background: var(--canvas-bg)");
    expect(rail).toContain("font-size: var(--text-meta)");
  });

  it("uses solid hairlines instead of dashed separators", () => {
    expect(css).not.toContain("dashed");
    const rows = ruleFor(css, ".wb-app .inspector-checkpoints")[0];
    expect(rows).toContain("inset 0 1px 0 var(--hairline)");
  });

  it("drops the uppercase micro-labels", () => {
    expect(
      ruleFor(css, ".wb-app .wb-inspector .inspector-card-title")[0],
    ).toContain("text-transform: none");
    expect(ruleFor(css, ".workspace-picker-section-label")[0]).toContain(
      "text-transform: none",
    );
  });

  it("marks the current plan step with a wash, not a bordered box", () => {
    const current = ruleFor(
      css,
      ".wb-app .wb-inspector .plan-step-in_progress .plan-step-row",
    )[0];
    expect(current).toContain("var(--active-wash)");
    expect(ruleFor(css, ".wb-app .wb-inspector .plan-step-row")[0]).toContain(
      "border: 0",
    );
  });

  it("defines the compact row and body indent tokens", () => {
    expect(tokensCss).toMatch(/--row-height-compact:\s*28px/);
    expect(tokensCss).toMatch(/--inspector-body-indent:\s*35px/);
  });
});

describe("phase 5 · settings", () => {
  const css = surface("settings");

  it("scopes everything to the settings page (it renders outside .wb-app)", () => {
    const selectors = [...css.matchAll(/^\s*([^@{}\s][^{}]*)\{/gm)]
      .map((match) => (match[1] ?? "").trim())
      .filter((selector) => !/^(from|to|\d)/.test(selector));
    expect(selectors.length).toBeGreaterThan(40);
    for (const selector of selectors)
      expect(selector.startsWith(".settings-page"), selector).toBe(true);
  });

  it("marks the selected nav item as a small lifted card", () => {
    const active = ruleFor(
      css,
      ".settings-page :is(.settings-nav-item.is-active, .settings-nav-item[aria-current])",
    )[0];
    expect(active).toContain("var(--surface-elevated)");
    expect(active).toContain("var(--shadow-xs)");
    expect(tokensCss).toMatch(/--row-height-rail:\s*34px/);
  });

  it("caps the content at the shared reading measure", () => {
    expect(ruleFor(css, ".settings-page .settings-section")[0]).toContain(
      "max-width: var(--reading-measure)",
    );
  });

  it("uses 600 for the page title (no 700) and hairline rows", () => {
    const title = ruleFor(css, ".settings-page .settings-header-meta h2")[0];
    expect(title).toContain("font-weight: 600");
    expect(css).not.toMatch(/font-weight:\s*700/);
    expect(ruleFor(css, ".settings-page .setting-row")[0]).toContain(
      "var(--setting-row-min-height)",
    );
  });
});

describe("phase 6 · usage", () => {
  const css = surface("usage");
  const legacy = read("src/renderer/components/workbench/usage-dashboard.css");
  const overview = read("src/renderer/components/workbench/UsageOverview.tsx");

  it("moves chart and topology colours into the theme (both themes)", () => {
    for (const name of [
      "--chart-cached",
      "--chart-uncached",
      "--chart-cost",
      "--chart-speed",
      "--topology-core",
      "--topology-provider",
      "--topology-model",
      "--topology-subagent",
      "--topology-label-bg",
    ])
      expect(themeCss.match(new RegExp(`${name}:`, "g")), name).toHaveLength(2);
    expect(stripComments(legacy)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(stripComments(legacy)).not.toMatch(/\brgba?\(/);
  });

  it("draws the 3D topology from theme variables, not the old warm palette", () => {
    expect(overview).toContain('themed("--topology-core"');
    expect(overview).not.toContain("#a54f35");
    expect(overview).not.toContain("#55684d");
  });

  it("scopes everything to the dashboard overlay (it renders outside .wb-app)", () => {
    const selectors = [...css.matchAll(/^\s*([^@{}\s][^{}]*)\{/gm)].map(
      (match) => (match[1] ?? "").trim(),
    );
    expect(selectors.length).toBeGreaterThan(40);
    for (const selector of selectors)
      expect(selector.startsWith(".usage-dashboard-overlay"), selector).toBe(
        true,
      );
  });

  it("shows KPI numbers in the UI face, 600 weight, tabular figures", () => {
    const value = ruleFor(css, ".usage-dashboard-overlay .usage-kpi-value")[0];
    expect(value).toContain("font-family: var(--font-sans)");
    expect(value).toContain("font-weight: 600");
    expect(value).toContain("tabular-nums");
  });
});

describe("phase 7 · cleanup", () => {
  const pkg = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
  };
  const stylelint = read("stylelint.config.mjs");

  it("imports Radix only through the radix-ui umbrella package", () => {
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain(
      "@radix-ui/react-checkbox",
    );
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain(
      "@radix-ui/react-select",
    );
    for (const file of [
      "src/renderer/ui/checkbox.tsx",
      "src/renderer/ui/select.tsx",
      "src/renderer/components/primitives/Checkbox.tsx",
      "src/renderer/components/primitives/Select.tsx",
    ]) {
      expect(read(file), file).not.toContain("@radix-ui/react-");
      expect(read(file), file).toContain('from "radix-ui"');
    }
  });

  it("lints the surfaces for literal colours", () => {
    expect(stylelint).toContain(
      'files: ["src/renderer/styles/surfaces/*.css"]',
    );
    expect(stylelint).toContain('"color-no-hex": true');
  });

  it("keeps the composer surface free of literal colours too", () => {
    const css = surface("composer");
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch)\(/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("rebase onto master PR #11 (ui-polish-v2)", () => {
  const v2 = (name: string) =>
    stripComments(read(`src/renderer/components/workbench/${name}`));

  it("defines master's foundation tokens on the Iris palette, both themes", () => {
    for (const name of [
      "--surface-raised",
      "--surface-sunken",
      "--edge-highlight",
      "--accent-subtle",
      "--accent-border",
      "--accent-glow",
      "--shadow-color",
      "--chart-completion",
      "--chart-failed",
    ])
      expect(themeCss.match(new RegExp(`${name}:`, "g")), name).toHaveLength(2);
    // Brand stays Iris, not master's terracotta.
    expect(themeCss).not.toContain("#a54f35");
  });

  it("leaves surfaces design A owns out of master's v2 sheets", () => {
    const sidebar = v2("sidebar-v2.css");
    expect(sidebar).not.toMatch(/\.session-item-main\s*\{/);
    expect(sidebar).not.toMatch(/\.sidebar-search-input\s*\{/);
    const transcript = v2("transcript-v2.css");
    expect(transcript).not.toContain(".markdown-content");
    expect(transcript).not.toMatch(/\.message-user\s*\{/);
    expect(v2("new-session-v2.css")).not.toMatch(/welcome-|wb-new-session/);
    const foundation = stripComments(
      read("src/renderer/styles/design-foundation.css"),
    );
    expect(foundation).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(foundation).not.toMatch(/\brgba?\(/);
  });

  it("styles master's search-first command palette", () => {
    const css = surface("shell");
    const list = ruleFor(css, ".command-palette .command-list")[0];
    expect(list).toContain("overflow-y: auto");
    expect(list).toContain("var(--palette-list-max)");
    const row = ruleFor(css, ".command-palette .command-action")[0];
    expect(row).toContain("display: flex");
    expect(row).toContain("width: 100%");
    expect(tokensCss).toMatch(/--palette-width:\s*560px/);
  });

  it("puts master's icon-only sidebar footer on design A washes", () => {
    const css = stripComments(read("src/renderer/styles/surfaces/sidebar.css"));
    expect(css).not.toContain("sidebar-model-status");
    expect(ruleFor(css, ".wb-app .sidebar-icon-btn:hover")[0]).toContain(
      "var(--hover-wash)",
    );
    expect(ruleFor(css, ".wb-app .sidebar-archive-toggle")[0]).toContain(
      "position: absolute",
    );
  });

  it("grows the effort fill with master's scaleX transform", () => {
    const css = stripComments(
      read("src/renderer/styles/surfaces/composer.css"),
    );
    const fill = ruleFor(css, ".effort-slider-fill")[0];
    expect(fill).toContain("transform-origin: left center");
    expect(fill).toContain("width: 100%");
    expect(read("src/renderer/components/workbench/ModelPicker.tsx")).toContain(
      "scaleX(",
    );
  });
});
