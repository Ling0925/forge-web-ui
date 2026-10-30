import { Check, Clock, ShieldCheck, Warning } from "@phosphor-icons/react";
import { permissionLabels } from "../../../state/permission-labels";
import { Tag } from "../../primitives/Tag";
import {
  EXECUTION_PERMISSION_OPTIONS,
  REQUEST_TIMEOUT_PRESETS,
  formatTimeoutDuration,
} from "./settings-options";
import type { SettingsForm } from "./useSettingsForm";

export function ExecutionSection({ form }: { readonly form: SettingsForm }) {
  const { draft, change, text, select } = form;
  return (
    <section className="settings-section" aria-label="执行配置">
      <div className="settings-flat-group execution-settings-layout">
        <div className="execution-panel-card">
          <div className="execution-panel-head">
            <div className="execution-panel-head-main">
              <span className="execution-panel-icon" aria-hidden="true">
                <ShieldCheck size={16} weight="duotone" />
              </span>
              <div className="execution-panel-title-wrap">
                <div className="execution-panel-title-row">
                  <h3>默认权限</h3>
                  <Tag tone="muted">新建运行策略</Tag>
                </div>
                <p>
                  为新建会话与后续发起的运行设定默认安全边界；切换默认策略不会自动提升当前正在运行的任务权限。
                </p>
              </div>
            </div>
            <span
              className={`execution-active-pill is-${draft.defaultPermission}`}
            >
              {EXECUTION_PERMISSION_OPTIONS.find(
                (opt) => opt.value === draft.defaultPermission,
              )?.title ?? "工作区模式"}{" "}
              · {draft.defaultPermission}
            </span>
          </div>

          <div className="visually-hidden">
            {select(
              "defaultPermission",
              "默认权限",
              Object.entries(permissionLabels).map(([value, label]) => ({
                value,
                label,
              })),
            )}
          </div>

          <fieldset
            className="execution-permission-grid"
            aria-label="权限策略选择"
          >
            {EXECUTION_PERMISSION_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = draft.defaultPermission === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  className={`execution-permission-card is-${option.tone}${
                    active ? " is-active" : ""
                  }`}
                  onClick={() => change("defaultPermission", option.value)}
                >
                  <div className="execution-permission-top">
                    <span
                      className={`execution-permission-icon is-${option.tone}`}
                      aria-hidden="true"
                    >
                      <Icon size={18} weight={active ? "fill" : "duotone"} />
                    </span>
                    <div className="execution-permission-badges">
                      <span
                        className={`execution-permission-badge is-${option.tone}`}
                      >
                        {option.badge}
                      </span>
                      {active && (
                        <span
                          className="execution-permission-check"
                          aria-hidden="true"
                        >
                          <Check size={12} weight="bold" />
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="execution-permission-heading">
                    <div className="execution-permission-title-line">
                      <span className="execution-permission-title">
                        {option.title}
                      </span>
                      <code>{option.value}</code>
                    </div>
                    <span className="execution-permission-subtitle">
                      {option.subtitle}
                    </span>
                  </div>

                  <p className="execution-permission-desc">
                    {option.description}
                  </p>

                  <div className="execution-capability-list" aria-hidden="true">
                    {option.capabilities.map((cap) => (
                      <div key={cap.label} className="execution-capability-row">
                        <span className="execution-capability-label">
                          {cap.label}
                        </span>
                        <span
                          className={`execution-capability-state is-${cap.tone}`}
                        >
                          {cap.state}
                        </span>
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </fieldset>

          {draft.defaultPermission === "unrestricted" && (
            <div className="settings-warning execution-warning-banner">
              <Warning
                size={18}
                weight="fill"
                className="settings-warning-icon"
              />
              <span>
                无限制模式允许直接执行命令，可能访问工作区以外的文件和网络。仅在信任任务时使用。
              </span>
            </div>
          )}
        </div>

        <div className="execution-panel-card">
          {(() => {
            const timeoutMeta = formatTimeoutDuration(draft.requestTimeoutMs);
            return (
              <>
                <div className="execution-panel-head">
                  <div className="execution-panel-head-main">
                    <span className="execution-panel-icon" aria-hidden="true">
                      <Clock size={16} weight="duotone" />
                    </span>
                    <div className="execution-panel-title-wrap">
                      <div className="execution-panel-title-row">
                        <h3>请求空闲超时</h3>
                        <Tag tone="muted">流式保活阈值</Tag>
                      </div>
                      <p>
                        限制单次模型请求在流式输出期间的最大静默等待时间；只中断单次请求的空闲，不限制任务总时长。
                      </p>
                    </div>
                  </div>
                  <span
                    className={`execution-timeout-pill${
                      timeoutMeta.valid ? "" : " is-invalid"
                    }`}
                  >
                    {timeoutMeta.text}
                  </span>
                </div>

                <fieldset
                  className="execution-timeout-presets"
                  aria-label="空闲超时快捷档位"
                >
                  {REQUEST_TIMEOUT_PRESETS.map((preset) => {
                    const active =
                      draft.requestTimeoutMs.trim() === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        aria-pressed={active}
                        className={`execution-timeout-preset${
                          active ? " is-active" : ""
                        }`}
                        onClick={() => change("requestTimeoutMs", preset.value)}
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
                    "requestTimeoutMs",
                    "请求空闲超时（毫秒）",
                    "1000–600000；只中断单次请求的空闲，不限制任务总时长。",
                    "number",
                    "60000",
                  )}
                </div>
              </>
            );
          })()}
        </div>

        <div className="execution-panel-card execution-runtime-card">
          <div className="execution-runtime-grid">
            <div className="execution-runtime-item">
              <span className="execution-runtime-badge">主机直连执行</span>
              <strong>非 OS 容器沙箱</strong>
              <span>
                命令以当前系统用户环境直接执行，依赖权限档位与审批门控控制风险。
              </span>
            </div>
            <div className="execution-runtime-item">
              <span className="execution-runtime-badge">长任务连续运行</span>
              <strong>轮次与总时长不设上限</strong>
              <span>
                不因工具调用次数、子代理累计次数或任务总耗时截断复杂工程任务。
              </span>
            </div>
            <div className="execution-runtime-item">
              <span className="execution-runtime-badge">并发与中断控制</span>
              <strong>最多 4 路子代理并发</strong>
              <span>
                支持并行派发子代理协同执行，运行期间可随时手动取消当前任务。
              </span>
            </div>
          </div>
          <p className="settings-section-hint execution-runtime-footnote">
            更改默认权限不会提升当前运行的权限。命令不在 OS
            沙箱内执行；工具调用次数、子代理累计次数与任务总时长均不限（子代理最多同时活跃
            4 个，可随时手动取消运行）。
          </p>
        </div>
      </div>
    </section>
  );
}
