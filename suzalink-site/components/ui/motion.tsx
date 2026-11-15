"use client";

import { LazyMotion, MotionConfig, domAnimation, m, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

/** Strong UI ease-out (same curve as --ease-out in app/globals.css). */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** Loads only the DOM animation features and honours prefers-reduced-motion. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/**
 * Soft entrance when the element scrolls into view, once: opacity, 12 px rise and a 4 px blur
 * clearing over 300 ms. Under reduced motion: opacity only.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "article";
}) {
  const reduce = useReducedMotion();
  const Comp = m[as];
  return (
    <Comp
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, filter: "blur(4px)" }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.3, delay, ease: EASE_OUT }}
    >
      {children}
    </Comp>
  );
}

const item = (reduce: boolean | null): Variants => ({
  hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 12, filter: "blur(4px)" },
  show: reduce
    ? { opacity: 1, transition: { duration: 0.3 } }
    : { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.3, ease: EASE_OUT } },
});

/**
 * A list whose items enter one after the other when it scrolls into view (once).
 * Put the hover effect on the card INSIDE each StaggerItem, never on the item itself:
 * the entrance and the hover then never fight over `transform`.
 */
export function Stagger({
  children,
  className,
  as = "ul",
  gap = 0.06,
}: {
  children: ReactNode;
  className?: string;
  as?: "ul" | "ol" | "div";
  /** Seconds between two items (30 to 80 ms). */
  gap?: number;
}) {
  const Comp = m[as];
  return (
    <Comp
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </Comp>
  );
}

export function StaggerItem({ children, className, as = "li" }: { children: ReactNode; className?: string; as?: "li" | "div" }) {
  const reduce = useReducedMotion();
  const Comp = m[as];
  return (
    <Comp className={className} variants={item(reduce)}>
      {children}
    </Comp>
  );
}
