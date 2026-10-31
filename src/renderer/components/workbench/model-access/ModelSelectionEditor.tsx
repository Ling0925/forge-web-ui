import type { PublicProviderPreset } from "@forge/core/shared/model-access";
import type {
  ModelCatalog,
  ModelCatalogEntry,
} from "@forge/core/shared/model-catalog";
import { ArrowClockwise, Plus, Trash, X } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { configuredModelIds } from "../../../state/composer-model";
import { Button } from "../../primitives/Button";
import { Checkbox } from "../../primitives/Checkbox";
import { Field } from "../../primitives/Field";
import { IconButton } from "../../primitives/IconButton";
import { Input } from "../../primitives/Input";
import { Select } from "../../primitives/Select";
import { ModelMetadata } from "./ModelMetadata";
import {
  type CatalogTestState,
  type EditableAlias,
  type EditableModelSelection,
  type ProviderProtocol,
  randomId,
} from "./drafts";
import { effectiveModelEntry, hasModelOverride } from "./model-overrides";

export function PresetPicker({
  presets,
  preset,
  region,
  onPreset,
  onRegion,
}: {
  readonly presets: readonly PublicProviderPreset[];
  readonly preset: string;
  readonly region: string;
  readonly onPreset: (id: string) => void;
  readonly onRegion: (id: string) => void;
}) {
  const chosen = presets.find((item) => item.id === preset);
  return (
    <div className="model-access-preset">
      <Field id="model-access-preset" label="预设">
        <Select
          id="model-access-preset"
          value={preset}
          options={[
            { value: "", label: "自定义" },
            ...presets.map((item) => ({ value: item.id, label: item.name })),
          ]}
          onValueChange={(value) => onPreset(value)}
        />
      </Field>
      {chosen?.regions?.length ? (
        <Field id="model-access-region" label={chosen.regionLabel ?? "区域"}>
          <Select
            id="model-access-region"
            value={region}
            options={[
              { value: "", label: "默认" },
              ...chosen.regions.map((item) => ({
                value: item.id,
                label: item.name,
              })),
            ]}
            onValueChange={(value) => onRegion(value)}
          />
        </Field>
      ) : null}
    </div>
  );
}

export function presetEndpoints(
  preset: PublicProviderPreset | undefined,
  regionId: string,
): Readonly<Partial<Record<ProviderProtocol, string | undefined>>> {
  if (!preset) return {};
  const region = regionId
    ? preset.regions?.find((item) => item.id === regionId)
    : undefined;
  return { ...preset.endpoints, ...region?.endpoints };
}

