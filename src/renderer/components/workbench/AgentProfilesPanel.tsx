import {
  type AgentProfile,
  type AgentProfileInput,
  type AgentToolGroup,
  agentProfileInputSchema,
  agentProfileTemplates,
  agentToolGroups,
} from "@forge/core/shared/agent-profiles";
import { selectableModelIds } from "../../state/composer-model";
import {
  ArrowLeft,
  FloppyDisk,
  Plus,
  Sparkle,
  Trash,
} from "@phosphor-icons/react";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  shallowEqual,
  useWorkbenchActions,
  useWorkbenchSelector,
} from "../../state/workbench-store";
import { Button } from "../primitives/Button";
import { EmptyState } from "../primitives/EmptyState";
import { Field } from "../primitives/Field";
import { Input } from "../primitives/Input";
import { Select } from "../primitives/Select";
import { SettingsToggleCard } from "../primitives/SettingsToggleCard";
import { Textarea } from "../primitives/Textarea";
import { useDismiss } from "../primitives/useDismiss";

function isConflictError(error: string): boolean {
  return (
    error.includes("该智能体配置已被其他") ||
    error.includes("已被其他窗口或 CLI 修改") ||
    error.includes("重新加载设置") ||
    error.includes("revision") ||
    error.includes("冲突") ||
    error.includes("conflict") ||
    error.includes("expected")
  );
}

const PERMISSION_OPTIONS = [
  {
    // A role ceiling, not an independent grant: no extra restriction on the parent.
    value: "unrestricted",
    label: "继承主会话权限（推荐）",
    sub: "不额外降级；主会话免审批时，子任务无需重复审批",
  },
  {
    value: "readonly",
    label: "只读 (readonly)",
    sub: "额外限制为只读，不可修改文件或执行系统命令",
  },
  {
    value: "workspace",
    label: "工作区逐次审批 (workspace)",
    sub: "命令、浏览器、网络等操作仍需逐次用户审批",
  },
];

const ISOLATION_OPTIONS = [
  {
    value: "shared",
    label: "共享工作区 (shared)",
    sub: "与父会话在同一工作目录直接操作",
  },
  {
    value: "worktree",
    label: "独立 Git 工作树 (worktree)",
    sub: "为子代理创建隔离的 Git 分支目录（非 OS 沙箱）",
  },
];

const MODEL_MODE_OPTIONS = [
  {
    value: "inherit",
    label: "继承主模型 (inherit)",
    sub: "子代理沿用父会话选择的 Provider 与模型",
  },
  {
    value: "fixed",
    label: "固定绑定模型 (fixed)",
    sub: "指定固定的 Provider 来源与精确模型 ID",
  },
];

const TOOLS_MODE_OPTIONS = [
  {
    value: "inherit",
    label: "继承宿主工具 (inherit)",
    sub: "按子代理权限继承可用的系统与 MCP 工具",
  },
  {
    value: "restricted",
    label: "限定工具组 (restricted)",
    sub: "仅开放勾选的工具功能组或指定 MCP 服务",
  },
];

function defaultNewProfile(): AgentProfileInput {
  return {
    id: "new-agent",
    name: "新智能体角色",
    description: "描述该智能体的具体职能与工作边界",
    whenToUse: "在需要委派特定类型任务时使用",
    instructions: "针对该角色执行任务时的专属补充指令（系统提示词）。",
    enabled: true,
    model: { mode: "inherit" },
    permission: "unrestricted",
    tools: { mode: "inherit" },
    isolation: "shared",
  };
}

