// The interface, filmed in one continuous shot: the camera, the pointer and the rings all read
// the same absolute timeline, so nothing ever cuts.
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { E, type Plan, lerpBox } from "./camera";
import { Cursor, MenuView, Ring, Shot, clamp, tween } from "./parts";
import { C } from "./theme";
import type { Timeline } from "./timeline";
import type { Capture } from "./types";

/** Brand backdrop: navy, with two soft lights that drift slowly behind the window. */
export const Backdrop: React.FC = () => {
    const f = useCurrentFrame();
    const a = f / 140;
    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                background: [
                    `radial-gradient(620px circle at ${82 + Math.sin(a) * 5}% ${10 + Math.cos(a * 0.8) * 6}%, rgba(255, 10, 128, 0.2), transparent 62%)`,
                    `radial-gradient(760px circle at ${12 + Math.cos(a * 0.7) * 5}% ${88 + Math.sin(a * 0.9) * 6}%, rgba(64, 96, 255, 0.24), transparent 62%)`,
                    `radial-gradient(120% 90% at 50% 0%, ${C.navy2} 0%, ${C.navy} 72%)`,
                ].join(", "),
            }}
        />
    );
};

export const Stage: React.FC<{ c: Capture; tl: Timeline; p: Plan }> = ({ c, tl, p }) => {
    const f = useCurrentFrame();
    const cam = p.camAt(f);

    // Title sequence: the window floats in perspective, then settles flat into the stage.
    const hero = 1 - tween(f, tl.intro.hold, tl.intro.end, E.spring);
    const rise = tween(f, 2, 34, E.spring);
    const sway = Math.sin(f / 46) * 1.2;
    const pose: React.CSSProperties =
        hero > 0.001
            ? {
                  transformOrigin: "50% 42%",
                  transform: `perspective(1700px) translate3d(${hero * 236}px, ${hero * 62 + (1 - rise) * 70}px, 0) rotateX(${hero * 9}deg) rotateY(${hero * (-17 + sway)}deg) rotateZ(${hero * 1.6}deg) scale(${1 + hero * 0.1})`,
                  opacity: rise * (1 - hero * 0.2),
                  filter: hero > 0.02 ? `blur(${hero * 1.6}px)` : undefined,
              }
            : {};

    const rings: React.ReactNode[] = [];
    let press = 0;
    let ripple = 0;
    let pointer = tween(f, tl.steps[0].cursor[0] - 8, tl.steps[0].cursor[0] + 4);
    let menu: React.ReactNode = null;

    c.steps.forEach((s, i) => {
        const T = tl.steps[i];
        if (f < T.start || f >= T.end) return;
        const acts = T.press !== null;
        const leave = acts && T.reveal ? T.reveal[0] : T.end - 10;

        // Target ring: pops in as the pointer lands, leaves with the state it belonged to.
        const ringIn = tween(f, T.ring, T.ring + 12, E.pop);
        const ringOut = 1 - tween(f, leave, leave + 7);
        const flash = acts ? interpolate(f, [T.press!, T.press! + 3, T.press! + 12], [0, 1, 0], clamp) : 0;
        // Nothing to click: the ring calls the eye twice, a breath apart.
        const beat = (f - T.ring - 12) % 78;
        const ping = acts || f < T.ring + 12 || f > T.ring + 12 + 78 + 34 ? 0 : Math.min(1, beat / 34);
        rings.push(<Ring key={`t${i}`} box={s.target} cam={cam} opacity={Math.min(1, tween(f, T.ring, T.ring + 6)) * ringOut} pop={ringIn} flash={flash} ping={ping} />);

        // Result ring: glides from the control to what it changed, then relaxes.
        if (s.result && T.resultRing !== null) {
            const morph = tween(f, T.resultRing, T.resultRing + 18, E.spring);
            const o = tween(f, T.resultRing, T.resultRing + 8) * (1 - tween(f, T.end - 10, T.end - 2));
            const relax = 1 - tween(f, T.resultRing + 34, T.resultRing + 60, E.inOut) * 0.4;
            rings.push(<Ring key={`r${i}`} box={lerpBox(morph, s.target, s.result)} cam={cam} opacity={o * relax} tone="result" dim={0.12} />);
        }

        // Pointer: presses, then steps back so the eye goes to the result.
        if (acts) {
            const presses = [T.press!, ...(T.menu ? [T.menu.press] : [])];
            for (const at of presses) {
                press = Math.max(press, interpolate(f, [at - 2, at + 2, at + 8], [0, 1, 0], clamp));
                if (f >= at + 2) ripple = tween(f, at + 2, at + 24, (t) => t);
            }
        }
        // While text is typed, the pointer gets out of the way of the words.
        if (T.typing) pointer = Math.min(pointer, 1 - 0.85 * tween(f, T.typing.start - 2, T.typing.start + 6) * (1 - tween(f, T.typing.end + 2, T.typing.end + 12)));
        if (T.resultRing !== null && f >= T.resultRing) pointer = Math.min(pointer, 1 - tween(f, T.resultRing, T.resultRing + 14) * 0.6);
        if (f >= T.start && i > 0) pointer = Math.min(pointer, 0.4 + 0.6 * tween(f, T.start, T.start + 10));

        const m = p.menus[i];
        if (m && T.menu) {
            const open = tween(f, T.menu.open, T.menu.open + 9, E.spring) * (1 - tween(f, T.menu.close, T.menu.close + 6));
            menu = <MenuView menu={m} cam={cam} open={open} hovered={f >= T.menu.pick[1] - 5} picked={interpolate(f, [T.menu.press, T.menu.press + 3], [0, 1], clamp)} />;
        }
    });

    // Outcome: the result gets its own ring, which lets go as the camera pulls back.
    const O = tl.outcome;
    if (c.outcome.box && f >= O.check - 2) {
        const o = tween(f, O.check, O.check + 8) * (1 - tween(f, O.pullBack[0] - 4, O.pullBack[0] + 12));
        rings.push(<Ring key="outcome" box={c.outcome.box} cam={cam} opacity={o} pop={tween(f, O.check, O.check + 14, E.pop)} tone="result" dim={0.14} ping={tween(f, O.check + 10, O.check + 44, (t) => t)} />);
    }
    pointer = Math.min(pointer, 1 - tween(f, O.start + 2, O.start + 16));

    return (
        <div style={{ position: "absolute", inset: 0, ...pose }}>
            {p.screensAt(f).map((s) => (
                <Shot key={s.file} c={c} file={s.file} cam={cam} event={s.event} progress={s.progress} />
            ))}
            {rings}
            {menu}
            <Cursor at={p.cursorAt(f)} cam={cam} press={press} ripple={ripple} opacity={pointer} />
        </div>
    );
};
