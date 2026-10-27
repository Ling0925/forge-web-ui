import {
  ArrowClockwise,
  ChartBar,
  Check,
  Copy,
  Database,
  Image as ImageIcon,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChartSpec } from "@forge/core/shared/chart-spec";
import { Button } from "../primitives/Button";
import { buildChartOption } from "./build-option";
import { loadEcharts, type EchartsModule } from "./load-echarts";
import { sanitizeRawOption } from "./sanitize";
import { useChartTheme } from "./theme";
import "./chart-card.css";

type EChartsInstance = ReturnType<EchartsModule["init"]>;
type RenderState = { status: "loading" | "ready" | "error"; message?: string };

interface ChartCardProps {
  readonly spec: ChartSpec;
  /** Original fence JSON, offered through the copy button. */
  readonly source: string;
}

const CHART_LABELS = {
  bar: "柱状图",
  line: "折线图",
  "bar-line": "组合图",
  candlestick: "K 线图",
  pie: "饼图",
  funnel: "漏斗图",
  radar: "雷达图",
  scatter: "散点图",
  heatmap: "热力图",
  gauge: "仪表盘",
  table: "数据表",
} as const;

function DataTable({
  table,
}: {
  readonly table: {
    header: readonly string[];
    rows: readonly (readonly (string | number | null)[])[];
  };
}) {
  return (
    <section
      className="chart-card-table markdown-table-scroll"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: The scrollable data region must support keyboard scrolling.
      tabIndex={0}
      aria-label="图表数据"
    >
      <table>
        <thead>
          <tr>
            {table.header.map((cell, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Plain cells have no state and column names may repeat.
              <th key={index} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Snapshot rows are stateless and may have identical contents.
            <tr key={index}>
              {row.map((cell, column) => (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: Cells have no identity apart from their column.
                  key={column}
                  className={
                    typeof cell === "number" ? "chart-card-number" : undefined
                  }
                >
                  {cell ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function ChartCard({ spec, source }: ChartCardProps) {
  const theme = useChartTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<EChartsInstance | undefined>(undefined);
  const [renderState, setRenderState] = useState<RenderState>({
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);
  const [showTable, setShowTable] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const isTable = !spec.raw && spec.chart?.type === "table";
  const built = useMemo(
    () => (spec.chart ? buildChartOption(spec, theme) : undefined),
    [spec, theme],
  );
  const rawResult = useMemo(
    () => (spec.raw ? sanitizeRawOption(spec.raw) : undefined),
    [spec],
  );
  const invalidRaw = rawResult !== undefined && !rawResult.ok;
  const option = useMemo(
    () =>
      spec.raw
        ? rawResult?.ok
          ? {
              color: theme.palette,
              backgroundColor: "transparent",
              textStyle: { color: theme.ink, fontFamily: theme.fontFamily },
              ...rawResult.option,
            }
          : undefined
        : built?.option,
    [spec.raw, rawResult, built, theme],
  );
  const table = spec.raw ? undefined : built?.table;
  const height = built?.height ?? 320;
  const tableVisible = Boolean(table && (isTable || showTable));
  const failureMessage = invalidRaw
    ? (rawResult?.error ?? "raw 选项未通过安全检查。")
    : renderState.status === "error"
      ? renderState.message
      : undefined;

  // One lifecycle owns async loading, layout, painting and disposal. Restored
  // sessions can mount in a hidden pane: never initialize a zero-size chart.
  // Keep the container mounted on failure so retry/data/theme changes can recover.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly requests a fresh chart instance.
  useEffect(() => {
    if (tableVisible || invalidRaw || !option || !containerRef.current) return;
    const container = containerRef.current;
    let alive = true;
    let stopped = false;
    let frame = 0;
    let module: EchartsModule | undefined;
    let instance: EChartsInstance | undefined;
    let needsPaint = true;
    setRenderState({ status: "loading" });

    const dispose = () => {
      if (instanceRef.current === instance) instanceRef.current = undefined;
      instance?.dispose();
      instance = undefined;
    };
    const fail = (message: string) => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      dispose();
      if (alive) setRenderState({ status: "error", message });
    };
    const draw = () => {
      frame = 0;
      if (!alive || stopped || !module) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) {
        needsPaint = true;
        return;
      }
      try {
        if (!instance) {
          instance = module.init(container, undefined, {
            renderer: "canvas",
            width,
            height,
          });
          instanceRef.current = instance;
          needsPaint = true;
        } else if (
          instance.getWidth() !== width ||
          instance.getHeight() !== height
        ) {
          instance.resize({ width, height, animation: { duration: 0 } });
        }
        if (needsPaint) {
          instance.setOption(structuredClone(option), {
            notMerge: true,
            lazyUpdate: false,
          });
          needsPaint = false;
        }
        setRenderState((state) =>
          state.status === "ready" ? state : { status: "ready" },
        );
      } catch {
        fail("图表配置无法绘制。可重试，或查看数据、复制 JSON 检查配置。");
      }
    };
    const schedule = () => {
      if (alive && !stopped && !frame) frame = requestAnimationFrame(draw);
    };
    const restore = () => {
      if (document.visibilityState === "hidden") return;
      // A browser/page restore may discard the bitmap without changing size;
      // resize alone is not a substitute for reapplying the saved option.
      needsPaint = true;
      schedule();
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    window.addEventListener("pageshow", restore);
    document.addEventListener("visibilitychange", restore);
    loadEcharts().then(
      (loaded) => {
        if (!alive) return;
        module = loaded;
        schedule();
      },
      () => {
        if (alive) fail("图表库加载失败。请重试；若页面刚更新，请刷新页面。");
      },
    );
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pageshow", restore);
      document.removeEventListener("visibilitychange", restore);
      dispose();
    };
  }, [option, tableVisible, invalidRaw, attempt]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable outside secure contexts.
    }
  }, [source]);

  const exportPng = useCallback(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    const url = instance.getDataURL({
      type: "png",
      pixelRatio: 2,
      backgroundColor: theme.surface,
    });
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(spec.title ?? "chart").replace(/[\\/:*?"<>|\s]+/g, "-")}.png`;
    link.click();
  }, [spec.title, theme.surface]);

  const label = spec.chart ? CHART_LABELS[spec.chart.type] : "自定义图表";
  const title = spec.title ?? label;
  return (
    <section
      className={`chart-card${failureMessage ? " chart-card-error" : ""}`}
      aria-label={title}
      data-show-table={tableVisible ? "true" : undefined}
    >
      <header className="chart-card-header">
        <div className="chart-card-heading">
          <span className="chart-card-title" title={title}>
            {spec.title ?? ""}
          </span>
        </div>
        <div className="chart-card-actions">
          {table && !isTable && (
            <Button
              variant="ghost"
              size="sm"
              className="chart-card-toggle"
              icon={showTable ? <ChartBar size={14} /> : <Database size={14} />}
              aria-pressed={showTable}
              onClick={() => setShowTable((value) => !value)}
              title="在数据表和图形之间切换"
            >
              {showTable ? "图形" : "数据"}
            </Button>
          )}
          {!isTable && !invalidRaw && !tableVisible && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="chart-card-icon-button"
                icon={<ArrowClockwise size={14} />}
                onClick={() => setAttempt((value) => value + 1)}
                aria-label="重新绘制图表"
                title="重新绘制图表"
              />
              <Button
                variant="ghost"
                size="sm"
                className="chart-card-icon-button"
                icon={<ImageIcon size={14} />}
                onClick={exportPng}
                disabled={renderState.status !== "ready"}
                aria-label="导出 PNG"
                title="导出 PNG"
              />
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="chart-card-icon-button"
            icon={copied ? <Check size={14} /> : <Copy size={14} />}
            onClick={() => void copy()}
            aria-label={copied ? "已复制 JSON" : "复制图表 JSON"}
            title={copied ? "已复制 JSON" : "复制图表 JSON"}
          />
        </div>
      </header>
      {tableVisible && table ? (
        <DataTable table={table} />
      ) : (
        <div
          className="chart-card-plot"
          aria-busy={!failureMessage && renderState.status === "loading"}
        >
          {!invalidRaw && (
            <div
              ref={containerRef}
              className="chart-card-canvas"
              style={{ height }}
              role="img"
              aria-label={title}
              aria-hidden={Boolean(failureMessage) || undefined}
            />
          )}
          {failureMessage ? (
            <output className="chart-card-status chart-card-failure">
              <WarningCircle size={24} aria-hidden="true" />
              <strong>暂时无法显示图表</strong>
              <span>{failureMessage}</span>
            </output>
          ) : (
            renderState.status === "loading" && (
              <output className="chart-card-status">
                <ChartBar size={24} aria-hidden="true" />
                <span>正在绘制图表…</span>
              </output>
            )
          )}
        </div>
      )}
      {spec.note && <p className="chart-card-note">{spec.note}</p>}
    </section>
  );
}
