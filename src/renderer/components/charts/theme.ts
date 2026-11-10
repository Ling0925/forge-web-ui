import { useEffect, useState } from "react";

/**
 * ECharts renders to canvas and cannot read CSS custom properties, so the
 * active theme is sampled from computed styles and rebuilt whenever
 * `data-theme` changes on <html>. All colors come from design tokens
 * (workspace-theme.css); nothing here hardcodes a palette.
 */
export interface ChartTheme {
  readonly ink: string;
  readonly muted: string;
  readonly faint: string;
  readonly surface: string;
  readonly border: string;
  readonly accent: string;
  readonly success: string;
  readonly warning: string;
  readonly error: string;
  readonly palette: readonly string[];
  /** Candlestick up/down: red up, green down (A-share convention). */
  readonly positive: string;
  readonly negative: string;
  /** Single-hue ramp (low → mid → high) for the heatmap visualMap. */
  readonly heat: readonly string[];
  readonly fontFamily: string;
  readonly dark: boolean;
}

function cssVar(node: Element, name: string, fallback: string): string {
  const value = getComputedStyle(node).getPropertyValue(name).trim();
  return value || fallback;
}

export function readChartTheme(): ChartTheme {
  const root = document.documentElement;
  const dark = root.getAttribute("data-theme") === "dark";
  const palette = cssVar(
    root,
    "--chart-series",
    "#4f45db, #027e47, #b46d10, #ac43a5, #0070a6",
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const heat = cssVar(root, "--chart-heat", "#f3f4fd, #969cee, #3d2fb6")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    ink: cssVar(root, "--text-primary", "#15171e"),
    muted: cssVar(root, "--text-secondary", "#444751"),
    faint: cssVar(root, "--text-muted", "#5f636e"),
    surface: cssVar(root, "--surface-elevated", dark ? "#16171d" : "#ffffff"),
    border: cssVar(root, "--border-subtle", dark ? "#2a2b33" : "#e6e7ec"),
    accent: cssVar(root, "--accent", "#4f45db"),
    success: cssVar(root, "--success", "#027e47"),
    warning: cssVar(root, "--warning", "#925601"),
    error: cssVar(root, "--error", "#d61b2a"),
    palette: palette.length ? palette : ["#4f45db"],
    positive: cssVar(root, "--error", "#d61b2a"),
    negative: cssVar(root, "--success", "#027e47"),
    heat: heat.length >= 2 ? heat : ["#f3f4fd", "#4f45db"],
    fontFamily: cssVar(
      root,
      "--font-sans",
      'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
    ),
    dark,
  };
}

/** Re-renders consumers when the document theme flips. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(() =>
    typeof document === "undefined" ? FALLBACK_THEME : readChartTheme(),
  );
  useEffect(() => {
    const root = document.documentElement;
    setTheme(readChartTheme());
    const observer = new MutationObserver(() => setTheme(readChartTheme()));
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme", "class", "style"],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}

const FALLBACK_THEME: ChartTheme = {
  ink: "#15171e",
  muted: "#444751",
  faint: "#5f636e",
  surface: "#ffffff",
  border: "#e6e7ec",
  accent: "#4f45db",
  success: "#027e47",
  warning: "#925601",
  error: "#d61b2a",
  palette: ["#4f45db", "#027e47", "#b46d10", "#ac43a5", "#0070a6"],
  positive: "#d61b2a",
  negative: "#027e47",
  heat: ["#f3f4fd", "#969cee", "#3d2fb6"],
  fontFamily: "system-ui, sans-serif",
  dark: false,
};
