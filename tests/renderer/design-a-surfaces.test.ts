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

const SURFACES = ["shell"];

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
