import type { ComponentProps } from "react";
import { cn } from "#lib/utils";
import { fieldClasses } from "#ui/input";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldClasses,
        "min-h-20 resize-y px-2.5 py-2 leading-normal",
        className,
      )}
      {...props}
    />
  );
}
