// Pure topology model for the usage energy network (providers → models → Forge).
import type {
  PublicSettings,
  SessionId,
  SessionStatus,
  SessionSummary,
  UsageStatsDto,
} from "../../shared-types";
import { configuredModelIds } from "../../state/composer-model";
import type { ActiveRunState } from "../../state/workbench-reducer";

export interface ProviderNode3D {
  readonly id: string;
  readonly label: string;
  readonly modelIds: readonly string[];
  readonly totalTokens: number;
  readonly activeSessionCount: number;
  readonly pos: readonly [number, number, number];
}

export interface ModelNode3D {
  readonly id: string;
  readonly modelId: string;
  readonly label: string;
  readonly providerId: string;
  readonly providerLabel: string;
  readonly totalTokens: number;
  readonly runCount: number;
  readonly activeSessionCount: number;
  readonly pos: readonly [number, number, number];
}

export interface SessionEnergyConduit {
  readonly id: string;
  readonly sessionId: SessionId;
  readonly title: string;
  readonly isSubagent: boolean;
  readonly parentSessionId?: SessionId | undefined;
  readonly status: SessionStatus;
  readonly isLiveRunning: boolean;
  readonly providerId: string;
  readonly providerLabel: string;
  readonly modelNodeId: string;
  readonly modelLabel: string;
  readonly totalTokens: number;
  readonly siblingIndex: number;
  readonly siblingCount: number;
  readonly phaseOffset: number;
}

export interface EnergyNetworkTopology {
  readonly providers: readonly ProviderNode3D[];
  readonly models: readonly ModelNode3D[];
  readonly activeConduits: readonly SessionEnergyConduit[];
  readonly mainSessionCount: number;
  readonly subagentSessionCount: number;
  readonly liveRunningCount: number;
}

const shortModelLabel = (model: string): string => {
  if (!model) return "未知模型";
  const withoutSource = model.includes(":")
    ? model.split(":").slice(1).join(":")
    : model;
  return withoutSource.split("/").pop() || withoutSource;
};

const stripSourcePrefix = (model: string, sourceId: string): string => {
  if (!model) return "";
  const prefix = `${sourceId}:`;
  return model.startsWith(prefix) ? model.slice(prefix.length) : model;
};

