// Single source of timing. The whole tutorial is one continuous shot: every beat below is an
// absolute frame, used by the video (camera, pointer, rings, captions) and by render.ts
// (WebVTT, chapters, transcript), so they cannot drift.
import type { Caption } from "@remotion/captions";
import type { Capture } from "./types";

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;
/** Frame used as the poster: the title card once its text has settled. */
export const POSTER_FRAME = 70;

const words = (t: string) => t.trim().split(/\s+/).length;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Frames to read a caption at ~3.5 words/s, after a beat to find it. */
export const readFrames = (text: string, base = 0.8) => Math.round((base + words(text) / 3.5) * FPS);

export type Span = [number, number];

export type StepTimes = {
    start: number;
    end: number;
    /** Incoming screen slides in when the page was scrolled before this step. */
    scroll: Span | null;
    /** Camera travels to the target. */
    cam: Span;
    /** Pointer travels to the target, landing just after the camera. */
    cursor: Span;
    /** The target shows its real hover state. */
    hoverAt: number;
    /** Focus ring pops in. */
    ring: number;
    press: number | null;
    typing: { start: number; perChar: number; end: number } | null;
    menu: { open: number; pick: Span; press: number; close: number } | null;
    /** The new state spreads from the point of action. */
    reveal: Span | null;
    /** Camera settles on what changed (or back on the whole page). */
    reframe: Span | null;
    resultRing: number | null;
};

export type Timeline = {
    intro: { hold: number; end: number };
    steps: StepTimes[];
    outcome: { start: number; cam: Span; check: number; pullBack: Span; end: number };
    total: number;
};

const TRAVEL = 26;

export function build(c: Capture): Timeline {
    // Title card, then the window settles flat while the caption band rises.
    const hold = clamp(readFrames(c.purpose, 1.0), 96, 132);
    const intro = { hold, end: hold + 30 };

    let t = intro.end - 10; // the first caption comes in with the band
    const steps: StepTimes[] = c.steps.map((s, i) => {
        const start = t;
        const scroll: Span | null = s.scrolled ? [start, start + 14] : null;
        // First step: let the whole page land before moving. Scrolled steps: let the scroll read.
        const a = start + (i === 0 ? 24 : scroll ? 10 : 0);
        const base = { start, scroll, cam: [a, a + TRAVEL] as Span, cursor: [a + 3, a + TRAVEL + 4] as Span, hoverAt: a + TRAVEL + 1, ring: a + TRAVEL - 8 };
        const hasResult = !!s.result;
        let rest: Pick<StepTimes, "press" | "typing" | "menu" | "reveal" | "reframe" | "resultRing">;
        let actionEnd: number;

        if (s.kind === "point" || s.kind === "hover") {
            rest = { press: null, typing: null, menu: null, reveal: s.kind === "hover" ? [base.hoverAt, base.hoverAt + 8] : null, reframe: null, resultRing: null };
            actionEnd = a + TRAVEL + 16;
        } else if (s.kind === "type") {
            const press = a + TRAVEL + 9;
            const n = Math.max(1, (s.typed ?? "").length);
            const perChar = clamp(42 / n, 1.5, 3);
            const start2 = press + 7;
            const end2 = start2 + Math.ceil(n * perChar);
            rest = { press, typing: { start: start2, perChar, end: end2 }, menu: null, reveal: [end2, end2 + 6], reframe: [end2 + 8, end2 + 36], resultRing: hasResult ? end2 + 20 : null };
            actionEnd = end2 + 36;
        } else if (s.kind === "select") {
            const press = a + TRAVEL + 9;
            const menu = { open: press + 2, pick: [press + 13, press + 29] as Span, press: press + 34, close: press + 37 };
            rest = { press, typing: null, menu, reveal: [menu.press + 3, menu.press + 19], reframe: [menu.press + 9, menu.press + 37], resultRing: hasResult ? menu.press + 22 : null };
            actionEnd = menu.press + 37;
        } else {
            const press = a + TRAVEL + 10;
            rest = { press, typing: null, menu: null, reveal: [press + 2, press + 18], reframe: [press + 8, press + 36], resultRing: hasResult ? press + 21 : null };
            actionEnd = press + 36;
        }
        // The caption is on screen for the whole step: the step lasts as long as it takes to
        // read it, and never ends less than 0.9 s after the result has landed.
        const end = Math.max(actionEnd + 27, start + readFrames(`${s.title} ${s.detail}`));
        t = end;
        return { ...base, ...rest, end };
    });

    const dur = clamp(readFrames(`${c.outcome.title} ${c.outcome.detail}`, 1.3), 132, 186);
    const end = t + dur;
    const outcome = { start: t, cam: [t, t + 30] as Span, check: t + 14, pullBack: [end - 54, end - 16] as Span, end };
    return { intro, steps, outcome, total: end };
}

export const totalFrames = (c: Capture) => build(c).total;

export type Chapter = { label: string; title: string; detail: string; kind: "overview" | "step" | "result"; start: number; end: number; startMs: number; endMs: number };

/** Chapters as the viewer reads them: same text as the caption band. */
export function chapters(c: Capture): Chapter[] {
    const tl = build(c);
    const ms = (f: number) => Math.round((f / FPS) * 1000);
    const mk = (label: string, title: string, detail: string, kind: Chapter["kind"], start: number, end: number): Chapter => ({ label, title, detail, kind, start, end, startMs: ms(start), endMs: ms(end) });
    return [
        mk("Vue d'ensemble", c.title, c.purpose, "overview", 0, tl.steps[0]?.start ?? tl.outcome.start),
        ...c.steps.map((s, i) => mk(`Étape ${i + 1} sur ${c.steps.length}`, s.title, s.detail, "step", tl.steps[i].start, tl.steps[i].end)),
        mk("Résultat", c.outcome.title, c.outcome.detail, "result", tl.outcome.start, tl.outcome.end),
    ];
}

/** Captions in the @remotion/captions format, one per chapter (title, then detail). */
export function captions(c: Capture): Caption[] {
    return chapters(c).map((ch) => ({ text: `${ch.title} — ${ch.detail}`, startMs: ch.startMs, endMs: ch.endMs, timestampMs: ch.startMs, confidence: null }));
}
