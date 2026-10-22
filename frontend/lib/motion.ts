import type { Variants } from "framer-motion";
export const SPRING = { type: "spring", stiffness: 100, damping: 10 } as const;
export function entrance(reducedMotion: boolean): Variants {
  return {
    hidden: { opacity: 0, y: reducedMotion ? 0 : 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: reducedMotion ? { duration: 0 } : SPRING,
    },
  };
}
