import { useEffect, useMemo, useRef, useState } from "react";
import { contextDisplayLabel } from "@forge/core/shared/context-display";
import {
  budgetUsage,
  resolveContextBudget,
  resolveContextWindow,
} from "@forge/core/shared/context-usage";
import type { ModelCatalogEntry } from "@forge/core/shared/model-catalog";
import type { AgentEvent, SessionSnapshot } from "../../shared-types";
import { composerModelMetadata } from "../../state/composer-model";
import { persistentUsageCache } from "../../state/persistent-usage-cache";
import { compactTokens, sessionUsage } from "../../state/session-usage";
import {
  collectSessionModels,
  computeSessionCostMetrics,
  computeSessionSpeedMetrics,
  formatCostUsd,
  formatModelRatesSummary,
  formatTps,
  useUsagePricing,
} from "../../state/usage-pricing";
import { useWorkbench } from "../../state/workbench-context";
import type { ActiveRunState } from "../../state/workbench-reducer";
import "./usage-popover.css";

const percent = (value: number | undefined) =>
  value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;

const formatDuration = (ms: number | undefined) => {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return undefined;
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
};

const shortModelLabel = (model: string | undefined) => {
  if (!model) return undefined;
  const trimmed = model.trim();
  if (!trimmed) return undefined;
  const withoutSource = trimmed.includes(":")
    ? trimmed.split(":").slice(1).join(":")
    : trimmed;
  return withoutSource.split("/").pop() || withoutSource;
};

const categories = [
  ["instructions", "指令"],
  ["memory", "记忆"],
  ["conversation", "对话"],
  ["tools", "工具"],
] as const;

