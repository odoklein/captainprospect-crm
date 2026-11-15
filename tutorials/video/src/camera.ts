// Camera, pointer and screen planning: pure functions of the capture and the timeline.
// A camera is "which point of the capture sits at the stage centre, at which scale"
// (scale = video px per CSS px of the capture).
import { Easing } from "remotion";
import { hotspot, type Pt } from "./geometry";
import { STAGE } from "./theme";
import type { Timeline } from "./timeline";
import type { Box, Capture, CapturedStep } from "./types";

export type { Pt };
export type Cam = { x: number; y: number; s: number };

const MARGIN = 26;
/** Smallest scale at which interface labels stay comfortable at the embedded size. */
const READABLE = 0.94;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const unit = (f: number, t0: number, t1: number) => (t1 <= t0 ? (f >= t1 ? 1 : 0) : Math.min(1, Math.max(0, (f - t0) / (t1 - t0))));

/** Motion curves. Zero bounce by default; a hint of overshoot only on small accents. */
export const E = {
    /** Camera: gentle launch, long soft landing. */
    cam: Easing.bezier(0.4, 0, 0.1, 1),
    /** Pointer: leaves briskly, decelerates into its target like a hand does. */
    hand: Easing.bezier(0.35, 0, 0.1, 1),
    out: Easing.bezier(0.16, 1, 0.3, 1),
    inOut: Easing.bezier(0.45, 0, 0.2, 1),
    /** Critically damped spring: no overshoot, long tail. */
    spring: Easing.spring({ damping: 200 }),
    /** Small accents (rings, checks): ~15 % overshoot. */
    pop: Easing.bezier(0.34, 1.45, 0.64, 1),
};

export function fullCam(c: Capture): Cam {
    const { width: W, height: H } = c.viewport;
    const s = Math.min((STAGE.width - 2 * MARGIN) / W, (STAGE.height - 2 * MARGIN) / H);
    return { x: W / 2, y: H / 2, s };
}

/** Keep the capture covering the stage whenever it is big enough to. */
function cover(c: Capture, cam: Cam): Cam {
    const { width: W, height: H } = c.viewport;
    // `slack`: how far (in stage px) the window edge may come into frame, so a control near the
    // top or bottom of the page is not glued to the edge of the picture.
    const fit = (center: number, size: number, stage: number, slack: number) => {
        const half = stage / (2 * cam.s);
        if (size * cam.s <= stage) return size / 2;
        const give = Math.min(slack, (size * cam.s - stage) / 2) / cam.s;
        return Math.min(Math.max(center, half - give), size - half + give);
    };
    return { s: cam.s, x: fit(cam.x, W, STAGE.width, 0), y: fit(cam.y, H, STAGE.height, 84) };
}

/** Frame a box: as close as it fits (90 % of the stage width, 62 % of its height), capped so
 *  small controls keep their surroundings in view. */
export function camOn(c: Capture, b: Box, maxScale = 1.7): Cam {
    const base = fullCam(c).s;
    const s = Math.min(maxScale, Math.max(base, Math.min((STAGE.width * 0.9) / b.w, (STAGE.height * 0.62) / b.h)));
    return cover(c, { x: b.x + b.w / 2, y: b.y + b.h / 2, s });
}

/** Frame what changed. A result too tall to fit at a readable size is framed from its top
 *  instead of being shrunk: the labels matter more than the bottom edge. */
export function camOnResult(c: Capture, b: Box, maxScale = 1.45): Cam {
    const fitW = (STAGE.width * 0.9) / b.w;
    if (Math.min(fitW, (STAGE.height * 0.62) / b.h) >= READABLE) return camOn(c, b, maxScale);
    const s = Math.min(maxScale, Math.max(READABLE, fitW));
    return cover(c, { x: b.x + b.w / 2, y: b.y - 18 / s + STAGE.height / (2 * s), s });
}

/** A whole page at a readable size: almost full width, aligned to its top. */
export function pageCam(c: Capture): Cam {
    return cover(c, { x: c.viewport.width / 2, y: (STAGE.height / 2 - 20) / READABLE, s: READABLE });
}

/** Smooth zoom-and-pan between two views (van Wijk & Nuij): the camera pulls back a little on
 *  long pans instead of sliding at full zoom, so the eye never loses its place. */
