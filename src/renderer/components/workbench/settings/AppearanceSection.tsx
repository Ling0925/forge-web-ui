import { Check } from "@phosphor-icons/react";
import type { SettingsForm } from "./useSettingsForm";

export function AppearanceSection({ form }: { readonly form: SettingsForm }) {
  const { draft, change } = form;
  return (
    <section className="settings-section" aria-label="外观配置">
      <div className="settings-flat-group">
        <div className="settings-theme-options">
          {[
            { value: "system", label: "跟随系统" },
            { value: "light", label: "浅色" },
            { value: "dark", label: "深色" },
          ].map((theme) => {
            const active = draft.theme === theme.value;
            return (
              <button
                type="button"
                key={theme.value}
                className={`settings-theme-card ${active ? "is-active" : ""}`}
                aria-pressed={active}
                onClick={() => change("theme", theme.value)}
              >
                <div
                  className={`settings-theme-preview preview-${theme.value}`}
                  data-theme={theme.value === "dark" ? "dark" : "light"}
                >
                  <div className="preview-window-bar">
                    <span className="window-dot" />
                    <span className="window-dot" />
                    <span className="window-dot" />
                  </div>
                  <div className="preview-window-content">
                    <div className="preview-sidebar">
                      <div className="preview-line sm" />
                      <div className="preview-line xs" />
                      <div className="preview-line sm" />
                    </div>
                    <div
                      className="preview-main"
                      data-theme={theme.value === "light" ? undefined : "dark"}
                    >
                      <div className="preview-bubble received" />
                      <div className="preview-bubble sent" />
                    </div>
                  </div>
                </div>
                <div className="settings-theme-footer">
                  <span className="settings-theme-label">{theme.label}</span>
                  {active && (
                    <span className="settings-theme-check" aria-hidden="true">
                      <Check size={12} weight="bold" />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <p className="settings-section-hint">
          保存后立即应用，不影响正在进行的任务。
        </p>
      </div>
    </section>
  );
}
