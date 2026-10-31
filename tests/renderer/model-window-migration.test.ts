import {
  type ConfigureInput,
  type PublicProviderSource,
  type PublicSettings,
  configureInputSchema,
  defaultPublicSettings,
} from "@forge/core/shared/schemas";
import { describe, expect, it } from "vitest";
import {
  legacyModelWindow,
  migrateModelContextWindows,
  planModelWindowMigration,
} from "../../src/renderer/components/workbench/model-access/model-window-migration";

const source = (
  id: string,
  overrides: Partial<PublicProviderSource> = {},
): PublicProviderSource =>
  ({
    id,
    label: `源 ${id}`,
    baseUrl: `https://${id}.test/v1`,
    model: `${id}/default`,
    apiMode: "chat-completions",
    revision: 1,
    hasApiKey: true,
    ...overrides,
  }) as PublicProviderSource;

const settings = (
  sources: readonly PublicProviderSource[],
  modelContextWindows: Record<string, number | null>,
): PublicSettings =>
  ({
    ...defaultPublicSettings,
    providerSources: sources,
    modelContextWindows,
  }) as PublicSettings;

/** In-memory stand-in for Core: validates input, bumps revisions, merges patches. */
function fakeCore(
  initial: PublicSettings,
  failOn?: (input: ConfigureInput) => boolean,
) {
  let current = structuredClone(initial);
  const calls: ConfigureInput[] = [];
  const update = async (input: ConfigureInput) => {
    const parsed = configureInputSchema.parse(input);
    calls.push(parsed);
    if (failOn?.(parsed)) return { ok: false as const, error: "写入失败" };
    if (parsed.source?.type === "save") {
      const op = parsed.source;
      const prior = current.providerSources?.find(
        (item) => item.id === op.source.id,
      );
      if (
        op.expectedRevision !== undefined &&
        prior?.revision !== op.expectedRevision
      )
        return { ok: false as const, error: "revision conflict" };
      const saved = {
        ...prior,
        ...op.source,
        revision: (prior?.revision ?? 0) + 1,
      } as PublicProviderSource;
      current = {
        ...current,
        providerSources: (current.providerSources ?? []).map((item) =>
          item.id === saved.id ? saved : item,
        ),
      };
    } else if (parsed.settings) {
      current = { ...current, ...parsed.settings } as PublicSettings;
    }
    return { ok: true as const, settings: structuredClone(current) };
  };
  return { update, calls, get: () => current };
}

describe("per-model context window migration", () => {
  it("moves windows onto every source that lists the model; the global value wins", () => {
    const plan = planModelWindowMigration(
      settings(
        [
          source("a", {
            modelSelection: {
              mode: "selected",
              models: ["shared/x"],
              overrides: {
                "shared/x": {
                  contextWindowTokens: 64000,
                  maxOutputTokens: 4096,
                },
              },
            },
          }),
          source("b", {
            modelSelection: {
              mode: "selected",
              models: ["shared/x", "b/only"],
            },
          }),
        ],
        { "shared/x": 1_000_000, "b/only": 200_000 },
      ),
    );
    expect([...plan.migrated].sort()).toEqual(["b/only", "shared/x"]);
    expect(plan.unmatched).toEqual({});
    const byId = Object.fromEntries(
      plan.updates.map((item) => [item.source.id, item.selection.overrides]),
    );
    // Other override fields survive; the differing source value is replaced
    // so the effective runtime window stays the same.
    expect(byId.a).toEqual({
      "shared/x": { contextWindowTokens: 1_000_000, maxOutputTokens: 4096 },
    });
    expect(byId.b).toEqual({
      "shared/x": { contextWindowTokens: 1_000_000 },
      "b/only": { contextWindowTokens: 200_000 },
    });
  });

  it("drops null entries, keeps unknown models global and is idempotent", () => {
    const already = source("a", {
      modelSelection: {
        mode: "selected",
        models: ["a/one"],
        overrides: { "a/one": { contextWindowTokens: 128000 } },
      },
    });
    const plan = planModelWindowMigration(
      settings([already], {
        "a/one": 128000,
        "gone/model": 64000,
        "a/auto": null,
      }),
    );
    expect(plan.updates).toEqual([]);
    expect([...plan.migrated].sort()).toEqual(["a/auto", "a/one"]);
    expect(plan.unmatched).toEqual({ "gone/model": 64000 });
    expect(planModelWindowMigration(settings([already], {}))).toEqual({
      updates: [],
      migrated: [],
      unmatched: {},
    });
  });

  it("saves sources without key material, then shrinks the global map; a rerun is a no-op", async () => {
    const core = fakeCore(
      settings(
        [
          source("a", {
            credentials: [
              {
                id: "default",
                label: "默认",
                enabled: true,
                type: "api-key",
                status: "ready",
              },
            ],
            modelSelection: { mode: "selected", models: ["a/one"] },
          } as Partial<PublicProviderSource>),
          source("b", {
            modelSelection: { mode: "selected", models: ["b/one"] },
          }),
        ],
        { "a/one": 256000, "b/one": 32000, "gone/model": 64000 },
      ),
    );
    const result = await migrateModelContextWindows(core.get(), core.update);
    expect(result.unmatched).toEqual({ "gone/model": 64000 });
    expect(core.calls.map((call) => call.source?.type ?? "settings")).toEqual([
      "save",
      "save",
      "settings",
    ]);
    for (const call of core.calls)
      if (call.source?.type === "save")
        for (const credential of call.source.credentials ?? [])
          expect(credential).not.toHaveProperty("apiKey");
    const after = core.get();
    expect(after.modelContextWindows).toEqual({ "gone/model": 64000 });
    const overrides = (id: string) =>
      after.providerSources?.find((item) => item.id === id)?.modelSelection
        ?.overrides;
    expect(overrides("a")).toEqual({
      "a/one": { contextWindowTokens: 256000 },
    });
    expect(overrides("b")).toEqual({ "b/one": { contextWindowTokens: 32000 } });

    const again = await migrateModelContextWindows(after, core.update);
    expect(again).toEqual({ migrated: [], unmatched: { "gone/model": 64000 } });
    expect(core.calls).toHaveLength(3);
  });

  it("leaves the global map intact when a source save fails, and a retry completes", async () => {
    const initial = settings(
      [
        source("a", {
          modelSelection: { mode: "selected", models: ["a/one"] },
        }),
        source("b", {
          modelSelection: { mode: "selected", models: ["b/one"] },
        }),
      ],
      { "a/one": 256000, "b/one": 32000 },
    );
    let failing = true;
    const core = fakeCore(
      initial,
      (input) =>
        failing &&
        input.source?.type === "save" &&
        input.source.source.id === "b",
    );
    await expect(
      migrateModelContextWindows(core.get(), core.update),
    ).rejects.toThrow("写入失败");
    expect(core.get().modelContextWindows).toEqual({
      "a/one": 256000,
      "b/one": 32000,
    });
    // Effective windows are still read from the legacy map meanwhile.
    expect(legacyModelWindow(core.get(), "b/one")).toBe(32000);
    failing = false;
    await migrateModelContextWindows(core.get(), core.update);
    expect(core.get().modelContextWindows).toEqual({});
    // Source a was already migrated, so the retry only saved b.
    expect(
      core.calls.filter(
        (call) => call.source?.type === "save" && call.source.source.id === "a",
      ),
    ).toHaveLength(1);
    expect(legacyModelWindow(core.get(), "b/one")).toBeNull();
  });
});
