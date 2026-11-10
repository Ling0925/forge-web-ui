import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

const loadFeatures = () =>
  import("#lib/motion-features").then((module) => module.default);

/** Shared motion defaults for every `m.*` element: one spring for indicators and confirmations. */
export const springTransition = {
  type: "spring",
  stiffness: 400,
  damping: 32,
} as const;

/**
 * Root motion boundary. `reducedMotion="user"` turns transform/layout
 * animations off when the OS asks for reduced motion; `strict` makes any
 * accidental full `motion.*` import throw so only the lazy `m.*` is used.
 */
export function MotionProvider({ children }: { readonly children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={springTransition}>
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
