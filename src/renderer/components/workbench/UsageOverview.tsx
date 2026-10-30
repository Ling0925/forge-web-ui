import {
  ArrowsClockwise,
  GitBranch,
  GlobeHemisphereWest,
  Sparkle,
} from "@phosphor-icons/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  PublicSettings,
  SessionId,
  SessionSummary,
  UsageStatsDto,
} from "../../shared-types";
import { compactTokens } from "../../state/session-usage";
import type { ActiveRunState } from "../../state/workbench-reducer";
import { Button } from "../primitives/Button";
import { EmptyState } from "../primitives/EmptyState";
import { Tag } from "../primitives/Tag";
import {
  type Vec3,
  conduitControlPoint,
  projectPoint,
  quadraticBezier3D,
  transformPoint,
} from "./usage-3d-math";
import {
  type ModelNode3D,
  type ProviderNode3D,
  buildEnergyNetworkTopology,
  computeEnergyTransferSpeed,
} from "./usage-topology";

export function UsageOverview({
  kpiCards,
  data,
  settings,
  sessions,
  activeRuns,
  workspaceFilter,
  onSelectSession,
}: {
  readonly kpiCards: ReactNode;
  readonly data: UsageStatsDto;
  readonly settings: PublicSettings | null;
  readonly sessions: readonly SessionSummary[];
  readonly activeRuns: Readonly<Record<string, ActiveRunState>>;
  readonly workspaceFilter?: string | undefined;
  readonly onSelectSession: (sessionId: SessionId) => void;
}) {
  // Ignore high-frequency streaming text/reasoning deltas on activeRuns:
  // only recompute topology when session IDs, statuses, or pending approvals actually change.
  const activeRunsKey = Object.entries(activeRuns)
    .map(
      ([sid, run]) =>
        `${sid}:${run?.pendingApproval ? "awaiting_approval" : (run?.status ?? "")}`,
    )
    .sort()
    .join("|");

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by activeRunsKey to avoid rebuilding topology on every streaming token delta
  const stableActiveRuns = useMemo(() => activeRuns, [activeRunsKey]);

  const topology = useMemo(
    () =>
      buildEnergyNetworkTopology(
        data,
        settings,
        sessions,
        stableActiveRuns,
        workspaceFilter,
      ),
    [data, settings, sessions, stableActiveRuns, workspaceFilter],
  );

  const [selectedConduitId, setSelectedConduitId] = useState<string | null>(
    null,
  );
  const [hoveredNodeLabel, setHoveredNodeLabel] = useState<string | null>(null);

  const activeConduits = topology.activeConduits;
  const activeSubagentCount = topology.subagentSessionCount;
  const activeMainCount = topology.mainSessionCount;
  const activeLiveCount = topology.liveRunningCount;

  const transferSpeed = useMemo(
    () => computeEnergyTransferSpeed(activeConduits.length, activeLiveCount),
    [activeConduits.length, activeLiveCount],
  );

  // Speed progress percentage (capped at 100% around 8+ sessions for visual meter)
  const speedMeterPercent =
    activeConduits.length === 0
      ? 0
      : Math.min(100, Math.round((transferSpeed / 4.0) * 100));

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const cameraRef = useRef({
    yaw: 0.58,
    pitch: 0.62,
    isDragging: false,
    lastX: 0,
    lastY: 0,
    energyPhase: 0,
    corePhase: 0,
    lastFrameTime: 0,
  });

  // Lookup maps & primary label set memoized once per topology change
  const topologyLookups = useMemo(() => {
    const modelById = new Map<string, ModelNode3D>();
    for (const m of topology.models) {
      modelById.set(m.id, m);
    }
    const providerById = new Map<string, ProviderNode3D>();
    for (const p of topology.providers) {
      providerById.set(p.id, p);
    }
    const primaryModelIds = new Set<string>();
    for (const p of topology.providers) {
      const childModels = topology.models.filter((m) => m.providerId === p.id);
      const topModel = [...childModels].sort(
        (a, b) =>
          b.activeSessionCount - a.activeSessionCount ||
          b.totalTokens - a.totalTokens,
      )[0];
      if (topModel) primaryModelIds.add(topModel.id);
    }
    return { modelById, providerById, primaryModelIds };
  }, [topology]);

  // Keep latest scene inputs in a ref so the RAF loop never restarts or stacks on React re-renders
  const sceneStateRef = useRef({
    topology,
    topologyLookups,
    activeConduits,
    activeMainCount,
    activeSubagentCount,
    transferSpeed,
    selectedConduitId,
  });
  sceneStateRef.current = {
    topology,
    topologyLookups,
    activeConduits,
    activeMainCount,
    activeSubagentCount,
    transferSpeed,
    selectedConduitId,
  };

  // Hit targets populated on each frame for pointer hover/click
  const hitNodesRef = useRef<
    Array<{
      x: number;
      y: number;
      r: number;
      label: string;
      conduitId?: string | undefined;
    }>
  >([]);

  const drawScene = useCallback((now: number, advancePhase: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const {
      topology: curTopology,
      topologyLookups: lookups,
      activeConduits: curConduits,
      activeMainCount: curMainCount,
      activeSubagentCount: curSubCount,
      transferSpeed: curSpeed,
      selectedConduitId: curSelectedId,
    } = sceneStateRef.current;

    const cam = cameraRef.current;
    const dt =
      cam.lastFrameTime > 0
        ? Math.max(0, Math.min((now - cam.lastFrameTime) / 1000, 0.05))
        : 0;
    cam.lastFrameTime = now;

    if (advancePhase && curConduits.length > 0) {
      // Only energy particles flow along conduits; peripheral nodes NEVER auto-rotate
      const flowRate = 0.22 * Math.min(curSpeed, 3.2);
      cam.energyPhase = (cam.energyPhase + dt * flowRate) % 1000;
      cam.corePhase = (cam.corePhase + dt * 1.2) % (Math.PI * 20);
    }

    const cssWidth =
      canvasSizeRef.current.width ||
      canvas.clientWidth ||
      canvas.getBoundingClientRect().width;
    const cssHeight =
      canvasSizeRef.current.height ||
      canvas.clientHeight ||
      canvas.getBoundingClientRect().height;
    const width = Math.max(cssWidth, 300);
    const height = Math.max(cssHeight, 360);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark" ||
      document.documentElement.dataset.theme === "dark";

    // Palette aligned with DESIGN.md Warm Light-First & Charcoal Dark tokens
    const bgCenter = isDark ? "#20221f" : "#f7f6f1";
    const bgEdge = isDark ? "#151614" : "#efeee8";
    const orbitRingStroke = isDark
      ? "rgba(170, 167, 159, 0.16)"
      : "rgba(104, 102, 95, 0.16)";
    const activeTetherStroke = isDark
      ? "rgba(220, 148, 119, 0.55)"
      : "rgba(165, 79, 53, 0.48)";
    const textPrimary = isDark ? "#eeede8" : "#292824";
    const textSecondary = isDark ? "#aaa79f" : "#68665f";
    const forgeCoreMain = isDark ? "#dc9477" : "#a54f35";
    const forgeCoreGlow = isDark
      ? "rgba(220, 148, 119, 0.34)"
      : "rgba(165, 79, 53, 0.24)";
    const providerFill = isDark ? "#2c332a" : "#e7ece3";
    const providerStroke = isDark ? "#8fad82" : "#55684d";
    const modelStroke = isDark ? "#b89f8d" : "#8c7362";
    const mainConduitColor = isDark ? "#dc9477" : "#a54f35";
    const subagentConduitColor = isDark ? "#56b881" : "#226d40";
    const fontSans =
      '"Geist", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    const fontMono = '"Geist Mono", "SFMono-Regular", monospace';

    // Background radial gradient
    const bgGrad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      20,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.65,
    );
    bgGrad.addColorStop(0, bgCenter);
    bgGrad.addColorStop(1, bgEdge);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const cx = width * 0.5;
    const cy = height * 0.48;
    const fov = 640;
    const minDim = Math.min(width, height);
    const sceneScale = Math.max(0.58, Math.min(1.12, minDim / 570));

    // Draw 3D orbital reference rings (Middle Model ID orbit = 150, Outermost Provider orbit = 268)
    for (const orbitRadius of [150, 268]) {
      ctx.beginPath();
      const segments = 64;
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const pt3d: Vec3 = [
          Math.cos(theta) * orbitRadius,
          0,
          Math.sin(theta) * orbitRadius,
        ];
        const rotated = transformPoint(pt3d, cam.yaw, cam.pitch);
        const proj = projectPoint(rotated, cx, cy, fov, sceneScale);
        if (i === 0) ctx.moveTo(proj.x, proj.y);
        else ctx.lineTo(proj.x, proj.y);
      }
      ctx.strokeStyle = orbitRingStroke;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Layer 1 -> Layer 2: Outermost Provider (r=258) -> Middle Model ID (r=136) feeder links
    for (const mNode of curTopology.models) {
      const pNode = lookups.providerById.get(mNode.providerId);
      if (!pNode) continue;

      const hasActive = mNode.activeSessionCount > 0;
      const feederCp: Vec3 = [
        (pNode.pos[0] + mNode.pos[0]) * 0.5,
        hasActive ? -3 : 0,
        (pNode.pos[2] + mNode.pos[2]) * 0.5,
      ];

      const fStart = 0.14;
      const fEnd = 0.9;
      const fSpan = fEnd - fStart;
      const fSteps = 16;

      ctx.beginPath();
      for (let s = 0; s <= fSteps; s++) {
        const t = fStart + (s / fSteps) * fSpan;
        const pt3D = quadraticBezier3D(pNode.pos, feederCp, mNode.pos, t);
        const proj = projectPoint(
          transformPoint(pt3D, cam.yaw, cam.pitch),
          cx,
          cy,
          fov,
          sceneScale,
        );
        if (s === 0) ctx.moveTo(proj.x, proj.y);
        else ctx.lineTo(proj.x, proj.y);
      }

      ctx.lineCap = "round";
      if (hasActive) {
        // Soft outer glow + crisp core curve so Provider -> Model ID seamlessly matches Model ID -> Forge
        ctx.strokeStyle = mainConduitColor;
        ctx.globalAlpha = 0.14;
        ctx.lineWidth = 3.2;
        ctx.stroke();

        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.45;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Flowing energy pulse from Provider (outer) -> Model ID (middle)
        const rawP = (cam.energyPhase * 1.15) % 1;
        const prog = rawP < 0 ? rawP + 1 : rawP;
        const headT = fStart + prog * fSpan;
        const tailT = Math.max(fStart, headT - 0.22);

        const headProj = projectPoint(
          transformPoint(
            quadraticBezier3D(pNode.pos, feederCp, mNode.pos, headT),
            cam.yaw,
            cam.pitch,
          ),
          cx,
          cy,
          fov,
          sceneScale,
        );
        const tailProj = projectPoint(
          transformPoint(
            quadraticBezier3D(pNode.pos, feederCp, mNode.pos, tailT),
            cam.yaw,
            cam.pitch,
          ),
          cx,
          cy,
          fov,
          sceneScale,
        );

        ctx.beginPath();
        for (let ss = 0; ss <= 5; ss++) {
          const st = tailT + (ss / 5) * (headT - tailT);
          const sProj = projectPoint(
            transformPoint(
              quadraticBezier3D(pNode.pos, feederCp, mNode.pos, st),
              cam.yaw,
              cam.pitch,
            ),
            cx,
            cy,
            fov,
            sceneScale,
          );
          if (ss === 0) ctx.moveTo(sProj.x, sProj.y);
          else ctx.lineTo(sProj.x, sProj.y);
        }
        const grad = ctx.createLinearGradient(
          tailProj.x,
          tailProj.y,
          headProj.x,
          headProj.y,
        );
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, mainConduitColor);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.1 * headProj.scale;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(headProj.x, headProj.y, 1.9 * headProj.scale, 0, Math.PI * 2);
        ctx.fillStyle = mainConduitColor;
        ctx.fill();
      } else {
        // Subtle idle radial tether for inactive providers
        ctx.strokeStyle = orbitRingStroke;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = 1.1;
        ctx.setLineDash([3, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }

    // Layer 2 -> Layer 3: Middle Model ID (r=136) -> Central Forge Core (0,0,0) Session Energy Conduits
    const forgeCenter3D: Vec3 = [0, 0, 0];
    const forgeCenterProj = projectPoint(
      forgeCenter3D,
      cx,
      cy,
      fov,
      sceneScale,
    );

    const tStart = 0.08;
    const tEnd = 0.82;
    const tSpan = tEnd - tStart;

    for (const conduit of curConduits) {
      const mNode = lookups.modelById.get(conduit.modelNodeId);
      if (!mNode) continue;

      const cp3D = conduitControlPoint(
        mNode.pos,
        conduit.siblingIndex,
        conduit.siblingCount,
      );

      const isSelected = curSelectedId === conduit.id;
      const baseColor = conduit.isSubagent
        ? subagentConduitColor
        : mainConduitColor;

      // Sample clipped 3D curve points from Model ID node (tStart) -> Forge edge (tEnd)
      const steps = 22;
      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const t = tStart + (s / steps) * tSpan;
        const pt3D = quadraticBezier3D(mNode.pos, cp3D, forgeCenter3D, t);
        const rot = transformPoint(pt3D, cam.yaw, cam.pitch);
        const proj = projectPoint(rot, cx, cy, fov, sceneScale);
        if (s === 0) ctx.moveTo(proj.x, proj.y);
        else ctx.lineTo(proj.x, proj.y);
      }

      ctx.lineCap = "round";

      // Soft ambient glow pass
      ctx.strokeStyle = baseColor;
      ctx.globalAlpha = isSelected ? 0.28 : 0.14;
      ctx.lineWidth = isSelected ? 4.5 : 3.2;
      ctx.stroke();

      // Crisp core conduit curve
      ctx.globalAlpha = isSelected ? 0.92 : 0.56;
      ctx.lineWidth = isSelected ? 2.1 : 1.45;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Sleek curved energy pulse gliding along the conduit from Model ID -> Forge
      const pulseCount = curConduits.length <= 2 ? 2 : 1;
      for (let p = 0; p < pulseCount; p++) {
        const rawProgress =
          (cam.energyPhase + conduit.phaseOffset + p / pulseCount) % 1;
        const progress = rawProgress < 0 ? rawProgress + 1 : rawProgress;
        const headT = tStart + progress * tSpan;
        const tailT = Math.max(tStart, headT - 0.18);

        const head3D = quadraticBezier3D(mNode.pos, cp3D, forgeCenter3D, headT);
        const headProj = projectPoint(
          transformPoint(head3D, cam.yaw, cam.pitch),
          cx,
          cy,
          fov,
          sceneScale,
        );
        const tail3D = quadraticBezier3D(mNode.pos, cp3D, forgeCenter3D, tailT);
        const tailProj = projectPoint(
          transformPoint(tail3D, cam.yaw, cam.pitch),
          cx,
          cy,
          fov,
          sceneScale,
        );

        // Draw curved comet streak following the Bezier path
        const streakSteps = 6;
        ctx.beginPath();
        for (let ss = 0; ss <= streakSteps; ss++) {
          const st = tailT + (ss / streakSteps) * (headT - tailT);
          const sPt = quadraticBezier3D(mNode.pos, cp3D, forgeCenter3D, st);
          const sProj = projectPoint(
            transformPoint(sPt, cam.yaw, cam.pitch),
            cx,
            cy,
            fov,
            sceneScale,
          );
          if (ss === 0) ctx.moveTo(sProj.x, sProj.y);
          else ctx.lineTo(sProj.x, sProj.y);
        }

        const grad = ctx.createLinearGradient(
          tailProj.x,
          tailProj.y,
          headProj.x,
          headProj.y,
        );
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, baseColor);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.4 * headProj.scale;
        ctx.stroke();

        // Subtle glowing pulse tip
        const tipRadius = 2.2 * headProj.scale;
        ctx.beginPath();
        ctx.arc(headProj.x, headProj.y, tipRadius, 0, Math.PI * 2);
        ctx.fillStyle = baseColor;
        ctx.fill();
      }
    }

    // Collect all 3D nodes (Providers, Models, and Central Forge Core) and depth-sort back-to-front
    type RenderableNode =
      | {
          kind: "provider";
          z: number;
          proj: { x: number; y: number; scale: number };
          node: ProviderNode3D;
        }
      | {
          kind: "model";
          z: number;
          proj: { x: number; y: number; scale: number };
          node: ModelNode3D;
        }
      | {
          kind: "forge";
          z: number;
          proj: { x: number; y: number; scale: number };
        };

    const renderQueue: RenderableNode[] = [
      { kind: "forge", z: 0, proj: forgeCenterProj },
    ];

    for (const pNode of curTopology.providers) {
      const rot = transformPoint(pNode.pos, cam.yaw, cam.pitch);
      const proj = projectPoint(rot, cx, cy, fov, sceneScale);
      renderQueue.push({ kind: "provider", z: rot[2], proj, node: pNode });
    }

    for (const mNode of curTopology.models) {
      const rot = transformPoint(mNode.pos, cam.yaw, cam.pitch);
      const proj = projectPoint(rot, cx, cy, fov, sceneScale);
      renderQueue.push({ kind: "model", z: rot[2], proj, node: mNode });
    }

    // Depth sort: farthest (negative z) drawn first, closest (positive z) drawn last
    renderQueue.sort((a, b) => a.z - b.z);

    const newHitNodes: Array<{
      x: number;
      y: number;
      r: number;
      label: string;
    }> = [];

    for (const item of renderQueue) {
      if (item.kind === "forge") {
        const { x, y, scale } = item.proj;
        const coreR = 25 * scale;
        const pulseBoost =
          curConduits.length > 0 ? 1 + Math.sin(cam.corePhase) * 0.05 : 1;

        // Soft outer radial aura glow
        const auraR = coreR * 2.1 * pulseBoost;
        const aura = ctx.createRadialGradient(x, y, coreR * 0.2, x, y, auraR);
        aura.addColorStop(0, forgeCoreGlow);
        aura.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.arc(x, y, auraR, 0, Math.PI * 2);
        ctx.fillStyle = aura;
        ctx.fill();

        // Single clean concentric 3D orbital halo ring around Forge Core
        ctx.beginPath();
        const haloSegs = 40;
        const haloRadius = 36;
        for (let i = 0; i <= haloSegs; i++) {
          const a = (i / haloSegs) * Math.PI * 2;
          const pt3d: Vec3 = [
            Math.cos(a) * haloRadius,
            0,
            Math.sin(a) * haloRadius,
          ];
          const gp = projectPoint(
            transformPoint(pt3d, cam.yaw, cam.pitch),
            cx,
            cy,
            fov,
            sceneScale,
          );
          if (i === 0) ctx.moveTo(gp.x, gp.y);
          else ctx.lineTo(gp.x, gp.y);
        }
        ctx.strokeStyle = forgeCoreMain;
        ctx.globalAlpha = curConduits.length > 0 ? 0.45 : 0.25;
        ctx.lineWidth = 1.25;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Crisp inner containment ring
        ctx.beginPath();
        ctx.arc(x, y, coreR * 0.84, 0, Math.PI * 2);
        ctx.strokeStyle = forgeCoreMain;
        ctx.globalAlpha = 0.36;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Inner solid energy sphere
        ctx.beginPath();
        ctx.arc(x, y, coreR * 0.58 * pulseBoost, 0, Math.PI * 2);
        ctx.fillStyle = forgeCoreMain;
        ctx.fill();

        // Label "FORGE"
        ctx.font = `700 ${Math.round(12.5 * scale)}px ${fontSans}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = textPrimary;
        ctx.fillText("FORGE", x, y + coreR + 12 * scale);

        const rateSub =
          curConduits.length > 0
            ? `${curConduits.length} 通道 · ${curSpeed}x`
            : "待机轨道";
        ctx.font = `500 ${Math.round(10 * scale)}px ${fontMono}`;
        ctx.fillStyle = textSecondary;
        ctx.fillText(rateSub, x, y + coreR + 25 * scale);

        newHitNodes.push({
          x,
          y,
          r: coreR * 1.2,
          label: `Forge 核心 · ${curConduits.length} 条会话能量线 (${curMainCount} 主会话 / ${curSubCount} 子代理) · 传输速率 ${curSpeed}x`,
        });
      } else if (item.kind === "provider") {
        const { x, y, scale } = item.proj;
        const pNode = item.node;
        const r = (pNode.activeSessionCount > 0 ? 15 : 12.5) * scale;

        // Hexagon hub for Outermost Provider
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const hx = x + Math.cos(a) * r;
          const hy = y + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fillStyle = providerFill;
        ctx.fill();
        ctx.lineWidth = pNode.activeSessionCount > 0 ? 2 : 1.35;
        ctx.strokeStyle = providerStroke;
        ctx.stroke();

        // Inner dot
        ctx.beginPath();
        ctx.arc(x, y, r * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = providerStroke;
        ctx.fill();

        // Place Provider label OUTWARD away from the middle Model ID ring so it never collides
        const placeAbove = y < cy - 12;
        ctx.font = `600 ${Math.max(10, Math.round(11 * scale))}px ${fontSans}`;
        ctx.textAlign = "center";
        ctx.textBaseline = placeAbove ? "bottom" : "top";
        ctx.fillStyle = textPrimary;
        ctx.fillText(
          pNode.label,
          x,
          placeAbove ? y - r - 6 * scale : y + r + 6 * scale,
        );

        newHitNodes.push({
          x,
          y,
          r: r + 8,
          label: `供应商：${pNode.label} · ${pNode.modelIds.length} 个模型 · ${pNode.activeSessionCount} 个活跃连接 · ${compactTokens(pNode.totalTokens)} tokens`,
        });
      } else {
        // Middle-layer Model ID node: compact glowing nexus point + sleek Model ID pill tag (no bulky balls)
        const { x, y, scale } = item.proj;
        const mNode = item.node;
        const hasActive = mNode.activeSessionCount > 0;
        const dotR = (hasActive ? 5 : 3.5) * scale;

        if (hasActive) {
          const glowR = dotR * 2.6;
          const mGlow = ctx.createRadialGradient(x, y, dotR * 0.2, x, y, glowR);
          mGlow.addColorStop(0, forgeCoreGlow);
          mGlow.addColorStop(1, "rgba(0,0,0,0)");
          ctx.beginPath();
          ctx.arc(x, y, glowR, 0, Math.PI * 2);
          ctx.fillStyle = mGlow;
          ctx.fill();
        }

        // Crisp nexus point on the middle orbital ring
        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
        ctx.fillStyle = hasActive ? mainConduitColor : modelStroke;
        ctx.fill();

        // Model ID pill badge right below the nexus point
        const labelText =
          hasActive && mNode.activeSessionCount > 1
            ? `${mNode.label} ×${mNode.activeSessionCount}`
            : mNode.label;
        const fontSize = Math.max(9, Math.round(10 * scale));
        ctx.font = `500 ${fontSize}px ${fontMono}`;
        const textWidth = ctx.measureText(labelText).width;
        const padX = 6 * scale;
        const pillW = textWidth + padX * 2;
        const pillH = Math.max(15, Math.round(16 * scale));
        const pillX = x - pillW * 0.5;
        const pillY = y + dotR + 4 * scale;

        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 999);
        ctx.fillStyle = isDark
          ? "rgba(28, 29, 27, 0.88)"
          : "rgba(250, 249, 245, 0.9)";
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = hasActive
          ? activeTetherStroke
          : "rgba(140, 115, 98, 0.28)";
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = hasActive ? textPrimary : textSecondary;
        ctx.fillText(labelText, x, pillY + pillH * 0.52);

        newHitNodes.push({
          x,
          y: pillY + pillH * 0.5,
          r: Math.max(pillW * 0.5, 16),
          label: `模型：${mNode.modelId} (${mNode.providerLabel}) · ${mNode.activeSessionCount} 条能量连接 · ${compactTokens(mNode.totalTokens)} tokens`,
        });
      }
    }

    hitNodesRef.current = newHitNodes;
    ctx.restore();
  }, []);

  const resetCamera = useCallback(() => {
    cameraRef.current.yaw = 0.58;
    cameraRef.current.pitch = 0.62;
    drawScene(performance.now(), false);
  }, [drawScene]);

  // Track canvas container size without calling getBoundingClientRect() on every frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvasSizeRef.current = { width: rect.width, height: rect.height };

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          canvasSizeRef.current = {
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          };
        }
        drawScene(performance.now(), false);
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }
    return undefined;
  }, [drawScene]);

  // Redraw static frame immediately whenever topology or selection changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally redraws when topology or selection updates
  useEffect(() => {
    drawScene(performance.now(), false);
  }, [topology, selectedConduitId, drawScene]);

  // Single guarded RAF loop ONLY when there are active conduits transmitting energy
  const hasActiveConduits = activeConduits.length > 0;
  useEffect(() => {
    if (!hasActiveConduits) return;

    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    let cancelled = false;
    let animationFrameId = 0;
    cameraRef.current.lastFrameTime = performance.now();

    const tick = (now: number) => {
      if (cancelled) return;
      drawScene(now, true);
      if (!cancelled) {
        animationFrameId = window.requestAnimationFrame(tick);
      }
    };

    animationFrameId = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [hasActiveConduits, drawScene]);

  return (
    <div
      id="tabpanel-usage-overview"
      role="tabpanel"
      aria-labelledby="tab-btn-usage-overview"
      className="usage-overview"
    >
      {/* 1. 总量卡片 (Total Summary KPI Cards) */}
      {kpiCards}

      {/* 2. 3D Forge 能量网络可视化 (3D Forge Energy Network Visualization) */}
      <section
        className="usage-dashboard-section usage-overview-3d-section"
        data-testid="usage-overview-3d"
        data-provider-count={topology.providers.length}
        data-model-count={topology.models.length}
        data-session-line-count={activeConduits.length}
        data-subagent-count={activeSubagentCount}
        data-energy-speed={transferSpeed}
        aria-label="Forge 3D 能量传输网络"
      >
        <div className="usage-section-header">
          <div className="usage-section-title-group">
            <span className="usage-section-title">
              <GlobeHemisphereWest size={16} weight="duotone" />
              Forge 3D 能量传输矩阵
            </span>
            <span className="usage-section-subtitle-meta">
              中心 Forge 核心 · 周边 {topology.providers.length} 个供应商与{" "}
              {topology.models.length} 个模型 · 当前活跃会话与子代理实时能量汇聚
            </span>
          </div>

          <div className="usage-section-header-right">
            <div className="usage-3d-camera-actions">
              <Button
                variant="secondary"
                size="sm"
                icon={<ArrowsClockwise size={13} />}
                onClick={resetCamera}
                title="重置 3D 视角"
              >
                重置视角
              </Button>
            </div>
          </div>
        </div>

        {/* Energy Status Telemetry Strip */}
        <div className="usage-energy-telemetry-bar">
          <div className="usage-energy-telemetry-item">
            <span className="usage-energy-telemetry-label">中心枢纽</span>
            <strong className="usage-energy-telemetry-val is-forge">
              <Sparkle size={13} weight="fill" />
              Forge Core
            </strong>
          </div>

          <div className="usage-energy-telemetry-item">
            <span className="usage-energy-telemetry-label">周边拓扑节点</span>
            <strong className="usage-energy-telemetry-val">
              {topology.providers.length} 供应商 · {topology.models.length} 模型
            </strong>
          </div>

          <div className="usage-energy-telemetry-item">
            <span className="usage-energy-telemetry-label">
              当前能量连接线 (含子代理)
            </span>
            <strong
              className="usage-energy-telemetry-val"
              data-testid="usage-energy-line-count"
            >
              {activeConduits.length} 条线条
              <span className="usage-energy-telemetry-sub">
                （主会话 {activeMainCount} · 子代理 {activeSubagentCount}）
              </span>
            </strong>
          </div>

          <div className="usage-energy-telemetry-item usage-energy-speed-item">
            <div className="usage-energy-speed-header">
              <span className="usage-energy-telemetry-label">能量传输速率</span>
              <strong
                className="usage-energy-telemetry-val is-speed"
                data-testid="usage-energy-speed-value"
              >
                {activeConduits.length > 0 ? `${transferSpeed}x` : "0x (待机)"}
              </strong>
            </div>
            <div
              className="usage-energy-speed-track"
              title={`当前 ${activeConduits.length} 个活跃会话通道，能量传输速率 ${transferSpeed}x（会话越多线条越多、传输越快）`}
            >
              <div
                className="usage-energy-speed-fill"
                style={{ width: `${speedMeterPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* 3D Stage + Interactive Channel List */}
        <div className="usage-3d-workbench-grid">
          <div className="usage-3d-canvas-Stage">
            <canvas
              ref={canvasRef}
              className="usage-3d-canvas"
              aria-label={`Forge 3D 能量网络画布：中心为 Forge，周边 ${topology.providers.length} 个模型供应商与 ${topology.models.length} 个模型，当前 ${activeConduits.length} 条会话能量线连接`}
              onPointerDown={(e) => {
                cameraRef.current.isDragging = true;
                cameraRef.current.lastX = e.clientX;
                cameraRef.current.lastY = e.clientY;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const localX = e.clientX - rect.left;
                const localY = e.clientY - rect.top;

                if (cameraRef.current.isDragging) {
                  const dx = e.clientX - cameraRef.current.lastX;
                  const dy = e.clientY - cameraRef.current.lastY;
                  cameraRef.current.yaw += dx * 0.0075;
                  cameraRef.current.pitch = Math.max(
                    -1.15,
                    Math.min(1.15, cameraRef.current.pitch + dy * 0.0075),
                  );
                  cameraRef.current.lastX = e.clientX;
                  cameraRef.current.lastY = e.clientY;
                  if (!hasActiveConduits) {
                    drawScene(performance.now(), false);
                  }
                  return;
                }

                const hit = hitNodesRef.current.find(
                  (n) => Math.hypot(localX - n.x, localY - n.y) <= n.r,
                );
                const nextLabel = hit ? hit.label : null;
                setHoveredNodeLabel((prev) =>
                  prev === nextLabel ? prev : nextLabel,
                );
              }}
              onPointerUp={(e) => {
                cameraRef.current.isDragging = false;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              }}
              onPointerLeave={() => {
                cameraRef.current.isDragging = false;
                setHoveredNodeLabel(null);
              }}
            />

            {/* Floating Legend & Hover HUD inside 3D Stage */}
            <div className="usage-3d-stage-legend">
              <span className="usage-3d-legend-item">
                <span className="usage-3d-dot is-forge" />
                <span>Forge 核心</span>
              </span>
              <span className="usage-3d-legend-item">
                <span className="usage-3d-dot is-provider" />
                <span>模型供应商 ({topology.providers.length})</span>
              </span>
              <span className="usage-3d-legend-item">
                <span className="usage-3d-dot is-model" />
                <span>模型节点 ({topology.models.length})</span>
              </span>
              <span className="usage-3d-legend-item">
                <span className="usage-3d-dot is-session" />
                <span>主会话能量线 ({activeMainCount})</span>
              </span>
              <span className="usage-3d-legend-item">
                <span className="usage-3d-dot is-subagent" />
                <span>子代理能量线 ({activeSubagentCount})</span>
              </span>
            </div>

            <div className="usage-3d-stage-hint">
              {hoveredNodeLabel ? (
                <span className="usage-3d-hover-readout">
                  {hoveredNodeLabel}
                </span>
              ) : topology.providers.length === 0 ? (
                <span>
                  尚未配置模型供应商，也没有用量记录；在设置中添加供应商后将显示供应商与模型节点
                </span>
              ) : (
                <span>
                  拖拽画布可 360° 旋转 3D 拓扑 · 会话越多能量线越密集、传输越快
                </span>
              )}
            </div>
          </div>

          {/* Right-hand Topology & Energy Conduit Inspector */}
          <aside
            className="usage-3d-conduit-sidebar"
            aria-label="能量通道与周边节点明细"
          >
            <div className="usage-3d-sidebar-block">
              <div className="usage-3d-sidebar-head">
                <span>当前活跃能量通道 (会话 & 子代理)</span>
                <Tag>
                  {activeConduits.length} 条
                </Tag>
              </div>

              {activeConduits.length === 0 ? (
                <div className="usage-3d-empty-conduits">
                  <p>
                    当前没有正在运行的会话或子代理；启动会话后将自动建立从对应模型通往
                    Forge 的 3D 能量传输线。
                  </p>
                </div>
              ) : (
                <div className="usage-3d-conduit-list">
                  {activeConduits.map((c) => {
                    const isSelected = selectedConduitId === c.id;
                    return (
                      <div
                        key={c.id}
                        className={`usage-3d-conduit-row ${isSelected ? "is-selected" : ""} ${c.isSubagent ? "is-subagent" : ""}`}
                        onMouseEnter={() => setSelectedConduitId(c.id)}
                        onMouseLeave={() => setSelectedConduitId(null)}
                      >
                        <div className="usage-3d-conduit-main">
                          <span
                            className={`usage-3d-conduit-badge ${c.isSubagent ? "is-subagent" : "is-primary"}`}
                          >
                            {c.isSubagent ? (
                              <>
                                <GitBranch size={11} />
                                子代理
                              </>
                            ) : (
                              "主会话"
                            )}
                          </span>
                          <button
                            type="button"
                            className="usage-session-link usage-3d-conduit-title"
                            title={`打开会话：${c.title}`}
                            onClick={() => onSelectSession(c.sessionId)}
                          >
                            {c.title}
                          </button>
                          {c.isLiveRunning && (
                            <span className="usage-3d-live-pill">传输中</span>
                          )}
                        </div>
                        <div className="usage-3d-conduit-meta">
                          <span>{c.providerLabel}</span>
                          <span>→</span>
                          <span className="usage-mono">{c.modelLabel}</span>
                          <span>→</span>
                          <strong className="usage-3d-forge-target">
                            Forge
                          </strong>
                          {c.totalTokens > 0 && (
                            <span className="usage-mono usage-3d-conduit-tokens">
                              {compactTokens(c.totalTokens)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="usage-3d-sidebar-block">
              <div className="usage-3d-sidebar-head">
                <span>周边供应商与模型节点</span>
                <Tag>
                  {topology.providers.length} 源 / {topology.models.length} 模型
                </Tag>
              </div>
              <div className="usage-3d-provider-list">
                {topology.providers.length === 0 && (
                  <EmptyState
                    variant="compact"
                    title="暂无供应商与模型节点"
                    description="在设置 → 模型接入中添加供应商后，这里会列出供应商及其模型。"
                  />
                )}
                {topology.providers.map((prov) => {
                  const childModels = topology.models.filter(
                    (m) => m.providerId === prov.id,
                  );
                  return (
                    <div key={prov.id} className="usage-3d-provider-group">
                      <div className="usage-3d-provider-row">
                        <strong>{prov.label}</strong>
                        <span className="usage-mono">
                          {prov.activeSessionCount} 通道 ·{" "}
                          {compactTokens(prov.totalTokens)}
                        </span>
                      </div>
                      <div className="usage-3d-model-chips">
                        {childModels.map((m) => (
                          <span
                            key={m.id}
                            className={`usage-3d-model-chip ${m.activeSessionCount > 0 ? "is-energized" : ""}`}
                            title={`${m.modelId} · ${m.activeSessionCount} 条能量连接 · ${compactTokens(m.totalTokens)} tokens`}
                          >
                            <span>{m.label}</span>
                            {m.activeSessionCount > 0 && (
                              <strong className="usage-3d-chip-count">
                                ×{m.activeSessionCount}
                              </strong>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
