import type { UsagePricingStatus, UsageStatsDto } from "@forge/core/shared/ipc";
import type { ModelCatalogEntry } from "@forge/core/shared/model-catalog";
import {
  type ModelPrice,
  type TokenRates,
  estimateAggregateCostUsd,
  estimateRequestCostUsd,
  findModelPrice,
  modelCatalogPricingToPrice,
  normalizePricingModelId,
  resolveRequestRates,
} from "@forge/core/shared/model-pricing";
import type {
  AgentEvent,
  PublicProviderSource,
} from "@forge/core/shared/schemas";
import type { SessionUsage } from "@forge/core/shared/session-usage";
import { useEffect, useState } from "react";
import { composerModelMetadata } from "./composer-model";

interface PricingStoreState {
  readonly prices: ReadonlyMap<string, ModelPrice>;
  readonly sessionCosts: ReadonlyMap<
    string,
    { readonly costUsd: number; readonly incomplete: boolean }
  >;
  readonly pricingStatus?: UsagePricingStatus | undefined;
  readonly version: number;
}

const mutablePrices = new Map<string, ModelPrice>();
const mutableSessionCosts = new Map<
  string,
  { readonly costUsd: number; readonly incomplete: boolean }
>();
const requestedModels = new Set<string>();
let pricingStatus: UsagePricingStatus | undefined;
let storeVersion = 0;
let inflightFetch: Promise<void> | undefined;
const listeners = new Set<() => void>();

function notifyListeners() {
  storeVersion += 1;
  for (const listener of listeners) listener();
}

export function resetUsagePricingCacheForTest() {
  mutablePrices.clear();
  mutableSessionCosts.clear();
  requestedModels.clear();
  pricingStatus = undefined;
  inflightFetch = undefined;
  notifyListeners();
}

export function ingestUsageStatsPricing(
  stats: UsageStatsDto | null | undefined,
): void {
  if (!stats) return;
  let changed = false;

  if (stats.pricing && stats.pricing.state !== pricingStatus?.state) {
    pricingStatus = stats.pricing;
    changed = true;
  } else if (stats.pricing) {
    pricingStatus = stats.pricing;
  }

  if (stats.modelPrices) {
    for (const [key, price] of Object.entries(stats.modelPrices)) {
      const normalized = normalizePricingModelId(key);
      if (normalized && !mutablePrices.has(normalized)) changed = true;
      if (normalized) mutablePrices.set(normalized, price);
      const canonical = normalizePricingModelId(price.modelId);
      if (canonical) mutablePrices.set(canonical, price);
    }
  }

  for (const modelStat of stats.models ?? []) {
    const normalized = normalizePricingModelId(modelStat.model);
    if (!normalized) continue;
    if (
      modelStat.estimatedCostUsd === 0 &&
      modelStat.costIncomplete === false &&
      !mutablePrices.has(normalized)
    ) {
      mutablePrices.set(normalized, {
        providerId: "usage",
        modelId: modelStat.model,
        rates: { input: 0, output: 0, cacheRead: 0 },
        contextTiers: [],
      });
      changed = true;
    } else if (
      !mutablePrices.has(normalized) &&
      modelStat.estimatedCostUsd !== undefined &&
      modelStat.totalTokens > 0 &&
      modelStat.completionTokens === 0 &&
      modelStat.cachedTokens === 0
    ) {
      const inputRate =
        (modelStat.estimatedCostUsd * 1_000_000) / modelStat.promptTokens;
      if (Number.isFinite(inputRate) && inputRate >= 0) {
        mutablePrices.set(normalized, {
          providerId: "usage",
          modelId: modelStat.model,
          rates: { input: inputRate },
          contextTiers: [],
        });
        changed = true;
      }
    }
  }

  if (stats.requests?.length) {
    const bySession = new Map<
      string,
      { costUsd: number; pricedCount: number; incomplete: boolean }
    >();
    for (const req of stats.requests) {
      const entry = bySession.get(req.sessionId) ?? {
        costUsd: 0,
        pricedCount: 0,
        incomplete: false,
      };
      if (
        typeof req.estimatedCostUsd === "number" &&
        Number.isFinite(req.estimatedCostUsd)
      ) {
        entry.costUsd += req.estimatedCostUsd;
        entry.pricedCount += 1;
      } else if (req.usage && req.usage.totalTokens > 0) {
        entry.incomplete = true;
      }
      bySession.set(req.sessionId, entry);
    }
    for (const [sessionId, entry] of bySession.entries()) {
      if (entry.pricedCount > 0) {
        mutableSessionCosts.set(sessionId, {
          costUsd: entry.costUsd,
          incomplete: entry.incomplete,
        });
        changed = true;
      }
    }
  }

  if (changed) notifyListeners();
}

