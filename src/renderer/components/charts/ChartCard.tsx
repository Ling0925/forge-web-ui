import {
  ChartBar,
  Check,
  Copy,
  Database,
  Image as ImageIcon,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ChartSpec } from "@forge/core/shared/chart-spec";
import { Button } from "../primitives/Button";
import { buildChartOption } from "./build-option";
import { loadEcharts, type EchartsModule } from "./load-echarts";
import { sanitizeRawOption } from "./sanitize";
import { useChartTheme } from "./theme";
import "./chart-card.css";

type EChartsInstance = ReturnType<EchartsModule["init"]>;

interface ChartCardProps {
  readonly spec: ChartSpec;
  /** Original fence JSON, offered through the copy button. */
  readonly source: string;
}

function DataTable({
  table,
}: {
  readonly table: {
    header: readonly string[];
    rows: readonly (readonly (string | number | null)[])[];
  };
}) {
  return (
    <div className="chart-card-table markdown-table-scroll">
      <table>
        <thead>
          <tr>
            {table.header.map((cell) => (
              <th key={cell}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, column) => (
                <td key={column}>{cell ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartCard({ spec, source }: ChartCardProps) {
  const theme = useChartTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<EChartsInstance | undefined>(undefined);
  const echartsRef = useRef<EchartsModule | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [copied, setCopied] = useState(false);

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
  const failed = invalidRaw || loadFailed;
  const failureMessage =
    rawResult && !rawResult.ok
      ? rawResult.error ?? "raw 选项未通过安全检查。"
      : loadFailed
        ? "图表库加载失败，请检查网络后刷新。"
        : undefined;

  const option: Record<string, unknown> | undefined = spec.raw
    ? rawResult?.ok
      ? rawResult.option
      : undefined
    : built?.option;
  const table = isTable
    ? built?.table
    : spec.raw
      ? undefined
      : built?.table;
  const height = built?.height ?? 320;

  // Lazy-load ECharts once per card that actually needs a canvas.
  useEffect(() => {
    if (isTable || failed) return;
    let alive = true;
    loadEcharts().then(
      (module) => {
        if (!alive) return;
        echartsRef.current = module;
        setReady(true);
      },
      () => {
        if (alive) setLoadFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [isTable, failed]);

  // Create/destroy the instance with the container and library availability.
  useEffect(() => {
    if (!ready || isTable || failed || !containerRef.current || !echartsRef.current)
      return;
    const instance = echartsRef.current.init(containerRef.current, undefined, {
      renderer: "canvas",
    });
    instanceRef.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      instanceRef.current = undefined;
    };
  }, [ready, isTable, failed]);

  // Re-apply the option whenever data or theme changes (theme → full redraw).
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !option || Object.keys(option).length === 0) return;
    instance.setOption(structuredClone(option), { notMerge: true });
  }, [option, theme]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  const actions = (
    <div className="chart-card-actions">
      {table && (
        <Button
          variant="ghost"
          size="sm"
          icon={<Database size={14} />}
          aria-pressed={showTable}
          onClick={() => setShowTable((value) => !value)}
          title="在数据表和图形之间切换"
        >
          {showTable ? "图形" : "数据"}
        </Button>
      )}
      {ready && !isTable && !failed && (
        <Button variant="ghost" size="sm" icon={<ImageIcon size={14} />} onClick={exportPng} title="导出 PNG">
          PNG
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        icon={copied ? <Check size={14} /> : <Copy size={14} />}
        onClick={() => void copy()}
        title="复制图表 JSON"
      >
        {copied ? "已复制" : "JSON"}
      </Button>
    </div>
  );

  if (failed)
    return (
      <section className="chart-card chart-card-error" aria-label="图表错误">
        <header className="chart-card-header">
          <span className="chart-card-title">
            <WarningCircle size={15} /> 图表无法渲染
          </span>
          {actions}
        </header>
        <p className="chart-card-note">{failureMessage}</p>
      </section>
    );

  let body: ReactNode;
  if (isTable && table) body = <DataTable table={table} />;
  else if (showTable && table) body = <DataTable table={table} />;
  else
    body = (
      <div
        ref={containerRef}
        className="chart-card-canvas"
        style={{ height }}
        role="img"
        aria-label={spec.title ?? "数据图表"}
      />
    );

  return (
    <section className="chart-card" aria-label={spec.title ?? "图表"}>
      <header className="chart-card-header">
        <span className="chart-card-title">
          <ChartBar size={15} />
          {spec.title ?? "图表"}
        </span>
        {actions}
      </header>
      {body}
      {spec.note && <p className="chart-card-note">{spec.note}</p>}
    </section>
  );
}
