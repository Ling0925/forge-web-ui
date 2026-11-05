import { Check } from "@phosphor-icons/react";
import * as RadixCheckbox from "@radix-ui/react-checkbox";
import "./checkbox.css";

/**
 * 统一复选框（基于 Radix Checkbox）。
 *
 * 渲染为 `role="checkbox"` 的按钮，可放在 `<label>` 内由文字标注，
 * 也可单独通过 `aria-label` 命名。视觉与表单控件 token 保持一致。
 */
export interface CheckboxProps {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly id?: string;
  readonly name?: string;
  readonly disabled?: boolean;
  readonly "aria-label"?: string;
  readonly className?: string;
}

export function Checkbox({
  checked,
  onCheckedChange,
  id,
  name,
  disabled = false,
  "aria-label": ariaLabel,
  className = "",
}: CheckboxProps) {
  return (
    <RadixCheckbox.Root
      id={id}
      checked={checked}
      onCheckedChange={(next) => onCheckedChange(next === true)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`forge-checkbox ${className}`.trim()}
      {...(name ? { name } : {})}
    >
      <RadixCheckbox.Indicator className="forge-checkbox-indicator">
        <Check size={11} weight="bold" aria-hidden="true" />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
}
