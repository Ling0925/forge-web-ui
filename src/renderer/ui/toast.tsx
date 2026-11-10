import { X } from "@phosphor-icons/react";
import { type VariantProps, cva } from "class-variance-authority";
import { Toast as ToastPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "#lib/utils";

/** Non-blocking global feedback; inline role=status feedback stays where it is. */
export const ToastProvider = ToastPrimitive.Provider;

export function ToastViewport({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "fixed right-4 bottom-4 z-[60] flex max-h-screen w-[calc(100%-2rem)] max-w-sm flex-col gap-2 outline-none",
        className,
      )}
      {...props}
    />
  );
}

export const toastVariants = cva(
  [
    "group pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border bg-popover p-3 pr-9",
    "text-popover-foreground shadow-dropdown",
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-bottom-2",
    "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=end]:animate-out",
  ],
  {
    variants: {
      variant: {
        default: "border-border",
        success: "border-success-border",
        destructive: "border-error-border",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Toast({
  className,
  variant,
  ...props
}: ComponentProps<typeof ToastPrimitive.Root> &
  VariantProps<typeof toastVariants>) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
}

export function ToastTitle({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Title>) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("font-medium text-sm", className)}
      {...props}
    />
  );
}

export function ToastDescription({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Description>) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("text-muted-foreground text-xs", className)}
      {...props}
    />
  );
}

export function ToastAction({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Action>) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      className={cn(
        "inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md border border-input bg-card px-2.5 font-medium text-xs hover:bg-accent",
        className,
      )}
      {...props}
    />
  );
}

export function ToastClose({
  className,
  label = "关闭",
  ...props
}: ComponentProps<typeof ToastPrimitive.Close> & { readonly label?: string }) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label={label}
      className={cn(
        "absolute top-2.5 right-2.5 grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
      {...props}
    >
      <X aria-hidden="true" className="size-3.5" />
    </ToastPrimitive.Close>
  );
}
