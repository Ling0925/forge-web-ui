import { type ReactNode, useEffect, useState } from "react";

export interface CollapsibleProps {
  readonly open: boolean;
  readonly children: ReactNode;
  readonly className?: string;
  readonly id?: string;
  readonly durationMs?: number;
}

/**
 * Smooth CSS Grid height & opacity collapse component.
 * On initial or static render with `open: false`, renders nothing so SSR/tests stay clean.
 * When toggled, smoothly animates grid-template-rows (0fr <-> 1fr) and opacity both on expand and collapse.
 */
export function Collapsible({
  open,
  children,
  className = "",
  id,
  durationMs = 200,
}: CollapsibleProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  // A panel that mounts because it was opened (not one that starts open)
  // renders one frame at 0fr first, so the height grows instead of popping.
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    if (!entering) return;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => setEntering(false)),
    );
    return () => cancelAnimationFrame(frame);
  }, [entering]);

  useEffect(() => {
    if (open) {
      if (!mounted) setEntering(true);
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const timer = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, durationMs);
      return () => clearTimeout(timer);
    }
  }, [open, mounted, durationMs]);

  if (!mounted && !open) return null;

  return (
    <div
      id={id}
      className={`smooth-collapse ${entering || !mounted ? "is-entering" : open && !closing ? "is-expanded" : "is-collapsing"} ${className}`}
      aria-hidden={!open}
    >
      <div className="smooth-collapse-inner">{children}</div>
    </div>
  );
}
