import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "#lib/utils";

/** Use for icon-only buttons and truncated text; keep native title elsewhere. */
export function TooltipProvider({
  delayDuration = 400,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  inline = false,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content> & {
  /** Render without a portal (gallery and server tests). */
  readonly inline?: boolean;
}) {
  const content = (
    <TooltipPrimitive.Content
      data-slot="tooltip-content"
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-w-64 rounded-sm bg-foreground px-2 py-1 font-sans text-background text-xs shadow-dropdown",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0",
        "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
        className,
      )}
      {...props}
    >
      {children}
    </TooltipPrimitive.Content>
  );
  return inline ? (
    content
  ) : (
    <TooltipPrimitive.Portal>{content}</TooltipPrimitive.Portal>
  );
}
