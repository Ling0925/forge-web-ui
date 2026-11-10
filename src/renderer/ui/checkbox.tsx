import { Check, Minus } from "@phosphor-icons/react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "#lib/utils";

/** shadcn-style checkbox on the Radix checkbox the app already ships. */
export function Checkbox({
  className,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer grid size-4 shrink-0 cursor-pointer place-items-center rounded-xs border border-input bg-card shadow-xs",
        "transition-[background-color,border-color] duration-[var(--duration-fast)] ease-out",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        "aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="group grid place-items-center"
      >
        <Check
          weight="bold"
          aria-hidden="true"
          className="size-3 group-data-[state=indeterminate]:hidden"
        />
        <Minus
          weight="bold"
          aria-hidden="true"
          className="hidden size-3 group-data-[state=indeterminate]:block"
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
