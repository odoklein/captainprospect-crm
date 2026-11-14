// Single source of timing for a tutorial. Used by the composition (scene lengths),
// and by render.ts (WebVTT captions, chapters, transcript), so they cannot drift.
import type { Caption } from "@remotion/captions";
import type { Capture } from "./types";

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;
/** Crossfade between adjacent scenes (frames). */
export const XFADE = 10;

/** Frames inside a step scene, before the reading hold. */
export const STEP = {
    travel: 34, // camera + cursor reach the target
    highlight: 12, // focus ring appears
    press: 8, // click press
    swap: 12, // before → after crossfade
    reframe: 30, // camera settles on the result
};
const STEP_ACTION = STEP.travel + STEP.highlight + STEP.press + STEP.swap + STEP.reframe;

/** Reading time for a caption: ~2.8 words/s on top of a calm base, in frames. */
export function readFrames(text: string, base = 2.2) {
    const words = text.trim().split(/\s+/).length;
    return Math.round((base + words / 2.8) * FPS);
}

export type Scene =
    | { kind: "intro"; frames: number }
    | { kind: "overview"; frames: number }
    | { kind: "step"; index: number; frames: number }
    | { kind: "outcome"; frames: number };

export function scenesFor(c: Capture): Scene[] {
    const scenes: Scene[] = [
        { kind: "intro", frames: Math.min(150, Math.max(105, readFrames(c.purpose, 0.6) - 90)) },
        { kind: "overview", frames: 96 },
    ];
    c.steps.forEach((s, index) => {
        // The caption is on screen from the start of the step, so reading overlaps the action;
        // the hold after the result is what is left of the reading time, never under 1.8 s.
        const hold = Math.max(54, readFrames(`${s.title} ${s.detail}`, 0.8) - 66);
        scenes.push({ kind: "step", index, frames: STEP_ACTION + hold });
    });
    scenes.push({ kind: "outcome", frames: Math.min(210, Math.max(165, readFrames(`${c.outcome.title} ${c.outcome.detail}`, 2.4))) });
    return scenes;
}

/** Start frame of every scene once crossfades overlap them. */
export function sceneStarts(scenes: Scene[]) {
    const starts: number[] = [];
    let t = 0;
    scenes.forEach((s, i) => {
        starts.push(t);
        t += s.frames - (i < scenes.length - 1 ? XFADE : 0);
    });
    return { starts, total: t };
}

export function totalFrames(c: Capture) {
    return sceneStarts(scenesFor(c)).total;
}

export type Chapter = { title: string; detail: string; startMs: number; endMs: number; label: string };

/** Chapters as the viewer reads them: same text as the caption band. */
export function chapters(c: Capture): Chapter[] {
    const scenes = scenesFor(c);
    const { starts, total } = sceneStarts(scenes);
    const ms = (f: number) => Math.round((f / FPS) * 1000);
    return scenes
        .filter((s) => s.kind !== "intro")
        .map((s) => {
            const i = scenes.indexOf(s);
            const end = i < scenes.length - 1 ? starts[i + 1] + XFADE / 2 : total;
            const start = i === 1 ? 0 : starts[i] + XFADE / 2;
            if (s.kind === "overview") return { label: "Vue d'ensemble", title: c.title, detail: c.purpose, startMs: ms(start), endMs: ms(end) };
            if (s.kind === "step") {
                const st = c.steps[s.index];
                return { label: `Étape ${s.index + 1} sur ${c.steps.length}`, title: st.title, detail: st.detail, startMs: ms(start), endMs: ms(end) };
            }
            return { label: "Résultat", title: c.outcome.title, detail: c.outcome.detail, startMs: ms(start), endMs: ms(end) };
        });
}

/** Captions in the @remotion/captions format, one per chapter (title, then detail). */
export function captions(c: Capture): Caption[] {
    return chapters(c).map((ch) => ({
        text: `${ch.title} — ${ch.detail}`,
        startMs: ch.startMs,
        endMs: ch.endMs,
        timestampMs: ch.startMs,
        confidence: null,
    }));
}
