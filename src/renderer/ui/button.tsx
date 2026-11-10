import { type VariantProps, cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "#lib/utils";
import { Spinner } from "#ui/spinner";

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap",
    "rounded-md border border-transparent font-sans font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-[var(--duration-fast)] ease-out",
    "active:not-disabled:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
    "aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:not-disabled:bg-primary-hover active:not-disabled:bg-primary-active",
        secondary:
          "bg-secondary text-secondary-foreground hover:not-disabled:bg-active",
        outline:
          "border-input bg-card text-foreground shadow-xs hover:not-disabled:border-hover-border hover:not-disabled:bg-accent",
        ghost: "bg-transparent text-foreground hover:not-disabled:bg-accent",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:not-disabled:bg-destructive/90",
        link: "h-auto border-0 bg-transparent px-0 text-link underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-7 px-2.5 text-xs [&_svg]:size-3.5",
        default: "h-8 px-3 text-sm [&_svg]:size-4",
        lg: "h-10 px-4 text-base [&_svg]:size-4",
        icon: "size-8 p-0 [&_svg]:size-4",
        "icon-sm": "size-7 p-0 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  /** Render the child element (for example a link) with button styling. */
  readonly asChild?: boolean;
  /** Shows a spinner, sets aria-busy and blocks clicks; the label stays. */
  readonly loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  type,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot.Root data-slot="button" className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      data-slot="button"
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