export function buildEnergyNetworkTopology(
  data: UsageStatsDto,
  settings: PublicSettings | null,
  sessions: readonly SessionSummary[],
  activeRuns: Readonly<Record<string, ActiveRunState>>,
  workspaceFilter?: string,
): EnergyNetworkTopology {
  const configuredSources = settings?.providerSources ?? [];
  const sourceById = new Map<
    string,
    {
      id: string;
      label: string;
      models: Set<string>;
      totalTokens: number;
    }
  >();

  // 1. Register configured provider sources and their configured models
  for (const src of configuredSources) {
    const models = new Set<string>();
    for (const m of configuredModelIds(src)) {
      const normalized = stripSourcePrefix(m, src.id);
      if (normalized) models.add(normalized);
    }
    sourceById.set(src.id, {
      id: src.id,
      label: src.label || src.id,
      models,
      totalTokens: 0,
    });
  }

  // Helper to resolve which provider a (sourceId?, model) pair belongs to
  const resolveProviderAndModel = (
    rawModel: string,
    explicitSourceId?: string,
  ): { providerId: string; providerLabel: string; modelKey: string } => {
    const cleanRaw =
      rawModel.trim() || settings?.model?.trim() || "default-model";

    if (explicitSourceId?.trim()) {
      const sid = explicitSourceId.trim();
      const existing = sourceById.get(sid);
      const modelKey = stripSourcePrefix(cleanRaw, sid) || cleanRaw;
      if (existing) {
        existing.models.add(modelKey);
        return {
          providerId: existing.id,
          providerLabel: existing.label,
          modelKey,
        };
      }
      const created = {
        id: sid,
        label: sid,
        models: new Set<string>([modelKey]),
        totalTokens: 0,
      };
      sourceById.set(sid, created);
      return { providerId: sid, providerLabel: sid, modelKey };
    }

    // Check if rawModel has "sourceId:modelName" prefix
    if (cleanRaw.includes(":")) {
      const parts = cleanRaw.split(":");
      const prefix = parts[0] ?? "";
      const rest = parts.slice(1).join(":") || cleanRaw;
      const matchedSource = sourceById.get(prefix);
      if (matchedSource) {
        matchedSource.models.add(rest);
        return {
          providerId: matchedSource.id,
          providerLabel: matchedSource.label,
          modelKey: rest,
        };
      }
      // Check if any configured source has the full string or rest string
      for (const src of sourceById.values()) {
        if (src.models.has(cleanRaw) || src.models.has(rest)) {
          const key = src.models.has(cleanRaw) ? cleanRaw : rest;
          src.models.add(key);
          return {
            providerId: src.id,
            providerLabel: src.label,
            modelKey: key,
          };
        }
      }
      const vendorId = prefix.split("/")[0] || prefix || "default";
      const entry = sourceById.get(vendorId) ?? {
        id: vendorId,
        label: vendorId,
        models: new Set<string>(),
        totalTokens: 0,
      };
      entry.models.add(rest);
      sourceById.set(vendorId, entry);
      return {
        providerId: entry.id,
        providerLabel: entry.label,
        modelKey: rest,
      };
    }

    // Check if any configured source already claims this model
    for (const src of sourceById.values()) {
      if (src.models.has(cleanRaw)) {
        return {
          providerId: src.id,
          providerLabel: src.label,
          modelKey: cleanRaw,
        };
      }
    }

    // If activeSourceId is configured in settings, use it for plain models
    if (settings?.activeSourceId && sourceById.has(settings.activeSourceId)) {
      const activeSrc = sourceById.get(settings.activeSourceId);
      if (activeSrc) {
        activeSrc.models.add(cleanRaw);
        return {
          providerId: activeSrc.id,
          providerLabel: activeSrc.label,
          modelKey: cleanRaw,
        };
      }
    }

    // If model has vendor/model format (e.g. "openai/gpt-5")
    if (cleanRaw.includes("/")) {
      const vendor = cleanRaw.split("/")[0] || "default";
      // If there is exactly 1 configured source and vendor is generic, check if we should attach or create vendor
      const entry = sourceById.get(vendor) ?? {
        id: vendor,
        label: vendor.toUpperCase(),
        models: new Set<string>(),
        totalTokens: 0,
      };
      entry.models.add(cleanRaw);
      sourceById.set(vendor, entry);
      return {
        providerId: entry.id,
        providerLabel: entry.label,
        modelKey: cleanRaw,
      };
    }

    // Fallback to first configured source or default provider
    const firstSource = configuredSources[0];
    if (firstSource) {
      const entry = sourceById.get(firstSource.id);
      if (entry) {
        entry.models.add(cleanRaw);
        return {
          providerId: entry.id,
          providerLabel: entry.label,
          modelKey: cleanRaw,
        };
      }
    }

    const defaultEntry = sourceById.get("default") ?? {
      id: "default",
      label: "默认供应商",
      models: new Set<string>(),
      totalTokens: 0,
    };
    defaultEntry.models.add(cleanRaw);
    sourceById.set("default", defaultEntry);
    return {
      providerId: defaultEntry.id,
      providerLabel: defaultEntry.label,
      modelKey: cleanRaw,
    };
  };

  // Track model token/run stats
  const modelStatsMap = new Map<
    string,
    { totalTokens: number; runCount: number }
  >();

  // 2. Incorporate route stats (which carry explicit sourceId + model)
  const rawModelToSource = new Map<string, string>();
  for (const route of data.routes ?? []) {
    rawModelToSource.set(route.model, route.sourceId);
    const resolved = resolveProviderAndModel(route.model, route.sourceId);
    const canonicalId = `${resolved.providerId}::${resolved.modelKey}`;
    const prev = modelStatsMap.get(canonicalId) ?? {
      totalTokens: 0,
      runCount: 0,
    };
    prev.totalTokens = Math.max(prev.totalTokens, route.totalTokens);
    prev.runCount = Math.max(prev.runCount, route.attempts);
    modelStatsMap.set(canonicalId, prev);
  }

  for (const req of data.requests ?? []) {
    if (req.sourceId && req.model) {
      rawModelToSource.set(req.model, req.sourceId);
    }
  }

  // 3. Incorporate model usage stats from data.models
  for (const mStat of data.models) {
    const explicitSource = rawModelToSource.get(mStat.model);
    const resolved = resolveProviderAndModel(mStat.model, explicitSource);
    const canonicalId = `${resolved.providerId}::${resolved.modelKey}`;
    const prev = modelStatsMap.get(canonicalId) ?? {
      totalTokens: 0,
      runCount: 0,
    };
    prev.totalTokens = Math.max(prev.totalTokens, mStat.totalTokens);
    prev.runCount = Math.max(prev.runCount, mStat.runCount);
    modelStatsMap.set(canonicalId, prev);
  }

  // 4. Collect ONLY currently active sessions (including active sub-agents)
  interface MergedSession {
    sessionId: SessionId;
    title: string;
    workspace: string;
    model: string;
    providerSourceId?: string | undefined;
    parentSessionId?: SessionId | undefined;
    isSubagent: boolean;
    status: SessionStatus;
    totalTokens: number;
  }

  const isActiveStatus = (status: SessionStatus | undefined): boolean =>
    status === "running" || status === "awaiting_approval";

  const sessionsById = new Map<string, SessionSummary>();
  for (const s of sessions) {
    if (!s || typeof s.id !== "string" || !s.id || s.archived) continue;
    if (workspaceFilter && s.workspace !== workspaceFilter) continue;
    sessionsById.set(s.id, s);
  }

  const getEffectiveStatus = (
    sid: string,
    fallback?: SessionStatus,
  ): SessionStatus => {
    const activeRun = activeRuns[sid];
    if (activeRun?.pendingApproval) return "awaiting_approval";
    if (activeRun?.status) return activeRun.status;
    return fallback ?? sessionsById.get(sid)?.status ?? "idle";
  };

  // Pre-collect token totals and model/source hints from topSessions & requests
  const sessionTokenTotals = new Map<string, number>();
  const sessionModelHints = new Map<string, string>();
  const sessionSourceHints = new Map<string, string>();

  for (const ts of data.topSessions) {
    if (workspaceFilter && ts.workspace !== workspaceFilter) continue;
    sessionTokenTotals.set(
      ts.sessionId,
      Math.max(sessionTokenTotals.get(ts.sessionId) ?? 0, ts.totalTokens),
    );
    if (ts.model) sessionModelHints.set(ts.sessionId, ts.model);
  }

  const requestTokensBySession = new Map<string, number>();
  for (const req of data.requests ?? []) {
    if (workspaceFilter && req.workspace !== workspaceFilter) continue;
    if (req.sourceId && !sessionSourceHints.has(req.sessionId)) {
      sessionSourceHints.set(req.sessionId, req.sourceId);
    }
    if (req.model && !sessionModelHints.has(req.sessionId)) {
      sessionModelHints.set(req.sessionId, req.model);
    }
    if (req.usage?.totalTokens) {
      requestTokensBySession.set(
        req.sessionId,
        (requestTokensBySession.get(req.sessionId) ?? 0) +
          req.usage.totalTokens,
      );
    }
  }

  const sessionMap = new Map<string, MergedSession>();

  // From state.sessions (includes both primary sessions and sub-agents with parentSessionId)
  for (const s of sessionsById.values()) {
    const effectiveStatus = getEffectiveStatus(s.id, s.status);
    if (!isActiveStatus(effectiveStatus)) continue;

    // If this is a sub-agent whose parent session is known and already finished,
    // ignore stale status unless the sub-agent itself has a live activeRun entry.
    if (s.parentSessionId && sessionsById.has(s.parentSessionId)) {
      const parentStatus = getEffectiveStatus(s.parentSessionId);
      const hasDirectActiveRun =
        Boolean(activeRuns[s.id]?.pendingApproval) ||
        isActiveStatus(activeRuns[s.id]?.status);
      if (!isActiveStatus(parentStatus) && !hasDirectActiveRun) {
        continue;
      }
    }

    const totalTokens = Math.max(
      sessionTokenTotals.get(s.id) ?? 0,
      requestTokensBySession.get(s.id) ?? 0,
    );

    sessionMap.set(s.id, {
      sessionId: s.id,
      title: s.title || (s.parentSessionId ? "子代理任务" : "未命名会话"),
      workspace: s.workspace || "",
      model:
        s.model ||
        sessionModelHints.get(s.id) ||
        settings?.model ||
        "default-model",
      providerSourceId: s.providerSourceId ?? sessionSourceHints.get(s.id),
      parentSessionId: s.parentSessionId,
      isSubagent: Boolean(s.parentSessionId),
      status: effectiveStatus,
      totalTokens,
    });
  }

  // Also include any live activeRuns not yet present in state.sessions
  for (const [sid, run] of Object.entries(activeRuns)) {
    if (sessionMap.has(sid)) continue;
    const effectiveStatus: SessionStatus = run.pendingApproval
      ? "awaiting_approval"
      : run.status;
    if (!isActiveStatus(effectiveStatus)) continue;
    const knownSession = sessionsById.get(sid);
    sessionMap.set(sid, {
      sessionId: run.sessionId,
      title: knownSession?.title || "实时运行会话",
      workspace: knownSession?.workspace ?? workspaceFilter ?? "",
      model:
        knownSession?.model ||
        sessionModelHints.get(sid) ||
        settings?.model ||
        "default-model",
      providerSourceId:
        knownSession?.providerSourceId ??
        sessionSourceHints.get(sid) ??
        settings?.activeSourceId,
      parentSessionId: knownSession?.parentSessionId,
      isSubagent: Boolean(knownSession?.parentSessionId),
      status: effectiveStatus,
      totalTokens: Math.max(
        sessionTokenTotals.get(sid) ?? 0,
        requestTokensBySession.get(sid) ?? 0,
      ),
    });
  }

  // Fallback for in-flight requests (strictly outcome === "started") when state.sessions does not list the session
  for (const req of data.requests ?? []) {
    if (workspaceFilter && req.workspace !== workspaceFilter) continue;
    if (req.outcome !== "started") continue;
    if (sessionMap.has(req.sessionId) || sessionsById.has(req.sessionId)) {
      continue;
    }
    sessionMap.set(req.sessionId, {
      sessionId: req.sessionId,
      title: req.sessionTitle || "会话",
      workspace: req.workspace,
      model: req.model || settings?.model || "default-model",
      providerSourceId: req.sourceId,
      isSubagent: false,
      status: "running",
      totalTokens: Math.max(
        sessionTokenTotals.get(req.sessionId) ?? 0,
        requestTokensBySession.get(req.sessionId) ?? 0,
      ),
    });
  }

  // No configured source and no recorded usage: leave the periphery empty so the
  // view shows an honest empty state instead of a fabricated provider/model node.

  // Build session conduits and count active sessions per provider/model
  const modelSessionCounter = new Map<string, number>();
  const providerSessionCounter = new Map<string, number>();

  interface RawConduit {
    session: MergedSession;
    providerId: string;
    providerLabel: string;
    modelNodeId: string;
    modelLabel: string;
    isLiveRunning: boolean;
  }

  const rawConduits: RawConduit[] = [];
  for (const s of sessionMap.values()) {
    const explicitSource = s.providerSourceId ?? rawModelToSource.get(s.model);
    const resolved = resolveProviderAndModel(s.model, explicitSource);
    const modelNodeId = `${resolved.providerId}::${resolved.modelKey}`;

    modelSessionCounter.set(
      modelNodeId,
      (modelSessionCounter.get(modelNodeId) ?? 0) + 1,
    );
    providerSessionCounter.set(
      resolved.providerId,
      (providerSessionCounter.get(resolved.providerId) ?? 0) + 1,
    );

    rawConduits.push({
      session: s,
      providerId: resolved.providerId,
      providerLabel: resolved.providerLabel,
      modelNodeId,
      modelLabel: shortModelLabel(resolved.modelKey),
      isLiveRunning: true,
    });
  }

  // Ensure every provider has at least one model node so the 3D periphery is complete
  for (const src of sourceById.values()) {
    if (src.models.size === 0) {
      src.models.add(settings?.model?.trim() || "未配置模型");
    }
  }

  // 5. Compute 3D positions:
  // Outermost orbital ring (r = 258): Model Providers (供应商)
  // Middle orbital ring (r = 136): Model IDs (模型 ID — active models, or 1 primary model per idle provider)
  // Center (0, 0, 0): Forge Core
  // This strict outside-in radial hierarchy (Provider -> Model ID -> Forge) keeps every energy line smooth and uncrossed.
  const providerList = Array.from(sourceById.values());
  const providerCount = providerList.length;
  const providerRadius = providerCount === 1 ? 250 : 268;
  const modelRadius = 150;

  // Determine which Model IDs to place on the middle 3D ring per provider:
  // - If the provider has active sessions, show ONLY its active Model IDs.
  // - If the provider has 0 active sessions, show its 1 primary Model ID so the middle ring stays aligned and minimal.
  const visibleModelsByProvider = new Map<string, string[]>();
  for (const prov of providerList) {
    const allKeys = Array.from(prov.models);
    const activeKeys = allKeys.filter(
      (mKey) => (modelSessionCounter.get(`${prov.id}::${mKey}`) ?? 0) > 0,
    );
    if (activeKeys.length > 0) {
      visibleModelsByProvider.set(prov.id, activeKeys);
    } else {
      const topKey = [...allKeys].sort((a, b) => {
        const ta = modelStatsMap.get(`${prov.id}::${a}`)?.totalTokens ?? 0;
        const tb = modelStatsMap.get(`${prov.id}::${b}`)?.totalTokens ?? 0;
        return tb - ta;
      })[0];
      visibleModelsByProvider.set(prov.id, topKey ? [topKey] : []);
    }
  }

  const providerWeights = providerList.map((p) => {
    const visibleCount = visibleModelsByProvider.get(p.id)?.length ?? 1;
    return 1 + Math.max(0, visibleCount - 1) * 0.75;
  });
  const totalWeight =
    providerWeights.reduce((acc, w) => acc + w, 0) ||
    Math.max(providerCount, 1);

  const providers3D: ProviderNode3D[] = [];
  const models3D: ModelNode3D[] = [];

  let cumulativeAngle = -Math.PI / 4;
  providerList.forEach((prov, pIdx) => {
    const weight = providerWeights[pIdx] ?? 1;
    const allocatedSpan = (weight / totalWeight) * Math.PI * 2;
    const baseAngle = cumulativeAngle + allocatedSpan * 0.5;
    cumulativeAngle += allocatedSpan;

    const provX = Math.cos(baseAngle) * providerRadius;
    const provZ = Math.sin(baseAngle) * providerRadius;
    const provY = 0;

    let providerTokens = 0;
    for (const mKey of prov.models) {
      providerTokens +=
        modelStatsMap.get(`${prov.id}::${mKey}`)?.totalTokens ?? 0;
    }

    const visibleKeys = visibleModelsByProvider.get(prov.id) ?? [];
    const childModelNodeIds: string[] = [];

    visibleKeys.forEach((mKey, mIdx) => {
      const canonicalId = `${prov.id}::${mKey}`;
      childModelNodeIds.push(canonicalId);
      const mStat = modelStatsMap.get(canonicalId);
      const tokens = mStat?.totalTokens ?? 0;
      const runs = mStat?.runCount ?? 0;

      // Spread multiple active models of the same provider cleanly across its angular sector
      const stepAngle =
        visibleKeys.length <= 1
          ? 0
          : Math.min(
              0.56,
              (allocatedSpan * 0.68) / Math.max(1, visibleKeys.length - 1),
            );
      const centeredIdx = mIdx - (visibleKeys.length - 1) * 0.5;
      const mAngle = baseAngle + centeredIdx * stepAngle;

      const mx = Math.cos(mAngle) * modelRadius;
      const mz = Math.sin(mAngle) * modelRadius;
      const my = 0;

      models3D.push({
        id: canonicalId,
        modelId: mKey,
        label: shortModelLabel(mKey),
        providerId: prov.id,
        providerLabel: prov.label,
        totalTokens: tokens,
        runCount: runs,
        activeSessionCount: modelSessionCounter.get(canonicalId) ?? 0,
        pos: [mx, my, mz],
      });
    });

    providers3D.push({
      id: prov.id,
      label: prov.label,
      modelIds: childModelNodeIds,
      totalTokens: providerTokens,
      activeSessionCount: providerSessionCounter.get(prov.id) ?? 0,
      pos: [provX, provY, provZ],
    });
  });

  // Group conduits by modelNodeId so multiple active sessions on the same model fan out cleanly in 3D
  const byModel = new Map<string, RawConduit[]>();
  for (const rc of rawConduits) {
    const group = byModel.get(rc.modelNodeId) ?? [];
    group.push(rc);
    byModel.set(rc.modelNodeId, group);
  }

  const activeConduits: SessionEnergyConduit[] = [];
  let conduitIdx = 0;
  for (const group of byModel.values()) {
    group.forEach((rc, siblingIndex) => {
      activeConduits.push({
        id: `conduit-${rc.session.sessionId}`,
        sessionId: rc.session.sessionId,
        title: rc.session.title,
        isSubagent: rc.session.isSubagent,
        parentSessionId: rc.session.parentSessionId,
        status: rc.session.status,
        isLiveRunning: rc.isLiveRunning,
        providerId: rc.providerId,
        providerLabel: rc.providerLabel,
        modelNodeId: rc.modelNodeId,
        modelLabel: rc.modelLabel,
        totalTokens: rc.session.totalTokens,
        siblingIndex,
        siblingCount: group.length,
        phaseOffset: (conduitIdx * 0.23) % 1,
      });
      conduitIdx += 1;
    });
  }

  const subagentSessionCount = activeConduits.filter(
    (c) => c.isSubagent,
  ).length;
  const mainSessionCount = activeConduits.length - subagentSessionCount;

  return {
    providers: providers3D,
    models: models3D,
    activeConduits,
    mainSessionCount,
    subagentSessionCount,
    liveRunningCount: activeConduits.length,
  };
}

/**
 * Computes the energy transmission speed multiplier from the number of connected sessions.
 * More sessions (including sub-agents) -> more energy lines -> faster energy transfer.
 */
export function computeEnergyTransferSpeed(
  conduitCount: number,
  liveRunningCount: number,
): number {
  if (conduitCount <= 0) return 0;
  const sessionFactor = 1 + (conduitCount - 1) * 0.38;
  const liveBoost = liveRunningCount * 0.24;
  return Number((sessionFactor + liveBoost).toFixed(2));
}
