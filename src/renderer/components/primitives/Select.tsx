import { Check } from "@phosphor-icons/react";
import * as RadixSelect from "@radix-ui/react-select";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import "./forms.css";
import "./select.css";

/**
 * 统一下拉选择组件（基于 Radix Select）。
 *
 * - 替代原生 `<select>` 包装与自绘 SettingsSelect 两套实现；
 * - 触发器沿用 `.form-select` 外观，弹层沿用设置页下拉的视觉；
 * - 支持空字符串选项（Radix 不允许空值，内部做编码）；
 * - 位于原生 `<dialog>` 内时自动把弹层挂到该 dialog，避免被 top layer 遮挡。
 */
export interface SelectOption<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly sub?: string;
  readonly disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly options: readonly SelectOption<T>[];
  readonly id?: string;
  readonly name?: string;
  readonly "aria-label"?: string;
  readonly "aria-describedby"?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly isError?: boolean;
  readonly icon?: ReactNode;
  readonly className?: string;
  /** 附加到弹层（Portal 内容）上的类名，弹层不在触发器 DOM 子树内。 */
  readonly contentClassName?: string;
}

const EMPTY_VALUE = "__forge-select-empty__";
const encode = (value: string) => (value === "" ? EMPTY_VALUE : value);
const decode = (value: string) => (value === EMPTY_VALUE ? "" : value);

export function Select<T extends string = string>({
  value,
  onValueChange,
  options,
  id,
  name,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  placeholder,
  disabled = false,
  isError = false,
  icon,
  className = "",
  contentClassName = "",
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const triggerRef = useCallback((node: HTMLButtonElement | null) => {
    setContainer(node?.closest("dialog") ?? null);
  }, []);
  const current = options.find((option) => option.value === value);
  const triggerClasses = [
    "form-select",
    "forge-select-trigger",
    isError ? "is-error" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <RadixSelect.Root
      open={open}
      onOpenChange={setOpen}
      value={current ? encode(current.value) : ""}
      onValueChange={(next) => onValueChange(decode(next) as T)}
      disabled={disabled}
      {...(name ? { name } : {})}
    >
      <RadixSelect.Trigger
        ref={triggerRef}
        id={id}
        className={triggerClasses}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={isError ? "true" : undefined}
        data-value={current?.value ?? ""}
      >
        <span className="forge-select-value">
          {icon && (
            <span className="forge-select-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="forge-select-label">
            <RadixSelect.Value placeholder={placeholder}>
              {current?.label}
            </RadixSelect.Value>
          </span>
        </span>
      </RadixSelect.Trigger>
      <RadixSelect.Portal container={container}>
        <RadixSelect.Content
          className={`forge-select-content ${contentClassName}`.trim()}
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          aria-label={ariaLabel}
          onEscapeKeyDown={(event) => {
            // 只关闭下拉，不让 Escape 冒泡关闭外层 dialog / 面板。
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }}
          onKeyDown={(event: ReactKeyboardEvent) => {
            if (event.key === "Escape") event.stopPropagation();
          }}
        >
          <RadixSelect.Viewport className="forge-select-viewport">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={encode(option.value)}
                disabled={option.disabled ?? false}
                className="forge-select-item"
                data-value={option.value}
              >
                <span className="forge-select-item-text">
                  <RadixSelect.ItemText>
                    <span className="forge-select-item-label">
                      {option.label}
                    </span>
                  </RadixSelect.ItemText>
                  {option.sub && (
                    <span className="forge-select-item-sub">{option.sub}</span>
                  )}
                </span>
                <RadixSelect.ItemIndicator className="forge-select-check">
                  <Check size={14} weight="bold" aria-hidden="true" />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
