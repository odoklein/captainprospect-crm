// Visual building blocks. Every motion is a pure function of the frame passed in
// (no CSS transitions/animations), so renders are deterministic.
import React from "react";
import { CanvasImage, interpolate, staticFile } from "remotion";
import { type Cam, E, type Menu, type Pt, type ShotEvent, project, projectBox } from "./camera";
import { C, body } from "./theme";
import type { Box, Capture } from "./types";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
/** 0→1 between two frames, eased. */
export const tween = (f: number, t0: number, t1: number, easing: (t: number) => number = E.out) => interpolate(f, [t0, Math.max(t0 + 0.001, t1)], [0, 1], { ...clamp, easing });

export const src = (c: Capture, file: string) => staticFile(`captures/${c.id}/${file}`);

/** One screenshot of the real interface, placed by the camera. `event` describes how it arrives:
 *  a ripple spreading from the click, a soft fade, or a short slide for a scroll. */
export const Shot: React.FC<{ c: Capture; file: string; cam: Cam; event: ShotEvent | null; progress: number }> = ({ c, file, cam, event, progress }) => {
    const { width: W, height: H } = c.viewport;
    const tl = project(cam, { x: 0, y: 0 });
    let opacity = 1;
    let mask: string | undefined;
    let dy = 0;
    if (event?.mode === "fade") opacity = E.out(progress);
    if (event?.mode === "scroll") {
        opacity = E.out(Math.min(1, progress * 1.6));
        dy = (1 - E.spring(progress)) * 56;
    }
    if (event?.mode === "ripple" && event.origin) {
        // The new state spreads from where the pointer acted: cause and effect in one gesture.
        const o = event.origin;
        const reach = Math.max(Math.hypot(o.x, o.y), Math.hypot(W - o.x, o.y), Math.hypot(o.x, H - o.y), Math.hypot(W - o.x, H - o.y)) + 140;
        const r = E.inOut(progress) * reach;
        mask = `radial-gradient(circle at ${o.x}px ${o.y}px, #000 ${Math.max(0, r - 140)}px, transparent ${r}px)`;
        opacity = Math.min(1, progress * 5);
    }
    return (
        <div
            style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: W,
                height: H,
                transformOrigin: "0 0",
                translate: `${tl.x}px ${tl.y + dy * cam.s}px`,
                scale: String(cam.s),
                opacity,
                borderRadius: 10,
                overflow: "hidden",
                boxShadow: event ? undefined : "0 24px 70px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.07)",
                WebkitMaskImage: mask,
                maskImage: mask,
            }}
        >
            <CanvasImage src={src(c, file)} width={W * c.dsf} height={H * c.dsf} style={{ width: W, height: H, display: "block" }} />
        </div>
    );
};

/** Focus ring. `pop` 0→1 drives a small overshoot on arrival; `flash` fills it briefly on press;
 *  `ping` sends one soft ring outward ("look here"). */
export const Ring: React.FC<{ box: Box; cam: Cam; opacity: number; pop?: number; flash?: number; ping?: number; tone?: "action" | "result"; dim?: number }> = ({
    box, cam, opacity, pop = 1, flash = 0, ping = 0, tone = "action", dim = 0.2,
}) => {
    if (opacity <= 0.002) return null;
    const b = projectBox(cam, box);
    const pad = 6;
    const color = tone === "action" ? C.pink : C.green;
    const soft = tone === "action" ? "255, 10, 128" : "22, 163, 74";
    const grow = (1 - pop) * 10;
    const radius = Math.min(14, (b.h + 2 * pad) / 2);
    const frame = (extra: number): React.CSSProperties => ({
        position: "absolute",
        left: b.x - pad - extra,
        top: b.y - pad - extra,
        width: b.w + 2 * (pad + extra),
        height: b.h + 2 * (pad + extra),
        borderRadius: radius + extra,
    });
    return (
        <>
            <div
                style={{
                    ...frame(grow),
                    border: `2.5px solid ${color}`,
                    background: `rgba(${soft}, ${flash * 0.2})`,
                    boxShadow: `0 0 0 5px rgba(${soft}, 0.16), 0 0 26px rgba(${soft}, 0.28), 0 0 0 4000px rgba(6, 16, 58, ${dim * opacity})`,
                    opacity,
                }}
            />
            {ping > 0 && ping < 1 && <div style={{ ...frame(6 + ping * 26), border: `2px solid ${color}`, opacity: (1 - ping) * 0.55 * opacity }} />}
        </>
    );
};

