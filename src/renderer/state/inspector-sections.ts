/**
 * 会话详情（Inspector）分区的展开状态。
 *
 * 每个会话记住用户亲手展开 / 收起过的分区；未操作过的分区按会话阶段取默认值：
 * 运行中优先展示进度，结束后优先展示变更。
 */
export type InspectorSectionId =
  | "attention"
  | "progress"
  | "subtasks"
  | "changes"
  | "context"
  | "session";

export type InspectorPhase = "running" | "settled";

export type InspectorSectionOverrides = Partial<
  Record<InspectorSectionId, boolean>
>;

export const INSPECTOR_DEFAULT_OPEN: Readonly<
  Record<InspectorPhase, Readonly<Record<InspectorSectionId, boolean>>>
> = {
  running: {
    attention: true,
    progress: true,
    subtasks: true,
    changes: false,
    context: false,
    session: false,
  },
  settled: {
    attention: true,
    progress: false,
    subtasks: true,
    changes: true,
    context: false,
    session: false,
  },
};

export function resolveSectionOpen(
  overrides: InspectorSectionOverrides | undefined,
  phase: InspectorPhase,
  id: InspectorSectionId,
): boolean {
  return overrides?.[id] ?? INSPECTOR_DEFAULT_OPEN[phase][id];
}

const MAX_REMEMBERED = 200;
const memory = new Map<string, InspectorSectionOverrides>();

export function readSectionOverrides(
  sessionId: string,
): InspectorSectionOverrides | undefined {
  return memory.get(sessionId);
}

export function rememberSectionOpen(
  sessionId: string,
  id: InspectorSectionId,
  open: boolean,
): InspectorSectionOverrides {
  const next = { ...memory.get(sessionId), [id]: open };
  // Re-insert so the Map's insertion order doubles as recency for eviction.
  memory.delete(sessionId);
  memory.set(sessionId, next);
  if (memory.size > MAX_REMEMBERED) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  return next;
}

/** Test hook: forget every remembered session. */
export function resetSectionMemory(): void {
  memory.clear();
}

const REVEAL_EVENT = "forge:reveal-inspector-section";

/** Ask the Inspector to open (and scroll to) one section, e.g. from 工作区文件. */
export function requestInspectorSection(id: InspectorSectionId): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<InspectorSectionId>(REVEAL_EVENT, { detail: id }),
  );
}

export function subscribeInspectorSection(
  listener: (id: InspectorSectionId) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handle = (event: Event) =>
    listener((event as CustomEvent<InspectorSectionId>).detail);
  window.addEventListener(REVEAL_EVENT, handle);
  return () => window.removeEventListener(REVEAL_EVENT, handle);
}
