import {
  Calendar,
  ChartBar,
  Cpu,
  Database,
  Lightning,
} from "@phosphor-icons/react";
import type { UsageStatsDto } from "../../shared-types";
import { compactTokens } from "../../state/session-usage";

export function renderUsageKpiGrid({
  data,
  costSummary,
  requestAnalytics,
  requestsCount,
  aggregateCostExplanation,
  formatCostUsd,
  formatDuration,
  percent,
  shortModelName,
}: {
  readonly data: UsageStatsDto;
  readonly costSummary: {
    readonly totalCostUsd: number | undefined;
    readonly hasAggregateEstimate: boolean;
    readonly incomplete: boolean;
  };
  readonly requestAnalytics: {
    readonly pricedCount: number;
    readonly avgSpeed: number | undefined;
    readonly peakSpeed: number | undefined;
    readonly avgDurationMs: number | undefined;
  };
  readonly requestsCount: number;
  readonly aggregateCostExplanation: string;
  readonly formatCostUsd: (value: number | undefined) => string;
  readonly formatDuration: (value: number | undefined) => string;
  readonly percent: (value: number) => string;
  readonly shortModelName: (model: string) => string;
}) {
  return (
    <div className="usage-kpi-grid">
      <div className="usage-kpi-card">
        <div className="usage-kpi-label">
          <span>总消耗 Tokens</span>
          <Lightning size={14} />
        </div>
        <div className="usage-kpi-value">{compactTokens(data.totalTokens)}</div>
        <div className="usage-kpi-sub">
          <span>入 {compactTokens(data.totalPromptTokens)}</span>
          <span>·</span>
          <span>出 {compactTokens(data.totalCompletionTokens)}</span>
        </div>
      </div>

      <div className="usage-kpi-card">
        <div className="usage-kpi-label">
          <span>平均缓存命中率</span>
          <Database size={14} />
        </div>
        <div className="usage-kpi-value">{percent(data.averageCacheRate)}</div>
        <div className="usage-kpi-sub">
          <span>命中 {compactTokens(data.totalCachedTokens)} tokens</span>
        </div>
      </div>

      <div className="usage-kpi-card">
        <div className="usage-kpi-label">
          <span>预估总费用 (USD)</span>
          <ChartBar size={14} />
        </div>
        <div className="usage-kpi-value">
          {formatCostUsd(costSummary.totalCostUsd)}
        </div>
        <div
          className="usage-kpi-sub"
          title={
            costSummary.hasAggregateEstimate
              ? aggregateCostExplanation
              : undefined
          }
        >
          {costSummary.totalCostUsd !== undefined ? (
            <span>
              {costSummary.incomplete ? "部分计价" : "已计价"}
              {requestsCount > 0 &&
                ` ${requestAnalytics.pricedCount} / ${requestsCount} 次请求`}
              {costSummary.hasAggregateEstimate && " · 含历史汇总估算"}
            </span>
          ) : (
            <span>
              {data.pricing?.state === "unavailable"
                ? "价格目录加载失败，点击刷新重试"
                : "缺少价格或用量，费用未知"}
            </span>
          )}
        </div>
      </div>

      <div className="usage-kpi-card">
        <div className="usage-kpi-label">
          <span>平均输出速度</span>
          <Lightning size={14} />
        </div>
        <div className="usage-kpi-value">
          {requestAnalytics.avgSpeed !== undefined
            ? `${requestAnalytics.avgSpeed.toFixed(1)}`
            : "—"}
          {requestAnalytics.avgSpeed !== undefined && (
            <span className="usage-kpi-unit">tok/s</span>
          )}
        </div>
        <div className="usage-kpi-sub">
          <span>
            峰值{" "}
            {requestAnalytics.peakSpeed !== undefined
              ? `${requestAnalytics.peakSpeed.toFixed(1)} tok/s`
              : "—"}
          </span>
          <span>·</span>
          <span>均耗时 {formatDuration(requestAnalytics.avgDurationMs)}</span>
        </div>
      </div>

      <div className="usage-kpi-card">
        <div className="usage-kpi-label">
          <span>会话与运行总数</span>
          <Calendar size={14} />
        </div>
        <div className="usage-kpi-value">
          {data.totalSessions} <span className="usage-kpi-unit">会话</span>
        </div>
        <div className="usage-kpi-sub">
          <span>累计运行 {data.totalRuns} 次任务</span>
          {requestsCount > 0 && (
            <>
              <span>·</span>
              <span>{requestsCount} 请求</span>
            </>
          )}
        </div>
      </div>

      <div className="usage-kpi-card">
        <div className="usage-kpi-label">
          <span>主力模型</span>
          <Cpu size={14} />
        </div>
        <div
          className="usage-kpi-value usage-kpi-model-value"
          title={data.models[0]?.model || "暂无模型"}
        >
          {data.models[0]?.model ? shortModelName(data.models[0].model) : "—"}
        </div>
        <div className="usage-kpi-sub">
          <span>共 {data.models.length} 个使用中的模型</span>
        </div>
      </div>
    </div>
  );
}
