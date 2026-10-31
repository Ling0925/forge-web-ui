import type { PublicProviderPreset } from "@forge/core/shared/model-access";
import type { ModelCatalog } from "@forge/core/shared/model-catalog";
import {
  type PublicProviderSource,
  configureInputSchema,
} from "@forge/core/shared/schemas";
import {
  ArrowClockwise,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { selectableModelIds } from "../../state/composer-model";
import {
  shallowEqual,
  useWorkbenchActions,
  useWorkbenchSelector,
} from "../../state/workbench-store";
import { Button } from "../primitives/Button";
import { Checkbox } from "../primitives/Checkbox";
import { EmptyState } from "../primitives/EmptyState";
import { Field } from "../primitives/Field";
import { Input } from "../primitives/Input";
import { Select } from "../primitives/Select";
import { Tag } from "../primitives/Tag";
import { useConfirm } from "./ConfirmDialog";
import { Dialog } from "./Dialog";
import {
  type AccessDraft,
  type CatalogTestState,
  ConnectionEditor,
  CredentialsEditor,
  type EditableModelSelection,
  ImportPanel,
  ModelSelectionEditor,
  PresetPicker,
  RouteGroupsPanel,
  SourceCardModelPanel,
  accessDraft,
  aliasesObject,
  credentialRows,
  describedFailure,
  endpointProblem,
  freshAccessDraft,
  modelSelectionObject,
  presetEndpoints,
  protocolLabel,
  selectionDraft,
} from "./ModelAccessPanels";
import { sourceModelSaveInput } from "./model-access/model-window-migration";
import {
  SaveIndicator,
  type SaveStatus,
  SettingGroup,
  SettingRow,
} from "./settings/SettingRows";
import "./provider-sources.css";
import "./model-access.css";

const protocolOptions = [
  { value: "chat-completions", label: "Chat Completions" },
  { value: "responses", label: "Responses" },
  { value: "anthropic", label: "Anthropic Messages" },
  { value: "gemini", label: "Gemini" },
] as const;

const freshSourceId = (sources: readonly PublicProviderSource[]) => {
  const taken = new Set(sources.map((item) => item.id));
  let candidate = "";
  do {
    candidate = `source-${Array.from(
      crypto.getRandomValues(new Uint32Array(2)),
      (value) => value.toString(36),
    ).join("")}`;
  } while (taken.has(candidate));
  return candidate;
};

const stableDraft = (draft: AccessDraft): string =>
  JSON.stringify({
    label: draft.label,
    baseUrl: draft.baseUrl,
    model: draft.model,
    apiMode: draft.apiMode,
    preset: draft.preset,
    region: draft.region,
    endpoints: draft.endpoints,
    modelSelection: {
      mode: draft.modelSelection.mode,
      models: draft.modelSelection.models,
      manual: draft.modelSelection.manual,
      overrides: draft.modelSelection.overrides,
    },
    aliases: draft.aliases.map((row) => [row.alias, row.model]),
    credentialRouting: draft.credentialRouting,
    sticky: draft.sticky,
    activeCredentialId: draft.activeCredentialId,
    credentials: draft.credentials.map((row) => ({
      id: row.id,
      label: row.label,
      enabled: row.enabled,
      type: row.type,
      protocol: row.protocol,
      hasKey: row.apiKey.length > 0,
      clearKey: row.clearKey,
    })),
    connection: {
      authEditing: draft.connection.authEditing,
      authType: draft.connection.authType,
      authHeader: draft.connection.authHeader,
      authPrefix: draft.connection.authPrefix,
      headersEditing: draft.connection.headersEditing,
      headersDirty: draft.connection.headersDirty,
      headers: draft.connection.headers.map((row) => [
        row.name,
        row.value,
        row.stored,
      ]),
      extraBodyEditing: draft.connection.extraBodyEditing,
      extraBodyText: draft.connection.extraBodyText,
      hasExtraBody: draft.connection.hasExtraBody,
      vertexEditing: draft.connection.vertexEditing,
      vertexText: draft.connection.vertexText,
      hasVertex: draft.connection.hasVertex,
      proxyEditing: draft.connection.proxyEditing,
      proxyUrl: draft.connection.proxyUrl,
    },
  });

const newDraft = (sources: readonly PublicProviderSource[]): AccessDraft =>
  freshAccessDraft(freshSourceId(sources));

type CatalogMeta = Readonly<{ stale: boolean; fetchedAt?: string }>;
type CatalogLoad = Readonly<{
  models: ModelCatalog;
  stale: boolean;
  fetchedAt?: string;
  error: string;
}>;

const refreshNotice = (loaded: CatalogLoad): string =>
  loaded.stale
    ? `刷新失败：${loaded.error || "目录未更新"}。保留 ${loaded.models.length} 个缓存模型。`
    : `目录已刷新：${loaded.models.length} 个模型。`;

function normalizedEndpoints(
  endpoints: AccessDraft["endpoints"],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [protocol, value] of Object.entries(endpoints)) {
    if (value?.trim()) out[protocol] = value.trim();
  }
  return out;
}

