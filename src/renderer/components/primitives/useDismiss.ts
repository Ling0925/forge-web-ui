import { type RefObject, useEffect, useRef } from "react";

/**
 * 统一的浮层"外部关闭"逻辑：替代各弹层各自手写的
 * `window.addEventListener("pointerdown", …)`。
 *
 * - 指针在所有 `refs` 之外按下时调用 `onDismiss`；
 * - `closeOnEscape: true` 时按下 Escape 也会关闭；
 * - `closeOnScroll: true` 时任意滚动（捕获阶段）也会关闭，适用于 fixed 定位的菜单。
 *
 * 焦点管理仍由各组件自行负责。
 */
export interface UseDismissOptions {
  readonly open: boolean;
  readonly refs: readonly RefObject<Element | null>[];
  readonly onDismiss: () => void;
  readonly closeOnEscape?: boolean;
  readonly closeOnScroll?: boolean;
}

export function useDismiss({
  open,
  refs,
  onDismiss,
  closeOnEscape = false,
  closeOnScroll = false,
}: UseDismissOptions) {
  const latest = useRef({ refs, onDismiss });
  latest.current = { refs, onDismiss };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const inside = latest.current.refs.some((ref) =>
        ref.current?.contains(target),
      );
      if (!inside) latest.current.onDismiss();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") latest.current.onDismiss();
    };
    const handleScroll = () => latest.current.onDismiss();

    window.addEventListener("pointerdown", handlePointerDown);
    if (closeOnEscape) window.addEventListener("keydown", handleKeyDown);
    if (closeOnScroll) window.addEventListener("scroll", handleScroll, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      if (closeOnEscape) window.removeEventListener("keydown", handleKeyDown);
      if (closeOnScroll)
        window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, closeOnEscape, closeOnScroll]);
}
