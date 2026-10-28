import { CaretDown, Check } from "@phosphor-icons/react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export interface SettingsSelectOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly sub?: string;
  readonly disabled?: boolean;
}

export interface SettingsSelectProps<T extends string = string> {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly options: readonly SettingsSelectOption<T>[];
  readonly ariaLabel: string;
  readonly id?: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly icon?: ReactNode;
}

export function SettingsSelect<T extends string = string>({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  disabled = false,
  className = "",
  icon,
}: SettingsSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const current = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!open) return;
    if (disabled) {
      setOpen(false);
      return;
    }
    // Focus selected option on open
    popoverRef.current
      ?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open, disabled]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();

    if (!open) {
      if (!disabled) setOpen(true);
      return;
    }

    const items = Array.from(
      popoverRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]:not(:disabled)',
      ) ?? [],
    );
    if (!items.length) return;

    const currentIndex = items.findIndex(
      (item) => item === document.activeElement,
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (currentIndex +
              (event.key === "ArrowDown" ? 1 : -1) +
              items.length) %
            items.length;
    items[nextIndex]?.focus();
  };

  return (
    <div
      ref={containerRef}
      className={`settings-select ${open ? "is-open" : ""} ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="settings-select-trigger"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
      >
        <span className="settings-select-trigger-content">
          {icon && <span className="settings-select-icon">{icon}</span>}
          <span className="settings-select-label">
            {current?.label ?? value}
          </span>
        </span>
        <CaretDown
          size={12}
          weight="bold"
          aria-hidden="true"
          className="settings-select-caret"
        />
      </button>

      {open && !disabled && (
        <div
          ref={popoverRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="settings-select-popover"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                className={`settings-select-option ${isSelected ? "is-selected" : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span className="settings-select-option-text">
                  <span className="settings-select-option-label">
                    {option.label}
                  </span>
                  {option.sub && (
                    <span className="settings-select-option-sub">
                      {option.sub}
                    </span>
                  )}
                </span>
                {isSelected && (
                  <Check
                    size={14}
                    weight="bold"
                    aria-hidden="true"
                    className="settings-select-check"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
