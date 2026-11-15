"use client";

// The call's timeline: a line that draws down as the visitor scrolls, and a marker per
// moment that lights up once reached. Transform and opacity only. With reduced motion
// the line is simply drawn and every marker is lit.
import { m, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { useRef, type ReactNode } from "react";
import { EASE_OUT } from "@/components/ui/motion";

export function FeatureTrack({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 60%"] });
  const progress = useSpring(scrollYProgress, { stiffness: 220, damping: 40, restDelta: 0.001 });
  return (
    <ol ref={ref} className="relative mt-14 sm:mt-16">
      {/* Track (left gutter on phones, inside the rail from lg). */}
      <span aria-hidden className="absolute top-2 bottom-2 left-[5px] w-px bg-line" />
      <m.span
        aria-hidden
        className="absolute top-2 bottom-2 left-[5px] w-px origin-top bg-navy"
        style={{ scaleY: reduce ? 1 : progress }}
      />
      {children}
    </ol>
  );
}

/** Marker on the track: a hollow ring that fills with the spark yellow when reached. */
export function FeatureMarker() {
  const reduce = useReducedMotion();
  return (
    <span aria-hidden className="absolute top-[7px] left-0 grid size-[11px] place-items-center rounded-full border border-ink/25 bg-paper">
      <m.span
        className="size-[7px] rounded-full bg-rose"
        initial={{ opacity: 0, scale: 0.4 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "0px 0px -40% 0px" }}
        transition={{ duration: reduce ? 0 : 0.24, ease: EASE_OUT }}
      />
    </span>
  );
}
