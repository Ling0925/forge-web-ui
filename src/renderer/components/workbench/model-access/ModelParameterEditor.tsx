import type { ModelCatalogEntry } from "@forge/core/shared/model-catalog";
import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { Input } from "../../primitives/Input";
import { Select } from "../../primitives/Select";
import { EffortBars } from "./ModelMetadata";
import { type ProviderProtocol, formatTokens, protocolOptions } from "./drafts";
import {
  CONTEXT_WINDOW_PRESETS,
  MAX_OUTPUT_PRESETS,
  type ModelOverrideEntry,
  type ModelReasoningEffort,
  REASONING_EFFORT_OPTIONS,
  SUPPORTED_EFFORT_LEVELS,
  hasModelOverride,
} from "./model-overrides";

export function ModelParameterEditor({
  entry,
  override,
  disabled,
  hideHeader = false,
  onChange,
  onReset,
}: {
  readonly entry: ModelCatalogEntry;
  readonly override: ModelOverrideEntry | undefined;
  readonly disabled: boolean;
  readonly hideHeader?: boolean;
  readonly onChange: (
    patch: Partial<{
      readonly contextWindowTokens: number | null | undefined;
      readonly maxOutputTokens: number | null | undefined;
      readonly reasoningEffort: ModelReasoningEffort | undefined;
      readonly reasoningEfforts: readonly string[] | undefined;
      readonly apiMode: ProviderProtocol | undefined;
    }>,
  ) => void;
  readonly onReset: () => void;
}) {
  const upstreamContext =
    entry.provenance?.contextWindowTokens === "user"
      ? null
      : entry.contextWindowTokens;
  const upstreamMaxOutput =
    entry.provenance?.maxOutputTokens === "user"
      ? undefined
      : entry.maxOutputTokens;
  const upstreamEffort =
    entry.provenance?.reasoningEffort === "user"
      ? undefined
      : entry.reasoningEffort;
  const upstreamEfforts =
    entry.provenance?.reasoningEfforts === "user"
      ? undefined
      : entry.reasoningEfforts;

  const currentEffort: "" | ModelReasoningEffort =
    override?.reasoningEffort ?? upstreamEffort ?? "";
  const currentEfforts: readonly string[] =
    override?.reasoningEfforts !== undefined &&
    override.reasoningEfforts.length > 0
      ? override.reasoningEfforts
      : (upstreamEfforts ?? []);
  const currentContext =
    override?.contextWindowTokens !== undefined &&
    override.contextWindowTokens !== null
      ? override.contextWindowTokens
      : undefined;
  const currentMaxOutput =
    override?.maxOutputTokens !== undefined && override.maxOutputTokens !== null
      ? override.maxOutputTokens
      : undefined;

  const isCustomized = hasModelOverride(override);

  const toggleSupportedEffort = (level: string) => {
    const exists = currentEfforts.includes(level);
    const next = exists
      ? currentEfforts.filter((item) => item !== level)
      : SUPPORTED_EFFORT_LEVELS.map((item) => item.value).filter(
          (val) => val === level || currentEfforts.includes(val),
        );
    onChange({ reasoningEfforts: next.length > 0 ? next : undefined });
  };

  const handleNumberInput = (
    raw: string,
    field: "contextWindowTokens" | "maxOutputTokens",
  ) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange({ [field]: undefined });
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 10_000_000) {
      onChange({ [field]: parsed });
    }
  };

  return (
    <div
      className={`model-param-editor${hideHeader ? " is-card-body" : ""}`}
      aria-label={`模型 ${entry.id} 参数配置面板`}
    >
      {!hideHeader && (
        <div className="model-param-editor-head">
          <div className="model-param-editor-title">
            <span className="model-param-editor-badge">参数覆盖</span>
            <code>{entry.id}</code>
            <span className="model-param-upstream-hint">
              上游基准：上下文 {formatTokens(upstreamContext)} · 最大输出{" "}
              {formatTokens(upstreamMaxOutput)} · 档位{" "}
              {upstreamEfforts?.length ? upstreamEfforts.join("/") : "未声明"}
            </span>
          </div>
          <button
            type="button"
            className="model-param-reset-btn"
            disabled={disabled || !isCustomized}
            aria-label={`恢复模型 ${entry.id} 默认配置`}
            onClick={onReset}
          >
            <ArrowCounterClockwise size={12} aria-hidden="true" />
            <span>恢复默认</span>
          </button>
        </div>
      )}

      <div className="model-param-rows">
        <div className="model-param-row">
          <div className="model-param-row-meta">
            <span className="model-param-label">请求协议</span>
            <span className="model-param-sub">
              仅影响此模型；使用来源中对应协议的端点和匹配凭据
            </span>
          </div>
          <div className="model-param-row-control">
            <Select
              aria-label={`模型 ${entry.id} 请求协议`}
              value={override?.apiMode ?? ""}
              disabled={disabled}
              options={[
                { value: "", label: "继承来源（别名优先继承实际模型）" },
                ...protocolOptions,
              ]}
              onValueChange={(value) =>
                onChange({
                  apiMode:
                    value === "" ? undefined : (value as ProviderProtocol),
                })
              }
            />
          </div>
        </div>
        <div className="model-param-row">
          <div className="model-param-row-meta">
            <span className="model-param-label">默认思考等级</span>
            <span className="model-param-sub">
              {override?.reasoningEffort !== undefined
                ? `已固定为 ${override.reasoningEffort === "default" ? "模型默认" : override.reasoningEffort}`
                : upstreamEffort
                  ? `上游默认 ${upstreamEffort} · 跟随全局`
                  : "跟随全局或模型默认"}
            </span>
          </div>
          <div className="model-param-row-control">
            <fieldset
              className="model-param-segmented"
              aria-label={`模型 ${entry.id} 默认思考等级`}
            >
              {REASONING_EFFORT_OPTIONS.map((option) => {
                const active = currentEffort === option.value;
                const outOfRange =
                  currentEfforts.length > 0 &&
                  option.value !== "" &&
                  option.value !== "default" &&
                  !currentEfforts.includes(option.value);
                return (
                  <button
                    key={option.value || "global"}
                    type="button"
                    aria-pressed={active}
                    disabled={disabled}
                    title={
                      outOfRange
                        ? `${option.label}（不在当前声明的支持档位中，仍可强制指定）`
                        : option.label
                    }
                    className={`model-param-seg-btn${active ? " is-active" : ""}${outOfRange ? " is-out-of-range" : ""}`}
                    onClick={() =>
                      onChange({
                        reasoningEffort:
                          option.value === "" ? undefined : option.value,
                      })
                    }
                  >
                    {option.bars > 0 && <EffortBars bars={option.bars} />}
                    <span>{option.shortLabel}</span>
                  </button>
                );
              })}
            </fieldset>
          </div>
        </div>

        <div className="model-param-row">
          <div className="model-param-row-meta">
            <span className="model-param-label">支持思考档位</span>
            <span className="model-param-sub">
              {currentEfforts.length > 0
                ? `已启用 ${currentEfforts.length} 个档位`
                : "使用默认档位范围"}
            </span>
          </div>
          <div className="model-param-row-control is-split">
            <fieldset
              className="model-param-chips"
              aria-label={`模型 ${entry.id} 支持的思考档位范围`}
            >
              {SUPPORTED_EFFORT_LEVELS.map((level) => {
                const checked = currentEfforts.includes(level.value);
                return (
                  <button
                    key={level.value}
                    type="button"
                    aria-pressed={checked}
                    disabled={disabled}
                    className={`model-param-chip is-toggle${checked ? " is-active" : ""}`}
                    onClick={() => toggleSupportedEffort(level.value)}
                  >
                    <span>{level.shortLabel}</span>
                  </button>
                );
              })}
            </fieldset>
            <div className="model-param-quick-links">
              <button
                type="button"
                className="model-param-link-btn"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    reasoningEfforts: SUPPORTED_EFFORT_LEVELS.map(
                      (item) => item.value,
                    ),
                  })
                }
              >
                全档位
              </button>
              <button
                type="button"
                className="model-param-link-btn"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    reasoningEfforts: ["low", "medium", "high"],
                  })
                }
              >
                标准三档
              </button>
              <button
                type="button"
                className="model-param-link-btn"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    reasoningEfforts: ["medium", "high", "xhigh", "max"],
                  })
                }
              >
                深度推理
              </button>
              {override?.reasoningEfforts !== undefined && (
                <button
                  type="button"
                  className="model-param-link-btn is-muted"
                  disabled={disabled}
                  onClick={() => onChange({ reasoningEfforts: undefined })}
                >
                  恢复上游
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="model-param-row">
          <div className="model-param-row-meta">
            <span className="model-param-label">上下文窗口</span>
            <span className="model-param-sub">
              生效：
              {formatTokens(
                currentContext ?? upstreamContext ?? entry.contextWindowTokens,
              )}
            </span>
          </div>
          <div className="model-param-row-control is-token-control">
            <fieldset
              className="model-param-segmented is-compact"
              aria-label={`模型 ${entry.id} 上下文窗口预设`}
            >
              <button
                type="button"
                disabled={disabled}
                className={`model-param-seg-btn${currentContext === undefined ? " is-active" : ""}`}
                onClick={() => onChange({ contextWindowTokens: undefined })}
              >
                默认 ({formatTokens(upstreamContext)})
              </button>
              {CONTEXT_WINDOW_PRESETS.map((preset) => (
                <button
                  key={preset.tokens}
                  type="button"
                  disabled={disabled}
                  className={`model-param-seg-btn${currentContext === preset.tokens ? " is-active" : ""}`}
                  onClick={() =>
                    onChange({ contextWindowTokens: preset.tokens })
                  }
                >
                  {preset.label}
                </button>
              ))}
            </fieldset>
            <div className="model-param-number-box">
              <Input
                type="number"
                min={1024}
                max={10000000}
                step={1024}
                disabled={disabled}
                aria-label={`模型 ${entry.id} 上下文窗口 Token`}
                value={
                  currentContext === undefined ? "" : String(currentContext)
                }
                placeholder={
                  upstreamContext ? String(upstreamContext) : "自定义"
                }
                onChange={(event) =>
                  handleNumberInput(event.target.value, "contextWindowTokens")
                }
              />
              <span className="model-param-number-unit">Tokens</span>
            </div>
          </div>
        </div>

        <div className="model-param-row">
          <div className="model-param-row-meta">
            <span className="model-param-label">最大输出上限</span>
            <span className="model-param-sub">
              生效：
              {formatTokens(
                currentMaxOutput ?? upstreamMaxOutput ?? entry.maxOutputTokens,
              )}
            </span>
          </div>
          <div className="model-param-row-control is-token-control">
            <fieldset
              className="model-param-segmented is-compact"
              aria-label={`模型 ${entry.id} 最大输出预设`}
            >
              <button
                type="button"
                disabled={disabled}
                className={`model-param-seg-btn${currentMaxOutput === undefined ? " is-active" : ""}`}
                onClick={() => onChange({ maxOutputTokens: undefined })}
              >
                默认 ({formatTokens(upstreamMaxOutput)})
              </button>
              {MAX_OUTPUT_PRESETS.map((preset) => (
                <button
                  key={preset.tokens}
                  type="button"
                  disabled={disabled}
                  className={`model-param-seg-btn${currentMaxOutput === preset.tokens ? " is-active" : ""}`}
                  onClick={() => onChange({ maxOutputTokens: preset.tokens })}
                >
                  {preset.label}
                </button>
              ))}
            </fieldset>
            <div className="model-param-number-box">
              <Input
                type="number"
                min={256}
                max={10000000}
                step={256}
                disabled={disabled}
                aria-label={`模型 ${entry.id} 最大输出 Token`}
                value={
                  currentMaxOutput === undefined ? "" : String(currentMaxOutput)
                }
                placeholder={
                  upstreamMaxOutput ? String(upstreamMaxOutput) : "自定义"
                }
                onChange={(event) =>
                  handleNumberInput(event.target.value, "maxOutputTokens")
                }
              />
              <span className="model-param-number-unit">Tokens</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
