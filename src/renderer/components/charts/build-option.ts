import type { ChartSpec } from "@forge/core/shared/chart-spec";
import type { ChartTheme } from "./theme";

/**
 * Pure friendly-grammar → ECharts option compiler. Kept free of ECharts
 * imports so it is unit-testable without loading the chart library.
 */

type Option = Record<string, unknown>;

// ECharts 6 deprecated `containLabel` (it now needs the opt-in
// LegacyGridContainLabel module and logs a warning otherwise). outerBounds
// 'same' + 'axisLabel' is the documented equivalent: shrink the grid so axis
// labels stay inside.
const GRID = {
  left: 48,
  right: 20,
  top: 44,
  bottom: 32,
  outerBoundsMode: "same",
  outerBoundsContain: "axisLabel",
};

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

function withTitle(option: Option, theme: ChartTheme, spec: ChartSpec): Option {
  if (spec.title)
    option["title"] = {
      text: spec.title,
      left: 0,
      top: 0,
      textStyle: { color: theme.ink, fontSize: 14, fontWeight: 600 },
    };
  return option;
}

const axisLabel = (theme: ChartTheme): Option => ({
  color: theme.muted,
  fontSize: 11,
});
const axisLine = (theme: ChartTheme): Option => ({
  lineStyle: { color: theme.border },
});
const splitLine = (theme: ChartTheme): Option => ({
  lineStyle: { color: theme.border, opacity: 0.55 },
});

function categoryAxis(theme: ChartTheme, categories: readonly string[], horizontal = false): Option {
  return {
    type: "category",
    data: categories,
    boundaryGap: true,
    axisLabel: axisLabel(theme),
    axisLine: axisLine(theme),
    axisTick: { show: false },
    inverse: horizontal || undefined,
  };
}

function valueAxis(theme: ChartTheme, title?: string): Option {
  return {
    type: "value",
    name: title,
    nameTextStyle: { color: theme.faint, fontSize: 11 },
    axisLabel: axisLabel(theme),
    axisLine: { show: false },
    splitLine: splitLine(theme),
  };
}

// The legend sits under the title when one exists.
const LEGEND_TOP_WITH_TITLE = 26;
const LEGEND_TOP_PLAIN = 6;

export interface BuiltChart {
  readonly option: Option;
  /** Rows for the accessible data-table fallback: header + body rows. */
  readonly table: { header: readonly string[]; rows: readonly (readonly (string | number | null)[])[] };
  readonly height: number;
}

