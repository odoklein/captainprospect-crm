/**
 * Suzalink brand icons: a tilted, rounded frame with a filled glyph in navy, mint and yellow.
 * Redrawn as SVG from the brand icon sheets so they stay sharp at any size and can move.
 *
 * Motion (app/globals.css, « Brand icons »): when the icon's card, link or button is hovered,
 * the frame tilts a little and each glyph does its own small gesture (sparks flash, bars grow,
 * the gear turns…). Gated to fine pointers and to prefers-reduced-motion: no-preference.
 * Decorative by default (aria-hidden); pass `title` only when the icon carries meaning alone.
 */
import type { ReactNode } from "react";
import { cx } from "./primitives";

export type BrandIconName =
  | "dashboard"
  | "team"
  | "phoneRing"
  | "calendar"
  | "growth"
  | "ai"
  | "recording"
  | "calendarCheck"
  | "lead"
  | "settings";

/** Rounded polygon path: straight sides, circular-ish corners of radius r. */
function roundedPolygon(points: Array<[number, number]>, r: number): string {
  const n = points.length;
  const at = (i: number) => points[(i + n) % n]!;
  const toward = (a: [number, number], b: [number, number], d: number): [number, number] => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [a[0] + ((b[0] - a[0]) * d) / len, a[1] + ((b[1] - a[1]) * d) / len];
  };
  let d = "";
  for (let i = 0; i < n; i++) {
    const p = at(i);
    const start = toward(p, at(i - 1), r);
    const end = toward(p, at(i + 1), r);
    d += `${i === 0 ? "M" : "L"}${start[0].toFixed(2)} ${start[1].toFixed(2)}Q${p[0]} ${p[1]} ${end[0].toFixed(2)} ${end[1].toFixed(2)}`;
  }
  return `${d}Z`;
}

/** The leaning card shape of the brand sheets: top edge rising to the right, left edge slanting. */
const FRAME = roundedPolygon(
  [
    [22, 15],
    [95, 4],
    [83, 82],
    [5, 92],
  ],
  14,
);

/** Gear with 8 teeth, centred on (50, 48). */
const GEAR = (() => {
  const cx0 = 50;
  const cy0 = 48;
  const outer = 22;
  const inner = 16.5;
  const teeth = 8;
  const pts: Array<[number, number]> = [];
  for (let t = 0; t < teeth; t++) {
    const a = (t / teeth) * Math.PI * 2;
    const half = (Math.PI / teeth) * 0.45;
    for (const [ang, rad] of [
      [a - half * 1.6, inner],
      [a - half, outer],
      [a + half, outer],
      [a + half * 1.6, inner],
    ] as Array<[number, number]>) {
      pts.push([+(cx0 + Math.cos(ang) * rad).toFixed(2), +(cy0 + Math.sin(ang) * rad).toFixed(2)]);
    }
  }
  return roundedPolygon(pts, 1.6);
})();

const ink = "fill-[var(--bi-ink)]";
const mint = "fill-mint-strong";
const spark = "bi-spark stroke-rose";

/**
 * Chunky handset of the sheets (earpiece top-left, mouthpiece bottom-right), drawn in a
 * 40-unit box. The outer group places it; the inner group is the one that animates, because a
 * CSS transform would replace an SVG transform attribute on the same element.
 */
function Handset({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className="bi-wiggle">
        <path className="stroke-[var(--bi-ink)]" d="M9.5 11C8.5 24 18 33.5 30.5 34.5" fill="none" strokeWidth={9} strokeLinecap="round" />
        <rect className={ink} x={2} y={1.5} width={13} height={15.5} rx={5.5} transform="rotate(-24 8.5 9.25)" />
        <rect className={ink} x={23.5} y={27.5} width={15.5} height={13} rx={5.5} transform="rotate(-24 31.25 34)" />
      </g>
    </g>
  );
}

