import { CaretDown, Check } from "@phosphor-icons/react";
import * as m from "motion/react-m";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cn } from "#lib/utils";
import { useDismiss } from "../primitives/useDismiss";

/**
 * Composer toolbar choice (mode / permission). Behaviour, roles and keyboard
 * handling are unchanged from the legacy control; only the skin moved to
 * Tailwind utilities (trigger chrome lives in styles/surfaces/composer.css so
 * the plain image button in Composer shares it). The hover highlight is a
 * Motion shared-layout pill that glides between items; without a
 * MotionProvider (or with reduced motion) it simply jumps.
 */

export function ComposerDropdown<T extends string>({
  value,
  onChange,
  options,
  icon,
  ariaLabel,
  iconOnly = false,
  disabled = false,
}: {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly options: readonly {
    readonly value: T;
    readonly label: string;
    readonly sub?: string;
  }[];
  readonly icon?: ReactNode;
  readonly ariaLabel: string;
  readonly iconOnly?: boolean;
  readonly disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const descId = useId();
  const highlightId = useId();
  const [hovered, setHovered] = useState<T | null>(null);
  const current = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) {
      setHovered(null);
      return;
    }
    if (disabled) {
      setOpen(false);
      return;
    }
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus();
  }, [open, disabled]);
  useDismiss({
    open,
    refs: [containerRef],
    onDismiss: () => setOpen(false),
  });

  return (
    <div
      className={cn(
        "composer-dropdown relative inline-flex",
        open && "is-open",
      )}
      ref={containerRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
          return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        if (!open) {
          if (!disabled) setOpen(true);
          return;
        }
        const items = Array.from(
          menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
        );
        const index = items.findIndex(
          (item) => item === document.activeElement,
        );
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length;
        items[next]?.focus();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={cn("composer-dropdown-trigger", iconOnly && "is-icon-only")}
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={descId}
        title={
          iconOnly && current ? `${ariaLabel}：${current.label}` : undefined
        }
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-expanded={open}
      >
        {icon && (
          <span className="composer-dropdown-icon inline-flex items-center">
            {icon}
          </span>
        )}
        {!iconOnly && (
          <span className="composer-dropdown-label truncate">
            {current?.label}
          </span>
        )}
        {!iconOnly && (
          <CaretDown
            size={12}
            aria-hidden="true"
            className={cn(
              "composer-dropdown-caret text-muted-foreground transition-transform duration-[var(--duration-normal)] ease-out",
              open && "is-open rotate-180",
            )}
          />
        )}
      </button>
      <span id={descId} className="visually-hidden">
        {current?.label}
      </span>
      {open && !disabled && (
        <div
          ref={menuRef}
          id={menuId}
          className={cn(
            "composer-dropdown-menu absolute bottom-[calc(100%+8px)] left-0 z-50 flex min-w-60 flex-col gap-0.5 p-1.5",
            "rounded-xl border border-border bg-popover text-popover-foreground shadow-overlay",
            "origin-bottom-left animate-in fade-in-0 zoom-in-[0.97] slide-in-from-bottom-1 duration-150 ease-out",
          )}
          role="menu"
          aria-label={ariaLabel}
          onPointerLeave={() => setHovered(null)}
        >
          <p
            aria-hidden="true"
            className="px-2.5 pt-1.5 pb-1 font-medium text-2xs text-muted-foreground uppercase tracking-wide"
          >
            {ariaLabel}
          </p>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              tabIndex={-1}
              className={cn(
                "composer-dropdown-item group/item relative flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-2.5 py-2 text-left font-[inherit] text-foreground",
                "outline-none focus-visible:bg-accent focus-visible:shadow-[inset_0_0_0_2px_var(--focus-ring)]",
                option.value === value && "is-selected",
              )}
              onPointerEnter={() => setHovered(option.value)}
              onFocus={() => setHovered(option.value)}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              {hovered === option.value && (
                <m.span
                  layoutId={highlightId}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-lg bg-accent"
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  "relative flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-[var(--duration-fast)]",
                  option.value === value
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-input bg-card",
                )}
              >
                {option.value === value && (
                  <Check
                    size={10}
                    weight="bold"
                    aria-hidden="true"
                    className="composer-dropdown-check"
                  />
                )}
              </span>
              <span className="composer-dropdown-item-main relative flex min-w-0 flex-col gap-0.5">
                <span
                  className={cn(
                    "composer-dropdown-item-title text-sm leading-tight",
                    option.value === value && "font-medium",
                  )}
                >
                  {option.label}
                </span>
                {option.sub && (
                  <span className="composer-dropdown-item-sub text-muted-foreground text-xs leading-tight">
                    {option.sub}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
