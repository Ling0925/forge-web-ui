import type { ModelCatalogEntry } from "@forge/core/shared/model-catalog";
import { useState } from "react";
import { Button } from "../../primitives/Button";
import { Input } from "../../primitives/Input";
import { Select } from "../../primitives/Select";
import { useConfirm } from "../ConfirmDialog";
import { Dialog } from "../Dialog";
import {
  SaveIndicator,
  type SaveStatus,
  SettingRow,
} from "../settings/SettingRows";
import { type ProviderProtocol, formatTokens, protocolOptions } from "./drafts";
import {
  CONTEXT_WINDOW_PRESETS,
  MAX_OUTPUT_PRESETS,
  type ModelOverrideEntry,
  type ModelReasoningEffort,
  REASONING_EFFORT_OPTIONS,
  SUPPORTED_EFFORT_LEVELS,
  effortName,
} from "./model-overrides";

const AUTO = "";
const CUSTOM = "custom";

/** Upstream (non-user) metadata the source reports for a model. */
export function upstreamModelValues(entry: ModelCatalogEntry) {
  return {
    context:
      entry.provenance?.contextWindowTokens === "user"
        ? null
        : entry.contextWindowTokens,
    maxOutput:
      entry.provenance?.maxOutputTokens === "user"
        ? undefined
        : entry.maxOutputTokens,
    effort:
      entry.provenance?.reasoningEffort === "user"
        ? undefined
        : entry.reasoningEffort,
    efforts:
      entry.provenance?.reasoningEfforts === "user"
        ? undefined
        : entry.reasoningEfforts,
  };
}

/** Effective context window text, shared by the card and the dialog. */
export function contextWindowText(
  override: number | null | undefined,
  upstream: number | null | undefined,
  legacy: number | null,
): string {
  if (legacy != null) return `${formatTokens(legacy)}（旧版全局设置）`;
  if (override != null) return formatTokens(override);
  if (upstream != null) return `${formatTokens(upstream)}（来源上报）`;
  return "未知，按 300K 估算";
}

type TokenField = "contextWindowTokens" | "maxOutputTokens";

function TokenChoice({
  label,
  field,
  value,
  autoLabel,
  presets,
  min,
  onChange,
}: {
  readonly label: string;
  readonly field: TokenField;
  readonly value: number | undefined;
  readonly autoLabel: string;
  readonly presets: readonly {
    readonly label: string;
    readonly tokens: number;
  }[];
  readonly min: number;
  readonly onChange: (field: TokenField, value: number | undefined) => void;
}) {
  const isPreset =
    value === undefined || presets.some((preset) => preset.tokens === value);
  const [customChosen, setCustomChosen] = useState(false);
  const custom = customChosen || !isPreset;
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [error, setError] = useState("");
  const applyText = (raw: string) => {
    setText(raw);
    const parsed = Number(raw.trim());
    if (!raw.trim()) {
      setError("");
      onChange(field, undefined);
      return;
    }
    if (!Number.isInteger(parsed) || parsed < min || parsed > 10_000_000) {
      setError(`请输入 ${min.toLocaleString()}–10,000,000 之间的整数。`);
      return;
    }
    setError("");
    onChange(field, parsed);
  };
  return (
    <>
      <Select
        aria-label={label}
        value={custom ? CUSTOM : value === undefined ? AUTO : String(value)}
        options={[
          { value: AUTO, label: autoLabel },
          ...presets.map((preset) => ({
            value: String(preset.tokens),
            label: preset.label,
          })),
          { value: CUSTOM, label: "自定义…" },
        ]}
        onValueChange={(next) => {
          if (next === CUSTOM) {
            setCustomChosen(true);
            setText(value === undefined ? "" : String(value));
            return;
          }
          setCustomChosen(false);
          setError("");
          onChange(field, next === AUTO ? undefined : Number(next));
        }}
      />
      {custom && (
        <div className="setting-inline-input model-edit-custom">
          <Input
            type="number"
            min={min}
            max={10_000_000}
            aria-label={`${label}（自定义 tokens）`}
            value={text}
            isError={Boolean(error)}
            onChange={(event) => applyText(event.target.value)}
          />
          <span className="setting-unit">tokens</span>
          {error && (
            <SaveIndicator status={{ state: "error", message: error }} />
          )}
        </div>
      )}
    </>
  );
}

