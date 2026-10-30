import type {
  ModelCatalog,
  ModelCatalogEntry,
} from "@forge/core/shared/model-catalog";
import {
  ArrowCounterClockwise,
  FloppyDisk,
  Plus,
  X,
} from "@phosphor-icons/react";
import { useState } from "react";
import { configuredModelIds } from "../../../state/composer-model";
import { Button } from "../../primitives/Button";
import { EmptyState } from "../../primitives/EmptyState";
import { Input } from "../../primitives/Input";
import { ModelParameterEditor } from "./ModelParameterEditor";
import { type EditableModelSelection, formatTokens } from "./drafts";
import {
  clearModelOverride,
  hasModelOverride,
  updateModelOverride,
} from "./model-overrides";

export function SourceCardModelPanel({
  sourceLabel,
  catalog,
  loading,
  error,
  model,
  selection,
  dirty,
  saving,
  disabled,
  onModel,
  onSelection,
  onSave,
  onResetDraft,
}: {
  readonly sourceLabel: string;
  readonly catalog: ModelCatalog;
  readonly loading: boolean;
  readonly error: string | undefined;
  readonly model: string;
  readonly selection: EditableModelSelection;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly disabled: boolean;
  readonly onModel: (value: string) => void;
  readonly onSelection: (value: EditableModelSelection) => void;
  readonly onSave: () => void;
  readonly onResetDraft: () => void;
}) {
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

  return (
    <div
      className="provider-card-models-panel"
      aria-label={`${sourceLabel} 模型参数配置`}
    >
      <div className="provider-configured-header">
        <div className="provider-configured-title-group">
          <h4 className="provider-configured-title">已配置模型</h4>
          <span className="provider-configured-count">
            {configuredEntries.length} 个模型卡片
          </span>
          <span className="provider-configured-subtitle">
            {selection.mode === "none"
              ? "此来源设置为不提供模型；请在编辑连接中调整模型范围"
              : selection.mode === "selected"
                ? "选择器仅展示已保存且勾选的模型；添加后请保存模型配置"
                : "选择器仅展示已保存的配置模型；添加后请保存模型配置"}
          </span>
        </div>
        <div className="provider-configured-actions">
          {dirty && (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled || saving}
                onClick={onResetDraft}
              >
                放弃修改
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon={<FloppyDisk size={14} />}
                loading={saving}
                disabled={disabled}
                aria-label={`保存${sourceLabel}的模型配置`}
                onClick={onSave}
              >
                保存模型配置
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus size={14} />}
            aria-expanded={pickerOpen}
            aria-label={`添加${sourceLabel}的配置模型`}
            disabled={disabled}
            onClick={() => setPickerOpen((open) => !open)}
          >
            {pickerOpen ? "收起模型列表" : "添加配置模型"}
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
                添加并配置
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
                        已在配置卡片中
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="provider-picker-add-btn"
                        disabled={disabled}
                        aria-label={`添加模型 ${entry.id} 到配置卡片`}
                        onClick={() => addModelToCards(entry.id)}
                      >
                        <Plus size={12} aria-hidden="true" />
                        <span>配置此模型</span>
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
            const upstreamContext =
              entry.provenance?.contextWindowTokens === "user"
                ? null
                : entry.contextWindowTokens;
            const upstreamMaxOutput =
              entry.provenance?.maxOutputTokens === "user"
                ? undefined
                : entry.maxOutputTokens;

            return (
              <article
                key={entry.id}
                className={`configured-model-card${overridden ? " is-customized" : ""}${isDefaultModel ? " is-default" : ""}`}
                aria-label={`已配置模型卡片 ${entry.id}`}
              >
                <div className="configured-model-card-head">
                  <div className="configured-model-card-identity">
                    <span
                      className={`provider-model-dot${overridden ? " is-custom" : isDefaultModel ? " is-default" : ""}`}
                      aria-hidden="true"
                    />
                    <code className="provider-card-model-id">{entry.id}</code>
                    {entry.displayName && entry.displayName !== entry.id && (
                      <span className="provider-card-model-name">
                        {entry.displayName}
                      </span>
                    )}
                    {isDefaultModel ? (
                      <span className="provider-model-badge is-default">
                        默认模型
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="provider-model-action-pill"
                        disabled={disabled}
                        onClick={() => onModel(entry.id)}
                      >
                        设为默认
                      </button>
                    )}
                    {overridden && (
                      <span className="provider-model-badge is-custom">
                        已定制参数
                      </span>
                    )}
                  </div>

                  <div className="configured-model-card-head-right">
                    <span className="model-param-upstream-hint">
                      上游基准：上下文 {formatTokens(upstreamContext)} · 输出{" "}
                      {formatTokens(upstreamMaxOutput)}
                    </span>
                    {overridden && (
                      <button
                        type="button"
                        className="model-param-reset-btn"
                        disabled={disabled}
                        aria-label={`恢复模型 ${entry.id} 默认配置`}
                        onClick={() =>
                          onSelection(clearModelOverride(selection, entry.id))
                        }
                      >
                        <ArrowCounterClockwise size={12} aria-hidden="true" />
                        <span>恢复默认</span>
                      </button>
                    )}
                    {!isDefaultModel && (
                      <button
                        type="button"
                        className="configured-model-remove-btn"
                        disabled={disabled}
                        title="从配置卡片中移除"
                        aria-label={`移除模型 ${entry.id} 配置卡片`}
                        onClick={() => removeModelCard(entry.id)}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                <ModelParameterEditor
                  entry={entry}
                  override={override}
                  disabled={disabled}
                  hideHeader
                  onChange={(patch) =>
                    onSelection(updateModelOverride(selection, entry.id, patch))
                  }
                  onReset={() =>
                    onSelection(clearModelOverride(selection, entry.id))
                  }
                />
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          variant="inline"
          title="当前来源暂未配置任何模型卡片"
          action={
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={14} />}
              disabled={disabled}
              onClick={() => setPickerOpen(true)}
            >
              从模型目录选择模型进行配置
            </Button>
          }
        />
      )}
    </div>
  );
}
