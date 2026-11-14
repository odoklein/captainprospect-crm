import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { type Cam, type StepPlan, lerpCam, lerpBox } from "./camera";
import { CaptionBand, Cursor, Focus, Full, Screen, Stage } from "./parts";
import { C, body, display } from "./theme";
import { STEP } from "./timeline";
import type { Capture } from "./types";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const out = Easing.bezier(0.16, 1, 0.3, 1);
const inOut = Easing.bezier(0.45, 0, 0.2, 1);

// Step phase boundaries (frames from the start of the step scene).
const T1 = STEP.travel;
const T2 = T1 + STEP.highlight;
const T3 = T2 + STEP.press;
const T4 = T3 + STEP.swap;
const T5 = T4 + STEP.reframe;

export const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();

export const IntroScene: React.FC<{ c: Capture; cam: Cam }> = ({ c, cam }) => {
    const f = useCurrentFrame();
    const rise = (d: number) => ({
        opacity: interpolate(f, [d, d + 18], [0, 1], { ...clamp, easing: out }),
        translate: `0px ${interpolate(f, [d, d + 18], [14, 0], { ...clamp, easing: out })}px`,
    });
    return (
        <Full>
            <Stage>
                <Screen c={c} file={c.overview} cam={cam} blur={7} opacity={0.55} />
            </Stage>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(6,16,58,0.55) 0%, rgba(6,16,58,0.92) 70%)" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 120px", gap: 18 }}>
                <div style={{ ...rise(4), display: "flex", alignItems: "center", gap: 12, fontFamily: body, fontWeight: 600, fontSize: 18, letterSpacing: "0.1em", textTransform: "uppercase", color: C.pink }}>
                    <span style={{ width: 28, height: 2, background: C.pink }} />
                    Tutoriel · {c.section}
                </div>
                <div style={{ ...rise(10), fontFamily: display, fontWeight: 700, fontSize: 76, lineHeight: 1.02, color: C.white, letterSpacing: "-0.01em" }}>{c.title}</div>
                <div style={{ ...rise(18), fontFamily: body, fontSize: 28, lineHeight: 1.4, color: C.ink2, maxWidth: 900 }}>{c.purpose}</div>
            </div>
        </Full>
    );
};

export const OverviewScene: React.FC<{ c: Capture; cam: Cam }> = ({ c, cam }) => {
    const f = useCurrentFrame();
    const { durationInFrames } = useVideoConfig();
    // A barely perceptible push-in: the page is alive, nothing competes with it.
    const k = interpolate(f, [0, durationInFrames], [1, 1.035], { ...clamp, easing: inOut });
    return (
        <Full>
            <Stage>
                <Screen c={c} file={c.overview} cam={{ ...cam, s: cam.s * k }} />
            </Stage>
            <CaptionBand label="Vue d'ensemble" title={c.title} detail={firstSentence(c.purpose)} />
        </Full>
    );
};

export const StepScene: React.FC<{ c: Capture; index: number; p: StepPlan }> = ({ c, index, p }) => {
    const f = useCurrentFrame();
    const s = c.steps[index];
    const cam = f <= T4 ? lerpCam(f, [0, T1], p.start, p.target) : lerpCam(f, [T4, T5], p.target, p.end);

    // Pointer glides on a soft arc, then rests on the element.
    const t = interpolate(f, [2, T1], [0, 1], { ...clamp, easing: inOut });
    const arc = Math.sin(t * Math.PI) * Math.min(60, Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y) * 0.12);
    const at = { x: p.from.x + (p.to.x - p.from.x) * t, y: p.from.y + (p.to.y - p.from.y) * t - arc };

    const clicks = s.kind === "click" || s.kind === "type" || s.kind === "select";
    const press = clicks ? interpolate(f, [T2, T2 + 4, T3], [0, 1, 0], clamp) : 0;
    const ripple = clicks ? interpolate(f, [T2 + 4, T2 + 22], [0, 1], clamp) : 0;

    // The pointer steps aside once the eye should move to the result, and comes back at the next step.
    const pointer = Math.min(
        interpolate(f, [0, 8], [index === 0 ? 0 : 0.35, 1], clamp),
        s.result ? interpolate(f, [T4, T4 + 14], [1, 0.35], clamp) : 1,
    );

    const changes = s.kind !== "point";
    const after = changes ? interpolate(f, [T3 + (s.partials ? 10 : 0), T4 + (s.partials ? 6 : 0)], [0, 1], { ...clamp, easing: out }) : 0;

    const ringIn = interpolate(f, [T1 - 8, T2], [0, 1], { ...clamp, easing: out });
    // The clicked element may move once the interface changes: its ring leaves with the old state.
    const ringOut = changes ? interpolate(f, [T3, T3 + 8], [1, 0], clamp) : 1;
    const resultIn = s.result ? interpolate(f, [T4 + 8, T5], [0, 1], { ...clamp, easing: out }) : 0;
    // The ring follows the change: from the clicked element to what it revealed.
    const resultBox = s.result ? lerpBox(interpolate(f, [T4 + 8, T5], [0, 1], { ...clamp, easing: inOut }), s.target, s.result) : s.target;

    return (
        <Full>
            <Stage>
                <Screen c={c} file={s.before} cam={cam} />
                {s.partials?.map((file, k) => (
                    <Screen key={file} c={c} file={file} cam={cam} opacity={f >= T2 + 2 + k * 6 ? 1 : 0} />
                ))}
                {changes && <Screen c={c} file={s.after} cam={cam} opacity={after} />}
                <Focus box={s.target} cam={cam} opacity={ringIn * ringOut} />
                {s.result && <Focus box={resultBox} cam={cam} opacity={resultIn} tone="result" />}
                <Cursor at={at} cam={cam} press={press} ripple={ripple} opacity={pointer} />
            </Stage>
            <CaptionBand label={`Étape ${index + 1} sur ${c.steps.length}`} title={s.title} detail={s.detail} />
        </Full>
    );
};

export const OutcomeScene: React.FC<{ c: Capture; from: Cam; to: Cam }> = ({ c, from, to }) => {
    const f = useCurrentFrame();
    const cam = lerpCam(f, [0, 40], from, to);
    const ring = interpolate(f, [24, 44], [0, 1], { ...clamp, easing: out });
    return (
        <Full>
            <Stage>
                <Screen c={c} file={c.outcome.image} cam={cam} />
                {c.outcome.box && <Focus box={c.outcome.box} cam={cam} opacity={ring} tone="result" />}
            </Stage>
            <CaptionBand label="Résultat" title={c.outcome.title} detail={c.outcome.detail} tone="result" />
        </Full>
    );
};