function buildConnection(
  draft: AccessDraft,
): Record<string, unknown> | undefined {
  const connection: Record<string, unknown> = {};
  if (draft.connection.authEditing) {
    connection.auth = {
      type: draft.connection.authType,
      ...(draft.connection.authType === "header"
        ? { header: draft.connection.authHeader.trim() }
        : {}),
      ...(draft.connection.authPrefix
        ? { prefix: draft.connection.authPrefix }
        : {}),
    };
  }
  if (draft.connection.headersEditing && draft.connection.headersDirty) {
    const incomplete = draft.connection.headers.find(
      (row) => row.stored && row.name.trim() && !row.value,
    );
    if (incomplete)
      throw new Error("已保存的请求头值不会回显，请填写或删除对应请求头。");
    const headers: Record<string, string> = {};
    for (const row of draft.connection.headers) {
      const name = row.name.trim();
      if (name) headers[name] = row.value;
    }
    connection.headers = headers;
  }
  if (draft.connection.extraBodyEditing) {
    const text = draft.connection.extraBodyText.trim();
    // Blank leaves saved extra parameters untouched; `{}` clears them.
    if (text) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("额外参数 JSON 格式错误。");
      }
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
        throw new Error("额外参数必须是 JSON 对象。");
      connection.extraBody = parsed;
    }
  }
  if (draft.connection.vertexEditing) {
    const text = draft.connection.vertexText.trim();
    // Blank leaves the saved Vertex config untouched; an explicit null clears it.
    if (text) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("Vertex JSON 格式错误。");
      }
      if (
        parsed !== null &&
        (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
      )
        throw new Error("Vertex JSON 必须是对象或 null。");
      connection.vertex = parsed;
    }
  }
  if (draft.connection.proxyEditing)
    connection.proxyUrl = draft.connection.proxyUrl.trim();
  return Object.keys(connection).length ? connection : undefined;
}

