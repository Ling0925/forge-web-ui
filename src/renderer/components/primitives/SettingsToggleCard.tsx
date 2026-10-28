import type { ReactNode } from "react";

export interface SettingsToggleCardProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly id?: string;
  readonly ariaLabel?: string;
  readonly meta?: ReactNode;
}

export function SettingsToggleCard({
  title,
  description,
  checked,
  onChange,
  disabled = false,
  className = "",
  id,
  ariaLabel,
  meta,
}: SettingsToggleCardProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={typeof title === "string" ? title : ariaLabel}
      disabled={disabled}
      className={`settings-toggle-card ${checked ? "is-checked" : ""} ${className}`}
      onClick={() => onChange(!checked)}
    >
      <div className="settings-toggle-card-content">
        <div className="settings-toggle-card-header">
          <span className="settings-toggle-card-title">{title}</span>
          {meta}
        </div>
        {description && (
          <div className="settings-toggle-card-desc">{description}</div>
        )}
      </div>
      <div className="settings-toggle-switch" aria-hidden="true">
        <div className="settings-toggle-thumb" />
      </div>
    </button>
  );
}