function fly(c: Capture, a: Cam, b: Cam): (t: number) => Cam {
    const rho = 1.15, rho2 = rho * rho, rho4 = rho2 * rho2;
    const w0 = STAGE.width / a.s, w1 = STAGE.width / b.s;
    const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
    const minS = fullCam(c).s;
    const done = (x: number, y: number, w: number) => cover(c, { x, y, s: Math.max(minS, STAGE.width / w) });
    if (d2 < 1) {
        const S = Math.log(w1 / w0) / rho;
        return (t) => done(lerp(a.x, b.x, t), lerp(a.y, b.y, t), w0 * Math.exp(rho * t * S));
    }
    const d1 = Math.sqrt(d2);
    const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
    const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
    const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
    const S = (r1 - r0) / rho;
    return (t) => {
        if (t >= 1) return b;
        const s = t * S;
        const coshr0 = Math.cosh(r0);
        const u = (w0 / (rho2 * d1)) * (coshr0 * Math.tanh(rho * s + r0) - Math.sinh(r0));
        return done(a.x + u * dx, a.y + u * dy, (w0 * coshr0) / Math.cosh(rho * s + r0));
    };
}

const union = (a: Box, b: Box): Box => {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

type CamSeg = { t0: number; t1: number; at: (u: number) => Cam; ease: (t: number) => number };

// ───────────────────────── select menu ─────────────────────────

export type Menu = { box: Box; rows: { label: string; chosen: boolean }[]; rowH: number; pad: number; pick: Pt };

/** A plain option list under the field (native menus are drawn by the OS, not the page). */
export function menuFor(c: Capture, s: CapturedStep): Menu | null {
    if (s.kind !== "select" || !s.options?.length) return null;
    const ci = Math.max(0, s.options.indexOf(s.typed ?? ""));
    const from = Math.min(Math.max(0, ci - 3), Math.max(0, s.options.length - 6));
    const labels = s.options.slice(from, from + 6);
    const rowH = 30, pad = 6;
    const w = Math.min(380, Math.max(s.target.w, 190, 56 + Math.max(...labels.map((l) => l.length)) * 7.3));
    const h = labels.length * rowH + 2 * pad;
    const x = Math.min(s.target.x, c.viewport.width - w - 8);
    let y = s.target.y + s.target.h + 6;
    if (y + h > c.viewport.height - 8) y = s.target.y - h - 6;
    return {
        box: { x, y, w, h },
        rows: labels.map((label, i) => ({ label, chosen: from + i === ci })),
        rowH, pad,
        pick: { x: x + Math.min(w * 0.42, 96), y: y + pad + (ci - from) * rowH + rowH / 2 },
    };
}

// ───────────────────────── screens ─────────────────────────

export type ShotEvent = { t0: number; t1: number; file: string; mode: "cut" | "fade" | "ripple" | "scroll"; origin?: Pt };

/** Which screenshot is on screen when, and how each one arrives. */
function shotsFor(c: Capture, tl: Timeline, menus: (Menu | null)[]): ShotEvent[] {
    const ev: ShotEvent[] = [];
    c.steps.forEach((s, i) => {
        const T = tl.steps[i];
        const at = hotspot(s.target);
        ev.push(T.scroll ? { t0: T.scroll[0], t1: T.scroll[1], file: s.before, mode: "scroll" } : { t0: T.start, t1: T.start, file: s.before, mode: "cut" });
        if (s.hover && s.kind !== "hover" && s.kind !== "point") ev.push({ t0: T.hoverAt, t1: T.hoverAt + 4, file: s.hover, mode: "fade" });
        if (s.kind === "type" && T.typing && s.partials?.length) {
            ev.push({ t0: T.press! + 3, t1: T.press! + 3, file: s.partials[0], mode: "cut" });
            for (let k = 1; k < s.partials.length; k++) {
                const t = Math.round(T.typing.start + k * T.typing.perChar);
                ev.push({ t0: t, t1: t, file: s.partials[k], mode: "cut" });
            }
        }
        if (T.reveal) {
            // A page that scrolled to its result slides in; otherwise the change spreads from the click.
            const mode = s.scrolledAfter ? "scroll" : s.kind === "click" || s.kind === "select" ? "ripple" : "fade";
            ev.push({ t0: T.reveal[0], t1: T.reveal[1] + (mode === "scroll" ? 4 : 0), file: s.after, mode, origin: menus[i]?.pick ?? at });
        }
    });
    ev.push({ t0: tl.outcome.start, t1: tl.outcome.start, file: c.outcome.image, mode: "cut" });
    return ev.sort((a, b) => a.t1 - b.t1 || a.t0 - b.t0);
}

// ───────────────────────── plan ─────────────────────────

type PtSeg = { t0: number; t1: number; from: Pt; to: Pt };

export type Plan = {
    overview: Cam;
    camAt: (f: number) => Cam;
    cursorAt: (f: number) => Pt;
    shots: ShotEvent[];
    menus: (Menu | null)[];
    /** Screens visible at a frame: the settled one first, then those arriving. */
    screensAt: (f: number) => { file: string; event: ShotEvent | null; progress: number }[];
};

export function plan(c: Capture, tl: Timeline): Plan {
    const overview = fullCam(c);
    const menus = c.steps.map((s) => menuFor(c, s));

    // Camera: moves chained end to end; between two moves it keeps drifting in, barely.
    const segs: CamSeg[] = [];
    let cur = overview;
    let last = tl.intro.end;
    const drift = (t0: number, t1: number) => {
        if (t1 - t0 < 2) return;
        const from = cur;
        const to = cover(c, { ...cur, s: cur.s * (1 + 0.00022 * (t1 - t0)) });
        segs.push({ t0, t1, at: (u) => ({ x: lerp(from.x, to.x, u), y: lerp(from.y, to.y, u), s: lerp(from.s, to.s, u) }), ease: (t) => t });
        cur = to;
    };
    const move = ([t0, t1]: [number, number], to: Cam) => {
        drift(last, t0);
        segs.push({ t0, t1, at: fly(c, cur, to), ease: E.cam });
        cur = to;
        last = t1;
    };
    c.steps.forEach((s, i) => {
        const T = tl.steps[i];
        // A dropdown is framed with its list, so the option to pick is in view before it opens.
        const m = menus[i];
        move(T.cam, camOn(c, m ? union(s.target, m.box) : s.target));
        // What changed gets the frame; when the whole page changed, so does the whole page.
        // Typing filters what sits around the field: stay close. Anything else changed the page.
        if (T.reframe) move(T.reframe, s.result ? camOnResult(c, s.result) : s.kind === "type" ? cover(c, { ...camOn(c, s.target), s: READABLE }) : pageCam(c));
    });
    move(tl.outcome.cam, c.outcome.box ? camOnResult(c, c.outcome.box, 1.35) : pageCam(c));
    // Closing beat: back to the whole page.
    move(tl.outcome.pullBack, overview);
    drift(last, tl.total);

    const camAt = (f: number): Cam => {
        let cam = overview;
        for (const g of segs) {
            if (f < g.t0) break;
            cam = g.at(g.ease(unit(f, g.t0, g.t1)));
        }
        return cam;
    };

    // Pointer: one glide per target, on a shallow arc.
    const ptSegs: PtSeg[] = [];
    let at: Pt = { x: c.viewport.width * 0.6, y: c.viewport.height * 0.64 };
    c.steps.forEach((s, i) => {
        const T = tl.steps[i];
        const to = hotspot(s.target);
        ptSegs.push({ t0: T.cursor[0], t1: T.cursor[1], from: at, to });
        at = to;
        const m = menus[i];
        if (m && T.menu) {
            ptSegs.push({ t0: T.menu.pick[0], t1: T.menu.pick[1], from: at, to: m.pick });
            at = m.pick;
        }
    });
    const cursorAt = (f: number): Pt => {
        let p = ptSegs[0]?.from ?? at;
        for (const g of ptSegs) {
            if (f < g.t0) break;
            const t = E.hand(unit(f, g.t0, g.t1));
            const dx = g.to.x - g.from.x, dy = g.to.y - g.from.y;
            const d = Math.hypot(dx, dy) || 1;
            // Bow the path to the side that curves upward, like a wrist pivot.
            const side = dx >= 0 ? 1 : -1;
            const bow = Math.sin(t * Math.PI) * Math.min(42, d * 0.13);
            p = { x: g.from.x + dx * t + (dy / d) * bow * side, y: g.from.y + dy * t - (Math.abs(dx) / d) * bow };
        }
        return p;
    };

    const shots = shotsFor(c, tl, menus);
    const screensAt = (f: number) => {
        let base = c.overview;
        const arriving: { file: string; event: ShotEvent | null; progress: number }[] = [];
        for (const e of shots) {
            if (f >= e.t1) base = e.file;
            else if (f >= e.t0) arriving.push({ file: e.file, event: e, progress: unit(f, e.t0, e.t1) });
        }
        return [{ file: base, event: null, progress: 1 }, ...arriving.filter((a) => a.file !== base)];
    };

    return { overview, camAt, cursorAt, shots, menus, screensAt };
}

/** Capture point → stage point under a camera. */
export function project(cam: Cam, p: Pt): Pt {
    return { x: STAGE.width / 2 + cam.s * (p.x - cam.x), y: STAGE.height / 2 + cam.s * (p.y - cam.y) };
}

export function projectBox(cam: Cam, b: Box): Box {
    const p = project(cam, { x: b.x, y: b.y });
    return { x: p.x, y: p.y, w: b.w * cam.s, h: b.h * cam.s };
}

export function lerpBox(t: number, a: Box, b: Box): Box {
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) };
}

export { unit };