export async function ensureUsageModelPrices(
  models: readonly string[],
): Promise<void> {
  if (typeof window === "undefined" || !window.forge?.getUsageStats) return;
  const cleaned = [
    ...new Set(models.map((m) => m.trim()).filter((m) => m.length > 0)),
  ];
  const unrequested = cleaned.filter((m) => {
    const key = normalizePricingModelId(m);
    return (
      key.length > 0 && !requestedModels.has(key) && !mutablePrices.has(key)
    );
  });
  if (unrequested.length === 0 && pricingStatus !== undefined) return;
  if (inflightFetch) return inflightFetch;
  inflightFetch = (async () => {
    try {
      const res = await window.forge.getUsageStats?.(
        cleaned.length > 0 ? { models: cleaned } : undefined,
      );
      if (res && res.pricing?.state !== "unavailable") {
        for (const m of unrequested) {
          requestedModels.add(normalizePricingModelId(m));
        }
      }
      ingestUsageStatsPricing(res);
    } catch {
      // Ignore bridge errors in detached/test environments.
    } finally {
      inflightFetch = undefined;
    }
  })();
  return inflightFetch;
}

export function useUsagePricing(
  models: readonly string[],
  open = false,
): PricingStoreState {
  const [, setTick] = useState(storeVersion);
  const modelsKey = models
    .map((m) => m.trim())
    .filter(Boolean)
    .join("\0");

  useEffect(() => {
    const onUpdate = () => setTick(storeVersion);
    listeners.add(onUpdate);
    return () => {
      listeners.delete(onUpdate);
    };
  }, []);

  useEffect(() => {
    const list = modelsKey ? modelsKey.split("\0") : [];
    if (!open && list.length === 0) return;
    void ensureUsageModelPrices(list);
  }, [open, modelsKey]);

  return {
    prices: mutablePrices,
    sessionCosts: mutableSessionCosts,
    pricingStatus,
    version: storeVersion,
  };
}

export interface SessionCostMetrics {
  readonly estimatedCostUsd?: number | undefined;
  readonly inputCostUsd?: number | undefined;
  readonly outputCostUsd?: number | undefined;
  readonly cacheSavedUsd?: number | undefined;
  readonly incomplete: boolean;
  readonly hasPrice: boolean;
  readonly activePrice?: ModelPrice | undefined;
  readonly activeRates?: TokenRates | undefined;
  readonly activeTierAboveTokens?: number | undefined;
  readonly modelsUsed: readonly string[];
}

export interface SessionSpeedMetrics {
  readonly avgTps?: number | undefined;
  readonly latestTps?: number | undefined;
  readonly peakTps?: number | undefined;
  readonly durationMs: number;
  readonly outputTokens: number;
  readonly requestCount: number;
  readonly estimated: boolean;
  readonly live: boolean;
}

const requestBoundaryTypes = new Set([
  "run_started",
  "run_finished",
  "tool_call_started",
  "tool_call_Completed",
  "tool_call_completed",
  "approval_requested",
  "approval_resolved",
]);

export function collectSessionModels(
  events: readonly AgentEvent[],
  primaryModel?: string | undefined,
  snapshotModel?: string | undefined,
): string[] {
  const seen = new Set<string>();
  const add = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) seen.add(trimmed);
  };
  add(primaryModel);
  add(snapshotModel);
  for (const event of events) {
    if (event.type === "run_started") add(event.model);
    else if (event.type === "provider_attempt") add(event.selection.model);
  }
  return [...seen];
}

