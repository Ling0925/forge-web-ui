import { defaultPublicSettings } from "@forge/core/shared/schemas";
import { useEffect, useRef, useState } from "react";
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
import { Field } from "../../primitives/Field";
import { Input } from "../../primitives/Input";
import { Select } from "../../primitives/Select";
import {
  type Section,
  type TextKey,
  mobilePairingSection,
  sections,
} from "./settings-options";

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
  const [section, setSection] = useState<Section>("connection");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [listing, setListing] = useState(false);
  const [mobile] = useState(() => isMobileAppHost());
  const [agentDirty, setAgentDirty] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const sourceBusy = useRef(false);
  const locked = useRef(false);
  const alive = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(createSettingsDraft(original));
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!dirtyRef.current && state.settings) {
      setOriginal(state.settings);
      setDraft(createSettingsDraft(state.settings));
    }
  }, [state.settings, state.isSettingsOpen]);

  useEffect(() => {
    if (!state.isSettingsOpen) return;
    const previous = document.activeElement;
    heading.current?.focus();
    return () => {
      if (previous instanceof HTMLElement)
        requestAnimationFrame(() => previous.focus());
    };
  }, [state.isSettingsOpen]);

  const close = () => {
    if (agentBusy) return;
    if (agentDirty) {
      if (!window.confirm("当前智能体有未保存的修改，确定离开设置吗？")) {
        return;
      }
    }
    if (!locked.current && !sourceBusy.current) openSettings(false);
  };

  useEffect(() => {
    if (!state.isSettingsOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !document.querySelector("dialog[open]") &&
        !event.isComposing
      ) {
        if (agentBusy) return;
        if (agentDirty) {
          if (!window.confirm("当前智能体有未保存的修改，确定离开设置吗？")) {
            return;
          }
        }
        event.preventDefault();
        if (!locked.current && !sourceBusy.current) openSettings(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.isSettingsOpen, openSettings, agentDirty, agentBusy]);

  const change = <K extends keyof SettingsDraft>(
    name: K,
    value: SettingsDraft[K],
  ) => {
    setDraft((old) => ({ ...old, [name]: value }));
    setNotice("");
    setError("");
  };

  const reset = () => {
    setOriginal(initial);
    setDraft(createSettingsDraft(initial));
    setError("");
    setNotice("");
  };

  const save = async () => {
    if (locked.current) return;
    setError("");
    setNotice("");
    try {
      const input = buildSettingsUpdate(draft, original, "", false);
      if (!Object.keys(input).length) {
        setNotice("没有需要保存的修改。");
        return;
      }
      locked.current = true;
      setBusy(true);
      const result = await updateSettings(input);
      if (!result.ok) throw Error(result.error);
      if (!alive.current) return;
      // Rebuild the draft from the authoritative settings the store returned so
      // server-side normalization and concurrent edits are reflected exactly.
      const next = result.settings;
      setOriginal(next);
      setDraft(createSettingsDraft(next));
      setNotice("设置已保存。执行配置用于新的运行；当前运行不会被中断。");
    } catch (err) {
      if (alive.current)
        setError(err instanceof Error ? err.message : "保存失败，草稿已保留。");
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  };

  const text = (
    name: TextKey,
    label: string,
    helper?: string,
    type = "text",
    placeholder?: string,
  ) => (
    <Field key={name} id={`setting-${name}`} label={label} helper={helper}>
      <Input
        id={`setting-${name}`}
        type={type}
        placeholder={placeholder}
        value={draft[name]}
        onChange={(e) => change(name, e.target.value)}
        aria-describedby={helper ? `setting-${name}-helper` : undefined}
      />
    </Field>
  );

  const select = (
    name: TextKey,
    label: string,
    options: { value: string; label: string }[],
    helper?: string,
  ) => (
    <Field id={`setting-${name}`} label={label} helper={helper}>
      <Select
        id={`setting-${name}`}
        value={draft[name]}
        onValueChange={(value) => change(name, value)}
        options={options}
      />
    </Field>
  );

  const catalog = mobile
    ? sections.map((item) =>
        item.id === "pairing" ? mobilePairingSection : item,
      )
    : sections;
  const matching = catalog.filter((item) =>
    `${item.title} ${item.keywords} ${item.description}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const selected = catalog.find((item) => item.id === section)!;
  const visible = (id: Section) =>
    query.trim() ? matching.some((item) => item.id === id) : section === id;

  return {
    state,
    serviceStatus,
    draft,
    section,
    setSection,
    query,
    setQuery,
    error,
    notice,
    busy,
    listing,
    setListing,
    mobile,
    agentDirty,
    setAgentDirty,
    agentBusy,
    setAgentBusy,
    sourceBusy,
    heading,
    dirty,
    close,
    change,
    reset,
    save,
    text,
    select,
    catalog,
    matching,
    selected,
    visible,
  };
}

export type SettingsForm = ReturnType<typeof useSettingsForm>;
