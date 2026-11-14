// Camera and cursor planning: pure functions of the capture, no React.
// A camera is "which point of the capture sits at the stage centre, at which scale"
// (scale = video px per CSS px of the capture).
import { Easing, interpolate } from "remotion";
import { STAGE } from "./theme";
import type { Box, Capture } from "./types";

export type Cam = { x: number; y: number; s: number };
export type Pt = { x: number; y: number };

const MARGIN = 26;

export function fullCam(c: Capture): Cam {
    const { width: W, height: H } = c.viewport;
    const s = Math.min((STAGE.width - 2 * MARGIN) / W, (STAGE.height - 2 * MARGIN) / H);
    return { x: W / 2, y: H / 2, s };
}

/** Keep the capture covering the stage whenever it is big enough to. */
function clamp(c: Capture, cam: Cam): Cam {
    const { width: W, height: H } = c.viewport;
    const fit = (center: number, size: number, stage: number) => {
        const half = stage / (2 * cam.s);
        if (size * cam.s <= stage) return size / 2;
        return Math.min(Math.max(center, half), size - half);
    };
    return { s: cam.s, x: fit(cam.x, W, STAGE.width), y: fit(cam.y, H, STAGE.height) };
}

/** Frame a box: as close as it fits (90 % of the stage width, 62 % of its height), capped so
 *  small controls keep their surroundings in view. */
export function camOn(c: Capture, b: Box, maxScale = 1.7): Cam {
    const base = fullCam(c).s;
    const s = Math.min(maxScale, Math.max(base, Math.min((STAGE.width * 0.9) / b.w, (STAGE.height * 0.62) / b.h)));
    return clamp(c, { x: b.x + b.w / 2, y: b.y + b.h / 2, s });
}

/** Where the pointer lands on a box: centre, or near the left edge of wide rows. */
export function hotspot(b: Box): Pt {
    return { x: b.w > 320 ? b.x + Math.min(160, b.w * 0.25) : b.x + b.w / 2, y: b.y + b.h / 2 };
}

export type StepPlan = { start: Cam; target: Cam; end: Cam; from: Pt; to: Pt };

/** Camera and pointer for every step, chained so each scene starts where the last one ended. */
export function plan(c: Capture) {
    const overview = fullCam(c);
    const steps: StepPlan[] = [];
    let cam = overview;
    let ptr: Pt = { x: c.viewport.width * 0.62, y: c.viewport.height * 0.58 };
    for (const s of c.steps) {
        const target = camOn(c, s.target);
        const end = s.result ? camOn(c, s.result, 1.45) : target;
        const to = hotspot(s.target);
        steps.push({ start: cam, target, end, from: ptr, to });
        cam = end;
        ptr = to;
    }
    const outcome = c.outcome.box ? camOn(c, c.outcome.box, 1.35) : overview;
    return { overview, steps, outcomeStart: cam, outcome, lastPointer: ptr };
}

const ease = Easing.bezier(0.45, 0, 0.2, 1);

export function lerpCam(f: number, range: [number, number], a: Cam, b: Cam): Cam {
    const o = { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease } as const;
    return {
        x: interpolate(f, range, [a.x, b.x], o),
        y: interpolate(f, range, [a.y, b.y], o),
        // Scale interpolated perceptually so zooms feel even.
        s: Math.exp(interpolate(f, range, [Math.log(a.s), Math.log(b.s)], o)),
    };
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
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t };
}