export function AgentProfilesPanel({
  onDirtyChange,
  onBusyChange,
}: {
  readonly onDirtyChange?: ((dirty: boolean) => void) | undefined;
  readonly onBusyChange?: ((busy: boolean) => void) | undefined;
}) {
  const { updateSettings, loadSettings } = useWorkbenchActions();
  const state = useWorkbenchSelector(
    ({ state }) => ({
      settings: state.settings,
    }),
    shallowEqual,
  );
  const profiles = useMemo(
    () => state.settings?.agentProfiles ?? [],
    [state.settings?.agentProfiles],
  );
  const providerSources = useMemo(
    () => state.settings?.providerSources ?? [],
    [state.settings?.providerSources],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentProfileInput>(defaultNewProfile);
  const [isManualInput, setIsManualInput] = useState(false);
  // Keep separators while typing; normalizing a controlled comma list on every
  // keystroke otherwise removes the comma before the next server can be entered.
  const [mcpServersText, setMcpServersText] = useState("");
  const resetDraft = (profile: AgentProfileInput) => {
    setDraft(profile);
    setMcpServersText(
      profile.tools.mode === "restricted"
        ? profile.tools.mcpServers.join(", ")
        : "",
    );
    // Unlisted values are shown as manual below, without changing the binding.
    setIsManualInput(false);
  };
  const [originalProfile, setOriginalProfile] = useState<AgentProfile | null>(
    null,
  );
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictRevision, setConflictRevision] = useState<boolean | null>(
    null,
  );
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listConflict, setListConflict] = useState(false);

  const templateMenuRef = useRef<HTMLDivElement>(null);
  const templatePopoverRef = useRef<HTMLDivElement>(null);
  const templateMenuId = useId();

  // Template menu focus and keyboard interaction
  useEffect(() => {
    if (!showTemplateMenu) return;

    templatePopoverRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
  }, [showTemplateMenu]);
  useDismiss({
    open: showTemplateMenu,
    refs: [templateMenuRef],
    onDismiss: () => setShowTemplateMenu(false),
  });

  const handleTemplateMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && showTemplateMenu) {
      event.preventDefault();
      event.stopPropagation();
      setShowTemplateMenu(false);
      templateMenuRef.current
        ?.querySelector<HTMLButtonElement>("#agent-template-menu-trigger")
        ?.focus({ preventScroll: true });
      return;
    }

    if (event.key === "Tab" && showTemplateMenu) {
      setShowTemplateMenu(false);
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    if (!showTemplateMenu) {
      if (!busy) setShowTemplateMenu(true);
      return;
    }

    const items = Array.from(
      templatePopoverRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not(:disabled)',
      ) ?? [],
    );
    if (!items.length) return;

    const currentIndex = items.findIndex(
      (item) => item === document.activeElement,
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (currentIndex +
              (event.key === "ArrowDown" ? 1 : -1) +
              items.length) %
            items.length;
    items[nextIndex]?.focus({ preventScroll: true });
  };

  const fixedModel = draft.model.mode === "fixed" ? draft.model : undefined;
  const currentFixedSource = providerSources.find(
    (s) => s.id === fixedModel?.providerSourceId,
  );
  const availableModelIds = useMemo(
    () => (currentFixedSource ? selectableModelIds(currentFixedSource) : []),
    [currentFixedSource],
  );
  const showManualModel =
    isManualInput || !availableModelIds.includes(fixedModel?.model ?? "");
  const providerSourceOptions = [
    ...(fixedModel?.providerSourceId && !currentFixedSource
      ? [
          {
            value: fixedModel.providerSourceId,
            label: `${fixedModel.providerSourceId}（未找到配置）`,
            sub: "已保留原绑定来源",
            disabled: true,
          },
        ]
      : []),
    ...providerSources.map((s) => ({
      value: s.id,
      label: s.label || s.id,
      sub: `来源 ID: ${s.id}`,
    })),
  ];
  const modelOptions = [
    ...availableModelIds.map((id) => ({ value: id, label: id })),
    {
      value: "",
      label: "手动输入模型 ID…",
      sub: "自定义或未列入可选列表的精确模型 ID",
    },
  ];
  // Only an explicit source change chooses a new default; opening an existing
  // profile or refreshing settings must never rewrite its saved model.
  const selectFixedSource = (sourceId: string) => {
    const source = providerSources.find((s) => s.id === sourceId);
    const models = source ? selectableModelIds(source) : [];
    setDraft({
      ...draft,
      model: {
        mode: "fixed",
        providerSourceId: sourceId,
        model:
          source && models.includes(source.model)
            ? source.model
            : (models[0] ?? ""),
      },
    });
    setIsManualInput(false);
  };

  // Compute dirty flag
  const isDirty = useMemo(() => {
    if (!editingId) return false;
    if (isNew) return true;
    if (!originalProfile) return false;
    const { revision: _rev, ...origWithoutRev } = originalProfile;
    return JSON.stringify(draft) !== JSON.stringify(origWithoutRev);
  }, [editingId, isNew, originalProfile, draft]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  // Unmount cleanup: reset dirty and busy flags so they don't block other navigation
  useEffect(() => {
    return () => {
      onDirtyChange?.(false);
      onBusyChange?.(false);
    };
  }, [onDirtyChange, onBusyChange]);

  const handleStartCreate = (template?: AgentProfileInput) => {
    if (busy) return;
    const base = template ? { ...template } : defaultNewProfile();
    let targetId = base.id;
    if (profiles.some((p) => p.id === targetId)) {
      let counter = 1;
      while (profiles.some((p) => p.id === `${base.id}-${counter}`)) {
        counter++;
      }
      targetId = `${base.id}-${counter}`;
    }
    const finalDraft: AgentProfileInput = { ...base, id: targetId };
    resetDraft(finalDraft);
    setOriginalProfile(null);
    setIsNew(true);
    setEditingId(targetId);
    setStatusMessage(null);
    setErrorMessage(null);
    setConflictRevision(null);
    setListConflict(false);
    setShowTemplateMenu(false);
  };

  const handleStartEdit = (profile: AgentProfile) => {
    if (busy) return;
    const { revision: _rev, ...input } = profile;
    resetDraft(input);
    setOriginalProfile(profile);
    setIsNew(false);
    setEditingId(profile.id);
    setStatusMessage(null);
    setErrorMessage(null);
    setConflictRevision(null);
    setListConflict(false);
  };

  const handleDuplicate = (profile: AgentProfile) => {
    if (busy) return;
    let suffix = "-copy";
    let newId = `${profile.id.slice(0, 64 - suffix.length)}${suffix}`;
    let counter = 1;
    while (profiles.some((p) => p.id === newId)) {
      suffix = `-copy-${counter++}`;
      newId = `${profile.id.slice(0, 64 - suffix.length)}${suffix}`;
    }
    const { revision: _rev, ...input } = profile;
    const duplicated: AgentProfileInput = {
      ...input,
      id: newId,
      name: `${profile.name.slice(0, 75)} (副本)`,
    };
    resetDraft(duplicated);
    setOriginalProfile(null);
    setIsNew(true);
    setEditingId(newId);
    setStatusMessage(null);
    setErrorMessage(null);
    setConflictRevision(null);
    setListConflict(false);
  };

  const handleCancelEdit = () => {
    if (busy) return;
    if (isDirty) {
      if (
        !window.confirm(
          "当前智能体有未保存的修改，离开将丢失这些内容。是否继续？",
        )
      ) {
        return;
      }
    }
    setEditingId(null);
    setOriginalProfile(null);
    setConflictRevision(null);
    setListConflict(false);
    setErrorMessage(null);
    setStatusMessage(null);
  };

  const handleToggleEnabled = async (profile: AgentProfile) => {
    if (busy) return;
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const { revision, ...input } = profile;
      const updatedInput: AgentProfileInput = {
        ...input,
        enabled: !profile.enabled,
      };
      const res = await updateSettings({
        agent: {
          type: "save",
          profile: updatedInput,
          expectedRevision: revision,
        },
      });
      if (res.ok) {
        setStatusMessage(
          `已${updatedInput.enabled ? "启用" : "停用"}智能体「${profile.name}」`,
        );
        setListConflict(false);
      } else {
        setErrorMessage(res.error);
        if (isConflictError(res.error)) {
          setListConflict(true);
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "更新智能体状态失败",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (profile: AgentProfile) => {
    if (busy) return;
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await updateSettings({
        agent: {
          type: "remove",
          id: profile.id,
          expectedRevision: profile.revision,
        },
      });
      if (res.ok) {
        setStatusMessage(`已删除智能体「${profile.name}」`);
        setDeletingId(null);
        setListConflict(false);
        if (editingId === profile.id) {
          setEditingId(null);
          setOriginalProfile(null);
        }
      } else {
        setErrorMessage(res.error);
        if (isConflictError(res.error)) {
          setListConflict(true);
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "删除智能体失败");
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (busy) return;
    setErrorMessage(null);
    setStatusMessage(null);

    // Validation
    const cleanDraft: AgentProfileInput = {
      ...draft,
      id: draft.id.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      whenToUse: draft.whenToUse.trim(),
      instructions: draft.instructions.trim(),
    };

    if (cleanDraft.model.mode === "fixed") {
      if (!cleanDraft.model.providerSourceId.trim()) {
        setErrorMessage("请选择或填写有效的 Provider 来源标识。");
        return;
      }
      if (!cleanDraft.model.model.trim()) {
        setErrorMessage("请输入固定的模型 ID，不能为空。");
        return;
      }
    }

    const parseResult = agentProfileInputSchema.safeParse(cleanDraft);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      setErrorMessage(`配置校验未通过：${issues}`);
      return;
    }

    const savePayload = parseResult.data;
    const expectedRevision = isNew ? 0 : (originalProfile?.revision ?? 0);

    setBusy(true);
    try {
      const res = await updateSettings({
        agent: {
          type: "save",
          profile: savePayload,
          expectedRevision,
        },
      });

      if (res.ok) {
        setStatusMessage("智能体保存成功。配置仅影响后续派发的子任务。");
        const saved = res.settings?.agentProfiles?.find(
          (p) => p.id === savePayload.id,
        );
        if (saved) {
          const { revision: _rev, ...cleanSaved } = saved;
          resetDraft(cleanSaved);
          setOriginalProfile(saved);
          setIsNew(false);
        } else {
          // Revisions are host-assigned, globally monotonic tokens, not +1 per ID.
          setStatusMessage(null);
          setErrorMessage(
            "服务端未返回已保存的角色，草稿已保留。请刷新配置确认结果，不要重复提交。",
          );
          setConflictRevision(true);
          return;
        }
        setConflictRevision(null);
        setErrorMessage(null);
      } else {
        // Detect conflict
        if (isConflictError(res.error)) {
          setConflictRevision(true);
          setErrorMessage(
            "版本冲突：该智能体已被其他操作更新。当前草稿已保留，请选择刷新最新版本或放弃。",
          );
        } else {
          setErrorMessage(res.error);
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "保存请求失败");
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshFromHost = async () => {
    if (
      !window.confirm(
        "刷新将从服务器拉取最新配置，并放弃当前草稿。确定继续吗？",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const latestSettings = await loadSettings();
      if (!latestSettings)
        throw new Error("未能读取服务器配置，当前草稿已保留。");
      if (latestSettings.agentProfiles) {
        const latest = latestSettings.agentProfiles.find(
          (p) => p.id === draft.id,
        );
        if (latest) {
          const { revision: _rev, ...cleanSaved } = latest;
          resetDraft(cleanSaved);
          setOriginalProfile(latest);
          setIsNew(false);
        } else {
          setEditingId(null);
        }
      } else {
        setEditingId(null);
      }
      setConflictRevision(null);
      setErrorMessage(null);
      setStatusMessage("已同步最新服务器配置。");
    } catch (err) {
      setErrorMessage(
        `拉取最新配置失败：${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshListFromHost = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const latestSettings = await loadSettings();
      if (!latestSettings) {
        throw new Error("未能读取服务器配置，请稍后重试。");
      }
      setDeletingId(null);
      setListConflict(false);
      setErrorMessage(null);
      setStatusMessage("已同步最新服务器配置。");
    } catch (err) {
      setErrorMessage(
        `拉取最新配置失败：${err instanceof Error ? err.message : String(err)}`,
      );
      setListConflict(true);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleToolGroup = (group: AgentToolGroup) => {
    if (draft.tools.mode !== "restricted") return;
    const currentGroups = draft.tools.groups;
    const exists = currentGroups.includes(group);
    const nextGroups = exists
      ? currentGroups.filter((g) => g !== group)
      : [...currentGroups, group];
    setDraft({
      ...draft,
      tools: {
        ...draft.tools,
        groups: nextGroups,
      },
    });
  };

  // 1. If currently editing a profile
  if (editingId) {
    return (
      <div
        className="agent-editor-wrapper"
        role="region"
        aria-label="智能体编辑器"
      >
        <div className="agent-editor-header">
          <Button
            size="sm"
            variant="ghost"
            icon={<ArrowLeft size={14} weight="bold" />}
            onClick={handleCancelEdit}
            disabled={busy}
          >
            返回列表
          </Button>
          <div className="agent-editor-title-wrap">
            <h3>{isNew ? "新建智能体角色" : `编辑智能体：${draft.name}`}</h3>
            {isDirty && <span className="agent-draft-badge">未保存草稿</span>}
          </div>
        </div>

        {errorMessage && (
          <div role="alert" className="form-error">
            <span>{errorMessage}</span>
            {conflictRevision && (
              <div className="agent-conflict-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleRefreshFromHost()}
                  disabled={busy}
                >
                  刷新为最新配置
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  disabled={busy}
                >
                  放弃修改
                </Button>
              </div>
            )}
          </div>
        )}

        {statusMessage && (
          <div role="status" className="form-notice">
            {statusMessage}
          </div>
        )}

        {/* Section 1: 基础信息 */}
        <div className="agent-editor-section">
          <h4 className="agent-editor-section-title">基本信息</h4>

          <Field
            id="agent-input-id"
            label="智能体 ID"
            helper="以小写字母开头的字母、数字、下划线或连字符，最长 64 字符。创建后不可更改。"
          >
            <Input
              id="agent-input-id"
              value={draft.id}
              disabled={!isNew || busy}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                })
              }
              placeholder="例如: frontend-specialist"
              maxLength={64}
            />
          </Field>

          <Field
            id="agent-input-name"
            label="智能体名称"
            helper="在子任务卡片与会话列表中展示的名称（最长 80 字符）。"
          >
            <Input
              id="agent-input-name"
              value={draft.name}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="例如: 前端设计与实现"
              maxLength={80}
            />
          </Field>

          <Field
            id="agent-input-desc"
            label="简要描述"
            helper="简明阐述该智能体的职责与特点（最长 512 字符）。"
          >
            <Input
              id="agent-input-desc"
              value={draft.description}
              disabled={busy}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              placeholder="例如: 负责界面组件、交互状态与响应式样式的开发与验证。"
              maxLength={512}
            />
          </Field>

          <Field
            id="agent-input-when"
            label="适用场景 (whenToUse)"
            helper="说明何时主代理应该委派此角色（最长 1024 字符）。"
          >
            <Textarea
              id="agent-input-when"
              value={draft.whenToUse}
              disabled={busy}
              onChange={(e) =>
                setDraft({ ...draft, whenToUse: e.target.value })
              }
              rows={2}
              placeholder="例如: 需要实现或修复 React 组件、响应式布局及界面样式时。"
              maxLength={1024}
            />
          </Field>

          <Field
            id="agent-input-instructions"
            label="系统指令 (instructions)"
            helper="为该角色注入的专属任务边界与执行要求（最长 16384 字符）。"
          >
            <Textarea
              id="agent-input-instructions"
              value={draft.instructions}
              disabled={busy}
              onChange={(e) =>
                setDraft({ ...draft, instructions: e.target.value })
              }
              rows={5}
              placeholder="例如: 严格遵循设计规范，优先使用既有 Token，不引入新外部依赖。"
              maxLength={16384}
            />
          </Field>

          <SettingsToggleCard
            title="启用该智能体角色"
            description="停用后，主代理将不再委派此角色，现有历史会话不受影响。"
            checked={draft.enabled}
            onChange={(checked) => setDraft({ ...draft, enabled: checked })}
            disabled={busy}
          />
        </div>

        {/* Section 2: 模型配置 */}
        <div className="agent-editor-section">
          <h4 className="agent-editor-section-title">模型选择</h4>

          <Field
            id="agent-select-model-mode"
            label="模型模式"
            helper="选择继承主代理当前模型，或固定绑定特定的 Provider 来源与模型 ID。"
          >
            <Select
              aria-label="模型模式选择"
              value={draft.model.mode}
              options={MODEL_MODE_OPTIONS}
              disabled={busy}
              onValueChange={(val) => {
                if (val === draft.model.mode) return;
                if (val === "inherit") {
                  setDraft({ ...draft, model: { mode: "inherit" } });
                  setIsManualInput(false);
                } else {
                  const preferredSource =
                    providerSources.find(
                      (s) => s.id === state.settings?.activeSourceId,
                    ) ?? providerSources[0];
                  selectFixedSource(preferredSource?.id ?? "");
                }
              }}
            />
          </Field>

          {draft.model.mode === "fixed" && (
            <div className="agent-fixed-model-fields">
              {providerSources.length === 0 && (
                <p className="agent-help-callout" role="alert">
                  当前尚未配置任何模型服务来源。请先前往「模型连接」添加可用来源后再绑定固定模型。
                </p>
              )}

              {draft.model.providerSourceId &&
                providerSources.length > 0 &&
                !currentFixedSource && (
                  <p className="agent-help-callout" role="alert">
                    绑定的 Provider 来源（{draft.model.providerSourceId}
                    ）未在当前已配置来源中找到，已保留原绑定。
                  </p>
                )}

              <Field
                id="agent-input-source"
                label="Provider 来源标识"
                helper="必须为已配置的来源标识，只保存来源标识，不复制密钥。"
              >
                {providerSources.length > 0 ? (
                  <Select
                    aria-label="Provider 来源"
                    value={draft.model.providerSourceId}
                    options={providerSourceOptions}
                    disabled={busy}
                    onValueChange={(val) => {
                      if (val !== fixedModel?.providerSourceId)
                        selectFixedSource(val);
                    }}
                  />
                ) : (
                  <Input
                    id="agent-input-source"
                    value={draft.model.providerSourceId}
                    disabled={busy}
                    onChange={(e) => {
                      if (draft.model.mode === "fixed") {
                        setDraft({
                          ...draft,
                          model: {
                            ...draft.model,
                            providerSourceId: e.target.value
                              .trim()
                              .toLowerCase(),
                          },
                        });
                      }
                    }}
                    placeholder="例如: default"
                  />
                )}
              </Field>

              {providerSources.length > 0 && (
                <Field
                  id="agent-select-model"
                  label="已配置模型"
                  helper="从当前 Provider 已配置的模型列表中直接选择，或选择手动输入精确 ID。"
                >
                  <Select
                    aria-label="智能体模型"
                    id="agent-select-model"
                    className="agent-model-select"
                    contentClassName="agent-model-select-content"
                    value={showManualModel ? "" : draft.model.model}
                    options={modelOptions}
                    disabled={busy}
                    onValueChange={(val) => {
                      if (!fixedModel) return;
                      setIsManualInput(val === "");
                      if (val)
                        setDraft({
                          ...draft,
                          model: { ...fixedModel, model: val },
                        });
                    }}
                  />
                </Field>
              )}

              {availableModelIds.length === 0 && currentFixedSource && (
                <p className="agent-help-callout" role="note">
                  该 Provider
                  来源未列出可用模型。可前往「模型连接」配置可选模型，或手动输入精确模型
                  ID。
                </p>
              )}

              {currentFixedSource &&
                availableModelIds.length > 0 &&
                draft.model.model &&
                !availableModelIds.includes(draft.model.model) && (
                  <p className="agent-help-callout" role="note">
                    当前模型 ID（{draft.model.model}
                    ）未在来源已配置模型列表中。可保留此
                    ID，或从上方选择已配置模型。
                  </p>
                )}

              {showManualModel && (
                <Field
                  id="agent-input-model"
                  label="精确模型 ID"
                  helper="原样保留完整模型 ID（含冒号或斜杠，不作来源分隔符）。精确匹配，不虚构模型。"
                >
                  <Input
                    id="agent-input-model"
                    value={draft.model.model}
                    disabled={busy}
                    onChange={(e) => {
                      if (draft.model.mode === "fixed") {
                        setIsManualInput(true);
                        setDraft({
                          ...draft,
                          model: {
                            ...draft.model,
                            model: e.target.value.trim(),
                          },
                        });
                      }
                    }}
                    placeholder="例如: cn:deepseek-v4.1-flash"
                  />
                </Field>
              )}
            </div>
          )}
        </div>

        {/* Section 3: 权限上限与隔离 */}
        <div className="agent-editor-section">
          <h4 className="agent-editor-section-title">权限上限与工作树隔离</h4>

          <Field
            id="agent-select-permission"
            label="权限策略（主会话为上限）"
            helper="默认继承主会话；仅需额外限制角色时选择只读或逐次审批。"
          >
            <Select
              aria-label="权限上限选择"
              value={draft.permission}
              options={PERMISSION_OPTIONS}
              disabled={busy}
              onValueChange={(val) =>
                setDraft({
                  ...draft,
                  permission: val as "readonly" | "workspace" | "unrestricted",
                })
              }
            />
          </Field>

          <div className="agent-help-callout">
            <strong>权限继承说明：</strong>
            继承模式不增加子任务审批：主会话免审批，子任务也免审批；主会话需要审批，子任务仍遵守同一规则。只读、计划模式和工具组限制不能被绕过，父会话降权也会同步收紧子任务。权限不会超过子任务创建时的主会话权限。
          </div>
          {draft.permission === "workspace" && (
            <div className="agent-help-callout" role="note">
              <strong>当前角色仍需逐次用户审批：</strong>
              该上限会让免审批主会话的子任务也停下来等待审批。需要长任务托管时，请选择“继承主会话权限”并保存。已保存的旧配置不会自动放宽，修改仅影响后续新派发的子任务。
            </div>
          )}

          <Field
            id="agent-select-isolation"
            label="工作树隔离 (isolation)"
            helper="选择子代理的执行与写入目录隔离方式。"
          >
            <Select
              aria-label="工作树隔离选择"
              value={draft.isolation}
              options={ISOLATION_OPTIONS}
              disabled={busy}
              onValueChange={(val) =>
                setDraft({
                  ...draft,
                  isolation: val as "shared" | "worktree",
                })
              }
            />
          </Field>

          <div className="agent-help-callout">
            <strong>工作树非沙箱说明：</strong>
            worktree 模式基于独立 Git
            工作树提供文件读写分支隔离，便于比对与并发开发；但它并非 OS
            或进程沙箱，命令执行仍遵守宿主审批与权限。只读模式下不创建工作树。
          </div>
        </div>

        {/* Section 4: 可用工具组 */}
        <div className="agent-editor-section">
          <h4 className="agent-editor-section-title">工具策略</h4>

          <Field
            id="agent-select-tools-mode"
            label="工具模式"
            helper="继承宿主工具或限定可用工具组列表。"
          >
            <Select
              aria-label="工具模式选择"
              value={draft.tools.mode}
              options={TOOLS_MODE_OPTIONS}
              disabled={busy}
              onValueChange={(val) => {
                setMcpServersText("");
                if (val === "inherit") {
                  setDraft({ ...draft, tools: { mode: "inherit" } });
                } else {
                  setDraft({
                    ...draft,
                    tools: {
                      mode: "restricted",
                      groups: ["read"],
                      mcpServers: [],
                    },
                  });
                }
              }}
            />
          </Field>

          {draft.tools.mode === "restricted" && (
            <div className="agent-restricted-tools-wrap">
              <label className="agent-tools-label">勾选允许的工具组：</label>
              <div className="agent-tools-grid">
                {agentToolGroups.map((group) => {
                  const checked =
                    draft.tools.mode === "restricted" &&
                    draft.tools.groups.includes(group.id);
                  return (
                    <SettingsToggleCard
                      key={group.id}
                      title={group.label}
                      description={group.description}
                      checked={checked}
                      onChange={() => handleToggleToolGroup(group.id)}
                      disabled={busy}
                    />
                  );
                })}
              </div>

              {draft.tools.groups.includes("mcp") && (
                <Field
                  id="agent-input-mcp-servers"
                  label="允许的 MCP 服务器列表"
                  helper="以逗号分隔服务器名称。MCP 工具仅允许访问此处明确列出且已启用的 MCP 服务。"
                >
                  <Input
                    id="agent-input-mcp-servers"
                    value={mcpServersText}
                    disabled={busy}
                    onChange={(e) => {
                      setMcpServersText(e.target.value);
                      if (draft.tools.mode === "restricted") {
                        const servers = e.target.value
                          .split(",")
                          .map((s) => s.trim().toLowerCase())
                          .filter(Boolean);
                        setDraft({
                          ...draft,
                          tools: {
                            ...draft.tools,
                            mcpServers: servers,
                          },
                        });
                      }
                    }}
                    placeholder="例如: github, memory"
                  />
                </Field>
              )}
            </div>
          )}

          <div className="agent-help-callout">
            <strong>配置生效说明：</strong>
            此处保存的智能体配置仅影响后续派发的子任务，不会修改正在运行中或历史会话的角色快照。
          </div>
        </div>

        {/* Save action bar */}
        <div className="settings-card-action-row agent-editor-actions">
          <Button
            variant="primary"
            icon={<FloppyDisk size={14} weight="bold" />}
            onClick={() => void handleSave()}
            disabled={busy || !draft.name.trim() || !draft.id.trim()}
          >
            {busy ? "正在保存…" : "保存智能体角色"}
          </Button>
          <Button variant="ghost" onClick={handleCancelEdit} disabled={busy}>
            取消
          </Button>
        </div>
      </div>
    );
  }

  // 2. Profile list view
  return (
    <div
      className="agent-profiles-panel wb-stack"
      role="region"
      aria-label="智能体角色配置"
    >
      <div className="agent-list-toolbar">
        <span className="agent-count-badge">
          已配置 {profiles.length} / 64 个智能体
        </span>
        <div className="agent-list-actions">
          <div
            ref={templateMenuRef}
            className="agent-template-menu-container"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setShowTemplateMenu(false);
              }
            }}
            onKeyDown={handleTemplateMenuKeyDown}
          >
            <Button
              id="agent-template-menu-trigger"
              size="sm"
              variant="secondary"
              icon={<Sparkle size={13} weight="bold" />}
              onClick={() => setShowTemplateMenu((prev) => !prev)}
              disabled={busy}
              aria-haspopup="menu"
              aria-expanded={showTemplateMenu}
              aria-controls={showTemplateMenu ? templateMenuId : undefined}
            >
              从模板添加
            </Button>
            {showTemplateMenu && (
              <div
                ref={templatePopoverRef}
                id={templateMenuId}
                className="agent-template-popover"
                role="menu"
                aria-labelledby="agent-template-menu-trigger"
              >
                {agentProfileTemplates.map((tmpl) => (
                  <button
                    type="button"
                    key={tmpl.id}
                    className="agent-template-item"
                    role="menuitem"
                    onClick={() => handleStartCreate(tmpl)}
                  >
                    <strong>{tmpl.name}</strong>
                    <small>{tmpl.description}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="primary"
            icon={<Plus size={13} weight="bold" />}
            onClick={() => handleStartCreate()}
            disabled={busy}
          >
            新建智能体
          </Button>
        </div>
      </div>

      {statusMessage && (
        <div role="status" className="form-notice">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="form-error">
          <span>{errorMessage}</span>
          {listConflict && (
            <div className="agent-conflict-actions">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleRefreshListFromHost()}
                disabled={busy}
              >
                刷新为最新配置
              </Button>
            </div>
          )}
        </div>
      )}

      {profiles.length === 0 ? (
        <EmptyState
          variant="inline"
          title="尚未配置任何智能体角色"
          description="主代理在委派并行或专项任务时，将使用默认行为。你可以从预置模板快速添加角色："
          action={agentProfileTemplates.map((tmpl) => (
            <Button
              key={tmpl.id}
              size="sm"
              variant="secondary"
              icon={<Plus size={14} />}
              onClick={() => handleStartCreate(tmpl)}
              disabled={busy}
            >
              {tmpl.name}
            </Button>
          ))}
        />
      ) : (
        <div className="agent-profiles-list">
          {profiles.map((profile) => {
            const isDeleting = deletingId === profile.id;
            return (
              <article
                key={profile.id}
                className={`agent-profile-card ${profile.enabled ? "is-enabled" : "is-disabled"}`}
                aria-label={`智能体：${profile.name}`}
              >
                <div className="agent-profile-header">
                  <div className="agent-profile-identity">
                    <strong className="agent-profile-name">
                      {profile.name}
                    </strong>
                    <code className="agent-profile-id">{profile.id}</code>
                  </div>
                  <div className="agent-profile-meta-row">
                    <span
                      className={`agent-profile-badge ${profile.enabled ? "is-enabled" : "is-disabled"}`}
                    >
                      {profile.enabled ? "已启用" : "已停用"}
                    </span>
                    <span className="agent-profile-badge">
                      权限：
                      {profile.permission === "unrestricted"
                        ? "继承主会话"
                        : profile.permission === "workspace"
                          ? "逐次审批"
                          : "只读"}
                    </span>
                    <span className="agent-profile-badge">
                      隔离：{profile.isolation}
                    </span>
                    <span className="agent-profile-badge">
                      模型：
                      {profile.model.mode === "inherit"
                        ? "继承主模型"
                        : `${profile.model.providerSourceId}/${profile.model.model}`}
                    </span>
                  </div>
                </div>

                <p className="agent-profile-desc">{profile.description}</p>
                {profile.whenToUse && (
                  <p className="agent-profile-when">
                    适用场景：{profile.whenToUse}
                  </p>
                )}

                <div className="agent-profile-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleStartEdit(profile)}
                    disabled={busy}
                  >
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDuplicate(profile)}
                    disabled={busy}
                  >
                    复制
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleToggleEnabled(profile)}
                    disabled={busy}
                  >
                    {profile.enabled ? "停用" : "启用"}
                  </Button>

                  {isDeleting ? (
                    <div className="agent-delete-confirm">
                      <span className="agent-delete-confirm-text">
                        确认删除？此操作不可逆
                      </span>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => void handleDelete(profile)}
                        disabled={busy}
                      >
                        确定删除
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeletingId(null)}
                        disabled={busy}
                      >
                        取消
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="agent-delete-btn"
                      icon={<Trash size={13} />}
                      onClick={() => setDeletingId(profile.id)}
                      disabled={busy}
                      aria-label={`删除智能体 ${profile.name}`}
                    >
                      删除
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