export function UsagePopover({
  events,
  snapshot,
  selection,
  run,
  closing = false,
}: {
  readonly events: readonly AgentEvent[];
  readonly snapshot?: SessionSnapshot | undefined;
  readonly selection?: {
    readonly model: string;
    readonly sourceId?: string | undefined;
    readonly metadata?: ModelCatalogEntry | undefined;
  };
  readonly run?: ActiveRunState | null | undefined;
  readonly closing?: boolean | undefined;
}) {
  const { state } = useWorkbench();
  const settings = state?.settings;
  const activeRun =
    run !== undefined
      ? (run ?? undefined)
      : snapshot?.id
        ? state?.activeRuns?.[snapshot.id]
        : undefined;
  const isRunActive = Boolean(
    activeRun &&
      (activeRun.status === "running" ||
        activeRun.status === "awaiting_approval" ||
        closing),
  );
  const isCancelling = Boolean(isRunActive && activeRun?.isCancelling);
  const isAwaiting = Boolean(
    isRunActive && !isCancelling && activeRun?.status === "awaiting_approval",
  );
  const retryCount = activeRun?.providerRetry;
  const isRetrying = Boolean(
    isRunActive && !isCancelling && !isAwaiting && retryCount,
  );
  const isExecuting = Boolean(
    isRunActive && !isCancelling && !isAwaiting && activeRun?.status === "running",
  );
  const runStatusLabel = !isRunActive
    ? undefined
    : isCancelling
      ? "正在停止"
      : isAwaiting
        ? "等待审批"
        : isRetrying
          ? `重试 ${retryCount}/5`
          : "正在执行";
  const usage = useMemo(
    () =>
      snapshot &&
      ["completed", "failed", "cancelled", "interrupted"].includes(
        snapshot.status,
      )
        ? persistentUsageCache.snapshot(snapshot).usage
        : sessionUsage(events),
    [events, snapshot],
  );
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  // Historical events/cache contain the window at request time. Apply current
  // settings to an idle view only; an active run still uses its captured budget.
  // Never rewrite persisted usage or billing totals.
  const active =
    snapshot?.status === "running" || snapshot?.status === "awaiting_approval";
  const model = selection ? selection.model : snapshot?.model;
  const sourceId = selection ? selection.sourceId : snapshot?.providerSourceId;
  const source = settings?.providerSources?.find(
    (item) => item.id === sourceId,
  );
  const metadata = model
    ? composerModelMetadata(
        model,
        source,
        selection?.metadata ? [selection.metadata] : [],
      )
    : undefined;
  // A previous model/source's reported window is not a fallback for a new pick.
  const sameSelection =
    !selection ||
    (model === snapshot?.model && sourceId === snapshot?.providerSourceId);
  // Explicit picker metadata (including an unknown window) describes the next
  // request. Do not revive a cleared override from a historical usage event.
  const reportedWindow =
    metadata?.contextWindowTokens ??
    (sameSelection && !selection?.metadata
      ? usage.context?.windowTokens
      : undefined);
  const resolvedWindow =
    !active && settings && model
      ? resolveContextWindow(model, settings, reportedWindow)
      : undefined;
  const previewBudget =
    resolvedWindow !== undefined && settings
      ? budgetUsage(resolveContextBudget(resolvedWindow, settings))
      : undefined;
  const context =
    resolvedWindow !== undefined && usage.context
      ? { ...usage.context, windowTokens: resolvedWindow, ...previewBudget }
      : usage.context;
  // New conversations can show the model window without fabricating usage data.
  const windowTokens = resolvedWindow ?? context?.windowTokens ?? undefined;
  const ratio =
    windowTokens && context ? context.usedTokens / windowTokens : undefined;
  const partsTotal = context
    ? categories.reduce((sum, [key]) => sum + context.parts[key], 0)
    : 0;
  const budgetLimit = windowTokens
    ? (previewBudget?.budgetTokens ??
      context?.budgetTokens ??
      Math.floor(windowTokens * 0.8))
    : undefined;
  const reserveTokens =
    windowTokens && budgetLimit !== undefined && budgetLimit < windowTokens
      ? windowTokens - budgetLimit
      : undefined;
  const reserveRatio =
    windowTokens && reserveTokens !== undefined
      ? reserveTokens / windowTokens
      : undefined;
  const remainingToCompact =
    budgetLimit !== undefined && context?.usedTokens !== undefined
      ? budgetLimit - context.usedTokens
      : undefined;

  const sessionModels = useMemo(
    () => collectSessionModels(events, model, snapshot?.model),
    [events, model, snapshot?.model],
  );
  const pricingStore = useUsagePricing(sessionModels, open);

  const liveSpeed =
    activeRun?.status === "running" &&
    usage.speed.requestStartedAt !== undefined;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!liveSpeed) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [liveSpeed, activeRun?.sessionId, usage.speed.requestStartedAt]);

  const speedMetrics = useMemo(
    () => computeSessionSpeedMetrics(events, usage, activeRun, now),
    [events, usage, activeRun, now],
  );

  const costMetrics = useMemo(
    () =>
      computeSessionCostMetrics({
        events,
        usage,
        sessionId: snapshot?.id,
        model,
        snapshotModel: snapshot?.model,
        contextUsedTokens: context?.usedTokens,
        metadata,
        source,
        prices: pricingStore.prices,
        sessionCosts: pricingStore.sessionCosts,
      }),
    [
      events,
      usage,
      snapshot?.id,
      model,
      snapshot?.model,
      context?.usedTokens,
      metadata,
      source,
      pricingStore.prices,
      pricingStore.sessionCosts,
      pricingStore.version,
    ],
  );

  const rateSummary = formatModelRatesSummary(costMetrics.activeRates);
  const displayModel = shortModelLabel(
    model ?? snapshot?.model ?? costMetrics.modelsUsed.at(-1),
  );
  const uncachedInputTokens =
    usage.total && usage.cacheRead !== undefined
      ? Math.max(0, usage.total.promptTokens - usage.cacheRead)
      : undefined;

  const costDetailSub = useMemo(() => {
    if (
      costMetrics.inputCostUsd === undefined ||
      costMetrics.outputCostUsd === undefined ||
      (costMetrics.inputCostUsd === 0 && costMetrics.outputCostUsd === 0)
    ) {
      return undefined;
    }
    const parts = [
      `入 ${formatCostUsd(costMetrics.inputCostUsd)}`,
      `出 ${formatCostUsd(costMetrics.outputCostUsd)}`,
      costMetrics.cacheSavedUsd && costMetrics.cacheSavedUsd >= 0.0001
        ? `省 ${formatCostUsd(costMetrics.cacheSavedUsd)}`
        : undefined,
    ].filter(Boolean);
    return parts.join(" · ");
  }, [
    costMetrics.inputCostUsd,
    costMetrics.outputCostUsd,
    costMetrics.cacheSavedUsd,
  ]);

  const speedDetailSub = useMemo(() => {
    const parts: string[] = [];
    if (
      speedMetrics.requestCount > 1 &&
      speedMetrics.peakTps !== undefined
    ) {
      parts.push(`峰值 ${speedMetrics.peakTps.toFixed(1)}`);
    }
    const dur = formatDuration(speedMetrics.durationMs);
    if (dur) parts.push(`耗时 ${dur}`);
    return parts.length > 0 ? parts.join(" · ") : undefined;
  }, [
    speedMetrics.requestCount,
    speedMetrics.peakTps,
    speedMetrics.durationMs,
  ]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        ref.current &&
        !ref.current.contains(event.target)
      )
        ref.current.open = false;
    };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [open]);

  return (
    <details
      ref={ref}
      className="composer-usage"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && ref.current)
          ref.current.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && ref.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          ref.current.open = false;
          ref.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        className="usage-trigger"
        aria-label="上下文与用量"
        title={`${runStatusLabel ? `${runStatusLabel} · ` : ""}${contextDisplayLabel(context, usage.compacted)}；点击查看本地预估和累计用量`}
      >
        <span
          className={`usage-track${isRunActive ? " is-active" : ""}${
            isExecuting ? " is-executing" : ""
          }${isAwaiting ? " is-awaiting" : ""}${
            isCancelling ? " is-cancelling" : ""
          }${isRetrying ? " is-retrying" : ""}${closing ? " is-leaving" : ""}`}
          data-run-status={runStatusLabel}
          aria-hidden="true"
        >
          {context &&
            ratio !== undefined &&
            categories.map(([key, label]) => (
              <span
                key={key}
                className={`usage-segment usage-${key}`}
                title={`${label}：≈${compactTokens(context.parts[key])} tokens`}
                style={{
                  width: `${partsTotal ? (context.parts[key] / partsTotal) * Math.min(1, ratio) * 100 : 0}%`,
                }}
              />
            ))}
          <span
            className="usage-track-empty"
            style={
              reserveRatio !== undefined && reserveTokens !== undefined
                ? { marginRight: `${reserveRatio * 100}%` }
                : undefined
            }
          >
            <span className="usage-track-wave" />
          </span>
          {reserveRatio !== undefined && reserveTokens !== undefined && (
            <span
              className="usage-reserve"
              title={`压缩预留区：${compactTokens(reserveTokens)} tokens (${percent(reserveRatio)})；${
                remainingToCompact === undefined
                  ? ""
                  : remainingToCompact > 0
                    ? `距自动压缩还剩约 ${compactTokens(remainingToCompact)} tokens`
                    : `已达阈值，下一次请求前自动压缩（超出约 ${compactTokens(-remainingToCompact)} tokens）`
              }`}
              style={{ width: `${reserveRatio * 100}%` }}
            />
          )}
        </span>
        <span className="usage-footer-stats">
          {speedMetrics.avgTps !== undefined && (
            <span className="usage-speed-chip" title="会话平均输出速度 (TPS)">
              {formatTps(speedMetrics.avgTps, speedMetrics.estimated)}
            </span>
          )}
          <span className="usage-cache-chip" title="最近请求缓存命中率">
            CH {percent(usage.latestCache)}
          </span>
          <span className="usage-footer-total">
            {windowTokens
              ? compactTokens(windowTokens)
              : context
                ? `${compactTokens(context.usedTokens)} tokens`
                : "—"}
          </span>
        </span>
      </summary>
      {open && (
        <section className="usage-panel" aria-label="用量详情" tabIndex={-1}>
          <div className="usage-panel-header">
            <strong>用量</strong>
            {displayModel && (
              <span
                className="usage-model-badge"
                title={model ?? snapshot?.model}
              >
                {displayModel}
              </span>
            )}
          </div>
          <dl className="usage-context-dl">
            <dt>{contextDisplayLabel(context, usage.compacted)}</dt>
            <dd className="usage-primary-value">
              {context
                ? ratio === undefined
                  ? `${compactTokens(context.usedTokens)} tokens 已用`
                  : `${percent(ratio)} / ${compactTokens(context.usedTokens)}`
                : "尚无数据"}
            </dd>
            {usage.projected && context?.basis === "request" && (
              <>
                <dt>本地上下文预估</dt>
                <dd>≈{compactTokens(usage.projected.usedTokens)} tokens</dd>
              </>
            )}
          </dl>
          {usage.compacted && (
            <p className="usage-caption">
              上下文已压缩；当前是压缩后预估，等待下次请求实报。累计用量不清零。
            </p>
          )}
          {ratio !== undefined && (
            <div
              role="progressbar"
              aria-label="上下文占用"
              aria-valuenow={Math.round(ratio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="usage-panel-track"
            >
              {context &&
                categories.map(([key, label]) => (
                  <span
                    key={key}
                    className={`usage-panel-segment usage-${key}`}
                    title={`${label}：≈${compactTokens(context.parts[key])} tokens`}
                    style={{
                      width: `${partsTotal ? (context.parts[key] / partsTotal) * Math.min(1, ratio) * 100 : 0}%`,
                    }}
                  />
                ))}
              {reserveRatio !== undefined && reserveTokens !== undefined && (
                <span
                  className="usage-panel-reserve"
                  title={`压缩预留区：${compactTokens(reserveTokens)} tokens (${percent(reserveRatio)})；${
                    remainingToCompact === undefined
                      ? ""
                      : remainingToCompact > 0
                        ? `距自动压缩还剩约 ${compactTokens(remainingToCompact)} tokens`
                        : `已达阈值，下一次请求前自动压缩（超出约 ${compactTokens(-remainingToCompact)} tokens）`
                  }`}
                  style={{ width: `${reserveRatio * 100}%` }}
                />
              )}
            </div>
          )}
          <div className="usage-caption-row">
            <p className="usage-caption">
              {windowTokens
                ? `窗口 ${compactTokens(windowTokens)} tokens`
                : "上下文窗口未知，暂不计算百分比"}
            </p>
            {windowTokens && budgetLimit !== undefined && (
              <span className="usage-caption-meta">
                {remainingToCompact !== undefined
                  ? remainingToCompact > 0
                    ? `距压缩约 ${compactTokens(remainingToCompact)}`
                    : `超阈值 ${compactTokens(-remainingToCompact)}`
                  : `阈值 ${compactTokens(budgetLimit)}`}
              </span>
            )}
          </div>
          {context && (
            <dl className="usage-legend">
              {categories.map(([key, label]) => (
                <div key={key}>
                  <dt>
                    <span className={`usage-legend-dot usage-${key}`} />
                    {label}
                  </dt>
                  <dd>≈{compactTokens(context.parts[key])}</dd>
                </div>
              ))}
              {reserveRatio !== undefined && (
                <div>
                  <dt>
                    <span className="usage-legend-dot usage-legend-dot-reserve" />
                    压缩预留
                  </dt>
                  <dd>
                    {reserveTokens !== undefined
                      ? `${compactTokens(reserveTokens)} · ${percent(reserveRatio)}`
                      : percent(reserveRatio)}
                  </dd>
                </div>
              )}
            </dl>
          )}
          <div className="usage-section">
            <h4>会话</h4>
            <dl>
              <dt>费用估算</dt>
              <dd>
                {costMetrics.estimatedCostUsd !== undefined ? (
                  <span className="usage-dd-inline">
                    {costDetailSub && (
                      <span className="usage-dd-sub">{costDetailSub}</span>
                    )}
                    <span className="usage-primary-value">
                      {costMetrics.incomplete &&
                      costMetrics.estimatedCostUsd > 0
                        ? "≈ "
                        : ""}
                      {formatCostUsd(costMetrics.estimatedCostUsd)}
                      {costMetrics.incomplete &&
                      costMetrics.estimatedCostUsd > 0
                        ? "（部分）"
                        : ""}
                    </span>
                  </span>
                ) : (
                  "未提供价格"
                )}
              </dd>
              <dt>
                模型单价
                {costMetrics.activeTierAboveTokens !== undefined
                  ? ` (>${compactTokens(costMetrics.activeTierAboveTokens)})`
                  : ""}
              </dt>
              <dd>{rateSummary ?? "未提供价格"}</dd>
              <dt>输出速度 (TPS)</dt>
              <dd>
                <span className="usage-dd-inline">
                  {speedDetailSub && (
                    <span className="usage-dd-sub">{speedDetailSub}</span>
                  )}
                  <span
                    className={
                      speedMetrics.avgTps !== undefined
                        ? "usage-primary-value"
                        : undefined
                    }
                  >
                    {formatTps(speedMetrics.avgTps, speedMetrics.estimated)}
                  </span>
                </span>
              </dd>
              <dt>最近缓存命中（CH）</dt>
              <dd>{percent(usage.latestCache)}</dd>
              <dt>平均缓存命中{usage.cachePartial ? "（已上报）" : ""}</dt>
              <dd>{percent(usage.averageCache)}</dd>
            </dl>
          </div>
          <div className="usage-section">
            <h4>Tokens{usage.partial ? " · 部分统计" : ""}</h4>
            <dl>
              <dt>输入 / 输出</dt>
              <dd>
                {usage.total
                  ? `${compactTokens(usage.total.promptTokens)} / ${compactTokens(usage.total.completionTokens)}`
                  : "—"}
              </dd>
              <dt>缓存读取{usage.cachePartial ? "（已上报）" : ""}</dt>
              <dd>
                {usage.cacheRead === undefined ? (
                  "—"
                ) : (
                  <span className="usage-dd-inline">
                    {uncachedInputTokens !== undefined &&
                      usage.cacheRead > 0 && (
                        <span className="usage-dd-sub">
                          未缓存 {compactTokens(uncachedInputTokens)}
                        </span>
                      )}
                    <span>{compactTokens(usage.cacheRead)}</span>
                  </span>
                )}
              </dd>
              <dt>总计</dt>
              <dd className="usage-primary-value">
                {usage.total ? compactTokens(usage.total.totalTokens) : "—"}
              </dd>
            </dl>
          </div>
        </section>
      )}
    </details>
  );
}
