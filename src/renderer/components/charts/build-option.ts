import type { ChartSpec } from "@forge/core/shared/chart-spec";
import type { ChartTheme } from "./theme";

/**
 * Pure friendly-grammar → ECharts option compiler. Kept free of ECharts
 * imports so it is unit-testable without loading the chart library.
 *
 * The card header owns `spec.title`, so the canvas deliberately has no
 * `title` component: that space belongs to the plot itself.
 */

type Option = Record<string, unknown>;

// ECharts 6 deprecated `containLabel` (it now needs the opt-in
// LegacyGridContainLabel module and logs a warning otherwise). outerBounds
// 'same' + axis labels/names is the documented equivalent: shrink the grid
// so labels stay inside the canvas. `left/right/top/bottom` are therefore the
// breathing room around the axis elements, not the plot rectangle itself.
const GRID = {
  left: 12,
  right: 16,
  top: 18,
  bottom: 26,
  outerBoundsMode: "same",
  outerBoundsContain: "all",
};

// One legend row sits above the plot; reserve its height plus a small gap.
const LEGEND_TOP = 6;
const LEGEND_GRID_TOP = 34;
// Horizontal bars keep their category labels in a bounded column so a long
// label cannot eat the whole narrow canvas.
const HORIZONTAL_LABEL_MAX_WIDTH = 96;

function baseOption(theme: ChartTheme): Option {
  return {
    color: theme.palette,
    backgroundColor: "transparent",
    textStyle: { color: theme.ink, fontFamily: theme.fontFamily },
    animationDuration: 300,
    tooltip: {
      trigger: "item",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.ink, fontSize: 12 },
      confine: true,
    },
  };
}

/**
 * A scroll legend keeps every series reachable on a narrow card without
 * wrapping onto a second row (which would overlap the plot). Its layout box
 * defaults to the full canvas width, so it pages instead of overflowing.
 */
function legendOption(theme: ChartTheme): Option {
  return {
    type: "scroll",
    top: LEGEND_TOP,
    left: "center",
    itemGap: 12,
    itemWidth: 8,
    itemHeight: 8,
    icon: "circle",
    pageIconColor: theme.accent,
    pageIconInactiveColor: theme.faint,
    pageIconSize: 10,
    pageButtonPosition: "end",
    pageTextStyle: { color: theme.muted, fontSize: 11 },
    textStyle: { color: theme.muted, fontSize: 11, lineHeight: 14 },
    padding: [0, 4],
  };
}

const axisLabel = (theme: ChartTheme): Option => ({
  color: theme.muted,
  fontSize: 11,
  margin: 8,
  // Narrow cards: drop labels that would collide instead of overprinting.
  hideOverlap: true,
});
const axisLine = (theme: ChartTheme): Option => ({
  lineStyle: { color: theme.border },
});
const splitLine = (theme: ChartTheme): Option => ({
  lineStyle: { color: theme.border, opacity: 0.55 },
});

interface CategoryAxisOptions {
  readonly inverse?: boolean;
  readonly maxLabelWidth?: number;
}

function categoryAxis(
  theme: ChartTheme,
  categories: readonly string[],
  { inverse = false, maxLabelWidth }: CategoryAxisOptions = {},
): Option {
  const labels: Option = axisLabel(theme);
  if (maxLabelWidth) {
    labels.width = maxLabelWidth;
    labels.overflow = "truncate";
  }
  return {
    type: "category",
    data: categories,
    boundaryGap: true,
    inverse: inverse || undefined,
    axisLabel: labels,
    axisLine: axisLine(theme),
    axisTick: { show: false },
  };
}

function valueAxis(theme: ChartTheme, title?: string): Option {
  return {
    type: "value",
    name: title,
    nameGap: 10,
    nameTextStyle: { color: theme.faint, fontSize: 11 },
    axisLabel: axisLabel(theme),
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: splitLine(theme),
    splitNumber: 4,
  };
}