export function ModelSelectionEditor({
  catalog,
  loading,
  error,
  stale,
  fetchedAt,
  model,
  selection,
  aliases,
  disabled,
  test,
  onModel,
  onSelection,
  onAliases,
  onRefresh,
  onTest,
  onCancelTest,
}: {
  readonly catalog: ModelCatalog;
  readonly loading: boolean;
  readonly error: string;
  readonly stale?: boolean;
  readonly fetchedAt?: string | undefined;
  readonly model: string;
  readonly selection: EditableModelSelection;
  readonly aliases: readonly EditableAlias[];
  readonly disabled: boolean;
  readonly test: CatalogTestState | undefined;
  readonly onModel: (value: string) => void;
  readonly onSelection: (value: EditableModelSelection) => void;
  readonly onAliases: (value: readonly EditableAlias[]) => void;
  readonly onRefresh: () => void;
  readonly onTest: (kind: "catalog" | "inference") => void;
  readonly onCancelTest: () => void;
}) {
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState("");
  const [visible, setVisible] = useState(50);
  const listId = useId();
  const byId = new Map<string, ModelCatalogEntry>();
  for (const entry of selection.manual) byId.set(entry.id, entry);
  for (const entry of catalog) byId.set(entry.id, entry);
  const entries = [...byId.values()];
  const needle = query.trim().toLowerCase();
  const filtered = entries.filter(
    (entry) =>
      !needle ||
      entry.id.toLowerCase().includes(needle) ||
      entry.displayName?.toLowerCase().includes(needle),
  );
  const selectedIds = selection.mode === "selected" ? selection.models : [];
  const toggle = (id: string) => {
    const base =
      selection.mode === "selected"
        ? selection.models
        : entries.map((entry) => entry.id);
    const next = base.includes(id)
      ? base.filter((value) => value !== id)
      : [...base, id];
    onSelection({ ...selection, mode: "selected", models: next });
  };
  const addManual = () => {
    const id = manual.trim();
    if (!id) return;
    if (!selection.manual.some((entry) => entry.id === id)) {
      const entry: ModelCatalogEntry = { id, contextWindowTokens: null };
      onSelection({
        ...selection,
        ...(selection.mode === "selected"
          ? { models: [...selection.models, id] }
          : {}),
        manual: [...selection.manual, entry],
      });
    }
    setManual("");
  };
  const removeManual = (id: string) => {
    onSelection({
      ...selection,
      manual: selection.manual.filter((entry) => entry.id !== id),
      ...(selection.mode === "selected"
        ? { models: selection.models.filter((value) => value !== id) }
        : {}),
    });
  };
  return (
    <section className="model-access-section" aria-label="模型">
      <div className="model-access-heading">
        <h4>模型</h4>
        <div className="model-access-actions">
          <Button
            size="sm"
            variant="secondary"
            icon={<ArrowClockwise size={15} />}
            loading={loading}
            disabled={disabled}
            onClick={onRefresh}
          >
            刷新目录
          </Button>
        </div>
      </div>
      <Field id="model-access-default-model" label="默认模型">
        <Input
          id="model-access-default-model"
          value={model}
          spellCheck={false}
          placeholder="模型 ID"
          onChange={(event) => onModel(event.target.value)}
        />
      </Field>
      <div
        className="model-access-modes"
        role="radiogroup"
        aria-label="模型范围"
      >
        {(
          [
            ["all", "全部已添加的模型"],
            ["selected", "只提供勾选的模型"],
            ["none", "不提供模型"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="model-access-mode">
            <input
              type="radio"
              name="model-access-mode"
              value={value}
              checked={selection.mode === value}
              onChange={() =>
                onSelection({
                  ...selection,
                  mode: value,
                  models:
                    value === "selected" &&
                    selection.mode !== "selected" &&
                    selection.models.length === 0
                      ? configuredModelIds({ model, modelSelection: selection })
                      : selection.models,
                })
              }
            />
            {label}
          </label>
        ))}
      </div>
      <div className="model-access-catalog-toolbar">
        <Input
          aria-label="搜索模型"
          value={query}
          placeholder="搜索模型"
          onChange={(event) => {
            setQuery(event.target.value);
            setVisible(50);
          }}
        />
        <span>
          {filtered.length} / {entries.length}
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => onTest("catalog")}
        >
          测试目录
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || !model.trim()}
          onClick={() => onTest("inference")}
        >
          测试推理
        </Button>
        {test?.status === "running" && (
          <Button size="sm" variant="ghost" onClick={onCancelTest}>
            取消测试
          </Button>
        )}
      </div>
      {stale && (
        <p className="model-access-status is-stale" role="status">
          目录已过期
          {fetchedAt && !Number.isNaN(new Date(fetchedAt).getTime())
            ? ` · ${new Date(fetchedAt).toLocaleString()}`
            : ""}
        </p>
      )}
      {test && test.status !== "running" && (
        <output
          className={`model-access-test-result${test.status === "error" ? " is-error" : ""}`}
          role={test.status === "error" ? "alert" : undefined}
        >
          {test.kind === "catalog" ? "目录测试" : "推理测试"}
          {test.status === "ok"
            ? `成功 · ${test.latencyMs ?? 0} ms${test.model ? ` · ${test.model}` : ""}`
            : test.status === "cancelled"
              ? "已取消"
              : `失败${test.error ? ` · ${test.error}` : ""}`}
        </output>
      )}
      <div
        id={listId}
        className="model-access-catalog"
        aria-label="模型目录"
        aria-busy={loading}
      >
        {filtered.length ? (
          <div className="model-access-model-list">
            {filtered.slice(0, visible).map((entry) => {
              const isManual = selection.manual.some(
                (item) => item.id === entry.id,
              );
              const override = selection.overrides?.[entry.id];
              const effective = effectiveModelEntry(entry, override);
              const overridden = hasModelOverride(override);
              return (
                <div
                  className={`model-access-model-row${overridden ? " is-customized" : ""}`}
                  key={entry.id}
                >
                  <div className="model-access-model-row-main">
                    <label className="model-access-model-check">
                      <Checkbox
                        checked={selectedIds.includes(entry.id)}
                        disabled={disabled || selection.mode !== "selected"}
                        onCheckedChange={() => toggle(entry.id)}
                      />
                      <span className="model-access-model-id">{entry.id}</span>
                    </label>
                    {entry.displayName && (
                      <span className="model-access-model-name">
                        {entry.displayName}
                      </span>
                    )}
                    <ModelMetadata entry={effective} />
                    <div className="model-access-row-actions">
                      {overridden && (
                        <span className="model-override-badge">已自定义</span>
                      )}
                      {isManual && (
                        <IconButton
                          label={`移除手工模型 ${entry.id}`}
                          icon={<X size={14} aria-hidden="true" />}
                          disabled={disabled}
                          onClick={() => removeManual(entry.id)}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="model-access-status">{error || "目录为空。"}</p>
        )}
        {filtered.length > visible && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setVisible((count) => count + 50)}
          >
            显示更多（剩余 {filtered.length - visible}）
          </Button>
        )}
      </div>
      {error && filtered.length > 0 && (
        <p className="model-access-status is-error" role="alert">
          {error}
        </p>
      )}
      <div className="model-access-inline">
        <Input
          aria-label="手动添加模型 ID"
          value={manual}
          placeholder="目录中没有的模型 ID"
          onChange={(event) => setManual(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addManual();
            }
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus size={14} />}
          disabled={disabled || !manual.trim()}
          onClick={addManual}
        >
          添加模型
        </Button>
      </div>
      <details className="model-access-fold">
        <summary>模型别名</summary>
        <div className="model-access-rows">
          {aliases.map((row) => (
            <div className="model-access-row" key={row.id}>
              <Input
                aria-label="别名"
                value={row.alias}
                placeholder="别名"
                onChange={(event) =>
                  onAliases(
                    aliases.map((item) =>
                      item.id === row.id
                        ? { ...item, alias: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <Input
                aria-label="别名目标模型"
                value={row.model}
                placeholder="模型 ID"
                onChange={(event) =>
                  onAliases(
                    aliases.map((item) =>
                      item.id === row.id
                        ? { ...item, model: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <IconButton
                label="删除别名"
                icon={<Trash size={14} aria-hidden="true" />}
                disabled={disabled}
                onClick={() =>
                  onAliases(aliases.filter((item) => item.id !== row.id))
                }
              />
            </div>
          ))}
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus size={14} />}
            disabled={disabled}
            onClick={() =>
              onAliases([
                ...aliases,
                { id: randomId("alias"), alias: "", model: "" },
              ])
            }
          >
            添加别名
          </Button>
        </div>
      </details>
      {selection.mode === "none" && (
        <p className="model-access-status">不提供模型。</p>
      )}
    </section>
  );
}
