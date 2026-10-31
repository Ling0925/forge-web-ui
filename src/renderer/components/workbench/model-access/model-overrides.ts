import type { ModelCatalogEntry } from "@forge/core/shared/model-catalog";
import type { EditableModelSelection, ProviderProtocol } from "./drafts";

export type ModelReasoningEffort = NonNullable<
  ModelCatalogEntry["reasoningEffort"]
>;
export type ModelOverrideEntry = NonNullable<
  EditableModelSelection["overrides"]
>[string];

export const REASONING_EFFORT_OPTIONS: readonly {
  readonly value: "" | ModelReasoningEffort;
  readonly label: string;
  readonly shortLabel: string;
  readonly bars: number;
}[] = [
  { value: "", label: "跟随全局", shortLabel: "全局", bars: 0 },
  { value: "default", label: "模型默认", shortLabel: "默认", bars: 0 },
  { value: "none", label: "关闭", shortLabel: "关闭", bars: 0 },
  { value: "minimal", label: "极低", shortLabel: "极低", bars: 1 },
  { value: "low", label: "低", shortLabel: "低", bars: 2 },
  { value: "medium", label: "中", shortLabel: "中", bars: 3 },
  { value: "high", label: "高", shortLabel: "高", bars: 4 },
  { value: "xhigh", label: "超高", shortLabel: "超高", bars: 5 },
  { value: "max", label: "最大", shortLabel: "最大", bars: 5 },
];

/** Chinese name for a reasoning effort value. */
export function effortName(value: string): string {
  if (value === "default") return "模型默认";
  return (
    REASONING_EFFORT_OPTIONS.find((item) => item.value === value)?.label ??
    value
  );
}

export const SUPPORTED_EFFORT_LEVELS = [
  { value: "none", label: "关闭", shortLabel: "关闭" },
  { value: "minimal", label: "极低", shortLabel: "极低" },
  { value: "low", label: "低", shortLabel: "低" },
  { value: "medium", label: "中", shortLabel: "中" },
  { value: "high", label: "高", shortLabel: "高" },
  { value: "xhigh", label: "超高", shortLabel: "超高" },
  { value: "max", label: "最大", shortLabel: "最大" },
] as const;

export const CONTEXT_WINDOW_PRESETS = [
  { label: "32K", tokens: 32_000 },
  { label: "64K", tokens: 64_000 },
  { label: "128K", tokens: 128_000 },
  { label: "200K", tokens: 200_000 },
  { label: "256K", tokens: 256_000 },
  { label: "512K", tokens: 512_000 },
  { label: "1M", tokens: 1_000_000 },
  { label: "2M", tokens: 2_000_000 },
] as const;

export const MAX_OUTPUT_PRESETS = [
  { label: "4K", tokens: 4_096 },
  { label: "8K", tokens: 8_192 },
  { label: "16K", tokens: 16_384 },
  { label: "32K", tokens: 32_768 },
  { label: "64K", tokens: 65_536 },
  { label: "128K", tokens: 128_000 },
] as const;

export function hasModelOverride(
  override: ModelOverrideEntry | undefined,
): boolean {
  if (!override) return false;
  return (
    (override.contextWindowTokens !== undefined &&
      override.contextWindowTokens !== null) ||
    (override.maxOutputTokens !== undefined &&
      override.maxOutputTokens !== null) ||
    override.apiMode !== undefined ||
    override.reasoningEffort !== undefined ||
    (override.reasoningEfforts !== undefined &&
      override.reasoningEfforts.length > 0) ||
    override.displayName !== undefined ||
    override.tools !== undefined ||
    override.vision !== undefined
  );
}

