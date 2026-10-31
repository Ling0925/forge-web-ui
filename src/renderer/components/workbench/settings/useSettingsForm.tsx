import { defaultPublicSettings } from "@forge/core/shared/schemas";
import { useCallback, useEffect, useRef, useState } from "react";
import { isMobileAppHost } from "../../../state/mobile-connection";
import { modelServiceStatus } from "../../../state/model-service-status";
import {
  type SettingsDraft,
  buildSettingsUpdate,
  createSettingsDraft,
} from "../../../state/settings-draft";
import {
  shallowEqual,
  useWorkbenchActions,
  useWorkbenchSelector,
} from "../../../state/workbench-store";
import { useConfirm } from "../ConfirmDialog";
import {
  migrateModelContextWindows,
  planModelWindowMigration,
} from "../model-access/model-window-migration";
import type { SaveStatus } from "./SettingRows";
import {
  SETTING_INDEX,
  type Section,
  mobilePairingSection,
  sections,
  subscribeSettingsSection,
  takeRequestedSettingsSection,
} from "./settings-options";

/** Simple preferences that save as soon as they change. */
export type AutoSaveKey =
  | "theme"
  | "defaultPermission"
  | "requestTimeoutMs"
  | "reasoningEffort"
  | "contextBudgetTokens"
  | "contextBudgetChars";

const IDLE: SaveStatus = { state: "idle" };

