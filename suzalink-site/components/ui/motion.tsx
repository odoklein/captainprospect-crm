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
 * Entrance when the element scrolls into view, once: opacity and a 10 px rise over 280 ms
 * (transform and opacity only, no filter). Reserved for product visuals and card lists:
 * headings are never animated, they are there when the visitor arrives.
 * Under reduced motion the element is simply visible: the hidden state is never rendered
 * with an offset that the reduced animation would then forget to clear.
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
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: reduce ? 0 : 0.28, delay: reduce ? 0 : delay, ease: EASE_OUT }}
    >
      {children}
    </Comp>
  );
}

// The visible state always clears the offset, whatever the motion preference: the hidden
// state is in the server HTML, so a target without `y` would leave the item shifted.
const item = (reduce: boolean | null): Variants => ({
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.28, ease: EASE_OUT } },
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
  const reduce = useReducedMotion();
  const Comp = m[as];
  return (
    <Comp
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : gap } } }}
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