/** Pointer with press and a double ripple, in stage space so it never scales with the zoom. */
export const Cursor: React.FC<{ at: Pt; cam: Cam; press: number; ripple: number; opacity?: number }> = ({ at, cam, press, ripple, opacity = 1 }) => {
    if (opacity <= 0.002) return null;
    const p = project(cam, at);
    const wave = (t: number, size: number, alpha: number) =>
        t > 0 && t < 1 ? (
            <div style={{ position: "absolute", left: p.x - size / 2, top: p.y - size / 2, width: size, height: size, borderRadius: "50%", border: `2px solid ${C.pink}`, scale: String(0.15 + E.out(t) * 0.85), opacity: (1 - t) * alpha }} />
        ) : null;
    return (
        <>
            {wave(ripple, 64, 0.8)}
            {wave(ripple * 1.25 - 0.25, 104, 0.4)}
            {press > 0.01 && <div style={{ position: "absolute", left: p.x - 13, top: p.y - 13, width: 26, height: 26, borderRadius: "50%", background: C.pink, opacity: press * 0.28 }} />}
            <svg
                width={32}
                height={32}
                viewBox="0 0 24 24"
                style={{ position: "absolute", left: p.x - 4.5, top: p.y - 2.5, scale: String(1 - press * 0.16), transformOrigin: "4.5px 2.5px", opacity, filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.38))" }}
            >
                <path d="M4.5 2.5 L4.5 19 L9 14.8 L12.2 21.5 L15 20.2 L11.8 13.6 L18 13.4 Z" fill="#fff" stroke={C.navy} strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
        </>
    );
};

/** Option list of a dropdown, in capture space so it zooms with the interface. */
export const MenuView: React.FC<{ menu: Menu; cam: Cam; open: number; hovered: boolean; picked: number }> = ({ menu, cam, open, hovered, picked }) => {
    if (open <= 0.002) return null;
    const b = projectBox(cam, menu.box);
    return (
        <div style={{ position: "absolute", left: b.x, top: b.y, width: menu.box.w, height: menu.box.h, transformOrigin: "0 0", scale: String(cam.s) }}>
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    boxSizing: "border-box",
                    padding: menu.pad,
                    background: "#fff",
                    border: "1px solid #DDE1EA",
                    borderRadius: 10,
                    boxShadow: "0 14px 36px rgba(6, 16, 58, 0.2), 0 2px 6px rgba(6, 16, 58, 0.08)",
                    transformOrigin: "50% 0",
                    scale: `1 ${0.9 + 0.1 * open}`,
                    translate: `0px ${(1 - open) * -4}px`,
                    opacity: Math.min(1, open * 1.6),
                    fontFamily: body,
                    fontSize: 13,
                    color: "#0F172A",
                }}
            >
                {menu.rows.map((r) => (
                    <div
                        key={r.label}
                        style={{
                            height: menu.rowH,
                            display: "flex",
                            alignItems: "center",
                            padding: "0 10px",
                            borderRadius: 6,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            fontWeight: r.chosen && picked > 0 ? 600 : 400,
                            background: r.chosen && (hovered || picked > 0) ? `rgba(255, 10, 128, ${0.08 + picked * 0.12})` : "transparent",
                        }}
                    >
                        {r.label}
                    </div>
                ))}
            </div>
        </div>
    );
};

/** Text that arrives word by word: each word sharpens out of a soft blur. */
export const Words: React.FC<{ text: string; frame: number; delay?: number; stagger?: number; style?: React.CSSProperties }> = ({ text, frame, delay = 0, stagger = 2, style }) => (
    <div style={style}>
        {text.split(" ").map((w, i) => {
            const t = tween(frame, delay + i * stagger, delay + i * stagger + 11);
            return (
                <span key={`${w}-${i}`} style={{ display: "inline-block", whiteSpace: "pre", opacity: t, filter: t < 1 ? `blur(${(1 - t) * 5}px)` : undefined, translate: `0px ${(1 - t) * 7}px` }}>
                    {w}
                    {" "}
                </span>
            );
        })}
    </div>
);