/** Three yellow strokes radiating from (x, y), like the ringing marks of the sheets. */
function Sparks({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`} strokeWidth={4.2} strokeLinecap="round">
      <line className={spark} style={{ ["--d" as string]: "0ms" }} x1={0} y1={-6} x2={3} y2={-15} />
      <line className={spark} style={{ ["--d" as string]: "60ms" }} x1={5} y1={-2} x2={13} y2={-8} />
      <line className={spark} style={{ ["--d" as string]: "120ms" }} x1={7} y1={4} x2={16} y2={3} />
    </g>
  );
}

function Calendar({ check }: { check?: boolean }) {
  return (
    <>
      <rect className={ink} x={26} y={29} width={48} height={42} rx={9} />
      <rect className={mint} x={31} y={40} width={38} height={26} rx={4} />
      <rect className={ink} x={35.5} y={22} width={6} height={13} rx={3} />
      <rect className={ink} x={58.5} y={22} width={6} height={13} rx={3} />
      <rect className="fill-[var(--bi-paper)]" x={37.5} y={24} width={2} height={7} rx={1} />
      <rect className="fill-[var(--bi-paper)]" x={60.5} y={24} width={2} height={7} rx={1} />
      {check ? (
        <path className="bi-check stroke-[var(--bi-ink)]" d="M40 53l6.5 6.5L60.5 46" fill="none" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <g className="bi-dots">
          {[0, 1, 2].flatMap((c) =>
            [0, 1].map((r) => (
              <rect
                key={`${c}-${r}`}
                className={ink}
                style={{ ["--d" as string]: `${(r * 3 + c) * 55}ms` }}
                x={37.5 + c * 10}
                y={45 + r * 10}
                width={5.5}
                height={5.5}
                rx={1.6}
              />
            )),
          )}
        </g>
      )}
    </>
  );
}

function People({ sparks }: { sparks?: boolean }) {
  return (
    <>
      <g className="bi-side bi-side-l">
        <circle className={mint} cx={31} cy={41} r={6.5} />
        <path className={mint} d="M20 66c0-6.6 5-11 11-11s11 4.4 11 11Z" />
      </g>
      <g className="bi-side bi-side-r">
        <circle className={mint} cx={69} cy={41} r={6.5} />
        <path className={mint} d="M58 66c0-6.6 5-11 11-11s11 4.4 11 11Z" />
      </g>
      <g className="bi-lift">
        <circle className={ink} cx={50} cy={37} r={9.5} />
        <path className={ink} d="M34 70c0-9.4 7.2-16 16-16s16 6.6 16 16Z" />
      </g>
      {sparks ? (
        <g strokeWidth={4.2} strokeLinecap="round">
          <line className={spark} style={{ ["--d" as string]: "0ms" }} x1={42} y1={20} x2={39} y2={13} />
          <line className={spark} style={{ ["--d" as string]: "60ms" }} x1={50} y1={18} x2={50} y2={10} />
          <line className={spark} style={{ ["--d" as string]: "120ms" }} x1={58} y1={20} x2={61} y2={13} />
        </g>
      ) : null}
    </>
  );
}

const glyphs: Record<BrandIconName, () => ReactNode> = {
  dashboard: () => (
    <g transform="translate(10 0) skewX(-11)">
      <rect className={mint} x={30} y={28} width={27} height={18} rx={5.5} />
      <rect className={ink} x={61} y={28} width={20} height={18} rx={5.5} />
      <rect className={ink} x={28} y={50} width={24} height={19} rx={5.5} />
      {[
        [57, 61, 8],
        [65, 56, 13],
        [73, 49, 20],
      ].map(([x, y, h], i) => (
        <rect key={x} className="bi-bar fill-rose" style={{ ["--d" as string]: `${i * 70}ms` }} x={x} y={y} width={5} height={h} rx={1.6} />
      ))}
    </g>
  ),
  team: () => <People />,
  lead: () => <People sparks />,
  phoneRing: () => (
    <>
      <Handset x={22} y={27} scale={1.2} />
      <Sparks x={63} y={33} />
    </>
  ),
  calendar: () => <Calendar />,
  calendarCheck: () => <Calendar check />,
  growth: () => (
    <>
      {[
        [27, 58, 11],
        [41, 50, 19],
        [55, 40, 29],
      ].map(([x, y, h], i) => (
        <rect key={x} className={cx(mint, "bi-bar")} style={{ ["--d" as string]: `${i * 70}ms` }} x={x} y={y} width={11} height={h} rx={3.5} />
      ))}
      <g className="bi-arrow">
        <path className="stroke-[var(--bi-ink)]" d="M28 41c13 0 25-5 36-14" fill="none" strokeWidth={4.2} strokeLinecap="round" />
        <path className="fill-rose" d="M60.5 20.5l12.5-3.6-2.4 12.8z" strokeLinejoin="round" />
      </g>
    </>
  ),
  ai: () => (
    <>
      <line className="stroke-[var(--bi-ink)]" x1={46} y1={21} x2={46} y2={29} strokeWidth={3.4} strokeLinecap="round" />
      <circle className={ink} cx={46} cy={19} r={4} />
      <rect className={mint} x={23} y={38} width={7} height={13} rx={3.5} />
      <rect className={mint} x={62} y={38} width={7} height={13} rx={3.5} />
      <rect className={mint} x={28} y={28} width={36} height={31} rx={13} />
      <rect className={ink} x={33} y={35} width={26} height={16} rx={8} />
      <rect className={cx(mint, "bi-eye")} x={39} y={39} width={5} height={8} rx={2.5} />
      <rect className={cx(mint, "bi-eye")} x={48} y={39} width={5} height={8} rx={2.5} />
      <path className={mint} d="M29 80c0-9.6 7.6-16 17-16s17 6.4 17 16Z" />
      <Sparks x={65} y={27} />
    </>
  ),
  recording: () => (
    <>
      <Handset x={19} y={37} scale={1.02} />
      <rect className={mint} x={46} y={23} width={36} height={18} rx={9} />
      <circle className="bi-dot fill-rose" cx={55} cy={32} r={4.2} />
      {[
        [63, 7],
        [67.5, 13],
        [72, 9],
        [76.5, 5],
      ].map(([x, h], i) => (
        <rect key={x} className={cx(ink, "bi-wave")} style={{ ["--d" as string]: `${i * 90}ms` }} x={x} y={32 - h / 2} width={2.8} height={h} rx={1.4} />
      ))}
    </>
  ),
  settings: () => (
    <g className="bi-gear">
      <path className={ink} d={GEAR} />
      <circle className={mint} cx={50} cy={48} r={9} />
    </g>
  ),
};

/**
 * <BrandIcon name="phoneRing" className="size-14" />           light surfaces
 * <BrandIcon name="ai" tone="dark" className="size-16" />       on navy / night cards
 */
export function BrandIcon({
  name,
  tone = "light",
  className,
  title,
}: {
  name: BrandIconName;
  tone?: "light" | "dark";
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 96"
      className={cx("bi shrink-0 overflow-visible", tone === "dark" ? "bi-dark" : "bi-light", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path className="bi-frame stroke-[var(--bi-ink)]" d={FRAME} fill="none" strokeWidth={5.5} strokeLinejoin="round" />
      {glyphs[name]()}
    </svg>
  );
}
