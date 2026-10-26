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
  const dark = root.getAttribute("data-theme") !== "light";
  const palette = cssVar(
    root,
    "--chart-series",
    "#a54f35, #226d40, #3b6998, #975a06, #55684d",
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const heat = cssVar(root, "--chart-heat", "#f6f3ee, #dc9477, #7a3520")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    ink: cssVar(root, "--text-primary", "#292824"),
    muted: cssVar(root, "--text-secondary", "#68665f"),
    faint: cssVar(root, "--text-muted", "#716e66"),
    surface: cssVar(root, "--surface-elevated", dark ? "#222221" : "#ffffff"),
    border: cssVar(root, "--border-subtle", dark ? "#2b2b28" : "#e5e3dc"),
    accent: cssVar(root, "--accent", "#a54f35"),
    success: cssVar(root, "--success", "#226d40"),
    warning: cssVar(root, "--warning", "#975a06"),
    error: cssVar(root, "--error", "#b82420"),
    palette: palette.length ? palette : ["#a54f35"],
    positive: cssVar(root, "--error", "#b82420"),
    negative: cssVar(root, "--success", "#226d40"),
    heat: heat.length >= 2 ? heat : ["#f6f3ee", "#a54f35"],
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
  ink: "#292824",
  muted: "#68665f",
  faint: "#716e66",
  surface: "#ffffff",
  border: "#e5e3dc",
  accent: "#a54f35",
  success: "#226d40",
  warning: "#975a06",
  error: "#b82420",
  palette: ["#a54f35", "#226d40", "#3b6998", "#975a06", "#55684d"],
  positive: "#b82420",
  negative: "#226d40",
  heat: ["#f6f3ee", "#dc9477", "#7a3520"],
  fontFamily: "system-ui, sans-serif",
  dark: false,
};
