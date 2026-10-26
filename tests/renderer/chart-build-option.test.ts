import { describe, expect, it } from "vitest";
import { buildChartOption } from "../../src/renderer/components/charts/build-option";
import type { ChartTheme } from "../../src/renderer/components/charts/theme";
import type { ChartSpec } from "@forge/core/shared/chart-spec";

const theme: ChartTheme = {
  ink: "#292824",
  muted: "#68665f",
  faint: "#716e66",
  surface: "#ffffff",
  border: "#e5e3dc",
  accent: "#a54f35",
  success: "#226d40",
  warning: "#975a06",
  error: "#b82420",
  palette: ["#a54f35", "#55684d"],
  positive: "#b82420",
  negative: "#226d40",
  heat: ["#f6f3ee", "#dc9477", "#7a3520"],
  fontFamily: "system-ui",
  dark: false,
};

const build = (chart: NonNullable<ChartSpec["chart"]>) =>
  buildChartOption({ title: "T", chart }, theme);

describe("buildChartOption", () => {
  it("builds grouped bars with a legend and a data table", () => {
    const built = build({
      type: "bar",
      categories: ["一月", "二月"],
      series: [
        { name: "收入", values: [10, 20] },
        { name: "支出", values: [5, 7] },
      ],
    });
    const series = built.option.series as Record<string, unknown>[];
    expect(series).toHaveLength(2);
    expect(series[0]?.type).toBe("bar");
    expect(built.option.legend).toBeTruthy();
    expect(built.table.header).toEqual(["类别", "收入", "支出"]);
    expect(built.table.rows[1]).toEqual(["二月", 20, 7]);
  });

  it("maps horizontal bars to an inverted category axis", () => {
    const built = build({
      type: "bar",
      categories: ["a"],
      series: [{ values: [1] }],
      horizontal: true,
    });
    expect(built.option.xAxis).toMatchObject({ type: "value" });
    expect(built.option.yAxis).toMatchObject({
      type: "category",
      inverse: true,
      data: ["a"],
    });
    expect(built.table.rows).toEqual([["a", 1]]);
  });

  it("stacks bars when stack is set", () => {
    const built = build({
      type: "bar",
      categories: ["a", "b"],
      series: [
        { name: "x", values: [1, 2] },
        { name: "y", values: [3, 4] },
      ],
      stack: true,
    });
    const series = built.option.series as Record<string, unknown>[];
    expect(series[0]?.stack).toBe("total");
  });

  it("renders area fill for line charts", () => {
    const built = build({
      type: "line",
      categories: ["a"],
      series: [{ values: [1] }],
      area: true,
    });
    const series = built.option.series as Record<string, unknown>[];
    expect(series[0]?.areaStyle).toBeTruthy();
  });

  it("stacks every line in an area chart without changing the source values", () => {
    const chart = {
      type: "line" as const,
      categories: ["A", "B"],
      area: true,
      stack: true,
      series: [
        { name: "X", values: [1, 2] },
        { name: "Y", values: [3, 4] },
      ],
    };
    const built = build(chart);
    const series = built.option.series as Record<string, unknown>[];
    expect(series.map((item) => item.stack)).toEqual(["total", "total"]);
    expect(series.every((item) => item.areaStyle !== undefined)).toBe(true);
    expect(built.table.rows).toEqual([
      ["A", 1, 3],
      ["B", 2, 4],
    ]);
    const unstacked = build({ ...chart, stack: false });
    expect(
      (unstacked.option.series as Record<string, unknown>[]).every(
        (item) => item.stack === undefined,
      ),
    ).toBe(true);
  });

  it("leaves the title to the card while retaining explicit value-axis names", () => {
    for (const horizontal of [false, true]) {
      const built = build({
        type: "bar",
        title: "万元",
        horizontal,
        categories: ["A"],
        series: [{ values: [12] }],
      });
      expect(built.option.title).toBeUndefined();
      expect(built.option[horizontal ? "xAxis" : "yAxis"]).toMatchObject({
        type: "value",
        name: "万元",
      });
    }
  });

  it("reserves one scrollable legend row and bounds long horizontal labels", () => {
    const built = build({
      type: "bar",
      horizontal: true,
      categories: ["非常长的类别名称".repeat(6)],
      series: Array.from({ length: 8 }, (_, index) => ({
        name: `很长的系列名称 ${index}`,
        values: [index + 1],
      })),
    });
    expect(built.option.legend).toMatchObject({
      type: "scroll",
      pageIconColor: theme.accent,
    });
    expect(built.option.yAxis).toMatchObject({
      axisLabel: { hideOverlap: true, width: 96, overflow: "truncate" },
    });
    expect(built.option.grid).toMatchObject({
      outerBoundsMode: "same",
      outerBoundsContain: "all",
      top: 34,
    });
    expect(built.table.header).toHaveLength(9);
  });

  it("combines bars and lines in bar-line", () => {
    const built = build({
      type: "bar-line",
      categories: ["a", "b"],
      bars: [{ name: "量", values: [1, 2] }],
      lines: [{ name: "价", values: [3, 4] }],
    });
    const series = built.option.series as Record<string, unknown>[];
    expect(series.map((item) => item.type)).toEqual(["bar", "line"]);
  });

  it("uses the up/down colors for candlestick", () => {
    const built = build({
      type: "candlestick",
      categories: ["d1"],
      ohlc: [[1, 2, 0.5, 3]],
    });
    const series = built.option.series as Record<string, unknown>[];
    const itemStyle = series[0]?.itemStyle as Record<string, unknown>;
    expect(itemStyle.color).toBe(theme.positive);
    expect(itemStyle.colorDown).toBe(theme.negative);
    expect(built.table.rows[0]).toEqual(["d1", 1, 2, 0.5, 3]);
  });

  it("turns donut and rose flags into pie radii", () => {
    const donut = build({
      type: "pie",
      series: [{ data: [{ name: "x", value: 1 }] }],
      donut: true,
    });
    const pie = (donut.option.series as Record<string, unknown>[])[0];
    expect(pie?.radius).toEqual(["42%", "68%"]);
    const rose = build({
      type: "pie",
      series: [{ data: [{ name: "x", value: 1 }] }],
      rose: true,
    });
    const roseSeries = (rose.option.series as Record<string, unknown>[])[0];
    expect(roseSeries?.roseType).toBe("radius");
  });

  it("builds funnel, radar, scatter, heatmap, gauge and table", () => {
    const funnel = build({
      type: "funnel",
      series: [{ data: [{ name: "a", value: 2 }] }],
    });
    expect((funnel.option.series as Record<string, unknown>[])[0]?.type).toBe(
      "funnel",
    );

    const radar = build({
      type: "radar",
      indicators: [{ name: "A" }, { name: "B" }, { name: "C" }],
      series: [{ name: "S", values: [1, 2, 3] }],
    });
    expect(radar.option.radar).toBeTruthy();
    expect(radar.table.rows[0]).toEqual(["S", 1, 2, 3]);

    const scatter = build({
      type: "scatter",
      series: [
        {
          points: [
            [1, 2],
            [3, 4],
          ],
        },
      ],
    });
    expect((scatter.option.series as Record<string, unknown>[])[0]?.type).toBe(
      "scatter",
    );

    const heatmap = build({
      type: "heatmap",
      xCategories: ["x1", "x2"],
      yCategories: ["y1"],
      data: [
        [0, 0, 5],
        [1, 0, 9],
      ],
    });
    const visualMap = heatmap.option.visualMap as Record<string, unknown>;
    expect(visualMap.min).toBe(5);
    expect(visualMap.max).toBe(9);
    expect(heatmap.table.rows[1]).toEqual(["x2", "y1", 9]);

    const gauge = build({ type: "gauge", value: 66, unit: "分", name: "评分" });
    const gaugeSeries = (gauge.option.series as Record<string, unknown>[])[0];
    expect(gaugeSeries?.type).toBe("gauge");
    expect(gaugeSeries?.detail).toBeTruthy();

    const table = build({
      type: "table",
      columns: ["名称", "数量"],
      rows: [
        ["苹果", 3],
        [null, null],
      ],
    });
    expect(table.option).toEqual({});
    expect(table.table.header).toEqual(["名称", "数量"]);
  });

  it("omits the legend for a single unnamed series", () => {
    const built = build({
      type: "bar",
      categories: ["a"],
      series: [{ values: [1] }],
    });
    expect(built.option.legend).toBeUndefined();
  });
});
