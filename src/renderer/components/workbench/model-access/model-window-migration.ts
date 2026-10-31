import {
  type ConfigureInput,
  type PublicProviderSource,
  type PublicSettings,
  configureInputSchema,
} from "@forge/core/shared/schemas";
import { configuredModelIds } from "../../../state/composer-model";
import {
  type EditableModelSelection,
  credentialRows,
  modelSelectionObject,
  selectionDraft,
} from "./drafts";
import { updateModelOverride } from "./model-overrides";

/**
 * A `source.save` input that only changes the source's default model and
 * model selection/overrides. Credentials are re-sent without key material, so
 * stored keys, connection settings and aliases stay untouched.
 */
export function sourceModelSaveInput(
  item: PublicProviderSource,
  model: string,
  selection: EditableModelSelection,
): ConfigureInput {
  const credentials = credentialRows(item).map((credential) => ({
    id: credential.id,
    label: credential.label.trim() || "API 密钥",
    enabled: credential.enabled,
    type: credential.type,
    ...(credential.protocol ? { protocol: credential.protocol } : {}),
  }));
  const parsed = configureInputSchema.safeParse({
    source: {
      type: "save",
      source: {
        id: item.id,
        label: item.label.trim(),
        baseUrl: item.baseUrl.trim(),
        model: model.trim(),
        apiMode: item.apiMode ?? "chat-completions",
        preset: item.preset ?? "",
        endpoints: Object.fromEntries(
          Object.entries(item.endpoints ?? {}).flatMap(([protocol, value]) =>
            value?.trim() ? [[protocol, value.trim()]] : [],
          ),
        ),
        modelSelection: modelSelectionObject(selection),
        modelAliases: item.modelAliases ?? {},
        credentialRouting: item.credentialRouting ?? "order",
        sticky: item.sticky === true,
        ...(item.activeCredentialId
          ? { activeCredentialId: item.activeCredentialId }
          : {}),
      },
      credentials,
      ...(item.revision === undefined
        ? {}
        : { expectedRevision: item.revision }),
    },
  });
  if (!parsed.success)
    throw new Error(
      parsed.error.issues
        .map((issue) => `${issue.path.slice(2).join(".")}：${issue.message}`)
        .join("\n"),
    );
  return parsed.data;
}

export type ModelWindowMigrationPlan = Readonly<{
  /** Sources to save, each with every migrated window applied. */
  updates: readonly Readonly<{
    source: PublicProviderSource;
    selection: EditableModelSelection;
  }>[];
  /** Global keys that were moved (or were `null`, i.e. "automatic"). */
  migrated: readonly string[];
  /** Global keys no source lists; they stay global so nothing is lost. */
  unmatched: Readonly<Record<string, number>>;
}>;

/**
 * Plan moving the legacy global `modelContextWindows` (keyed by model ID,
 * across all sources) into each source's per-model override.
 *
 * Runtime gives the global value priority over a source override, so the
 * global value wins here too: the effective window never changes. A `null`
 * entry means "automatic" and is simply dropped. A model that no source lists
 * is left in the global map. Running the plan again is a no-op.
 */
export function planModelWindowMigration(
  settings: Pick<PublicSettings, "modelContextWindows" | "providerSources">,
): ModelWindowMigrationPlan {
  const legacy = settings.modelContextWindows ?? {};
  const keys = Object.keys(legacy);
  const migrated = new Set<string>();
  const updates: {
    source: PublicProviderSource;
    selection: EditableModelSelection;
  }[] = [];
  if (!keys.length) return { updates, migrated: [], unmatched: {} };
  for (const source of settings.providerSources ?? []) {
    const listed = new Set(configuredModelIds(source));
    let selection = selectionDraft(source);
    let changed = false;
    for (const model of keys) {
      if (!listed.has(model)) continue;
      migrated.add(model);
      const tokens = legacy[model];
      if (tokens == null) continue;
      if (selection.overrides?.[model]?.contextWindowTokens === tokens)
        continue;
      selection = updateModelOverride(selection, model, {
        contextWindowTokens: tokens,
      });
      changed = true;
    }
    if (changed) updates.push({ source, selection });
  }
  // `null` entries carry no data; drop them even when no source lists them.
  for (const model of keys) if (legacy[model] == null) migrated.add(model);
  const unmatched: Record<string, number> = {};
  for (const model of keys) {
    const tokens = legacy[model];
    if (!migrated.has(model) && tokens != null) unmatched[model] = tokens;
  }
  return { updates, migrated: [...migrated], unmatched };
}

type Update = (
  input: ConfigureInput,
) => Promise<
  | Readonly<{ ok: true; settings: PublicSettings }>
  | Readonly<{ ok: false; error: string }>
>;

/**
 * Apply the plan: save each source first, then shrink the global map to what
 * could not be migrated. If any step fails the global map is left intact, so
 * the run can be retried safely (already-saved sources become no-ops).
 */
export async function migrateModelContextWindows(
  settings: PublicSettings,
  update: Update,
): Promise<
  Readonly<{
    migrated: readonly string[];
    unmatched: Readonly<Record<string, number>>;
  }>
> {
  const plan = planModelWindowMigration(settings);
  if (!plan.migrated.length) return { migrated: [], unmatched: plan.unmatched };
  let current = settings;
  for (const { source } of plan.updates) {
    // Re-read the source so revisions from earlier saves stay current.
    const latest =
      current.providerSources?.find((item) => item.id === source.id) ?? source;
    const step = planModelWindowMigration({
      modelContextWindows: settings.modelContextWindows,
      providerSources: [latest],
    }).updates[0];
    if (!step) continue;
    const result = await update(
      sourceModelSaveInput(latest, latest.model, step.selection),
    );
    if (!result.ok) throw new Error(result.error);
    current = result.settings;
  }
  const result = await update({
    settings: { modelContextWindows: { ...plan.unmatched } },
  });
  if (!result.ok) throw new Error(result.error);
  return { migrated: plan.migrated, unmatched: plan.unmatched };
}

/**
 * Read fallback while a legacy global entry still exists: Core resolves it
 * before any per-source value, so display it as the effective window.
 */
export function legacyModelWindow(
  settings: Pick<PublicSettings, "modelContextWindows"> | null | undefined,
  model: string,
): number | null {
  return settings?.modelContextWindows?.[model] ?? null;
}
