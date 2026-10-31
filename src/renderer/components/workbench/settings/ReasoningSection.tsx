import { useState } from "react";
import { Button } from "../../primitives/Button";
import { Input } from "../../primitives/Input";
import { Select } from "../../primitives/Select";
import { SaveIndicator, SettingGroup, SettingRow } from "./SettingRows";
import {
  CONTEXT_BUDGET_PRESETS,
  GLOBAL_REASONING_EFFORT_OPTIONS,
  formatTokenShort,
} from "./settings-options";
import type { SettingsForm } from "./useSettingsForm";

const CUSTOM = "custom";

export function ReasoningSection({ form }: { readonly form: SettingsForm }) {
  const { draft, commit, statusOf, confirm, original } = form;
  const disabled = !form.state.settings;
  const presetBudget = CONTEXT_BUDGET_PRESETS.some(
    (preset) => preset.value === draft.contextBudgetTokens,
  );
  const [customChosen, setCustomChosen] = useState(false);
  const customBudget = customChosen || !presetBudget;
  const [tokens, setTokens] = useState(draft.contextBudgetTokens);
  const [budgetError, setBudgetError] = useState("");
  const [chars, setChars] = useState(draft.contextBudgetChars);
  const [charsError, setCharsError] = useState("");
  const legacyWindows = Object.entries(original.modelContextWindows ?? {});

  const saveCustomBudget = () => {
    const value = Number(tokens.trim());
    if (
      !tokens.trim() ||
      !Number.isInteger(value) ||
      value < 4096 ||
      value > 10_000_000
    ) {
      setBudgetError("请输入 4,096–10,000,000 之间的整数。");
      return;
    }
    setBudgetError("");
    void commit("contextBudgetTokens", String(value));
  };

  const saveChars = () => {
    if (!/^\d+$/.test(chars.trim())) {
      setCharsError("请输入整数。");
      return;
    }
    setCharsError("");
    void commit("contextBudgetChars", chars.trim());
  };

  return (
    <section className="settings-section" aria-label="推理与上下文配置">
      <SettingGroup title="推理">
        <SettingRow
          id="reasoningEffort"
          label="默认思考等级"
          description="适用于支持思考参数的模型。优先级：单个模型的设置 ＞ 这里的默认 ＞ 模型自身默认。"
          control={
            <Select
              aria-label="默认思考等级"
              value={draft.reasoningEffort}
              disabled={disabled}
              options={GLOBAL_REASONING_EFFORT_OPTIONS.map((item) => ({
                value: item.value,
                label: item.label,
                sub: item.desc,
              }))}
              onValueChange={(value) => void commit("reasoningEffort", value)}
            />
          }
          status={<SaveIndicator status={statusOf("reasoningEffort")} />}
        />
      </SettingGroup>

      <SettingGroup
        title="上下文"
        description="上下文接近上限时自动压缩早期消息；原始历史仍可检索，不删除聊天，也不清零用量。"
      >
        <SettingRow
          id="contextBudgetTokens"
          label="压缩预算"
          description="自动时按模型上下文窗口的 80% 触发；手动上限仍不会超过窗口。各模型的窗口在“模型服务”中设置。"
          control={
            <Select
              aria-label="压缩预算"
              value={customBudget ? CUSTOM : draft.contextBudgetTokens}
              disabled={disabled}
              options={[
                ...CONTEXT_BUDGET_PRESETS.map((preset) => ({
                  value: preset.value as string,
                  label: preset.label,
                  sub: preset.desc,
                })),
                { value: CUSTOM, label: "自定义…" },
              ]}
              onValueChange={(value) => {
                if (value === CUSTOM) {
                  setCustomChosen(true);
                  setTokens(draft.contextBudgetTokens);
                  return;
                }
                setCustomChosen(false);
                setBudgetError("");
                void commit("contextBudgetTokens", value);
              }}
            />
          }
          status={<SaveIndicator status={statusOf("contextBudgetTokens")} />}
        >
          {customBudget && (
            <div className="setting-inline-input">
              <Input
                type="number"
                min={4096}
                max={10_000_000}
                aria-label="自定义压缩预算（tokens）"
                value={tokens}
                disabled={disabled}
                isError={Boolean(budgetError)}
                placeholder="例如 96000"
                onChange={(event) => setTokens(event.target.value)}
                onBlur={saveCustomBudget}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveCustomBudget();
                  }
                }}
              />
              <span className="setting-unit">
                tokens
                {!budgetError && Number(tokens) >= 4096
                  ? `（约 ${formatTokenShort(Number(tokens))}）`
                  : ""}
              </span>
              {budgetError && (
                <SaveIndicator
                  status={{ state: "error", message: budgetError }}
                />
              )}
            </div>
          )}
        </SettingRow>
        <details className="setting-advanced">
          <summary>兼容设置</summary>
          <SettingRow
            id="contextBudgetChars"
            label="旧版字符预算"
            description="只在模型窗口未知时作为字符级回退；通常无需修改。"
            control={
              <div className="setting-inline-input">
                <Input
                  type="number"
                  aria-label="旧版字符预算"
                  value={chars}
                  disabled={disabled}
                  isError={Boolean(charsError)}
                  onChange={(event) => setChars(event.target.value)}
                  onBlur={saveChars}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveChars();
                    }
                  }}
                />
                <span className="setting-unit">字符</span>
              </div>
            }
            status={
              <SaveIndicator
                status={
                  charsError
                    ? { state: "error", message: charsError }
                    : statusOf("contextBudgetChars")
                }
              />
            }
          />
        </details>
      </SettingGroup>

      {legacyWindows.length > 0 && (
        <SettingGroup
          title="未迁移的旧版窗口设置"
          description="这些模型 ID 不在任何来源的模型列表中，所以没有移到模型服务。它们仍然生效；在来源中添加对应模型后会自动迁移。"
        >
          <SettingRow
            label={legacyWindows
              .map(
                ([model, value]) =>
                  `${model} · ${value == null ? "自动" : formatTokenShort(value)}`,
              )
              .join("，")}
            control={
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: "清除旧版窗口设置？",
                      body: "这些模型将改用来源上报的窗口；未知模型按 300K 估算。",
                      confirmLabel: "清除",
                      tone: "danger",
                    }))
                  )
                    return;
                  await form.clearLegacyWindows();
                }}
              >
                清除
              </Button>
            }
          />
        </SettingGroup>
      )}
    </section>
  );
}