export function ProviderSources({
  onBusy,
  active = true,
}: {
  readonly onBusy: (busy: boolean) => void;
  readonly active?: boolean;
}) {
  const { updateSettings, loadSettings } = useWorkbenchActions();
  const state = useWorkbenchSelector(
    ({ state }) => ({
      isSettingsOpen: state.isSettingsOpen,
      sessions: state.sessions,
      settings: state.settings,
    }),
    shallowEqual,
  );
  const settings = state.settings;
  const sources = useMemo<readonly PublicProviderSource[]>(
    () => settings?.providerSources ?? [],
    [settings?.providerSources],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<AccessDraft>(() => newDraft(sources));
  const [baseline, setBaseline] = useState<AccessDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [presets, setPresets] = useState<readonly PublicProviderPreset[]>([]);
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const [catalogs, setCatalogs] = useState<
    Readonly<Record<string, ModelCatalog>>
  >({});
  const [catalogLoading, setCatalogLoading] = useState<
    Readonly<Record<string, boolean>>
  >({});
  const [catalogErrors, setCatalogErrors] = useState<
    Readonly<Record<string, string>>
  >({});
  const [catalogMeta, setCatalogMeta] = useState<
    Readonly<Record<string, CatalogMeta | undefined>>
  >({});
  const [tests, setTests] = useState<
    Readonly<Record<string, CatalogTestState | undefined>>
  >({});
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<SaveStatus>({
    state: "idle",
  });
  const { confirm, dialog: confirmDialog } = useConfirm();
  const requestedCatalogs = useRef(new Set<string>());
  const pendingCatalogs = useRef(new Map<string, Promise<CatalogLoad>>());
  const testRequests = useRef(
    new Map<string, { requestId: string; kind: "catalog" | "inference" }>(),
  );
  const lock = useRef(false);
  const alive = useRef(true);
  const id = useId();
  const effectiveTabId = useMemo(() => {
    if (activeTabId && sources.some((item) => item.id === activeTabId)) {
      return activeTabId;
    }
    if (
      settings?.activeSourceId &&
      sources.some((item) => item.id === settings.activeSourceId)
    ) {
      return settings.activeSourceId;
    }
    return sources[0]?.id ?? null;
  }, [activeTabId, sources, settings?.activeSourceId]);
  const source = sources.find((item) => item.id === selected);
  const dirty = baseline
    ? stableDraft(draft) !== stableDraft(baseline)
    : stableDraft(draft) !== stableDraft(freshAccessDraft(draft.id));
  const endpointError =
    draft.baseUrl === "" ? "" : endpointProblem(draft.baseUrl);
  const labelError =
    draft.label === ""
      ? ""
      : draft.label.trim() === ""
        ? "来源名称不能只有空白。"
        : "";
  const canSave =
    !busy &&
    !!settings &&
    dirty &&
    draft.label.trim() !== "" &&
    endpointProblem(draft.baseUrl) === "";

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active || !state.isSettingsOpen || presetsLoaded) return;
    setPresetsLoaded(true);
    if (!window.forge.modelAccess) return;
    void window.forge
      .modelAccess({ type: "presets" })
      .then((result) => {
        if (alive.current && result.type === "presets")
          setPresets(result.presets);
      })
      .catch(() => undefined);
  }, [active, state.isSettingsOpen, presetsLoaded]);

  const loadCatalog = useCallback(
    (sourceId: string, refresh = false): Promise<CatalogLoad> => {
      const pending = pendingCatalogs.current.get(sourceId);
      if (pending) return pending;
      requestedCatalogs.current.add(sourceId);
      setCatalogErrors((old) => ({ ...old, [sourceId]: "" }));
      setCatalogLoading((old) => ({ ...old, [sourceId]: true }));
      const request = (async (): Promise<CatalogLoad> => {
        if (window.forge.modelAccess) {
          const result = await window.forge.modelAccess({
            type: "catalog",
            sourceId,
            includeUnselected: true,
            ...(refresh ? { refresh: true } : {}),
          });
          if (result.type !== "catalog") throw new Error("目录响应类型错误。");
          // A stale result carries the last good catalog plus the refresh
          // failure; it must not be presented as a successful refresh.
          return {
            models: result.models,
            stale: result.stale === true,
            ...(result.fetchedAt ? { fetchedAt: result.fetchedAt } : {}),
            error: result.error ?? "",
          };
        }
        const models = await window.forge.listModels(sourceId, refresh);
        return {
          models: models.map((modelId) => ({
            id: modelId,
            contextWindowTokens: null,
          })),
          stale: false,
          error: "",
        };
      })()
        .then((loaded) => {
          if (alive.current) {
            setCatalogs((old) => ({ ...old, [sourceId]: loaded.models }));
            setCatalogErrors((old) => ({
              ...old,
              [sourceId]: loaded.error,
            }));
            setCatalogMeta((old) => ({
              ...old,
              [sourceId]: {
                stale: loaded.stale,
                ...(loaded.fetchedAt ? { fetchedAt: loaded.fetchedAt } : {}),
              },
            }));
          }
          return loaded;
        })
        .catch((failure: unknown) => {
          if (alive.current) {
            setCatalogErrors((old) => ({
              ...old,
              [sourceId]: describedFailure(failure),
            }));
            // Keep whatever was already listed; a failed refresh does not
            // invalidate the models the user could see before it.
            setCatalogMeta((old) => ({
              ...old,
              [sourceId]: { stale: true },
            }));
          }
          throw failure;
        })
        .finally(() => {
          requestedCatalogs.current.delete(sourceId);
          pendingCatalogs.current.delete(sourceId);
          if (alive.current)
            setCatalogLoading((old) => ({ ...old, [sourceId]: false }));
        });
      pendingCatalogs.current.set(sourceId, request);
      return request;
    },
    [],
  );

  useEffect(() => {
    if (!active || !state.isSettingsOpen) return;
    for (const item of sources) {
      if (
        catalogs[item.id] === undefined &&
        !requestedCatalogs.current.has(item.id) &&
        !pendingCatalogs.current.has(item.id)
      )
        void loadCatalog(item.id).catch(() => undefined);
    }
  }, [active, state.isSettingsOpen, sources, catalogs, loadCatalog]);

  const cancelTest = useCallback((sourceId: string) => {
    const activeTest = testRequests.current.get(sourceId);
    if (!activeTest) return;
    testRequests.current.delete(sourceId);
    setTests((old) => ({
      ...old,
      [sourceId]: {
        kind: activeTest.kind,
        status: "cancelled",
      },
    }));
    if (window.forge.modelAccess)
      void window.forge
        .modelAccess({ type: "cancel", requestId: activeTest.requestId })
        .catch(() => {});
  }, []);

  const cancelAllTests = useCallback(() => {
    for (const sourceId of [...testRequests.current.keys()])
      cancelTest(sourceId);
  }, [cancelTest]);

  useEffect(() => {
    return () => {
      for (const activeTest of testRequests.current.values()) {
        if (window.forge.modelAccess)
          void window.forge
            .modelAccess({ type: "cancel", requestId: activeTest.requestId })
            .catch(() => {});
      }
      testRequests.current.clear();
    };
  }, []);

  const runTest = async (sourceId: string, kind: "catalog" | "inference") => {
    if (testRequests.current.has(sourceId)) return;
    if (!window.forge.modelAccess) {
      setTests((old) => ({
        ...old,
        [sourceId]: {
          kind,
          status: "error",
          error: "当前宿主不支持模型测试。",
        },
      }));
      return;
    }
    const model = draft.model.trim() || source?.model || "";
    if (kind === "inference" && !model) {
      setTests((old) => ({
        ...old,
        [sourceId]: { kind, status: "error", error: "请选择模型。" },
      }));
      return;
    }
    const requestId =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    testRequests.current.set(sourceId, { requestId, kind });
    setTests((old) => ({ ...old, [sourceId]: { kind, status: "running" } }));
    try {
      const result = await window.forge.modelAccess({
        type: "test",
        sourceId,
        kind,
        requestId,
        ...(model ? { model } : {}),
        ...(draft.activeCredentialId
          ? { credentialId: draft.activeCredentialId }
          : {}),
      });
      if (result.type !== "test") throw new Error("测试响应类型错误。");
      if (!alive.current) return;
      // A canceled or superseded request must not overwrite its own status.
      if (testRequests.current.get(sourceId)?.requestId !== requestId) return;
      setTests((old) => ({
        ...old,
        [sourceId]: {
          kind,
          status: result.ok ? "ok" : "error",
          latencyMs: result.latencyMs,
          ...(result.model ? { model: result.model } : {}),
          ...(result.error ? { error: result.error } : {}),
        },
      }));
    } catch (testError) {
      if (
        alive.current &&
        testRequests.current.get(sourceId)?.requestId === requestId
      )
        setTests((old) => ({
          ...old,
          [sourceId]: {
            kind,
            status: "error",
            error: describedFailure(testError),
          },
        }));
    } finally {
      if (testRequests.current.get(sourceId)?.requestId === requestId)
        testRequests.current.delete(sourceId);
    }
  };

  useEffect(() => {
    if (state.isSettingsOpen || !editorOpen || lock.current) return;
    cancelAllTests();
    setEditorOpen(false);
    setDraft(newDraft(sources));
    setBaseline(null);
    setSelected(null);
  }, [state.isSettingsOpen, editorOpen, sources, cancelAllTests]);

  const resetEditor = () => {
    cancelAllTests();
    setEditorOpen(false);
    setDraft(newDraft(sources));
    setBaseline(null);
    setSelected(null);
  };

  const selectSource = useCallback(
    (sourceId: string | null) => {
      const saved = sources.find((item) => item.id === sourceId);
      setSelected(saved?.id ?? null);
      if (saved) {
        const base = accessDraft(saved);
        setDraft(base);
        setBaseline(base);
      } else {
        setDraft(newDraft(sources));
        setBaseline(null);
      }
      setError("");
      setMessage("");
    },
    [sources],
  );

  const openEditor = (sourceId: string | null) => {
    selectSource(sourceId);
    setEditorOpen(true);
    const saved = sources.find((item) => item.id === sourceId);
    if (saved && catalogs[saved.id] === undefined && !catalogLoading[saved.id])
      void loadCatalog(saved.id).catch(() => undefined);
  };

  const requestClose = async () => {
    if (lock.current) return;
    if (
      dirty &&
      !(await confirm({
        title: "放弃未保存的修改？",
        body: "关闭后，这次对来源的修改不会保存。",
        confirmLabel: "放弃修改",
        cancelLabel: "继续编辑",
        tone: "danger",
      }))
    )
      return;
    resetEditor();
  };

  const change = (patch: Partial<AccessDraft>) => {
    setDraft((old) => ({ ...old, ...patch }));
    setError("");
    setMessage("");
  };

  const changeBaseUrl = (value: string) => {
    setDraft((old) => {
      const endpoints = { ...old.endpoints };
      if (value.trim()) endpoints[old.apiMode] = value;
      else delete endpoints[old.apiMode];
      return { ...old, baseUrl: value, endpoints };
    });
    setError("");
    setMessage("");
  };

  const changeProtocol = (protocol: AccessDraft["apiMode"]) => {
    setDraft((old) => {
      const baseUrl = old.endpoints[protocol] ?? old.baseUrl;
      const endpoints = { ...old.endpoints };
      if (baseUrl.trim()) endpoints[protocol] = baseUrl;
      return { ...old, apiMode: protocol, baseUrl, endpoints };
    });
    setError("");
    setMessage("");
  };

  const selectPreset = (presetId: string) => {
    const chosen = presets.find((item) => item.id === presetId);
    if (!chosen) {
      change({ preset: "" });
      return;
    }
    const endpoints = presetEndpoints(chosen, "");
    const usable = protocolOptions.find((item) =>
      chosen.id === "google" ? item.value === "gemini" : endpoints[item.value],
    );
    change({
      preset: chosen.id,
      region: "",
      endpoints,
      label: draft.label.trim() ? draft.label : chosen.name,
      ...(usable
        ? { apiMode: usable.value, baseUrl: endpoints[usable.value] ?? "" }
        : chosen.id === "azure"
          ? { apiMode: "chat-completions", baseUrl: "" }
          : {}),
    });
  };

  const selectRegion = (regionId: string) => {
    const chosen = presets.find((item) => item.id === draft.preset);
    if (!chosen) return;
    const endpoints = presetEndpoints(chosen, regionId);
    const baseUrl = endpoints[draft.apiMode] ?? draft.baseUrl;
    change({ region: regionId, endpoints, baseUrl });
  };

  const operation = async (fn: () => Promise<string>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    setMessage("");
    try {
      const notice = await fn();
      if (alive.current && notice) setMessage(notice);
    } catch (failure) {
      if (alive.current) setError(describedFailure(failure));
    } finally {
      lock.current = false;
      onBusy(false);
      if (alive.current) setBusy(false);
    }
  };

  const adopt = (
    nextSettings: typeof settings | null | undefined,
    sourceId: string,
  ) => {
    const saved = nextSettings?.providerSources?.find(
      (item) => item.id === sourceId,
    );
    if (!saved) return;
    setSelected(saved.id);
    setActiveTabId(saved.id);
    setDraft(accessDraft(saved));
    setBaseline(accessDraft(saved));
  };

  const persist = () =>
    operation(async () => {
      if (!draft.credentials.length) throw new Error("至少需要一个凭据。");
      if (
        source?.hasApiKey &&
        draft.baseUrl.trim() !== source.baseUrl &&
        !draft.credentials.some(
          (credential) => credential.apiKey || credential.clearKey,
        )
      )
        throw new Error("修改 API 地址时，请填写密钥或勾选清除密钥。");
      const active = draft.credentials.find(
        (credential) => credential.id === draft.activeCredentialId,
      );
      const activeKey =
        active?.type === "api-key"
          ? active.clearKey
            ? ""
            : active.apiKey || undefined
          : undefined;
      const credentials = draft.credentials.map((credential) => ({
        id: credential.id,
        label: credential.label.trim() || "API 密钥",
        enabled: credential.enabled,
        type: credential.type,
        ...(credential.protocol ? { protocol: credential.protocol } : {}),
        ...(credential.type === "api-key"
          ? credential.clearKey
            ? { apiKey: "" }
            : credential.apiKey
              ? { apiKey: credential.apiKey }
              : {}
          : {}),
      }));
      const connection = buildConnection(draft);
      const parsed = configureInputSchema.safeParse({
        source: {
          type: "save",
          source: {
            id: draft.id,
            label: draft.label.trim(),
            baseUrl: draft.baseUrl.trim(),
            model: draft.model.trim(),
            apiMode: draft.apiMode,
            preset: draft.preset,
            endpoints: normalizedEndpoints(draft.endpoints),
            modelSelection: modelSelectionObject(draft.modelSelection),
            modelAliases: aliasesObject(draft.aliases),
            credentialRouting: draft.credentialRouting ?? "order",
            sticky: draft.sticky,
            ...(draft.activeCredentialId
              ? { activeCredentialId: draft.activeCredentialId }
              : {}),
          },
          credentials,
          ...(activeKey === undefined ? {} : { apiKey: activeKey }),
          ...(connection ? { connection } : {}),
          ...(draft.revision === undefined
            ? {}
            : { expectedRevision: draft.revision }),
        },
      });
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map(
              (issue) => `${issue.path.slice(2).join(".")}：${issue.message}`,
            )
            .join("\n"),
        );
      const result = await updateSettings(parsed.data);
      if (!result.ok) throw new Error(result.error);
      if (!alive.current) return "";
      adopt(result.settings, draft.id);
      setEditorOpen(false);
      void loadCatalog(draft.id, true).catch(() => undefined);
      return "来源已保存。";
    });

  /** Model cards save immediately: default model, list and per-model params. */
  const saveCardModelConfig = async (
    item: PublicProviderSource,
    nextModel: string,
    nextSelection: EditableModelSelection,
  ): Promise<boolean> => {
    let ok = false;
    await operation(async () => {
      const result = await updateSettings(
        sourceModelSaveInput(item, nextModel, nextSelection),
      );
      if (!result.ok) throw new Error(result.error);
      ok = true;
      if (!alive.current) return "";
      if (selected === item.id) adopt(result.settings, item.id);
      void loadCatalog(item.id, true).catch(() => undefined);
      return "模型设置已保存。";
    });
    return ok;
  };

  const chooseDefaultModel = async (value: string) => {
    const [sourceId, model] = value.split("\u0000");
    const target = sources.find((item) => item.id === sourceId);
    if (!target || !model) return;
    setDefaultStatus({ state: "saving" });
    let failure = "";
    await operation(async () => {
      try {
        if (target.model !== model) {
          const saved = await updateSettings(
            sourceModelSaveInput(target, model, selectionDraft(target)),
          );
          if (!saved.ok) throw new Error(saved.error);
        }
        if (settings?.activeSourceId !== target.id) {
          const activated = await updateSettings({
            source: { type: "activate", id: target.id },
          });
          if (!activated.ok) throw new Error(activated.error);
        }
      } catch (error) {
        failure = describedFailure(error);
      }
      return "";
    });
    if (alive.current)
      setDefaultStatus(
        failure
          ? { state: "error", message: `保存失败：${failure}` }
          : { state: "saved" },
      );
  };

  const remove = (sourceId: string, forgottenSessionIds?: readonly string[]) =>
    operation(async () => {
      const result = await updateSettings({
        source: {
          type: "remove",
          id: sourceId,
          ...(forgottenSessionIds ? { forgottenSessionIds } : {}),
        },
      });
      if (!result.ok) {
        const pinned = state.sessions
          .filter((item) => item.providerSourceId === sourceId)
          .map((item) => item.id);
        if (!forgottenSessionIds && pinned.length > 0) {
          // Core refuses while sessions still pin this source; ask again with
          // the list and remove them from the source on a second confirmation.
          void confirmRemoval(sourceId, pinned);
          return "";
        }
        throw new Error(result.error);
      }
      if (!alive.current) return "";
      selectSource(null);
      setEditorOpen(false);
      return "来源已删除。";
    });

  const confirmRemoval = async (
    sourceId: string,
    sessions: readonly string[] = [],
  ) => {
    const target = sources.find((item) => item.id === sourceId);
    const name = target?.label ?? sourceId;
    const ok = await confirm({
      title: `删除来源“${name}”？`,
      body: sessions.length
        ? `仍有 ${sessions.length} 个会话绑定这个来源：${sessions
            .slice(0, 5)
            .join(
              "、",
            )}${sessions.length > 5 ? " 等" : ""}。删除后这些会话需要重新选择模型。`
        : "来源的地址、密钥和模型设置会被删除，无法恢复。",
      confirmLabel: "删除来源",
      tone: "danger",
      requireText: name,
    });
    if (ok) void remove(sourceId, sessions.length ? sessions : undefined);
  };

  const reloadAfterLogin = async () => {
    const next = await loadSettings();
    const saved = next?.providerSources?.find((item) => item.id === draft.id);
    if (!saved) return;
    const unchanged = baseline
      ? stableDraft(draft) === stableDraft(baseline)
      : false;
    if (unchanged) {
      const rebuilt = accessDraft(saved);
      setDraft(rebuilt);
      setBaseline(rebuilt);
    } else {
      setDraft((old) => ({
        ...old,
        credentials: credentialRows(saved),
        activeCredentialId: saved.activeCredentialId ?? old.activeCredentialId,
        revision: saved.revision,
      }));
      setBaseline((old) =>
        old
          ? {
              ...old,
              credentials: credentialRows(saved),
              activeCredentialId:
                saved.activeCredentialId ?? old.activeCredentialId,
              revision: saved.revision,
            }
          : old,
      );
    }
    setMessage("登录完成。");
    void loadCatalog(saved.id, true).catch(() => undefined);
  };

  const tabSource = sources.find((item) => item.id === effectiveTabId);
  const defaultOptions = sources.flatMap((item) =>
    selectableModelIds(item).map((model) => ({
      value: `${item.id}\u0000${model}`,
      label: `${item.label} · ${model}`,
    })),
  );
  const defaultValue =
    settings?.activeSourceId && settings.model
      ? `${settings.activeSourceId}\u0000${settings.model}`
      : "";

  return (
    <section
      className="settings-section provider-sources"
      aria-label="模型来源管理"
    >
      {sources.length > 0 && (
        <SettingGroup title="默认">
          <SettingRow
            id="defaultModel"
            label="默认模型"
            description="新会话使用的模型；每个会话仍可在输入框中切换。"
            control={
              <Select
                aria-label="默认模型"
                value={
                  defaultOptions.some((item) => item.value === defaultValue)
                    ? defaultValue
                    : ""
                }
                placeholder="选择默认模型"
                disabled={busy || !defaultOptions.length}
                options={defaultOptions}
                onValueChange={(value) => void chooseDefaultModel(value)}
              />
            }
            status={<SaveIndicator status={defaultStatus} />}
          />
        </SettingGroup>
      )}

      <SettingGroup
        id="setting-row-sources"
        title="来源"
        description="地址、密钥和凭据在“编辑来源”中修改并保存。"
        actions={
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus size={14} />}
            disabled={!settings || busy || sources.length >= 20}
            onClick={() => openEditor(null)}
          >
            添加来源
          </Button>
        }
      >
        {sources.length > 0 ? (
          <ul
            className="provider-source-list"
            aria-label="已保存的来源"
            data-setting="sources"
          >
            {sources.map((item) => {
              const isDefault = settings?.activeSourceId === item.id;
              const loading = catalogLoading[item.id] ?? false;
              const catalog = catalogs[item.id];
              const meta = catalogMeta[item.id];
              const selection = selectionDraft(item);
              return (
                <li
                  key={item.id}
                  className={`provider-source-row${isDefault ? " is-current" : ""}`}
                >
                  <span
                    className="wb-status-dot"
                    data-status={
                      catalogErrors[item.id]
                        ? "awaiting_approval"
                        : loading
                          ? "running"
                          : "ready"
                    }
                    aria-hidden="true"
                  />
                  <div className="provider-source-row-main">
                    <span className="provider-source-title">
                      <strong>{item.label}</strong>
                      {isDefault && <Tag tone="accent">默认</Tag>}
                      {!item.hasApiKey &&
                        !item.credentials?.some(
                          (credential) => credential.type !== "api-key",
                        ) && <Tag tone="muted">无密钥</Tag>}
                      {meta?.stale && catalog && catalog.length > 0 && (
                        <Tag tone="warning">目录已过期</Tag>
                      )}
                    </span>
                    <span className="provider-source-meta-line">
                      {protocolLabel(item.apiMode)} · {item.baseUrl} ·{" "}
                      {selection.mode === "none"
                        ? "不提供模型"
                        : `${selectableModelIds(item).length} 个模型`}
                      {(item.credentials?.length ?? 1) > 1
                        ? ` · ${item.credentials?.length} 个凭据`
                        : ""}
                    </span>
                    {catalogErrors[item.id] && (
                      <span className="provider-source-row-error" role="alert">
                        {catalogErrors[item.id]}
                      </span>
                    )}
                  </div>
                  <div className="provider-source-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<ArrowClockwise size={14} />}
                      aria-label={`刷新${item.label}的模型`}
                      loading={loading}
                      disabled={busy}
                      onClick={() =>
                        void operation(async () => {
                          const loaded = await loadCatalog(item.id, true);
                          return refreshNotice(loaded);
                        })
                      }
                    >
                      刷新
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<PencilSimple size={14} />}
                      aria-label={`编辑${item.label}`}
                      disabled={busy}
                      onClick={() => openEditor(item.id)}
                    >
                      编辑来源
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            variant="inline"
            title="尚无模型来源"
            description="点击“添加来源”，或在下方“导入来源”中粘贴 JSON 配置。"
          />
        )}
      </SettingGroup>

      {!editorOpen && message && (
        <output className="provider-feedback">{message}</output>
      )}
      {!editorOpen && error && (
        <p className="provider-feedback provider-error" role="alert">
          {error}
        </p>
      )}

      {tabSource && (
        <SettingGroup
          title="模型"
          description="每个模型的上下文窗口、最大输出和思考等级在卡片的“编辑参数”中设置，保存后立即生效。"
          actions={
            sources.length > 1 ? (
              <Select
                aria-label="查看来源的模型"
                value={tabSource.id}
                options={sources.map((item) => ({
                  value: item.id,
                  label: item.label,
                }))}
                onValueChange={setActiveTabId}
              />
            ) : undefined
          }
        >
          <div className="provider-models-body" data-setting="modelCards">
            <SourceCardModelPanel
              key={tabSource.id}
              sourceLabel={tabSource.label}
              catalog={catalogs[tabSource.id] ?? []}
              loading={catalogLoading[tabSource.id] ?? false}
              error={catalogErrors[tabSource.id]}
              protocol={protocolLabel(tabSource.apiMode)}
              model={tabSource.model}
              selection={selectionDraft(tabSource)}
              disabled={busy}
              legacyWindows={settings?.modelContextWindows}
              onCommit={(nextModel, nextSelection) =>
                saveCardModelConfig(tabSource, nextModel, nextSelection)
              }
            />
          </div>
        </SettingGroup>
      )}

      <div data-setting="import">
        <ImportPanel
          onApplied={async (ids) => {
            const next = await loadSettings();
            for (const imported of ids)
              if (next?.providerSources?.some((item) => item.id === imported))
                void loadCatalog(imported).catch(() => undefined);
            setMessage(`已导入 ${ids.length} 个来源。`);
          }}
        />
      </div>

      <div data-setting="routeGroups">
        <RouteGroupsPanel catalogs={catalogs} />
      </div>

      {editorOpen && (
        <Dialog
          title={source ? `编辑来源 · ${source.label}` : "添加来源"}
          onClose={() => void requestClose()}
          dismissible={!busy}
          initialFocus="input"
          className="provider-editor-dialog"
        >
          <div className="provider-editor modal-content">
            <fieldset disabled={busy || !settings} className="provider-fields">
              <PresetPicker
                presets={presets}
                preset={draft.preset}
                region={draft.region}
                onPreset={selectPreset}
                onRegion={selectRegion}
              />
              <div className="provider-form-grid">
                <Field
                  id={`${id}-label`}
                  label="来源名称"
                  error={labelError || undefined}
                >
                  <Input
                    id={`${id}-label`}
                    value={draft.label}
                    placeholder="来源名称"
                    onChange={(event) => change({ label: event.target.value })}
                  />
                </Field>
                <Field id={`${id}-protocol`} label="协议">
                  <Select
                    id={`${id}-protocol`}
                    value={draft.apiMode}
                    options={protocolOptions}
                    onValueChange={(value) =>
                      changeProtocol(value as AccessDraft["apiMode"])
                    }
                  />
                </Field>
                <Field
                  className="provider-full-width"
                  id={`${id}-url`}
                  label="API 地址"
                  error={endpointError || undefined}
                >
                  <Input
                    id={`${id}-url`}
                    value={draft.baseUrl}
                    placeholder="https://api.example.com/v1"
                    spellCheck={false}
                    onChange={(event) => changeBaseUrl(event.target.value)}
                  />
                </Field>
              </div>

              <CredentialsEditor
                sourceId={draft.id}
                sourceReady={Boolean(source)}
                credentials={draft.credentials}
                activeCredentialId={draft.activeCredentialId}
                disabled={busy}
                onCredentials={(credentials) => change({ credentials })}
                onActive={(activeCredentialId) =>
                  change({ activeCredentialId })
                }
                onCompleted={reloadAfterLogin}
              />

              <ModelSelectionEditor
                catalog={catalogs[draft.id] ?? []}
                loading={catalogLoading[draft.id] ?? false}
                error={catalogErrors[draft.id] ?? ""}
                stale={Boolean(
                  catalogMeta[draft.id]?.stale &&
                    (catalogs[draft.id]?.length ?? 0) > 0,
                )}
                fetchedAt={catalogMeta[draft.id]?.fetchedAt}
                model={draft.model}
                selection={draft.modelSelection}
                aliases={draft.aliases}
                disabled={busy || !source || dirty}
                test={tests[draft.id]}
                onModel={(model) => change({ model })}
                onSelection={(selection) =>
                  change({ modelSelection: selection })
                }
                onAliases={(aliases) => change({ aliases })}
                onRefresh={() => {
                  if (!source) return;
                  void operation(async () => {
                    const loaded = await loadCatalog(source.id, true);
                    return refreshNotice(loaded);
                  });
                }}
                onTest={(kind) => void runTest(draft.id, kind)}
                onCancelTest={() => cancelTest(draft.id)}
              />

              <details className="provider-advanced">
                <summary>高级设置</summary>
                <p className="setting-hint">
                  多凭据的轮换方式、认证头、额外请求参数与代理。大多数来源无需修改。
                </p>
                <section className="model-access-section" aria-label="凭据路由">
                  <div className="model-access-heading">
                    <h4>凭据路由</h4>
                  </div>
                  <div className="model-access-form-grid">
                    <Field
                      id={`${id}-credential-routing`}
                      label="多个凭据时的使用顺序"
                    >
                      <Select
                        id={`${id}-credential-routing`}
                        value={draft.credentialRouting ?? "order"}
                        options={[
                          { value: "order", label: "顺序" },
                          { value: "rotate", label: "轮换" },
                          { value: "usage", label: "用量" },
                          { value: "smart", label: "智能" },
                          { value: "pace", label: "节流" },
                        ]}
                        onValueChange={(value) =>
                          change({
                            credentialRouting:
                              value as AccessDraft["credentialRouting"],
                          })
                        }
                      />
                    </Field>
                    <label className="model-access-check">
                      <Checkbox
                        checked={draft.sticky}
                        onCheckedChange={(checked) =>
                          change({ sticky: checked })
                        }
                      />
                      同一会话尽量保持同一凭据
                    </label>
                  </div>
                </section>
                <ConnectionEditor
                  connection={draft.connection}
                  disabled={busy}
                  onChange={(connection) => change({ connection })}
                />
              </details>
            </fieldset>

            {error && (
              <p className="provider-feedback provider-error" role="alert">
                {error}
              </p>
            )}
            {message && (
              <output className="provider-feedback">{message}</output>
            )}
            {source && (
              <SettingGroup title="危险操作" tone="danger">
                <SettingRow
                  label="删除来源"
                  description="删除地址、密钥和这个来源下的模型设置，无法恢复。"
                  control={
                    <Button
                      size="sm"
                      variant="danger"
                      icon={<Trash size={14} />}
                      disabled={busy || dirty}
                      title={dirty ? "先保存或放弃修改" : undefined}
                      onClick={() => void confirmRemoval(source.id)}
                    >
                      删除来源…
                    </Button>
                  }
                />
              </SettingGroup>
            )}
            <div className="provider-actions">
              <Button
                variant="primary"
                disabled={!canSave}
                onClick={() => void persist()}
              >
                保存来源
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void requestClose()}
              >
                关闭
              </Button>
              {dirty && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => selectSource(selected)}
                >
                  放弃修改
                </Button>
              )}
            </div>
          </div>
        </Dialog>
      )}
      {confirmDialog}
    </section>
  );
}
