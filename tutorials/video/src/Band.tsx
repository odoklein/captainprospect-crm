// Caption band under the interface: one idea at a time, readable at embedded size, no audio needed.
import React from "react";
import { Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { E } from "./camera";
import { Words, tween } from "./parts";
import { BAND, C, STAGE, body, display } from "./theme";
import { FPS, type Chapter, type Timeline, chapters } from "./timeline";
import type { Capture, StepKind } from "./types";

const GESTURE: Record<StepKind, string> = { click: "Cliquez", type: "Saisissez", select: "Choisissez", hover: "Survolez", point: "Observez" };

const Glyph: React.FC<{ kind: StepKind | "result"; draw: number }> = ({ kind, draw }) => {
    const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
    return (
        <svg width={18} height={18} viewBox="0 0 24 24">
            {kind === "result" && <path d="M5 12.5 L10 17.5 L19 7.5" {...p} strokeWidth={2.6} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />}
            {kind === "click" && <path d="M6 3 L6 18 L10 14.5 L13 20.5 L15.5 19.3 L12.6 13.4 L18 13 Z" {...p} />}
            {kind === "select" && <path d="M4 6h16M4 12h16M4 18h10M17 16l2.5 2.5L22 16" {...p} />}
            {kind === "type" && <path d="M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8" {...p} />}
            {(kind === "point" || kind === "hover") && <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z" {...p} />}
        </svg>
    );
};

/** One chapter's text: label, title and detail arrive in turn, then leave together. */
const Lines: React.FC<{ ch: Chapter; gesture: StepKind | "result" | null }> = ({ ch, gesture }) => {
    const f = useCurrentFrame();
    const { durationInFrames } = useVideoConfig();
    const exit = tween(f, durationInFrames - 8, durationInFrames - 1, E.inOut);
    const accent = ch.kind === "result" ? C.green : C.pink;
    const chip = tween(f, 6, 20, E.spring);
    return (
        <div style={{ position: "absolute", inset: 0, padding: "0 64px", display: "flex", alignItems: "center", gap: 32, opacity: 1 - exit, translate: `0px ${-exit * 8}px` }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <Words text={ch.label} frame={f} delay={1} stagger={1.5} style={{ fontFamily: body, fontWeight: 600, fontSize: 15, letterSpacing: "0.09em", textTransform: "uppercase", color: accent }} />
                <Words text={ch.title} frame={f} delay={4} stagger={2} style={{ fontFamily: display, fontWeight: 700, fontSize: 31, color: C.white, lineHeight: 1.15, whiteSpace: "nowrap" }} />
                <Words text={ch.detail} frame={f} delay={10} stagger={0.8} style={{ fontFamily: body, fontWeight: 400, fontSize: 21, color: C.ink2, lineHeight: 1.3, whiteSpace: "nowrap" }} />
            </div>
            {gesture && (
                <div
                    style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "8px 14px 8px 12px", borderRadius: 999,
                        border: `1px solid ${gesture === "result" ? "rgba(22,163,74,0.5)" : "rgba(255,255,255,0.16)"}`,
                        background: gesture === "result" ? "rgba(22,163,74,0.16)" : "rgba(255,255,255,0.06)",
                        color: gesture === "result" ? "#6EE7A0" : C.white,
                        fontFamily: body, fontWeight: 600, fontSize: 16,
                        opacity: chip, scale: String(0.9 + chip * 0.1), marginBottom: 6,
                    }}
                >
                    <Glyph kind={gesture} draw={tween(f, 14, 30, E.inOut)} />
                    {gesture === "result" ? "C'est fait" : GESTURE[gesture]}
                </div>
            )}
        </div>
    );
};

/** Chapter progress along the bottom edge. */
const Progress: React.FC<{ chs: Chapter[] }> = ({ chs }) => {
    const f = useCurrentFrame();
    const steps = chs.slice(1);
    const total = steps[steps.length - 1].end - steps[0].start;
    return (
        <div style={{ position: "absolute", left: 64, right: 64, bottom: 10, height: 3, display: "flex", gap: 6 }}>
            {steps.map((ch) => {
                const t = Math.min(1, Math.max(0, (f - ch.start) / (ch.end - ch.start)));
                const color = ch.kind === "result" ? C.green : C.pink;
                return (
                    <div key={ch.start} style={{ flex: (ch.end - ch.start) / total, background: "rgba(255,255,255,0.14)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${t * 100}%`, background: color, boxShadow: t > 0 && t < 1 ? `0 0 8px ${color}` : undefined }} />
                    </div>
                );
            })}
        </div>
    );
};

export const Band: React.FC<{ c: Capture; tl: Timeline }> = ({ c, tl }) => {
    const f = useCurrentFrame();
    const chs = chapters(c);
    // Rises from under the frame while the window settles flat.
    const up = tween(f, tl.intro.hold + 4, tl.intro.end + 2, E.spring);
    return (
        <div style={{ position: "absolute", left: 0, top: STAGE.height, width: 1280, height: BAND, translate: `0px ${(1 - up) * (BAND + 12)}px`, background: C.navy, borderTop: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 -18px 40px rgba(6,16,58,0.55)" }}>
            {chs.slice(1).map((ch, i) => (
                <Sequence key={ch.start} name={ch.label} from={ch.start} durationInFrames={ch.end - ch.start} layout="none">
                    <Lines ch={ch} gesture={ch.kind === "result" ? "result" : c.steps[i].kind} />
                </Sequence>
            ))}
            <Progress chs={chs} />
        </div>
    );
};

/** Title card: eyebrow, page name and purpose over the floating window. */
export const Title: React.FC<{ c: Capture; tl: Timeline }> = ({ c, tl }) => {
    const f = useCurrentFrame();
    if (f > tl.intro.hold + 16) return null;
    const exit = tween(f, tl.intro.hold - 4, tl.intro.hold + 12, E.inOut);
    const line = tween(f, 4, 22, E.spring);
    return (
        <>
            {/* Left scrim so the text never fights the interface behind it. */}
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${C.navy} 0%, rgba(6,16,58,0.94) 34%, rgba(6,16,58,0.5) 58%, rgba(6,16,58,0) 82%)`, opacity: 1 - exit }} />
            <div style={{ position: "absolute", left: 88, top: 0, bottom: 0, width: 620, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18, opacity: 1 - exit, translate: `0px ${-exit * 22}px`, filter: exit > 0.01 ? `blur(${exit * 6}px)` : undefined }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: body, fontWeight: 600, fontSize: 17, letterSpacing: "0.11em", textTransform: "uppercase", color: C.pink }}>
                    <span style={{ width: 30 * line, height: 2, background: C.pink }} />
                    <Words text={`Tutoriel · ${c.section}`} frame={f} delay={6} stagger={2} />
                </div>
                <Words text={c.title} frame={f} delay={12} stagger={3} style={{ fontFamily: display, fontWeight: 700, fontSize: c.title.length > 14 ? 68 : 84, lineHeight: 1.02, color: C.white, letterSpacing: "-0.015em" }} />
                <Words text={c.purpose} frame={f} delay={24} stagger={1} style={{ fontFamily: body, fontSize: 25, lineHeight: 1.42, color: C.ink2, maxWidth: 560 }} />
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 10, fontFamily: body, fontSize: 16, color: "rgba(255,255,255,0.55)", opacity: tween(f, 44, 60) }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.pink }} />
                    {c.steps.length} étapes · {Math.round(tl.total / FPS)} secondes · sans son
                </div>
            </div>
        </>
    );
};
