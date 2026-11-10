import type { ComponentProps } from "react";
import { cn } from "#lib/utils";

/** Field chrome shared by Input, Textarea and Select triggers. */
export const fieldClasses = [
  "w-full min-w-0 rounded-md border border-input bg-card font-sans text-sm text-foreground shadow-xs",
  "transition-[border-color,box-shadow] duration-[var(--duration-fast)] ease-out",
  "placeholder:text-muted-foreground hover:not-disabled:border-hover-border",
  "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20",
  "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
].join(" ");

export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      type={type ?? "text"}
      className={cn(fieldClasses, "h-8 px-2.5", className)}
      {...props}
    />
  );
}