export function computeSessionSpeedMetrics(
  events: readonly AgentEvent[],
  usage: SessionUsage,
  liveRun?: {
    readonly status?: string | undefined;
    readonly unreportedOutputTokens?: number | undefined;
  },
  now = Date.now(),
): SessionSpeedMetrics {
  const { speed } = usage;
  const live =
    liveRun?.status === "running" && speed.requestStartedAt !== undefined;
  const liveTokens = live ? (liveRun?.unreportedOutputTokens ?? 0) : 0;
  const liveElapsedMs = live ? Math.max(0, now - speed.requestStartedAt!) : 0;
  const durationMs = speed.durationMs + liveElapsedMs;
  const outputTokens = speed.outputTokens + liveTokens;
  const avgTps =
    durationMs > 0 && outputTokens > 0
      ? (outputTokens * 1000) / durationMs
      : undefined;
  const estimated =
    speed.partial || (live && (liveRun?.unreportedOutputTokens ?? 0) > 0);

  let latestTps: number | undefined;
  let peakTps: number | undefined;
  let requestCount = 0;
  let activeReq: { key: string; startedAt: number } | undefined;

  for (const event of events) {
    if (requestBoundaryTypes.has(event.type)) {
      activeReq = undefined;
    }
    if (event.type !== "provider_attempt") continue;
    const sel = event.selection;
    const key = JSON.stringify([
      event.sessionId,
      event.turn,
      event.step,
      sel.attempt,
      sel.groupId,
      sel.sourceId,
      sel.credentialId,
      sel.model,
      sel.apiMode,
    ]);
    const ts = Date.parse(sel.timestamp);
    if (sel.outcome === "started") {
      activeReq = Number.isFinite(ts) ? { key, startedAt: ts } : undefined;
      continue;
    }
    const reqDuration =
      activeReq?.key === key ? ts - activeReq.startedAt : Number.NaN;
    if (activeReq?.key === key) activeReq = undefined;
    const out = sel.usage?.completionTokens;
    if (
      Number.isFinite(reqDuration) &&
      reqDuration > 0 &&
      out !== undefined &&
      Number.isFinite(out) &&
      out > 0
    ) {
      const rate = (out * 1000) / reqDuration;
      if (Number.isFinite(rate) && rate > 0) {
        requestCount += 1;
        latestTps = rate;
        peakTps = peakTps === undefined ? rate : Math.max(peakTps, rate);
      }
    }
  }

  if (live && liveElapsedMs > 0 && liveTokens > 0) {
    const liveRate = (liveTokens * 1000) / liveElapsedMs;
    if (Number.isFinite(liveRate) && liveRate > 0) {
      latestTps = liveRate;
      peakTps = peakTps === undefined ? liveRate : Math.max(peakTps, liveRate);
    }
  }

  return {
    avgTps:
      avgTps !== undefined && Number.isFinite(avgTps) ? avgTps : undefined,
    latestTps,
    peakTps,
    durationMs,
    outputTokens,
    requestCount,
    estimated,
    live,
  };
}

