// Visual building blocks. Every motion is a pure function of the frame passed in
// (no CSS transitions/animations), so renders are deterministic.
import React from "react";
import { AbsoluteFill, CanvasImage, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { type Cam, type Pt, project, projectBox } from "./camera";
import { BAND, C, STAGE, body, display } from "./theme";
import type { Box, Capture } from "./types";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const out = Easing.bezier(0.16, 1, 0.3, 1);

export const src = (c: Capture, file: string) => staticFile(`captures/${c.id}/${file}`);

/** One screenshot of the real interface, placed by the camera. */
export const Screen: React.FC<{ c: Capture; file: string; cam: Cam; opacity?: number; blur?: number }> = ({ c, file, cam, opacity = 1, blur = 0 }) => {
    const { width: W, height: H } = c.viewport;
    const tl = project(cam, { x: 0, y: 0 });
    return (
        <div
            style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: W,
                height: H,
                transformOrigin: "0 0",
                translate: `${tl.x}px ${tl.y}px`,
                scale: String(cam.s),
                opacity,
                borderRadius: 10,
                overflow: "hidden",
                boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
                filter: blur ? `blur(${blur}px)` : undefined,
            }}
        >
            <CanvasImage src={src(c, file)} width={W * c.dsf} height={H * c.dsf} style={{ width: W, height: H, display: "block" }} />
        </div>
    );
};

/** Stage: the area above the caption band, with the brand backdrop. */
export const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ position: "absolute", left: 0, top: 0, width: STAGE.width, height: STAGE.height, overflow: "hidden", background: `radial-gradient(120% 90% at 50% 0%, ${C.navy2} 0%, ${C.navy} 70%)` }}>
        {children}
    </div>
);

/** Focus: a calm ring on the element, the rest of the screen slightly dimmed. */
export const Focus: React.FC<{ box: Box; cam: Cam; opacity: number; tone?: "action" | "result" }> = ({ box, cam, opacity, tone = "action" }) => {
    if (opacity <= 0.001) return null;
    const b = projectBox(cam, box);
    const pad = 6;
    const color = tone === "action" ? C.pink : C.green;
    return (
        <div
            style={{
                position: "absolute",
                left: b.x - pad,
                top: b.y - pad,
                width: b.w + 2 * pad,
                height: b.h + 2 * pad,
                borderRadius: 10,
                border: `2.5px solid ${color}`,
                boxShadow: `0 0 0 5px ${tone === "action" ? C.pinkSoft : C.greenSoft}, 0 0 0 4000px ${C.dim}`,
                opacity,
            }}
        />
    );
};

/** Pointer with press and ripple, positioned in stage space so it never scales with zoom. */
export const Cursor: React.FC<{ at: Pt; cam: Cam; press: number; ripple: number; opacity?: number }> = ({ at, cam, press, ripple, opacity = 1 }) => {
    const p = project(cam, at);
    return (
        <>
            {ripple > 0 && ripple < 1 && (
                <div
                    style={{
                        position: "absolute",
                        left: p.x,
                        top: p.y,
                        width: 60,
                        height: 60,
                        marginLeft: -30,
                        marginTop: -30,
                        borderRadius: "50%",
                        border: `2px solid ${C.pink}`,
                        scale: String(0.2 + ripple * 0.8),
                        opacity: (1 - ripple) * 0.7,
                    }}
                />
            )}
            <svg
                width={30}
                height={30}
                viewBox="0 0 24 24"
                style={{ position: "absolute", left: p.x - 4, top: p.y - 2, scale: String(1 - press * 0.14), transformOrigin: "4px 2px", opacity, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))" }}
            >
                <path d="M4.5 2.5 L4.5 19 L9 14.8 L12.2 21.5 L15 20.2 L11.8 13.6 L18 13.4 Z" fill="#fff" stroke={C.navy} strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
        </>
    );
};

export type BandText = { label: string; title: string; detail: string; tone?: "step" | "result" };

/** Caption band: one idea at a time, readable at embedded size, no audio needed. */
export const CaptionBand: React.FC<BandText> = ({ label, title, detail, tone = "step" }) => {
    const f = useCurrentFrame();
    const enter = (delay: number) => ({
        opacity: interpolate(f, [delay, delay + 14], [0, 1], { ...clamp, easing: out }),
        translate: `0px ${interpolate(f, [delay, delay + 14], [8, 0], { ...clamp, easing: out })}px`,
    });
    const accent = tone === "result" ? C.green : C.pink;
    return (
        <div style={{ position: "absolute", left: 0, top: STAGE.height, width: 1280, height: BAND, background: C.navy, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 64px", gap: 4 }}>
            <div style={{ ...enter(2), display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: body, fontWeight: 600, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase", color: accent }}>{label}</span>
            </div>
            <div style={{ ...enter(5), fontFamily: display, fontWeight: 700, fontSize: 31, color: C.white, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
            <div style={{ ...enter(9), fontFamily: body, fontWeight: 400, fontSize: 21, color: C.ink2, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detail}</div>
        </div>
    );
};

export const Full: React.FC<{ children: React.ReactNode }> = ({ children }) => <AbsoluteFill style={{ background: C.navy }}>{children}</AbsoluteFill>;