export function useSettingsForm() {
  const { updateSettings, openSettings } = useWorkbenchActions();
  const state = useWorkbenchSelector(
    ({ state }) => ({
      isSettingsOpen: state.isSettingsOpen,
      settings: state.settings,
    }),
    shallowEqual,
  );
  const initial = state.settings ?? defaultPublicSettings;
  const serviceStatus = modelServiceStatus(state.settings);
  const [original, setOriginal] = useState(initial);
  const [draft, setDraft] = useState(() => createSettingsDraft(initial));
  const [section, setSection] = useState<Section>(
    () => takeRequestedSettingsSection() ?? "general",
  );
  const [query, setQuery] = useState("");
  const [focusSetting, setFocusSetting] = useState<string | null>(null);
  const [status, setStatus] = useState<Readonly<Record<string, SaveStatus>>>(
    {},
  );
  const [lspStatus, setLspStatus] = useState<SaveStatus>(IDLE);
  const [listing, setListing] = useState(false);
  const [mobile] = useState(() => isMobileAppHost());
  const [agentDirty, setAgentDirty] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const sourceBusy = useRef(false);
  const alive = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const originalRef = useRef(original);
  originalRef.current = original;
  // Auto-saves run one at a time so a slow save can never land after a newer one.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  // Bumped when a save settles so settings that arrived meanwhile are adopted.
  const [settled, setSettled] = useState(0);
  const settle = useCallback(() => {
    pending.current -= 1;
    if (alive.current) setSettled((n) => n + 1);
  }, []);
  const savedTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const migrationAttempted = useRef(false);
  const [migrationNotice, setMigrationNotice] = useState<SaveStatus>(IDLE);
  const lspDirty =
    JSON.stringify(draft.lspServers) !==
    JSON.stringify(createSettingsDraft(original).lspServers);
  const lspDirtyRef = useRef(lspDirty);
  lspDirtyRef.current = lspDirty;

  useEffect(() => {
    alive.current = true;
    const timers = savedTimers.current;
    return () => {
      alive.current = false;
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, []);

  // Adopt settings changed elsewhere (another window, the CLI, a source save)
  // unless an auto-save is in flight; an unsaved LSP draft is kept.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `settled` re-runs this once an in-flight save finishes.
  useEffect(() => {
    if (!state.settings || pending.current > 0) return;
    const next = state.settings;
    setOriginal(next);
    setDraft((old) => {
      const fresh = createSettingsDraft(next);
      return lspDirtyRef.current
        ? { ...fresh, lspServers: old.lspServers }
        : fresh;
    });
  }, [state.settings, settled]);

  // One-time move of the legacy global per-model windows into each source's
  // model settings. It is idempotent and leaves unmatched entries in place.
  useEffect(() => {
    const current = state.settings;
    if (!state.isSettingsOpen || !current || migrationAttempted.current) return;
    if (!planModelWindowMigration(current).migrated.length) return;
    migrationAttempted.current = true;
    pending.current += 1;
    queue.current = queue.current
      .then(() => migrateModelContextWindows(current, updateSettings))
      .then(({ migrated }) => {
        if (alive.current && migrated.length)
          setMigrationNotice({ state: "saved" });
      })
      .catch((failure: unknown) => {
        if (alive.current)
          setMigrationNotice({
            state: "error",
            message: `旧版模型窗口设置迁移失败，仍按原设置生效：${
              failure instanceof Error ? failure.message : "未知错误"
            }`,
          });
      })
      .finally(() => {
        settle();
      });
  }, [state.isSettingsOpen, state.settings, updateSettings, settle]);

  const clearLegacyWindows = async () => {
    const result = await updateSettings({
      settings: { modelContextWindows: {} },
    });
    if (!result.ok && alive.current)
      setMigrationNotice({ state: "error", message: result.error });
  };

  useEffect(() => {
    if (!state.isSettingsOpen) return;
    const previous = document.activeElement;
    heading.current?.focus();
    return () => {
      if (previous instanceof HTMLElement)
        requestAnimationFrame(() => previous.focus());
    };
  }, [state.isSettingsOpen]);

  /** Resolves true when it is fine to leave the current agent editor. */
  const leaveAgentDraft = useCallback(async () => {
    if (agentBusy) return false;
    if (!agentDirty) return true;
    return confirm({
      title: "放弃智能体修改？",
      body: "当前智能体有未保存的修改，离开后这些修改会丢失。",
      confirmLabel: "放弃修改",
      cancelLabel: "继续编辑",
      tone: "danger",
    });
  }, [agentBusy, agentDirty, confirm]);

  const close = useCallback(async () => {
    if (!(await leaveAgentDraft())) return;
    if (!sourceBusy.current) openSettings(false);
  }, [leaveAgentDraft, openSettings]);

  useEffect(() => {
    if (!state.isSettingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !document.querySelector("dialog[open]") &&
        !event.isComposing
      ) {
        event.preventDefault();
        void close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.isSettingsOpen, close]);

  const markSaved = (key: string) => {
    const timers = savedTimers.current;
    const old = timers.get(key);
    if (old) clearTimeout(old);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        if (alive.current)
          setStatus((prev) =>
            prev[key]?.state === "saved" ? { ...prev, [key]: IDLE } : prev,
          );
      }, 2400),
    );
  };

  /**
   * Save one simple preference immediately. Validation errors keep the old
   * value; a failed save rolls the control back to the last saved value.
   * Resolves true once the value is persisted (or nothing needed saving).
   */
  const commit = <K extends AutoSaveKey>(
    name: K,
    value: SettingsDraft[K],
  ): Promise<boolean> => {
    const base = originalRef.current;
    let input: ReturnType<typeof buildSettingsUpdate>;
    try {
      input = buildSettingsUpdate(
        { ...createSettingsDraft(base), [name]: value },
        base,
        "",
        false,
      );
    } catch (failure) {
      setStatus((prev) => ({
        ...prev,
        [name]: {
          state: "error",
          message: failure instanceof Error ? failure.message : "值无效。",
        },
      }));
      return Promise.resolve(false);
    }
    setDraft((old) => ({ ...old, [name]: value }));
    if (!Object.keys(input).length) {
      setStatus((prev) => ({ ...prev, [name]: IDLE }));
      return Promise.resolve(true);
    }
    pending.current += 1;
    setStatus((prev) => ({ ...prev, [name]: { state: "saving" } }));
    const run = queue.current.then(async () => {
      try {
        const result = await updateSettings(input);
        if (!result.ok) throw Error(result.error);
        if (!alive.current) return true;
        setOriginal(result.settings);
        originalRef.current = result.settings;
        setStatus((prev) => ({ ...prev, [name]: { state: "saved" } }));
        markSaved(name);
        return true;
      } catch (failure) {
        if (!alive.current) return false;
        const rollback = createSettingsDraft(originalRef.current)[name];
        setDraft((old) => ({ ...old, [name]: rollback }));
        setStatus((prev) => ({
          ...prev,
          [name]: {
            state: "error",
            message: `保存失败，已恢复原值：${
              failure instanceof Error ? failure.message : "未知错误"
            }`,
          },
        }));
        return false;
      } finally {
        settle();
      }
    });
    queue.current = run;
    return run;
  };

  const statusOf = (name: string): SaveStatus => status[name] ?? IDLE;

  const changeLsp = (value: SettingsDraft["lspServers"]) => {
    setDraft((old) => ({ ...old, lspServers: value }));
    setLspStatus(IDLE);
  };

  const resetLsp = () => {
    setDraft((old) => ({
      ...old,
      lspServers: createSettingsDraft(originalRef.current).lspServers,
    }));
    setLspStatus(IDLE);
  };

  /** Language servers are a complex list: they save explicitly. */
  const saveLsp = async () => {
    const base = originalRef.current;
    let input: ReturnType<typeof buildSettingsUpdate>;
    try {
      input = buildSettingsUpdate(
        { ...createSettingsDraft(base), lspServers: draft.lspServers },
        base,
        "",
        false,
      );
    } catch (failure) {
      setLspStatus({
        state: "error",
        message: failure instanceof Error ? failure.message : "配置无效。",
      });
      return;
    }
    if (!Object.keys(input).length) return;
    setLspStatus({ state: "saving" });
    pending.current += 1;
    try {
      const result = await queue.current.then(() => updateSettings(input));
      if (!result.ok) throw Error(result.error);
      if (!alive.current) return;
      setOriginal(result.settings);
      originalRef.current = result.settings;
      setDraft((old) => ({
        ...old,
        lspServers: createSettingsDraft(result.settings).lspServers,
      }));
      setLspStatus({ state: "saved" });
    } catch (failure) {
      if (alive.current)
        setLspStatus({
          state: "error",
          message: `保存失败，修改已保留：${
            failure instanceof Error ? failure.message : "未知错误"
          }`,
        });
    } finally {
      settle();
    }
  };

  const catalog = mobile
    ? sections.map((item) =>
        item.id === "pairing" ? mobilePairingSection : item,
      )
    : sections;
  const needle = query.trim().toLowerCase();
  const titleOf = (id: Section) =>
    catalog.find((item) => item.id === id)?.title ?? "";
  const results = needle
    ? [
        ...SETTING_INDEX.filter((item) =>
          `${item.label} ${item.keywords} ${titleOf(item.section)}`
            .toLowerCase()
            .includes(needle),
        ),
        // Pages whose own description matches but no single setting does.
        ...catalog
          .filter(
            (page) =>
              `${page.title} ${page.keywords} ${page.description}`
                .toLowerCase()
                .includes(needle) &&
              !SETTING_INDEX.some(
                (item) =>
                  item.section === page.id &&
                  `${item.label} ${item.keywords} ${page.title}`
                    .toLowerCase()
                    .includes(needle),
              ),
          )
          .map((page) => ({
            id: "",
            section: page.id as Section,
            label: page.title,
            keywords: "",
          })),
      ]
    : [];
  const selected = catalog.find((item) => item.id === section)!;

  const goTo = async (next: Section, settingId?: string) => {
    if (next !== section && !(await leaveAgentDraft())) return;
    setSection(next);
    setQuery("");
    setFocusSetting(settingId || null);
  };

  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  useEffect(
    () => subscribeSettingsSection((next) => void goToRef.current(next)),
    [],
  );

  return {
    state,
    serviceStatus,
    original,
    draft,
    section,
    goTo,
    query,
    setQuery,
    results,
    titleOf,
    focusSetting,
    setFocusSetting,
    commit,
    statusOf,
    changeLsp,
    resetLsp,
    saveLsp,
    lspDirty,
    lspStatus,
    migrationNotice,
    clearLegacyWindows,
    listing,
    setListing,
    mobile,
    agentDirty,
    setAgentDirty,
    agentBusy,
    setAgentBusy,
    sourceBusy,
    heading,
    close,
    confirm,
    confirmDialog,
    catalog,
    selected,
  };
}

export type SettingsForm = ReturnType<typeof useSettingsForm>;
