import { Check } from "@phosphor-icons/react";
import { useState } from "react";
import { Input } from "../../primitives/Input";
import {
  SaveIndicator,
  Segmented,
  SettingGroup,
  SettingRow,
} from "./SettingRows";
import {
  EXECUTION_PERMISSION_OPTIONS,
  REQUEST_TIMEOUT_PRESETS,
} from "./settings-options";
import type { SettingsForm } from "./useSettingsForm";

const THEMES = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
] as const;

const CUSTOM = "custom";

export function GeneralSection({ form }: { readonly form: SettingsForm }) {
  const { draft, commit, statusOf, confirm } = form;
  const disabled = !form.state.settings;
  const presetTimeout = REQUEST_TIMEOUT_PRESETS.some(
    (preset) => preset.value === draft.requestTimeoutMs,
  );
  const [customChosen, setCustomTimeout] = useState(false);
  const customTimeout = customChosen || !presetTimeout;
  const [seconds, setSeconds] = useState(() =>
    String(Number(draft.requestTimeoutMs) / 1000),
  );
  const [timeoutError, setTimeoutError] = useState("");

  const choosePermission = async (value: string) => {
    if (value === draft.defaultPermission) return;
    if (
      value === "unrestricted" &&
      !(await confirm({
        title: "将默认权限设为无限制？",
        body: "新的运行将直接读写文件并执行终端命令，不再逐次请求批准。命令不在操作系统沙箱内运行，可能访问工作区以外的文件和网络。\n只在完全信任任务时使用；当前运行不受影响。",
        confirmLabel: "设为无限制",
        tone: "danger",
      }))
    )
      return;
    void commit("defaultPermission", value);
  };

  const saveCustomTimeout = () => {
    const value = Number(seconds.trim());
    if (
      !seconds.trim() ||
      !Number.isFinite(value) ||
      value < 1 ||
      value > 600
    ) {
      setTimeoutError("请输入 1–600 之间的秒数。");
      return;
    }
    setTimeoutError("");
    void commit("requestTimeoutMs", String(Math.round(value * 1000)));
  };

  return (
    <section className="settings-section" aria-label="通用配置">
      <SettingGroup title="外观">
        <SettingRow
          id="theme"
          label="主题"
          description="跟随系统会随操作系统的浅色 / 深色切换。"
          control={
            <Segmented
              label="主题"
              value={draft.theme}
              options={THEMES}
              disabled={disabled}
              onChange={(value) => void commit("theme", value)}
            />
          }
          status={<SaveIndicator status={statusOf("theme")} />}
        />
      </SettingGroup>

      <SettingGroup
        title="新运行的默认权限"
        description="更改不会提升当前正在进行的运行的权限。"
      >
        <SettingRow
          id="defaultPermission"
          stacked
          label="默认权限"
          description="命令以当前系统用户身份执行，不在操作系统沙箱内。"
          status={<SaveIndicator status={statusOf("defaultPermission")} />}
        >
          <fieldset className="execution-permission-grid" aria-label="默认权限">
            {EXECUTION_PERMISSION_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = draft.defaultPermission === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  disabled={disabled}
                  className={`execution-permission-card is-${option.tone}${
                    active ? " is-active" : ""
                  }`}
                  onClick={() => void choosePermission(option.value)}
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
                    <span className="execution-permission-title">
                      {option.title}
                    </span>
                    <span className="execution-permission-subtitle">
                      {option.subtitle}
                    </span>
                  </div>
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
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="请求">
        <SettingRow
          id="requestTimeoutMs"
          label="空闲超时"
          description="模型流式输出中断超过该时长才判定请求失败；不限制任务总时长。"
          control={
            <Segmented
              label="空闲超时"
              value={customTimeout ? CUSTOM : draft.requestTimeoutMs}
              disabled={disabled}
              options={[
                ...REQUEST_TIMEOUT_PRESETS.map((preset) => ({
                  value: preset.value as string,
                  label: preset.label,
                })),
                { value: CUSTOM, label: "自定义" },
              ]}
              onChange={(value) => {
                if (value === CUSTOM) {
                  setCustomTimeout(true);
                  setSeconds(String(Number(draft.requestTimeoutMs) / 1000));
                  return;
                }
                setCustomTimeout(false);
                setTimeoutError("");
                void commit("requestTimeoutMs", value);
              }}
            />
          }
          status={<SaveIndicator status={statusOf("requestTimeoutMs")} />}
        >
          {customTimeout && (
            <div className="setting-inline-input">
              <Input
                type="number"
                min={1}
                max={600}
                aria-label="自定义空闲超时（秒）"
                value={seconds}
                disabled={disabled}
                isError={Boolean(timeoutError)}
                onChange={(event) => setSeconds(event.target.value)}
                onBlur={saveCustomTimeout}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveCustomTimeout();
                  }
                }}
              />
              <span className="setting-unit">秒（1–600）</span>
              {timeoutError && (
                <SaveIndicator
                  status={{ state: "error", message: timeoutError }}
                />
              )}
            </div>
          )}
        </SettingRow>
      </SettingGroup>
    </section>
  );
}
