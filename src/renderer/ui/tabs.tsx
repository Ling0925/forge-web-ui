import * as m from "motion/react-m";
import { Tabs as TabsPrimitive } from "radix-ui";
import {
  type ComponentProps,
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
} from "react";
import { cn } from "#lib/utils";

interface TabsState {
  readonly value: string | undefined;
  readonly layoutId: string;
}

const TabsContext = createContext<TabsState>({
  value: undefined,
  layoutId: "tabs",
});
const ListContext = createContext<"segmented" | "underline">("segmented");

/** Radix Tabs that also tracks the active value so triggers can draw a shared Motion indicator. */
export function Tabs({
  value: controlled,
  defaultValue,
  onValueChange,
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Root>) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const value = controlled ?? uncontrolled;
  const handleChange = useCallback(
    (next: string) => {
      if (controlled === undefined) setUncontrolled(next);
      onValueChange?.(next);
    },
    [controlled, onValueChange],
  );
  const layoutId = `tabs-indicator-${useId()}`;
  const state = useMemo(() => ({ value, layoutId }), [value, layoutId]);
  return (
    <TabsContext.Provider value={state}>
      <TabsPrimitive.Root
        data-slot="tabs"
        value={value}
        onValueChange={handleChange}
        className={cn("flex flex-col gap-3", className)}
        {...props}
      />
    </TabsContext.Provider>
  );
}

export function TabsList({
  className,
  variant = "segmented",
  ...props
}: ComponentProps<typeof TabsPrimitive.List> & {
  readonly variant?: "segmented" | "underline";
}) {
  return (
    <ListContext.Provider value={variant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(
          "inline-flex w-fit items-center",
          variant === "segmented"
            ? "h-8 gap-0.5 rounded-md bg-muted p-0.5"
            : "h-9 gap-4 border-border border-b",
          className,
        )}
        {...props}
      />
    </ListContext.Provider>
  );
}

export function TabsTrigger({
  className,
  value,
  children,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { value: active, layoutId } = useContext(TabsContext);
  const variant = useContext(ListContext);
  const selected = active === value;
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        "relative inline-flex cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium font-sans text-sm",
        "text-muted-foreground transition-colors duration-[var(--duration-fast)] hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground",
        variant === "segmented" ? "h-7 rounded-sm px-2.5" : "h-full px-0.5",
        className,
      )}
      {...props}
    >
      {selected ? (
        <m.span
          layoutId={layoutId}
          data-slot="tabs-indicator"
          aria-hidden="true"
          className={cn(
            "absolute",
            variant === "segmented"
              ? "inset-0 rounded-sm bg-card shadow-xs"
              : "inset-x-0 -bottom-px h-0.5 rounded-full bg-brand",
          )}
        />
      ) : null}
      <span className="relative">{children}</span>
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("outline-none", className)}
      {...props}
    />
  );
}
