import {
  type Context,
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
} from "react";
import * as workbench from "./workbench-context";
import type {
  WorkbenchActions,
  WorkbenchController,
  WorkbenchStore,
} from "./workbench-context";

/**
 * Fine-grained subscriptions to the workbench controller.
 *
 * - `useWorkbenchActions()` returns stable callbacks and never re-renders on
 *   state changes.
 * - `useWorkbenchSelector(select, isEqual?)` re-renders only when the selected
 *   value changes (`Object.is` by default, `shallowEqual` for tuples/objects).
 *
 * When the real provider is absent (tests that replace `workbench-context`
 * with a fixture exporting only `useWorkbench`), both fall back to
 * `useWorkbench()`, so fixtures keep working unchanged.
 */
const StoreContext = (
  workbench as {
    readonly WorkbenchStoreContext?: Context<WorkbenchStore | null>;
  }
).WorkbenchStoreContext;
const ActionsContext = (
  workbench as {
    readonly WorkbenchActionsContext?: Context<WorkbenchActions | null>;
  }
).WorkbenchActionsContext;

export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  )
    return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      Object.is(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
  );
}

function useStoreSelector<T>(
  selector: (controller: WorkbenchController) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  // biome-ignore lint/style/noNonNullAssertion: only installed when the context exists
  const store = useContext(StoreContext!);
  if (!store) throw new Error("WorkbenchProvider required");
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const equalRef = useRef(isEqual);
  equalRef.current = isEqual;
  const cache = useRef<{ readonly value: T } | null>(null);
  const getSnapshot = useCallback(() => {
    const next = selectorRef.current(store.get());
    const previous = cache.current;
    if (previous && equalRef.current(previous.value, next))
      return previous.value;
    cache.current = { value: next };
    return next;
  }, [store]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

function useFallbackSelector<T>(
  selector: (controller: WorkbenchController) => T,
): T {
  return selector(workbench.useWorkbench());
}

function useStoreActions(): WorkbenchActions {
  // biome-ignore lint/style/noNonNullAssertion: only installed when the context exists
  const actions = useContext(ActionsContext!);
  if (!actions) throw new Error("WorkbenchProvider required");
  return actions;
}

function useFallbackActions(): WorkbenchActions {
  return workbench.useWorkbench();
}

export const useWorkbenchSelector: <T>(
  selector: (controller: WorkbenchController) => T,
  isEqual?: (a: T, b: T) => boolean,
) => T = StoreContext ? useStoreSelector : useFallbackSelector;

export const useWorkbenchActions: () => WorkbenchActions = ActionsContext
  ? useStoreActions
  : useFallbackActions;

/** Element-wise `shallowEqual` for derived lists of small records. */
export function shallowArrayEqual<T>(
  a: readonly T[],
  b: readonly T[],
): boolean {
  return (
    a === b ||
    (a.length === b.length &&
      a.every((item, index) => shallowEqual(item, b[index])))
  );
}
