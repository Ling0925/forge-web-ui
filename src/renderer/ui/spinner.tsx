import { CircleNotch } from "@phosphor-icons/react";
import type { ComponentProps } from "react";
import { cn } from "#lib/utils";

/** Decorative busy indicator; pair it with text or aria-busy on the owner. */
export function Spinner({
  className,
  ...props
}: Omit<ComponentProps<typeof CircleNotch>, "ref">) {
  return (
    <CircleNotch
      data-slot="spinner"
      aria-hidden="true"
      className={cn(
        "size-4 animate-spin motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
