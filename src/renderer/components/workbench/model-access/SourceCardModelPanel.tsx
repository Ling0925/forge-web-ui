import type {
  ModelCatalog,
  ModelCatalogEntry,
} from "@forge/core/shared/model-catalog";
import { PencilSimple, Plus, X } from "@phosphor-icons/react";
import { useState } from "react";
import {
  configuredModelIds,
  selectableModelIds,
} from "../../../state/composer-model";
import { Button } from "../../primitives/Button";
import { EmptyState } from "../../primitives/EmptyState";
import { Input } from "../../primitives/Input";
import { Tag } from "../../primitives/Tag";
import {
  ModelEditDialog,
  contextWindowText,
  upstreamModelValues,
} from "./ModelEditDialog";
import {
  type EditableModelSelection,
  formatTokens,
  protocolOptions,
} from "./drafts";
import {
  clearModelOverride,
  effortName,
  hasModelOverride,
} from "./model-overrides";

const protocolName = (value: string) =>
  protocolOptions.find((item) => item.value === value)?.label ?? value;

export function SourceCardModelPanel({
  sourceLabel,
  catalog,
  loading,
  error,
  protocol,
  model,
  selection,
  disabled,
  legacyWindows,
  onCommit,
}: {
  readonly sourceLabel: string;
  readonly catalog: ModelCatalog;
  readonly loading: boolean;
  readonly error: string | undefined;
  /** Display name of the source's protocol. */
  readonly protocol: string;
  readonly model: string;
  readonly selection: EditableModelSelection;
  readonly disabled: boolean;
  /** Legacy global per-model windows that Core still applies first. */
  readonly legacyWindows?: Readonly<Record<string, number | null>> | undefined;
  /** Persist the source's default model and model selection immediately. */
  readonly onCommit: (
    model: string,
    selection: EditableModelSelection,
  ) => Promise<boolean>;
}) {
  const onModel = (value: string) => void onCommit(value, selection);
  const onSelection = (value: EditableModelSelection) =>
    void onCommit(model, value);
  const [editing, setEditing] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [visible, setVisible] = useState(24);

  const byId = new Map<string, ModelCatalogEntry>();
  for (const entry of selection.manual) byId.set(entry.id, entry);
  for (const entry of catalog) byId.set(entry.id, entry);
  for (const id of Object.keys(selection.overrides ?? {})) {
    if (!byId.has(id)) {
      byId.set(id, { id, contextWindowTokens: null });
    }
  }
  const defaultModelId = model.trim();
  if (defaultModelId && !byId.has(defaultModelId)) {
    byId.set(defaultModelId, { id: defaultModelId, contextWindowTokens: null });
  }

  const configuredIds = configuredModelIds({
    model: defaultModelId,
    modelSelection: selection,
  });
  const configuredSet = new Set(configuredIds);

  const configuredEntries = configuredIds.map(
    (id) => byId.get(id) ?? { id, contextWindowTokens: null },
  );

  const allEntries = [...byId.values()];
  const needle = query.trim().toLowerCase();
  const pickerEntries = allEntries.filter((entry) => {
    if (!needle) return true;
    return (
      entry.id.toLowerCase().includes(needle) ||
      Boolean(entry.displayName?.toLowerCase().includes(needle))
    );
  });

  const addModelToCards = (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) return;
    // Persist even a model with all-default parameters. Do not snapshot upstream
    // capability values into manual metadata, which would freeze future refreshes.
    onSelection({
      ...selection,
      ...(selection.mode === "selected"
        ? { models: [...new Set([...selection.models, trimmed])] }
        : {}),
      manual: selection.manual.some((entry) => entry.id === trimmed)
        ? selection.manual
        : [...selection.manual, { id: trimmed, contextWindowTokens: null }],
    });
    setPickerOpen(false);
    setQuery("");
  };

  const addManualModel = () => {
    addModelToCards(manualInput);
    setManualInput("");
  };

  const removeModelCard = (id: string) => {
    onSelection({
      ...clearModelOverride(selection, id),
      manual: selection.manual.filter((entry) => entry.id !== id),
      models: selection.models.filter((modelId) => modelId !== id),
    });
  };

  const enabledSet = new Set(
    selectableModelIds({ model: defaultModelId, modelSelection: selection }),
  );
  const toggleEnabled = (id: string) =>
    onSelection({
      ...selection,
      models: selection.models.includes(id)
        ? selection.models.filter((value) => value !== id)
        : [...selection.models, id],
    });
  const editingEntry = editing
    ? configuredEntries.find((entry) => entry.id === editing)
    : undefined;

  return (
    <div
      className="provider-card-models-panel"
      aria-label={`${sourceLabel} 模型参数配置`}
    >
      <div className="provider-configured-header">
        <div className="provider-configured-title-group">
          <h4 className="provider-configured-title">模型</h4>
          <span className="provider-configured-count">
            {configuredEntries.length} 个
          </span>
          <span className="provider-configured-subtitle">
            {selection.mode === "none"
              ? "此来源设置为不提供模型；可在“编辑来源”中调整"
              : selection.mode === "selected"
                ? "输入框只显示已启用的模型"
                : "输入框显示这里列出的全部模型"}
          </span>
        </div>
        <div className="provider-configured-actions">
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus size={14} />}
            aria-expanded={pickerOpen}
            aria-label={`为${sourceLabel}添加模型`}
            disabled={disabled}
            onClick={() => setPickerOpen((open) => !open)}
          >
            {pickerOpen ? "收起" : "添加模型"}
          </Button>
        </div>
      </div>

      {pickerOpen && (
        <div
          className="provider-model-picker-drawer"
          aria-label={`${sourceLabel} 选择模型添加配置`}
        >
          <div className="provider-model-picker-toolbar">
            <div className="provider-card-models-search">
              <Input
                aria-label={`搜索${sourceLabel}的模型`}
                value={query}
                placeholder={`从目录 (${allEntries.length}) 中搜索模型 ID 或名称…`}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisible(24);
                }}
              />
            </div>
            <div className="provider-card-manual-add">
              <Input
                aria-label={`添加${sourceLabel}的手工模型`}
                value={manualInput}
                placeholder="或直接输入模型 ID…"
                onChange={(event) => setManualInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addManualModel();
                  }
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus size={14} />}
                disabled={disabled || !manualInput.trim()}
                onClick={addManualModel}
              >
                添加
              </Button>
            </div>
          </div>

          <div className="provider-picker-model-list" aria-busy={loading}>
            {pickerEntries.length > 0 ? (
              pickerEntries.slice(0, visible).map((entry) => {
                const alreadyAdded = configuredSet.has(entry.id);
                return (
                  <div
                    key={entry.id}
                    className={`provider-picker-model-row${alreadyAdded ? " is-added" : ""}`}
                  >
                    <div className="provider-picker-model-info">
                      <code>{entry.id}</code>
                      {entry.displayName && entry.displayName !== entry.id && (
                        <span className="provider-card-model-name">
                          {entry.displayName}
                        </span>
                      )}
                      <span className="provider-picker-model-meta">
                        上下文 {formatTokens(entry.contextWindowTokens)} · 输出{" "}
                        {formatTokens(entry.maxOutputTokens)}
                      </span>
                    </div>
                    {alreadyAdded ? (
                      <span className="provider-picker-added-badge">
                        已添加
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="provider-picker-add-btn"
                        disabled={disabled}
                        aria-label={`添加模型 ${entry.id}`}
                        onClick={() => addModelToCards(entry.id)}
                      >
                        <Plus size={12} aria-hidden="true" />
                        <span>添加</span>
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="provider-card-models-empty">
                {loading
                  ? "正在加载模型目录…"
                  : error || "未找到匹配的模型，可直接输入自定义模型 ID 添加。"}
              </p>
            )}
          </div>

          {pickerEntries.length > visible && (
            <div className="provider-card-models-more">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setVisible((count) => count + 24)}
              >
                显示更多（剩余 {pickerEntries.length - visible}）
              </Button>
            </div>
          )}
        </div>
      )}

      {configuredEntries.length > 0 ? (
        <div className="configured-models-grid">
          {configuredEntries.map((entry) => {
            const override = selection.overrides?.[entry.id];
            const overridden = hasModelOverride(override);
            const isDefaultModel = defaultModelId === entry.id;
            const upstream = upstreamModelValues(entry);
            const enabled = enabledSet.has(entry.id);
            const effort = override?.reasoningEffort;
            return (
              <article
                key={entry.id}
                className={`configured-model-card${overridden ? " is-customized" : ""}${isDefaultModel ? " is-default" : ""}${enabled ? "" : " is-disabled"}`}
                aria-label={`模型 ${entry.id}`}
              >
                <div className="configured-model-card-head">
                  <div className="configured-model-card-identity">
                    <code className="provider-card-model-id" title={entry.id}>
                      {entry.id}
                    </code>
                    {entry.displayName && entry.displayName !== entry.id && (
                      <span className="provider-card-model-name">
                        {entry.displayName}
                      </span>
                    )}
                  </div>
                  {!isDefaultModel && (
                    <button
                      type="button"
                      className="configured-model-remove-btn"
                      disabled={disabled}
                      title="从列表中移除"
                      aria-label={`移除模型 ${entry.id}`}
                      onClick={() => removeModelCard(entry.id)}
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="configured-model-card-tags">
                  {isDefaultModel && <Tag tone="accent">默认</Tag>}
                  <Tag tone={enabled ? "success" : "muted"}>
                    {enabled ? "已启用" : "未启用"}
                  </Tag>
                  {overridden && <Tag tone="muted">已自定义</Tag>}
                </div>
                <dl className="configured-model-card-facts">
                  <div>
                    <dt>协议</dt>
                    <dd>
                      {override?.apiMode
                        ? protocolName(override.apiMode)
                        : protocol}
                    </dd>
                  </div>
                  <div>
                    <dt>上下文</dt>
                    <dd>
                      {contextWindowText(
                        override?.contextWindowTokens,
                        upstream.context,
                        legacyWindows?.[entry.id] ?? null,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>思考</dt>
                    <dd>{effort ? effortName(effort) : "跟随全局"}</dd>
                  </div>
                  {override?.maxOutputTokens != null && (
                    <div>
                      <dt>输出</dt>
                      <dd>{formatTokens(override.maxOutputTokens)}</dd>
                    </div>
                  )}
                </dl>
                <div className="configured-model-card-actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<PencilSimple size={13} />}
                    disabled={disabled}
                    aria-label={`编辑模型 ${entry.id} 的参数`}
                    onClick={() => setEditing(entry.id)}
                  >
                    编辑参数
                  </Button>
                  {selection.mode === "selected" && !isDefaultModel && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() => toggleEnabled(entry.id)}
                    >
                      {enabled ? "停用" : "启用"}
                    </Button>
                  )}
                  {!isDefaultModel && enabled && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() => onModel(entry.id)}
                    >
                      设为默认
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          variant="inline"
          title="这个来源还没有添加模型"
          action={
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={14} />}
              disabled={disabled}
              onClick={() => setPickerOpen(true)}
            >
              从模型目录添加
            </Button>
          }
        />
      )}
      {editingEntry && (
        <ModelEditDialog
          entry={editingEntry}
          sourceLabel={sourceLabel}
          override={selection.overrides?.[editingEntry.id]}
          legacyWindow={legacyWindows?.[editingEntry.id] ?? null}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            const cleared = clearModelOverride(selection, editingEntry.id);
            return onCommit(
              model,
              next
                ? {
                    ...cleared,
                    overrides: {
                      ...(cleared.overrides ?? {}),
                      [editingEntry.id]: next,
                    },
                  }
                : cleared,
            );
          }}
        />
      )}
    </div>
  );
}
