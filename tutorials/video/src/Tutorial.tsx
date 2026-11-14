import React from "react";
import { AbsoluteFill, type CalculateMetadataFunction, interpolate, staticFile, useCurrentFrame } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { plan } from "./camera";
import { IntroScene, OutcomeScene, OverviewScene, StepScene } from "./scenes";
import { BAND, C, STAGE } from "./theme";
import { XFADE, chapters, scenesFor, totalFrames } from "./timeline";
import type { Capture } from "./types";

export type TutorialProps = { id: string; capture: Capture | null };

export const calculateMetadata: CalculateMetadataFunction<TutorialProps> = async ({ props }) => {
    const res = await fetch(staticFile(`captures/${props.id}/capture.json`));
    const capture = (await res.json()) as Capture;
    return { durationInFrames: totalFrames(capture), props: { ...props, capture } };
};

/** Chapter progress along the bottom of the caption band. */
const Progress: React.FC<{ c: Capture }> = ({ c }) => {
    const f = useCurrentFrame();
    const ms = (f / 30) * 1000;
    const chs = chapters(c);
    const total = chs[chs.length - 1].endMs;
    const visible = interpolate(ms, [chs[0].startMs + 200, chs[0].startMs + 600], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return (
        <div style={{ position: "absolute", left: 64, right: 64, top: STAGE.height + BAND - 12, height: 3, display: "flex", gap: 6, opacity: visible }}>
            {chs.map((ch) => (
                <div key={ch.startMs} style={{ flex: (ch.endMs - ch.startMs) / total, background: "rgba(255,255,255,0.14)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(1, Math.max(0, (ms - ch.startMs) / (ch.endMs - ch.startMs))) * 100}%`, background: ch.label === "Résultat" ? C.green : C.pink }} />
                </div>
            ))}
        </div>
    );
};

export const Tutorial: React.FC<TutorialProps> = ({ capture }) => {
    if (!capture) return null;
    const c = capture;
    const p = plan(c);
    const scenes = scenesFor(c);
    const xfade = () => <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: XFADE })} />;
    return (
        <AbsoluteFill style={{ background: C.navy }}>
            <TransitionSeries>
                {scenes.flatMap((s, i) => {
                    const node =
                        s.kind === "intro" ? <IntroScene c={c} cam={p.overview} />
                        : s.kind === "overview" ? <OverviewScene c={c} cam={p.overview} />
                        : s.kind === "step" ? <StepScene c={c} index={s.index} p={p.steps[s.index]} />
                        : <OutcomeScene c={c} from={p.outcomeStart} to={p.outcome} />;
                    const seq = (
                        <TransitionSeries.Sequence key={`s${i}`} name={s.kind === "step" ? `Étape ${s.index + 1}` : s.kind} durationInFrames={s.frames}>
                            {node}
                        </TransitionSeries.Sequence>
                    );
                    return i < scenes.length - 1 ? [seq, <React.Fragment key={`t${i}`}>{xfade()}</React.Fragment>] : [seq];
                })}
            </TransitionSeries>
            <Progress c={c} />
        </AbsoluteFill>
    );
};
