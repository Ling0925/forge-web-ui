import { CaretDown, Cpu, Plus, Stack, Trash } from "@phosphor-icons/react";
import { Button } from "../../primitives/Button";
import { EmptyState } from "../../primitives/EmptyState";
import { Field } from "../../primitives/Field";
import { Input } from "../../primitives/Input";
import { Tag } from "../../primitives/Tag";
import {
  CONTEXT_BUDGET_PRESETS,
  MODEL_WINDOW_PRESETS,
  formatContextBudgetBadge,
  formatModelWindowSummary,
} from "./settings-options";
import type { SettingsForm } from "./useSettingsForm";

export function ContextSection({ form }: { readonly form: SettingsForm }) {
  const { draft, change, text } = form;
  return (
    <section className="settings-section" aria-label="上下文配置">
      <div className="settings-flat-group execution-settings-layout">
        <div className="execution-panel-card context-budget-card">
          {(() => {
            const budgetBadge = formatContextBudgetBadge(
              draft.contextBudgetTokens,
            );
            return (
              <>
                <div className="execution-panel-head">
                  <div className="execution-panel-head-main">
                    <span className="execution-panel-icon" aria-hidden="true">
                      <Cpu size={16} weight="duotone" />
                    </span>
                    <div className="execution-panel-title-wrap">
                      <div className="execution-panel-title-row">
                        <h3>上下文压缩预算</h3>
                        <Tag tone="muted">自动摘要与检索</Tag>
                      </div>
                      <p>
                        自动压缩保留可检索的原始历史。压缩影响后续请求，不会删除聊天或清零累计用量。
                      </p>
                    </div>
                  </div>
                  <span
                    className={`execution-timeout-pill is-${budgetBadge.tone}`}
                  >
                    {budgetBadge.text}
                  </span>
                </div>

                <fieldset
                  className="execution-timeout-presets context-budget-presets"
                  aria-label="压缩预算快捷档位"
                >
                  {CONTEXT_BUDGET_PRESETS.map((preset) => {
                    const active =
                      draft.contextBudgetTokens.trim() === preset.value;
                    return (
                      <button
                        key={preset.value || "auto"}
                        type="button"
                        aria-pressed={active}
                        className={`execution-timeout-preset${
                          active ? " is-active" : ""
                        }`}
                        onClick={() =>
                          change("contextBudgetTokens", preset.value)
                        }
                      >
                        <span className="execution-timeout-preset-label">
                          {preset.label}
                        </span>
                        <span className="execution-timeout-preset-sub">
                          {preset.desc}
                        </span>
                      </button>
                    );
                  })}
                </fieldset>

                <div className="execution-timeout-input-wrap">
                  {text(
                    "contextBudgetTokens",
                    "上下文 token 上限",
                    "可留空自动按模型窗口的 80% 计算；手动值范围 4096–10000000，仍受窗口限制。",
                    "number",
                    "留空自动按模型窗口的 80% 计算",
                  )}
                </div>

                <div className="context-mechanism-strip">
                  <div className="context-mechanism-item">
                    <span className="context-mechanism-badge">
                      自动触发阈值
                    </span>
                    <span>
                      默认在单次上下文达到模型窗口
                      80%（或手动上限）时自动压缩摘要
                    </span>
                  </div>
                  <div className="context-mechanism-item">
                    <span className="context-mechanism-badge">
                      可检索原始记忆
                    </span>
                    <span>
                      被压缩的早期消息与工具输出仍保留在本地历史中，支持按需回溯检索
                    </span>
                  </div>
                  <div className="context-mechanism-item">
                    <span className="context-mechanism-badge">
                      计费与会话连续
                    </span>
                    <span>
                      仅精简后续请求的输入上下文，不删除对话记录、不清零累计用量统计
                    </span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        <div className="execution-panel-card context-windows-card">
          <div className="execution-panel-head">
            <div className="execution-panel-head-main">
              <span className="execution-panel-icon" aria-hidden="true">
                <Stack size={16} weight="duotone" />
              </span>
              <div className="execution-panel-title-wrap">
                <div className="execution-panel-title-row">
                  <h4>逐模型窗口覆盖</h4>
                  <Tag tone="muted">
                    {draft.modelContextWindows.length
                      ? `${draft.modelContextWindows.length} 项覆盖`
                      : "最高优先级"}
                  </Tag>
                </div>
                <p>
                  填写精确模型
                  ID，适用于网关别名。留空窗口表示自动解析；未知模型当前按 300K
                  估算。
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={14} />}
              onClick={() =>
                change("modelContextWindows", [
                  ...draft.modelContextWindows,
                  { model: "", tokens: "" },
                ])
              }
            >
              添加模型窗口
            </Button>
          </div>

          {!draft.modelContextWindows.length ? (
            <EmptyState
              variant="inline"
              title="尚未配置逐模型窗口覆盖"
              description="默认自动识别主流模型上下文窗口（未知模型按 300K tokens 估算，80% 压缩阈值约 240K）。若使用自建网关或自定义别名，可点击右上角“添加模型窗口”单独指定。"
            />
          ) : (
            <div className="context-window-list">
              {draft.modelContextWindows.map((row, index) => {
                const summary = formatModelWindowSummary(row.tokens);
                return (
                  <div
                    className="settings-entry context-window-entry"
                    key={index}
                  >
                    <div className="context-window-entry-head">
                      <div className="context-window-entry-title">
                        <span className="context-window-index">
                          #{index + 1}
                        </span>
                        <code className="context-window-model-pill">
                          {row.model.trim() || "待填写模型 ID"}
                        </code>
                        <span
                          className={`context-window-summary-pill${
                            summary.valid ? "" : " is-invalid"
                          }`}
                        >
                          {summary.text}
                        </span>
                      </div>
                      <div className="context-window-entry-actions">
                        <div
                          className="context-window-quick-chips"
                          role="group"
                          aria-label={`模型 ${index + 1} 常用窗口容量`}
                        >
                          {MODEL_WINDOW_PRESETS.map((preset) => {
                            const active = row.tokens.trim() === preset.value;
                            return (
                              <button
                                key={preset.value || "auto"}
                                type="button"
                                aria-pressed={active}
                                className={`context-window-chip${
                                  active ? " is-active" : ""
                                }`}
                                onClick={() =>
                                  change(
                                    "modelContextWindows",
                                    draft.modelContextWindows.map((v, i) =>
                                      i === index
                                        ? {
                                            ...v,
                                            tokens: preset.value,
                                          }
                                        : v,
                                    ),
                                  )
                                }
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="settings-entry-remove context-window-remove-btn"
                          icon={<Trash size={14} />}
                          onClick={() =>
                            change(
                              "modelContextWindows",
                              draft.modelContextWindows.filter(
                                (_, i) => i !== index,
                              ),
                            )
                          }
                        >
                          移除此窗口覆盖
                        </Button>
                      </div>
                    </div>
                    <div className="settings-entry-content">
                      <div className="settings-columns">
                        <Field id={`window-model-${index}`} label="模型 ID">
                          <Input
                            id={`window-model-${index}`}
                            placeholder="例如 gpt-4o 或 custom-model"
                            value={row.model}
                            onChange={(e) =>
                              change(
                                "modelContextWindows",
                                draft.modelContextWindows.map((v, i) =>
                                  i === index
                                    ? {
                                        ...v,
                                        model: e.target.value,
                                      }
                                    : v,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field
                          id={`window-tokens-${index}`}
                          label="窗口 tokens"
                        >
                          <Input
                            id={`window-tokens-${index}`}
                            type="number"
                            placeholder="留空自动解析"
                            value={row.tokens}
                            onChange={(e) =>
                              change(
                                "modelContextWindows",
                                draft.modelContextWindows.map((v, i) =>
                                  i === index
                                    ? {
                                        ...v,
                                        tokens: e.target.value,
                                      }
                                    : v,
                                ),
                              )
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <details className="settings-legacy context-legacy-fold">
          <summary className="context-legacy-summary">
            <div className="context-legacy-summary-main">
              <span className="context-legacy-title">兼容性设置</span>
              <span className="context-legacy-sub">
                仅用于无 token 窗口的旧版字符级回退预算
              </span>
            </div>
            <div className="context-legacy-summary-side">
              <span className="context-legacy-pill">
                {draft.contextBudgetChars.trim()
                  ? `${Number(draft.contextBudgetChars).toLocaleString()} 字符`
                  : "未设置"}
              </span>
              <CaretDown
                size={14}
                weight="bold"
                className="context-legacy-caret"
                aria-hidden="true"
              />
            </div>
          </summary>
          <div className="settings-legacy-body context-legacy-body">
            {text(
              "contextBudgetChars",
              "旧版字符预算",
              "仅用于无 token 窗口的兼容路径；当前默认 300K 窗口下不会作为压缩上限。",
              "number",
            )}
          </div>
        </details>
      </div>
    </section>
  );
}