export function buildChartOption(
  spec: ChartSpec,
  theme: ChartTheme,
): BuiltChart {
  const chart = spec.chart!;
  const option = baseOption(theme);
  const legendCount =
    chart.type === "bar-line"
      ? chart.bars.length + chart.lines.length
      : "series" in chart
        ? chart.series.length
        : 0;
  const legend =
    legendCount > 1 || chart.type === "pie"
      ? {
          top: spec.title ? LEGEND_TOP_WITH_TITLE : LEGEND_TOP_PLAIN,
          left: "center",
          textStyle: { color: theme.muted, fontSize: 11 },
          icon: "roundRect",
          itemWidth: 10,
          itemHeight: 10,
        }
      : undefined;
  if (legend) option["legend"] = legend;

  switch (chart.type) {
    case "bar":
    case "line":
    case "bar-line": {
      const isLine = chart.type === "line";
      const seriesItems =
        chart.type === "bar-line"
          ? [...chart.bars.map((item) => ({ ...item, kind: "bar" as const })), ...chart.lines.map((item) => ({ ...item, kind: "line" as const }))]
          : chart.series.map((item) => ({ ...item, kind: chart.type as "bar" | "line" }));
      const stacked = "stack" in chart && chart.stack === true;
      const horizontal = chart.type === "bar" && chart.horizontal === true;
      const stackName = stacked ? "total" : undefined;
      option["grid"] = GRID;
      option["xAxis"] = horizontal
        ? categoryAxis(theme, chart.categories, true)
        : categoryAxis(theme, chart.categories);
      option["yAxis"] = valueAxis(theme, chart.title);
      option["tooltip"] = { ...(option["tooltip"] as Option), trigger: "axis", axisPointer: { type: isLine ? "line" : "shadow" } };
      option["series"] = seriesItems.map((item, index) => ({
        name: item.name ?? `系列${index + 1}`,
        type: item.kind,
        stack: item.kind === "bar" ? stackName : undefined,
        smooth: item.kind === "line" ? 0.25 : undefined,
        symbol: item.kind === "line" ? "circle" : undefined,
        symbolSize: item.kind === "line" ? 6 : undefined,
        lineStyle: item.kind === "line" ? { width: 2 } : undefined,
        areaStyle: isLine && "area" in chart && chart.area ? { opacity: 0.18 } : undefined,
        barMaxWidth: 28,
        itemStyle:
          item.kind === "bar"
            ? { borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] }
            : undefined,
        emphasis: { focus: "series" },
        data: item.values,
      }));
      return {
        option: withTitle(option, theme, spec),
        table: {
          header: ["类别", ...seriesItems.map((item, index) => item.name ?? `系列${index + 1}`)],
          rows: chart.categories.map((category, column) => [
            category,
            ...seriesItems.map((item) => item.values[column] ?? null),
          ]),
        },
        height: 300,
      };
    }
    case "candlestick": {
      option["grid"] = GRID;
      option["xAxis"] = categoryAxis(theme, chart.categories);
      option["yAxis"] = valueAxis(theme, chart.title);
      option["tooltip"] = { ...(option["tooltip"] as Option), trigger: "axis", axisPointer: { type: "cross" } };
      option["series"] = [
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
        option: withTitle(option, theme, spec),
        table: {
          header: ["日期", "开", "收", "低", "高"],
          rows: chart.categories.map((category, index) => [category, ...(chart.ohlc[index] ?? [])]),
        },
        height: 320,
      };
    }
    case "pie": {
      const data = chart.series[0]?.data ?? [];
      option["tooltip"] = {
        ...(option["tooltip"] as Option),
        trigger: "item",
      };
      option["series"] = [
        {
          name: chart.series[0]?.name ?? spec.title ?? "占比",
          type: "pie",
          radius: chart.donut ? ["42%", "68%"] : "62%",
          roseType: chart.rose ? "radius" : undefined,
          center: ["50%", "56%"],
          itemStyle: { borderColor: theme.surface, borderWidth: 2, borderRadius: 4 },
          label: { color: theme.muted, fontSize: 11 },
          labelLine: { lineStyle: { color: theme.border } },
          emphasis: { scale: true, scaleSize: 4 },
          data,
        },
      ];
      return {
        option: withTitle(option, theme, spec),
        table: {
          header: ["名称", "数值"],
          rows: data.map((item) => [item.name, item.value]),
        },
        height: 320,
      };
    }
    case "funnel": {
      const data = chart.series[0]?.data ?? [];
      option["tooltip"] = {
        ...(option["tooltip"] as Option),
        trigger: "item",
      };
      option["series"] = [
        {
          name: chart.series[0]?.name ?? spec.title ?? "漏斗",
          type: "funnel",
          left: "12%",
          right: "12%",
          top: spec.title ? 40 : 16,
          bottom: 12,
          sort: "descending",
          gap: 2,
          label: { position: "inside", color: theme.surface, fontSize: 11 },
          itemStyle: { borderWidth: 0 },
          data,
        },
      ];
      return {
        option: withTitle(option, theme, spec),
        table: {
          header: ["名称", "数值"],
          rows: data.map((item) => [item.name, item.value]),
        },
        height: 340,
      };
    }
    case "radar": {
      option["tooltip"] = { ...(option["tooltip"] as Option), trigger: "item" };
      option["radar"] = {
        indicator: chart.indicators.map((item) => ({
          name: item.name,
          max: item.max,
        })),
        axisName: { color: theme.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: theme.border } },
        axisLine: { lineStyle: { color: theme.border } },
        splitArea: { show: false },
      };
      option["series"] = [
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
        option: withTitle(option, theme, spec),
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
      option["grid"] = GRID;
      option["xAxis"] = { ...valueAxis(theme, chart.xTitle), type: "value", scale: true };
      option["yAxis"] = { ...valueAxis(theme, chart.yTitle), type: "value", scale: true };
      option["tooltip"] = { ...(option["tooltip"] as Option), trigger: "item" };
      option["series"] = chart.series.map((item, index) => ({
        name: item.name ?? `系列${index + 1}`,
        type: "scatter",
        symbolSize: 9,
        itemStyle: { opacity: 0.8 },
        emphasis: { focus: "series" },
        data: item.points,
      }));
      return {
        option: withTitle(option, theme, spec),
        table: {
          header: ["X", "Y"],
          rows: chart.series.flatMap((item) => item.points.map(([x, y]) => [x, y])),
        },
        height: 320,
      };
    }
    case "heatmap": {
      option["grid"] = { ...GRID, top: spec.title ? 52 : 28 };
      option["xAxis"] = { type: "category", data: chart.xCategories, axisLabel: axisLabel(theme), axisLine: axisLine(theme), splitArea: { show: true } };
      option["yAxis"] = { type: "category", data: chart.yCategories, axisLabel: axisLabel(theme), axisLine: axisLine(theme), splitArea: { show: true } };
      option["tooltip"] = { ...(option["tooltip"] as Option), trigger: "item" };
      option["visualMap"] = {
        min: Math.min(...chart.data.map((item) => item[2])),
        max: Math.max(...chart.data.map((item) => item[2])),
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        itemHeight: 80,
        textStyle: { color: theme.faint, fontSize: 10 },
        inRange: {
          color: [...theme.heat],
        },
      };
      option["series"] = [
        {
          type: "heatmap",
          data: chart.data,
          label: { show: chart.data.length <= 120, fontSize: 10, color: theme.ink },
          itemStyle: { borderColor: theme.surface, borderWidth: 1 },
          emphasis: { itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.3)" } },
        },
      ];
      return {
        option: withTitle(option, theme, spec),
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
      option["series"] = [
        {
          type: "gauge",
          startAngle: 210,
          endAngle: -30,
          min: chart.min ?? 0,
          max: chart.max ?? 100,
          progress: { show: true, width: 14, itemStyle: { color: theme.accent } },
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
        option: withTitle(option, theme, spec),
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
