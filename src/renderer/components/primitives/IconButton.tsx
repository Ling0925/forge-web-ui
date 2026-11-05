import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import "./buttons.css";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  readonly label: string;
  readonly icon: ReactNode;
  readonly variant?: "secondary" | "ghost" | "danger";
  readonly size?: "sm" | "md" | "lg";
  readonly loading?: boolean;
  /** Visual state for toggles (menu open, panel expanded). */
  readonly active?: boolean;
  /** Extra adornments after the icon, e.g. a count badge or a responsive label. */
  readonly children?: ReactNode;
  readonly ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  loading = false,
  active = false,
  disabled = false,
  className = "",
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  const classes = [
    "btn",
    "btn-icon",
    `btn-${variant}`,
    `btn-${size}`,
    active ? "is-active" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={classes}
      disabled={isDisabled}
      aria-label={label}
      title={label}
      aria-busy={loading ? "true" : undefined}
      {...rest}
    >
      {loading ? (
        <span className="btn-spinner" aria-hidden="true" />
      ) : (
        <span aria-hidden="true" style={{ display: "inline-flex" }}>
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
