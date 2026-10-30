import { Tag } from "../../primitives/Tag";
import { EffortBars } from "../ModelAccessPanels";
import { GLOBAL_REASONING_EFFORT_OPTIONS } from "./settings-options";
import type { SettingsForm } from "./useSettingsForm";

export function ReasoningSection({ form }: { readonly form: SettingsForm }) {
  const { draft, change, select } = form;
  return (
    <section className="settings-section" aria-label="推理设置">
      <div className="provider-inference">
        <div className="provider-inference-head">
          <div className="provider-inference-info">
            <div className="provider-inference-title-row">
              <h3>默认思考等级</h3>
              <Tag>通用推理偏好</Tag>
            </div>
            <p>
              适用于支持思考参数的模型；未单独定制思考等级的模型将跟随此设定，修改后通过底部保存设置。
            </p>
          </div>
          <div className="provider-inference-status-wrap">
            <span className="provider-inference-current-pill">
              当前：
              {GLOBAL_REASONING_EFFORT_OPTIONS.find(
                (item) => item.value === draft.reasoningEffort,
              )?.label ?? "模型默认"}
            </span>
            <div className="visually-hidden">
              {select(
                "reasoningEffort",
                "默认思考强度",
                GLOBAL_REASONING_EFFORT_OPTIONS.map((item) => ({
                  value: item.value,
                  label: item.label,
                })),
              )}
            </div>
          </div>
        </div>

        <div className="provider-inference-card">
          <fieldset
            className="provider-inference-grid"
            aria-label="全局默认思考等级快捷选择"
          >
            {GLOBAL_REASONING_EFFORT_OPTIONS.map((item) => {
              const active = draft.reasoningEffort === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={active}
                  className={`provider-inference-option${active ? " is-active" : ""}`}
                  onClick={() => change("reasoningEffort", item.value)}
                >
                  <div className="provider-inference-option-top">
                    <span className="provider-inference-option-name">
                      {item.shortLabel}
                    </span>
                    {item.bars > 0 ? (
                      <EffortBars bars={item.bars} />
                    ) : (
                      <span className="provider-inference-option-tag">
                        {item.value === "default" ? "自动" : "0"}
                      </span>
                    )}
                  </div>
                  <span className="provider-inference-option-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </fieldset>
          {(() => {
            const activeOption =
              GLOBAL_REASONING_EFFORT_OPTIONS.find(
                (item) => item.value === draft.reasoningEffort,
              ) ?? GLOBAL_REASONING_EFFORT_OPTIONS[0]!;
            return (
              <div className="provider-inference-summary">
                <span className="provider-inference-summary-desc">
                  当前设定：
                  <strong>{activeOption.label}</strong> · {activeOption.desc}
                </span>
                <span className="provider-inference-summary-rule">
                  优先级：单模型覆盖 ＞ 全局默认 ＞ 模型默认
                </span>
              </div>
            );
          })()}
        </div>
      </div>
    </section>
  );
}