export function cleanModelOverrides(
  overrides: EditableModelSelection["overrides"],
): EditableModelSelection["overrides"] {
  if (!overrides) return undefined;
  const next: Record<string, ModelOverrideEntry> = {};
  for (const [id, item] of Object.entries(overrides)) {
    if (!item) continue;
    const entry: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      entry[key] = value;
    }
    if (Object.keys(entry).length > 0) {
      next[id] = entry as ModelOverrideEntry;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function countModelOverrides(
  overrides: EditableModelSelection["overrides"],
): number {
  const cleaned = cleanModelOverrides(overrides);
  return cleaned ? Object.keys(cleaned).length : 0;
}

export function updateModelOverride(
  selection: EditableModelSelection,
  modelId: string,
  patch: Partial<{
    readonly contextWindowTokens: number | null | undefined;
    readonly maxOutputTokens: number | null | undefined;
    readonly reasoningEffort: ModelReasoningEffort | undefined;
    readonly reasoningEfforts: readonly string[] | undefined;
    readonly apiMode: ProviderProtocol | undefined;
  }>,
): EditableModelSelection {
  const current = selection.overrides?.[modelId] ?? {};
  const merged: Record<string, unknown> = { ...current, ...patch };
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null) {
      delete merged[key];
    } else if (Array.isArray(value) && value.length === 0) {
      delete merged[key];
    }
  }
  const rest = { ...(selection.overrides ?? {}) };
  if (Object.keys(merged).length > 0) {
    rest[modelId] = merged as ModelOverrideEntry;
  } else {
    delete rest[modelId];
  }
  return {
    ...selection,
    overrides: cleanModelOverrides(rest),
  };
}

export function clearModelOverride(
  selection: EditableModelSelection,
  modelId: string,
): EditableModelSelection {
  if (!selection.overrides?.[modelId]) return selection;
  const rest = { ...selection.overrides };
  delete rest[modelId];
  return {
    ...selection,
    overrides: cleanModelOverrides(rest),
  };
}

export function effectiveModelEntry(
  entry: ModelCatalogEntry,
  override: ModelOverrideEntry | undefined,
): ModelCatalogEntry {
  const nextProvenance: Record<string, "upstream" | "reference" | "user"> = {};
  for (const [key, source] of Object.entries(entry.provenance ?? {})) {
    if (source !== "user") {
      nextProvenance[key] = source;
    }
  }
  const baseContext =
    entry.provenance?.contextWindowTokens === "user"
      ? null
      : entry.contextWindowTokens;
  const baseMaxOutput =
    entry.provenance?.maxOutputTokens === "user"
      ? undefined
      : entry.maxOutputTokens;
  const baseEffort =
    entry.provenance?.reasoningEffort === "user"
      ? undefined
      : entry.reasoningEffort;
  const baseEfforts =
    entry.provenance?.reasoningEfforts === "user"
      ? undefined
      : entry.reasoningEfforts;

  const contextWindowTokens =
    override?.contextWindowTokens !== undefined &&
    override.contextWindowTokens !== null
      ? override.contextWindowTokens
      : baseContext;
  if (
    override?.contextWindowTokens !== undefined &&
    override.contextWindowTokens !== null
  ) {
    nextProvenance.contextWindowTokens = "user";
  }

  const maxOutputTokens =
    override?.maxOutputTokens !== undefined && override.maxOutputTokens !== null
      ? override.maxOutputTokens
      : baseMaxOutput;
  if (
    override?.maxOutputTokens !== undefined &&
    override.maxOutputTokens !== null
  ) {
    nextProvenance.maxOutputTokens = "user";
  }

  const reasoningEffort = override?.reasoningEffort ?? baseEffort;
  if (override?.reasoningEffort !== undefined) {
    nextProvenance.reasoningEffort = "user";
  }

  const reasoningEfforts =
    override?.reasoningEfforts && override.reasoningEfforts.length > 0
      ? override.reasoningEfforts
      : baseEfforts;
  if (override?.reasoningEfforts && override.reasoningEfforts.length > 0) {
    nextProvenance.reasoningEfforts = "user";
  }

  return {
    ...entry,
    contextWindowTokens,
    ...(maxOutputTokens === undefined
      ? { maxOutputTokens: undefined }
      : { maxOutputTokens }),
    ...(reasoningEffort === undefined
      ? { reasoningEffort: undefined }
      : { reasoningEffort }),
    ...(reasoningEfforts === undefined
      ? { reasoningEfforts: undefined }
      : { reasoningEfforts }),
    ...(Object.keys(nextProvenance).length > 0
      ? { provenance: nextProvenance }
      : { provenance: undefined }),
  };
}