export function computeSessionCostMetrics(options: {
  readonly events: readonly AgentEvent[];
  readonly usage: SessionUsage;
  readonly sessionId?: string | undefined;
  readonly model?: string | undefined;
  readonly snapshotModel?: string | undefined;
  readonly contextUsedTokens?: number | undefined;
  readonly metadata?: ModelCatalogEntry | undefined;
  readonly source?: PublicProviderSource | undefined;
  readonly prices: ReadonlyMap<string, ModelPrice>;
  readonly sessionCosts?: ReadonlyMap<
    string,
    { readonly costUsd: number; readonly incomplete: boolean }
  >;
}): SessionCostMetrics {
  const {
    events,
    usage,
    sessionId,
    model,
    snapshotModel,
    contextUsedTokens,
    metadata,
    source,
    prices,
    sessionCosts,
  } = options;

  const primaryModel = model || snapshotModel;
  const resolvePrice = (
    targetModel: string | undefined,
  ): ModelPrice | undefined => {
    if (!targetModel) return undefined;
    const usagePrice = findModelPrice(prices, targetModel);
    const catalogMeta =
      targetModel === primaryModel && metadata?.pricing
        ? metadata
        : composerModelMetadata(
            targetModel,
            source,
            metadata && targetModel === primaryModel ? [metadata] : [],
          );
    return modelCatalogPricingToPrice(
      targetModel,
      catalogMeta?.pricing,
      usagePrice,
    );
  };

  const modelsUsed = collectSessionModels(events, model, snapshotModel);
  const activePrice =
    resolvePrice(primaryModel) ??
    (modelsUsed.length > 0 ? resolvePrice(modelsUsed.at(-1)) : undefined);

  let activeTierAboveTokens: number | undefined;
  if (activePrice && contextUsedTokens !== undefined) {
    for (const tier of activePrice.contextTiers) {
      if (contextUsedTokens > tier.aboveTokens) {
        activeTierAboveTokens = tier.aboveTokens;
      }
    }
  }
  const activeRates =
    resolveRequestRates(
      contextUsedTokens !== undefined
        ? { promptTokens: contextUsedTokens }
        : undefined,
      activePrice,
    ) ?? activePrice?.rates;

  let coveredPrompt = 0;
  let coveredCompletion = 0;
  let coveredCached = 0;
  let totalCostUsd: number | undefined;
  let inputCostUsd = 0;
  let outputCostUsd = 0;
  let cacheSavedUsd = 0;
  let hasPricedBreakdown = false;
  let incomplete = Boolean(usage.partial);
  let currentRunModel = snapshotModel || primaryModel;

  const accumulateBreakdown = (
    promptTokens: number,
    completionTokens: number,
    cachedPromptTokens: number,
    price: ModelPrice | undefined,
    tiered: boolean,
  ) => {
    const reqUsage = {
      promptTokens,
      completionTokens,
      cachedPromptTokens,
      totalTokens: promptTokens + completionTokens,
    };
    const cost = tiered
      ? estimateRequestCostUsd(reqUsage, price)
      : estimateAggregateCostUsd(reqUsage, price);
    if (cost === undefined || !price) {
      if (promptTokens + completionTokens > 0) incomplete = true;
      return;
    }
    totalCostUsd = (totalCostUsd ?? 0) + cost;
    const rates = tiered
      ? (resolveRequestRates(reqUsage, price) ?? price.rates)
      : price.rates;
    const cached = Math.min(promptTokens, Math.max(0, cachedPromptTokens));
    const uncached = Math.max(0, promptTokens - cached);
    const inputRate = rates.input ?? 0;
    const cacheRate = rates.cacheRead ?? inputRate;
    const outputRate = rates.output ?? 0;
    inputCostUsd += (uncached * inputRate + cached * cacheRate) / 1_000_000;
    outputCostUsd += (completionTokens * outputRate) / 1_000_000;
    if (inputRate > cacheRate && cached > 0) {
      cacheSavedUsd += (cached * (inputRate - cacheRate)) / 1_000_000;
    }
    hasPricedBreakdown = true;
  };

  for (const event of events) {
    if (event.type === "run_started") {
      currentRunModel = event.model || currentRunModel;
    } else if (
      event.type === "provider_attempt" &&
      event.selection.outcome !== "started" &&
      event.selection.usage
    ) {
      const u = event.selection.usage;
      const p = u.promptTokens ?? 0;
      const c = u.completionTokens ?? 0;
      const ch = Math.min(p, u.cachedPromptTokens ?? 0);
      coveredPrompt += p;
      coveredCompletion += c;
      coveredCached += ch;
      const reqModel = event.selection.model || currentRunModel;
      accumulateBreakdown(p, c, ch, resolvePrice(reqModel), true);
    }
  }

  if (usage.total) {
    const remPrompt = Math.max(0, usage.total.promptTokens - coveredPrompt);
    const remCompletion = Math.max(
      0,
      usage.total.completionTokens - coveredCompletion,
    );
    const remCached = Math.min(
      remPrompt,
      Math.max(0, (usage.cacheRead ?? 0) - coveredCached),
    );
    if (remPrompt > 0 || remCompletion > 0) {
      const fallbackModel = currentRunModel || primaryModel;
      accumulateBreakdown(
        remPrompt,
        remCompletion,
        remCached,
        resolvePrice(fallbackModel),
        false,
      );
    }
  }

  if (totalCostUsd === undefined && sessionId && sessionCosts?.has(sessionId)) {
    const fallback = sessionCosts.get(sessionId)!;
    totalCostUsd = fallback.costUsd;
    incomplete = incomplete || fallback.incomplete;
  }

  if (totalCostUsd === undefined && !usage.total && activePrice !== undefined) {
    totalCostUsd = 0;
  }

  return {
    estimatedCostUsd: totalCostUsd,
    inputCostUsd: hasPricedBreakdown ? inputCostUsd : undefined,
    outputCostUsd: hasPricedBreakdown ? outputCostUsd : undefined,
    cacheSavedUsd:
      hasPricedBreakdown && cacheSavedUsd > 0 ? cacheSavedUsd : undefined,
    incomplete,
    hasPrice: activePrice !== undefined || totalCostUsd !== undefined,
    activePrice,
    activeRates,
    activeTierAboveTokens,
    modelsUsed,
  };
}

export function formatCostUsd(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "$0.00";
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  if (value >= 0.0001) return `$${value.toFixed(4)}`;
  return "<$0.0001";
}

export function formatRateUsd(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  if (value === 0) return "$0";
  if (Number.isInteger(value)) return `$${value}`;
  if (value >= 0.1) return `$${Number(value.toFixed(2))}`;
  return `$${Number(value.toFixed(4))}`;
}

export function formatModelRatesSummary(
  rates: TokenRates | undefined,
): string | undefined {
  if (!rates) return undefined;
  const input = formatRateUsd(rates.input);
  const output = formatRateUsd(rates.output);
  const cache = formatRateUsd(rates.cacheRead);
  if (!input && !output) return undefined;
  if (rates.input === 0 && rates.output === 0) return "免费 ($0 /M)";
  const parts = [
    input ? `入 ${input}` : undefined,
    output ? `出 ${output}` : undefined,
    cache && rates.cacheRead !== rates.input ? `缓存 ${cache}` : undefined,
  ].filter(Boolean);
  return `${parts.join(" · ")} /M`;
}

export function formatTps(
  value: number | undefined,
  estimated = false,
): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return "—";
  const formatted = value < 10 ? value.toFixed(1) : value.toFixed(1);
  return `${estimated ? "≈ " : ""}${formatted} tok/s`;
}
