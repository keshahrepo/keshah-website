"use client";

/**
 * AnimatedPage — wraps a full step in the standard entrance animation
 * (fade + slight upward slide, ~400ms easeOut). Children can be wrapped
 * in `AnimatedPageItem` to opt into staggered fade-in on the same
 * timeline — mirrors the Interval-based staggered AnimationController
 * pattern used by _QuizSinglePickState / _QuizMultiPickState in
 * _quiz_widgets.dart (title first, list next, button last).
 */

import { motion, type Variants } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

const PAGE_VARIANTS: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.215, 0.61, 0.355, 1],
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

const ITEM_VARIANTS: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.215, 0.61, 0.355, 1] },
  },
};

export interface AnimatedPageProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function AnimatedPage({ children, className, style }: AnimatedPageProps) {
  return (
    <motion.div
      variants={PAGE_VARIANTS}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
      style={{ display: "flex", flexDirection: "column", width: "100%", ...style }}
    >
      {children}
    </motion.div>
  );
}

/** Opt-in wrapper for stagger — put around each element you want to
 * cascade in on the parent AnimatedPage's timeline. */
export function AnimatedPageItem({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <motion.div variants={ITEM_VARIANTS} className={className} style={style}>
      {children}
    </motion.div>
  );
}