/**
 * Per-model parameters in one dialog. Common settings are rows at the top;
 * protocol and supported effort levels sit in a collapsed "高级" panel.
 * Nothing is persisted until “保存”.
 */
export function ModelEditDialog({
  entry,
  sourceLabel,
  override,
  legacyWindow,
  onSave,
  onClose,
}: {
  readonly entry: ModelCatalogEntry;
  readonly sourceLabel: string;
  readonly override: ModelOverrideEntry | undefined;
  /** A legacy global window for this ID that Core still applies first. */
  readonly legacyWindow: number | null;
  readonly onSave: (next: ModelOverrideEntry | undefined) => Promise<boolean>;
  readonly onClose: () => void;
}) {
  const [draft, setDraft] = useState<ModelOverrideEntry>(() => ({
    ...(override ?? {}),
  }));
  const [status, setStatus] = useState<SaveStatus>({ state: "idle" });
  const { confirm, dialog: confirmDialog } = useConfirm();
  const upstream = upstreamModelValues(entry);
  const dirty = JSON.stringify(draft) !== JSON.stringify(override ?? {});
  const patch = (next: Partial<Record<string, unknown>>) => {
    setDraft((old) => {
      const merged: Record<string, unknown> = { ...old, ...next };
      for (const [key, value] of Object.entries(merged))
        if (
          value === undefined ||
          value === null ||
          (Array.isArray(value) && value.length === 0)
        )
          delete merged[key];
      return merged as ModelOverrideEntry;
    });
    setStatus({ state: "idle" });
  };
  const efforts: readonly string[] = draft.reasoningEfforts?.length
    ? draft.reasoningEfforts
    : (upstream.efforts ?? []);
  const toggleEffort = (level: string) => {
    const next = efforts.includes(level)
      ? efforts.filter((item) => item !== level)
      : SUPPORTED_EFFORT_LEVELS.map((item) => item.value).filter(
          (value) => value === level || efforts.includes(value),
        );
    patch({ reasoningEfforts: next.length ? next : undefined });
  };
  const requestClose = async () => {
    if (status.state === "saving") return;
    if (
      dirty &&
      !(await confirm({
        title: "放弃对模型参数的修改？",
        body: "关闭后，这次修改不会保存。",
        confirmLabel: "放弃修改",
        cancelLabel: "继续编辑",
        tone: "danger",
      }))
    )
      return;
    onClose();
  };
  const save = async () => {
    setStatus({ state: "saving" });
    const ok = await onSave(Object.keys(draft).length ? draft : undefined);
    if (ok) onClose();
    else
      setStatus({
        state: "error",
        message: "保存失败，修改已保留。",
      });
  };

  return (
    <Dialog
      title={`模型参数 · ${entry.id}`}
      kicker={`${sourceLabel}${entry.displayName && entry.displayName !== entry.id ? ` · ${entry.displayName}` : ""}`}
      className="model-edit-dialog"
      onClose={() => void requestClose()}
      dismissible={status.state !== "saving"}
    >
      <div className="modal-content model-edit-content">
        <div className="setting-group-body">
          <SettingRow
            label="默认思考等级"
            description={
              upstream.effort
                ? `模型自身默认：${effortName(upstream.effort)}`
                : "跟随全局时使用“推理与上下文”中的默认思考等级。"
            }
            control={
              <Select
                aria-label="默认思考等级"
                value={draft.reasoningEffort ?? ""}
                options={REASONING_EFFORT_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                  ...(efforts.length > 0 &&
                  option.value !== "" &&
                  option.value !== "default" &&
                  !efforts.includes(option.value)
                    ? { sub: "不在支持的档位中，仍会发送" }
                    : {}),
                }))}
                onValueChange={(value) =>
                  patch({
                    reasoningEffort:
                      value === ""
                        ? undefined
                        : (value as ModelReasoningEffort),
                  })
                }
              />
            }
          />
          <SettingRow
            label="上下文窗口"
            description={`生效：${contextWindowText(
              draft.contextWindowTokens,
              upstream.context,
              legacyWindow,
            )}。自动压缩在窗口的 80% 触发。`}
            control={
              <TokenChoice
                label="上下文窗口"
                field="contextWindowTokens"
                value={draft.contextWindowTokens ?? undefined}
                autoLabel={
                  upstream.context != null
                    ? `自动（${formatTokens(upstream.context)}）`
                    : "自动（未知，按 300K）"
                }
                presets={CONTEXT_WINDOW_PRESETS}
                min={1024}
                onChange={(field, value) => patch({ [field]: value })}
              />
            }
          />
          {legacyWindow != null && (
            <p className="setting-hint model-edit-legacy" role="note">
              旧版全局设置把这个模型的窗口定为 {formatTokens(legacyWindow)}
              ，它仍然优先生效。打开设置时会自动迁移到这里。
            </p>
          )}
          <SettingRow
            label="最大输出"
            description={
              upstream.maxOutput != null
                ? `来源上报：${formatTokens(upstream.maxOutput)}`
                : "来源未上报时由服务端决定。"
            }
            control={
              <TokenChoice
                label="最大输出"
                field="maxOutputTokens"
                value={draft.maxOutputTokens ?? undefined}
                autoLabel={
                  upstream.maxOutput != null
                    ? `自动（${formatTokens(upstream.maxOutput)}）`
                    : "自动（由服务端决定）"
                }
                presets={MAX_OUTPUT_PRESETS}
                min={256}
                onChange={(field, value) => patch({ [field]: value })}
              />
            }
          />
        </div>

        <details className="setting-advanced model-edit-advanced">
          <summary>高级</summary>
          <div className="setting-group-body">
            <SettingRow
              label="请求协议"
              description="只影响这个模型；使用来源中对应协议的地址和凭据。"
              control={
                <Select
                  aria-label="请求协议"
                  value={draft.apiMode ?? ""}
                  options={[
                    { value: "", label: "跟随来源" },
                    ...protocolOptions,
                  ]}
                  onValueChange={(value) =>
                    patch({
                      apiMode:
                        value === "" ? undefined : (value as ProviderProtocol),
                    })
                  }
                />
              }
            />
            <SettingRow
              stacked
              label="支持的思考档位"
              description={
                draft.reasoningEfforts?.length
                  ? `已手动指定 ${draft.reasoningEfforts.length} 个档位`
                  : upstream.efforts?.length
                    ? "使用来源上报的档位"
                    : "来源未上报，默认不限制"
              }
            >
              <div className="model-edit-efforts">
                <fieldset
                  className="model-param-chips"
                  aria-label="支持的思考档位"
                >
                  {SUPPORTED_EFFORT_LEVELS.map((level) => {
                    const checked = efforts.includes(level.value);
                    return (
                      <button
                        key={level.value}
                        type="button"
                        aria-pressed={checked}
                        className={`model-param-chip is-toggle${checked ? " is-active" : ""}`}
                        onClick={() => toggleEffort(level.value)}
                      >
                        {level.label}
                      </button>
                    );
                  })}
                </fieldset>
                {draft.reasoningEfforts?.length ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => patch({ reasoningEfforts: undefined })}
                  >
                    恢复来源上报
                  </Button>
                ) : null}
              </div>
            </SettingRow>
          </div>
        </details>
      </div>
      <footer className="modal-footer model-edit-actions">
        <Button
          variant="ghost"
          disabled={!Object.keys(draft).length}
          onClick={() => {
            setDraft({});
            setStatus({ state: "idle" });
          }}
        >
          全部恢复默认
        </Button>
        <span className="model-edit-actions-spacer" />
        <SaveIndicator status={status} />
        <Button variant="ghost" onClick={() => void requestClose()}>
          取消
        </Button>
        <Button
          variant="primary"
          disabled={!dirty}
          loading={status.state === "saving"}
          onClick={() => void save()}
        >
          保存
        </Button>
      </footer>
      {confirmDialog}
    </Dialog>
  );
}