/** Shared visual/cartesian configuration; the card title is not repeated. */
function axisPointer(
  theme: ChartTheme,
  type: "line" | "shadow" | "cross",
): Option {
  return {
    type,
    lineStyle: { color: theme.border },
    shadowStyle: { color: theme.border, opacity: 0.16 },
    crossStyle: { color: theme.border },
    label: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      color: theme.ink,
      fontSize: 11,
    },
  };
}

export interface BuiltChart {
  readonly option: Option;
  /** Rows for the accessible data-table fallback: header + body rows. */
  readonly table: {
    header: readonly string[];
    rows: readonly (readonly (string | number | null)[])[];
  };
  readonly height: number;
}

export function buildChartOption(
  spec: ChartSpec,
  theme: ChartTheme,
): BuiltChart {
  // biome-ignore lint/style/noNonNullAssertion: The caller sends friendly specs only; raw options use the sanitizer.
  const chart = spec.chart!;
  const option = baseOption(theme);
  const legendCount =
    chart.type === "bar-line"
      ? chart.bars.length + chart.lines.length
      : "series" in chart
        ? chart.series.length
        : 0;
  const showLegend = legendCount > 1 || chart.type === "pie";
  if (showLegend) option.legend = legendOption(theme);
  const grid = (extra: Option = {}): Option => ({
    ...GRID,
    top: showLegend ? LEGEND_GRID_TOP : GRID.top,
    ...extra,
  });

  switch (chart.type) {
    case "bar":
    case "line":
    case "bar-line": {
      const isLine = chart.type === "line";
      const isBarLine = chart.type === "bar-line";
      const seriesItems =
        chart.type === "bar-line"
          ? [
              ...chart.bars.map((item) => ({ ...item, kind: "bar" as const })),
              ...chart.lines.map((item) => ({
                ...item,
                kind: "line" as const,
              })),
            ]
          : chart.series.map((item) => ({
              ...item,
              kind: chart.type as "bar" | "line",
            }));
      const stacked = "stack" in chart && chart.stack === true;
      const horizontal = chart.type === "bar" && chart.horizontal === true;
      option.grid = grid();
      // Horizontal bars need a value X axis and an inverted category Y axis;
      // otherwise ECharts still draws vertical columns.
      // `chart.title` remains the *value* axis name (the card header already
      // shows `spec.title`, so the canvas must not repeat it as a title).
      option.xAxis = horizontal
        ? valueAxis(theme, chart.title)
        : categoryAxis(theme, chart.categories);
      option.yAxis = horizontal
        ? categoryAxis(theme, chart.categories, {
            inverse: true,
            maxLabelWidth: HORIZONTAL_LABEL_MAX_WIDTH,
          })
        : valueAxis(theme, chart.title);
      option.tooltip = {
        ...(option.tooltip as Option),
        trigger: "axis",
        axisPointer: axisPointer(theme, isLine ? "line" : "shadow"),
      };
      option.series = seriesItems.map((item, index) => ({
        name: item.name ?? `系列${index + 1}`,
        type: item.kind,
        // A combo chart stacks its columns only: its line is usually a rate
        // or total and would double-count the bars if stacked with them.
        stack:
          stacked &&
          (item.kind === "bar" || (!isBarLine && item.kind === "line"))
            ? "total"
            : undefined,
        smooth: item.kind === "line" ? 0.2 : undefined,
        showSymbol:
          item.kind === "line" ? chart.categories.length <= 40 : undefined,
        symbol: item.kind === "line" ? "circle" : undefined,
        symbolSize: item.kind === "line" ? 6 : undefined,
        lineStyle: item.kind === "line" ? { width: 2 } : undefined,
        areaStyle:
          item.kind === "line" && "area" in chart && chart.area
            ? { opacity: 0.16 }
            : undefined,
        barMaxWidth: item.kind === "bar" ? 26 : undefined,
        itemStyle:
          item.kind === "bar"
            ? { borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] }
            : undefined,
        emphasis: { focus: "series" },
        data: item.values,
      }));
      return {
        option,
        table: {
          header: [
            "类别",
            ...seriesItems.map(
              (item, index) => item.name ?? `系列${index + 1}`,
            ),
          ],
          rows: chart.categories.map((category, column) => [
            category,
            ...seriesItems.map((item) => item.values[column] ?? null),
          ]),
        },
        height: 300,
      };
    }
    case "candlestick": {
      option.grid = grid();
      option.xAxis = categoryAxis(theme, chart.categories);
      option.yAxis = valueAxis(theme, chart.title);
      option.tooltip = {
        ...(option.tooltip as Option),
        trigger: "axis",
        axisPointer: axisPointer(theme, "cross"),
      };
      option.series = [
        {
          name: chart.name ?? "K线",
          type: "candlestick",
          data: chart.ohlc,
          itemStyle: {
            color: theme.positive,
            colorDown: theme.negative,
            borderColor: theme.positive,
            borderColorDown: theme.negative,
          },
        },
      ];
      return {
        option,
        table: {
          header: ["日期", "开", "收", "低", "高"],
          rows: chart.categories.map((category, index) => [
            category,
            ...(chart.ohlc[index] ?? []),
          ]),
        },
        height: 320,
      };
    }
    case "pie": {
      const data = chart.series[0]?.data ?? [];
      option.tooltip = {
        ...(option.tooltip as Option),
        trigger: "item",
      };
      option.series = [
        {
          name: chart.series[0]?.name ?? spec.title ?? "占比",
          type: "pie",
          radius: chart.donut ? ["42%", "68%"] : "62%",
          roseType: chart.rose ? "radius" : undefined,
          center: ["50%", "55%"],
          avoidLabelOverlap: true,
          itemStyle: {
            borderColor: theme.surface,
            borderWidth: 2,
            borderRadius: 4,
          },
          label: { color: theme.muted, fontSize: 11, lineHeight: 14 },
          labelLine: { lineStyle: { color: theme.border } },
          emphasis: { scale: true, scaleSize: 4 },
          data,
        },
      ];
      return {
        option,
        table: {
          header: ["名称", "数值"],
          rows: data.map((item) => [item.name, item.value]),
        },
        height: 320,
      };
    }
    case "funnel": {
      const data = chart.series[0]?.data ?? [];
      option.tooltip = {
        ...(option.tooltip as Option),
        trigger: "item",
      };
      option.series = [
        {
          name: chart.series[0]?.name ?? spec.title ?? "漏斗",
          type: "funnel",
          left: "10%",
          right: "10%",
          top: 12,
          bottom: 12,
          sort: "descending",
          gap: 2,
          label: { position: "inside", color: theme.surface, fontSize: 11 },
          itemStyle: { borderWidth: 0 },
          data,
        },
      ];
      return {
        option,
        table: {
          header: ["名称", "数值"],
          rows: data.map((item) => [item.name, item.value]),
        },
        height: 340,
      };
    }
    case "radar": {
      option.tooltip = { ...(option.tooltip as Option), trigger: "item" };
      option.radar = {
        center: ["50%", "55%"],
        radius: "64%",
        indicator: chart.indicators.map((item) => ({
          name: item.name,
          max: item.max,
        })),
        axisName: { color: theme.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: theme.border } },
        axisLine: { lineStyle: { color: theme.border } },
        splitArea: { show: false },
      };
      option.series = [
        {
          type: "radar",
          symbolSize: 5,
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.15 },
          data: chart.series.map((item, index) => ({
            name: item.name ?? `系列${index + 1}`,
            value: item.values,
          })),
        },
      ];
      return {
        option,
        table: {
          header: ["系列", ...chart.indicators.map((item) => item.name)],
          rows: chart.series.map((item, index) => [
            item.name ?? `系列${index + 1}`,
            ...chart.indicators.map((_, column) => item.values[column] ?? null),
          ]),
        },
        height: 340,
      };
    }
    case "scatter": {
      option.grid = grid();
      option.xAxis = { ...valueAxis(theme, chart.xTitle), scale: true };
      option.yAxis = { ...valueAxis(theme, chart.yTitle), scale: true };
      option.tooltip = {
        ...(option.tooltip as Option),
        trigger: "item",
        axisPointer: axisPointer(theme, "cross"),
      };
      option.series = chart.series.map((item, index) => ({
        name: item.name ?? `系列${index + 1}`,
        type: "scatter",
        symbolSize: 9,
        itemStyle: { opacity: 0.8 },
        emphasis: { focus: "series" },
        data: item.points,
      }));
      return {
        option,
        table: {
          header: ["X", "Y"],
          rows: chart.series.flatMap((item) =>
            item.points.map(([x, y]) => [x, y]),
          ),
        },
        height: 320,
      };
    }
    case "heatmap": {
      // Leave room under the grid for the horizontal value ramp.
      option.grid = grid({ bottom: 56 });
      option.xAxis = {
        ...categoryAxis(theme, chart.xCategories),
        splitArea: { show: true },
      };
      option.yAxis = {
        ...categoryAxis(theme, chart.yCategories),
        splitArea: { show: true },
      };
      option.tooltip = { ...(option.tooltip as Option), trigger: "item" };
      option.visualMap = {
        min: Math.min(...chart.data.map((item) => item[2])),
        max: Math.max(...chart.data.map((item) => item[2])),
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 4,
        itemWidth: 10,
        itemHeight: 90,
        textStyle: { color: theme.faint, fontSize: 10 },
        handleStyle: { color: theme.surface, borderColor: theme.border },
        inRange: {
          color: [...theme.heat],
        },
      };
      option.series = [
        {
          type: "heatmap",
          data: chart.data,
          label: {
            show: chart.data.length <= 120,
            fontSize: 10,
            color: theme.ink,
          },
          itemStyle: { borderColor: theme.surface, borderWidth: 1 },
          emphasis: { itemStyle: { shadowBlur: 6, shadowColor: theme.ink } },
        },
      ];
      return {
        option,
        table: {
          header: ["X", "Y", "数值"],
          rows: chart.data.map(([x, y, value]) => [
            chart.xCategories[x] ?? x,
            chart.yCategories[y] ?? y,
            value,
          ]),
        },
        height: 360,
      };
    }
    case "gauge": {
      option.series = [
        {
          type: "gauge",
          startAngle: 210,
          endAngle: -30,
          min: chart.min ?? 0,
          max: chart.max ?? 100,
          progress: {
            show: true,
            width: 14,
            itemStyle: { color: theme.accent },
          },
          axisLine: { lineStyle: { width: 14, color: [[1, theme.border]] } },
          axisTick: { show: false },
          splitLine: { length: 8, lineStyle: { color: theme.faint, width: 1 } },
          axisLabel: { color: theme.faint, fontSize: 10, distance: 14 },
          pointer: { width: 4, itemStyle: { color: theme.accent } },
          anchor: { show: true, size: 10, itemStyle: { color: theme.accent } },
          title: { offsetCenter: [0, "72%"], color: theme.muted, fontSize: 12 },
          detail: {
            offsetCenter: [0, "42%"],
            fontSize: 26,
            fontWeight: 600,
            color: theme.ink,
            formatter: chart.unit ? `{value} ${chart.unit}` : "{value}",
          },
          data: [{ value: chart.value, name: chart.name ?? "" }],
        },
      ];
      return {
        option,
        table: {
          header: ["指标", "数值"],
          rows: [[chart.name ?? spec.title ?? "值", chart.value]],
        },
        height: 300,
      };
    }
    case "table": {
      // Rendered as a real HTML table by ChartCard; no ECharts option needed.
      return {
        option: {},
        table: { header: chart.columns, rows: chart.rows },
        height: Math.min(560, 64 + chart.rows.length * 30),
      };
    }
  }
}
