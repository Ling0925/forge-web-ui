import { Check, WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import "./setting-rows.css";

/** A titled block of setting rows on one settings page. */
export function SettingGroup({
  title,
  description,
  actions,
  children,
  tone,
  id,
}: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly tone?: "danger";
  readonly id?: string;
}) {
  return (
    <section
      className={`setting-group${tone ? ` is-${tone}` : ""}`}
      aria-label={title}
      id={id}
    >
      <header className="setting-group-head">
        <div className="setting-group-heading">
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? (
          <div className="setting-group-actions">{actions}</div>
        ) : null}
      </header>
      <div className="setting-group-body">{children}</div>
    </section>
  );
}

/** Label + description on the left, the control on the right. */
export function SettingRow({
  id,
  label,
  description,
  control,
  status,
  children,
  stacked = false,
}: {
  /** Anchor for search results; rendered as `setting-<id>`. */
  readonly id?: string;
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly control?: ReactNode;
  readonly status?: ReactNode;
  /** Extra content under the row, e.g. a custom value input. */
  readonly children?: ReactNode;
  /** Put the control under the label (wide controls such as cards). */
  readonly stacked?: boolean;
}) {
  return (
    <div
      className={`setting-row${stacked ? " is-stacked" : ""}`}
      id={id ? `setting-row-${id}` : undefined}
      data-setting={id}
    >
      <div className="setting-row-text">
        <div className="setting-row-label">{label}</div>
        {description ? (
          <div className="setting-row-description">{description}</div>
        ) : null}
      </div>
      {control || status ? (
        <div className="setting-row-control">
          {control}
          {status}
        </div>
      ) : null}
      {children ? <div className="setting-row-extra">{children}</div> : null}
    </div>
  );
}

export type SegmentedOption<T extends string> = Readonly<{
  value: T;
  label: string;
  title?: string;
}>;

/**
 * Few mutually exclusive choices (≤ 7). Use `Select` for more. Buttons use
 * `aria-pressed`, matching the other choice groups in Settings.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly SegmentedOption<T>[];
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
}) {
  return (
    <fieldset className="setting-segmented" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            title={option.title}
            disabled={disabled}
            className={`setting-segment${active ? " is-active" : ""}`}
            onClick={() => {
              if (!active) onChange(option.value);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

export type SaveStatus = Readonly<
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved" }
  | { state: "error"; message: string }
>;

/** Inline auto-save feedback next to a control. */
export function SaveIndicator({ status }: { readonly status: SaveStatus }) {
  if (status.state === "idle") return null;
  if (status.state === "saving")
    return (
      <output className="setting-save is-saving" aria-live="polite">
        保存中…
      </output>
    );
  if (status.state === "saved")
    return (
      <output className="setting-save is-saved" aria-live="polite">
        <Check size={12} weight="bold" aria-hidden="true" />
        已保存
      </output>
    );
  return (
    <span className="setting-save is-error" role="alert">
      <WarningCircle size={13} weight="bold" aria-hidden="true" />
      {status.message}
    </span>
  );
}
