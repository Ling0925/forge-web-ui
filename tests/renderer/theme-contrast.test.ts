import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Guards the Iris palette contract in styles/workspace-theme.css: text inks
// stay >= 4.5:1 on the surfaces they sit on, and interactive control borders
// stay >= 3:1 (WCAG 1.4.11). Decorative dividers (--border-subtle) are exempt.
const css = readFileSync(
  new URL("../../src/renderer/styles/workspace-theme.css", import.meta.url),
  "utf8",
);

function block(selector: string): Map<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(
    css.indexOf("{", start) + 1,
    css.indexOf("\n}", start),
  );
  const tokens = new Map<string, string>();
  for (const match of body.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\b/gi)) {
    tokens.set(match[1] as string, (match[2] as string).toLowerCase());
  }
  return tokens;
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = [
  "--canvas-bg",
  "--sidebar-bg",
  "--surface-shell",
  "--surface-elevated",
  "--surface-soft",
];
const THEMES = {
  light: block(':root,\n[data-theme="light"]'),
  dark: block('[data-theme="dark"]'),
};

describe.each(Object.entries(THEMES))("Iris %s theme", (_name, tokens) => {
  const get = (name: string) => {
    const value = tokens.get(name);
    if (!value) throw new Error(`${name} is not a hex token`);
    return value;
  };

  it("defines every semantic color the shadcn mapping reads", () => {
    for (const name of [
      ...SURFACES,
      "--surface-hover",
      "--surface-active",
      "--surface-selected",
      "--text-primary",
      "--text-secondary",
      "--text-muted",
      "--text-tertiary",
      "--border-subtle",
      "--border-control",
      "--border-hover",
      "--accent",
      "--accent-soft",
      "--on-accent",
      "--focus-ring",
      "--success",
      "--warning",
      "--error",
      "--on-error",
      "--info",
      "--info-bg",
      "--run-bg",
      "--run-ink",
      "--run-hover",
      "--run-active",
    ]) {
      expect(tokens.has(name), name).toBe(true);
    }
  });

  it("keeps text inks >= 4.5:1 on every base surface", () => {
    for (const ink of [
      "--text-primary",
      "--text-secondary",
      "--text-muted",
      "--text-tertiary",
    ]) {
      for (const surface of [
        ...SURFACES,
        "--surface-hover",
        "--surface-selected",
      ]) {
        expect(
          contrast(get(ink), get(surface)),
          `${ink} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps fills and state inks readable", () => {
    const pairs: [string, string][] = [
      ["--run-ink", "--run-bg"],
      ["--run-ink", "--run-hover"],
      ["--run-ink", "--run-active"],
      ["--on-accent", "--accent"],
      ["--on-error", "--error"],
      ["--accent", "--surface-elevated"],
      ["--accent", "--accent-soft"],
      ["--success", "--success-bg"],
      ["--warning", "--warning-bg"],
      ["--error", "--error-bg"],
      ["--info", "--info-bg"],
    ];
    for (const [ink, fill] of pairs) {
      expect(
        contrast(get(ink), get(fill)),
        `${ink} on ${fill}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps control borders and the focus ring >= 3:1 (WCAG 1.4.11)", () => {
    for (const edge of ["--border-control", "--border-hover", "--focus-ring"]) {
      for (const surface of SURFACES) {
        expect(
          contrast(get(edge), get(surface)),
          `${edge} on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("keeps decorative dividers faint", () => {
    expect(
      contrast(get("--border-subtle"), get("--surface-elevated")),
    ).toBeLessThan(1.6);
  });
});
