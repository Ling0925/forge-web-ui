import type { Transition } from "motion/react";

/**
 * Spring presets for Motion (design-v2/spec.md §1.4). Components import these
 * instead of writing ad-hoc stiffness/damping; CSS transitions use the
 * `--ease-soft` twin in tokens.css. MotionConfig reducedMotion="user" (see
 * ui/motion-provider.tsx) turns transform springs off for reduced motion.
 */
export const spring = {
  /** Pointer-follow highlights (layoutId), popovers, press feedback. */
  snappy: { type: "spring", stiffness: 520, damping: 40, mass: 0.7 },
  /** List / card entrance, layout height changes, drawers. */
  smooth: { type: "spring", stiffness: 300, damping: 32, mass: 0.9 },
  /** Segmented thumbs, icon swaps. */
  bouncy: { type: "spring", stiffness: 420, damping: 22, mass: 0.8 },
  /** Headline entrance. */
  gentle: { type: "spring", stiffness: 180, damping: 26, mass: 1 },
} as const satisfies Record<string, Transition>;

/** Stagger between list items entering, in seconds. */
export const stagger = 0.04;
