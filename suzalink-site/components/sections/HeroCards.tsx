"use client";

// Floating product cards around the hero (large screens only). Decorative: the same
// product is described for assistive tech by the SDR mockup below the hero.
// Entrance: staggered fade-in; then a gentle float (CSS, off with reduced motion).
import { useEffect, useState, type ReactNode } from "react";
import { m, useReducedMotion } from "framer-motion";
import { cx } from "@/components/ui/primitives";

function Card({
  className,
  rotate,
  delay,
  floatDelay,
  children,
}: {
  className: string;
  rotate: number;
  delay: number;
  floatDelay: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <m.div
      className={cx("absolute", className)}
      style={{ rotate }}
      initial={reduce ? false : { opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="animate-float" style={{ animationDelay: floatDelay }}>
        {children}
      </div>
    </m.div>
  );
}

const surface =
  "rounded-[18px] border border-line bg-white/95 shadow-[0_1px_0_rgba(12,31,35,.04),0_22px_50px_-26px_rgba(12,31,35,.38)] backdrop-blur";

function Avatar({ initials, tone }: { initials: string; tone: "mint" | "sand" | "sky" }) {
  const tones = { mint: "bg-mint text-navy", sand: "bg-sand text-navy", sky: "bg-[#E3EEF2] text-navy" };
  return (
    <span className={cx("grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold", tones[tone])}>
      {initials}
    </span>
  );
}

/** Live "En appel" timer, starting at 02:14 like the product shows it. */
function CallTimer() {
  const reduce = useReducedMotion();
  const [seconds, setSeconds] = useState(134);
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [reduce]);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <span className="font-mono tabular-nums">
      {mm}:{ss}
    </span>
  );
}

export function HeroCards() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden text-left select-none min-[1360px]:block">
      {/* Dotted connectors from each card to the app icon. */}
      <svg className="absolute inset-0 size-full" viewBox="0 0 1000 620" preserveAspectRatio="none" fill="none">
        {[
          "M 250 92 C 330 80, 400 70, 452 82",
          "M 762 92 C 690 80, 610 70, 548 82",
          "M 206 418 C 230 300, 330 170, 456 120",
          "M 800 430 C 770 300, 670 170, 544 120",
        ].map((d) => (
          <path key={d} d={d} stroke="#112F35" strokeOpacity=".28" strokeWidth="1.4" strokeDasharray="1 7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      {/* Top-left: today's queue */}
      <Card className="top-2 left-0 w-[290px]" rotate={-4} delay={0.15} floatDelay="0s">
        <div className={cx(surface, "p-4")}>
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <span className="h-3.5 w-1 -skew-x-12 rounded-full bg-rose" />
            File du jour <span className="font-normal text-muted">· 42 restants</span>
          </p>
          <ul className="mt-3 divide-y divide-line">
            <li className="flex items-center gap-3 py-2">
              <Avatar initials="LM" tone="mint" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink">Léa Moreau</span>
                <span className="block text-[11px] text-muted">Nova Industrie</span>
              </span>
              <span className="rounded-full bg-mint/70 px-2 py-0.5 text-[11px] font-medium text-navy">En appel</span>
            </li>
            <li className="flex items-center gap-3 py-2">
              <Avatar initials="PP" tone="sand" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink">Pierre Petit</span>
                <span className="block text-[11px] text-muted">Bâtir &amp; Co</span>
              </span>
              <span className="text-muted">›</span>
            </li>
            <li className="flex items-center gap-3 py-2">
              <Avatar initials="AB" tone="sky" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink">Alice Bernard</span>
                <span className="block text-[11px] text-muted">Delta Digital</span>
              </span>
              <span className="text-muted">›</span>
            </li>
          </ul>
        </div>
      </Card>

      {/* Top-right: live call */}
      <Card className="top-12 right-2" rotate={5} delay={0.3} floatDelay="-2.4s">
        <div className={cx(surface, "p-2.5")}>
          <div className="flex items-center gap-3 rounded-full bg-navy py-2.5 pr-5 pl-3 text-[15px] font-medium text-white">
            <span className="relative grid size-6 place-items-center">
              <span className="absolute inline-flex size-6 animate-ping rounded-full bg-rose/40" />
              <span className="relative size-3 rounded-full bg-rose" />
            </span>
            En appel · <CallTimer />
          </div>
        </div>
      </Card>

      {/* Bottom-left: AI proposed result */}
      <Card className="top-[350px] left-6 w-[260px]" rotate={-3} delay={0.45} floatDelay="-4.1s">
        <div className={cx(surface, "p-4")}>
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <span className="h-3.5 w-1 -skew-x-12 rounded-full bg-rose" />
            Résultat proposé
            <span className="rounded-md bg-rose/25 px-1.5 py-0.5 text-[10px] font-semibold text-[#6E5300]">✦ IA</span>
          </p>
          <p className="mt-3 rounded-[12px] bg-mint/45 px-3 py-2.5 text-[13px] leading-snug text-ink">
            Rappel (interlocuteur indisponible)
          </p>
          <span className="mt-3 block rounded-full bg-navy py-2 text-center text-[13px] font-medium text-white">Confirmer</span>
        </div>
      </Card>

      {/* Bottom-right: meeting booked */}
      <Card className="top-[380px] right-0" rotate={4} delay={0.6} floatDelay="-1.2s">
        <div className={cx(surface, "flex items-center gap-3 px-4 py-3.5")}>
          <span className="grid size-9 place-items-center rounded-[10px] bg-mint/60 text-navy">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="5" width="17" height="15" rx="3" />
              <path d="M8 3v4M16 3v4M3.5 10h17" />
            </svg>
          </span>
          <span className="text-[14px] font-medium text-ink">RDV pris · jeudi 10:00</span>
          <span className="grid size-6 place-items-center rounded-full bg-mint text-navy">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </span>
        </div>
      </Card>
    </div>
  );
}
