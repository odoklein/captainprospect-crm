import React, { useMemo } from "react";
import { AbsoluteFill, type CalculateMetadataFunction, staticFile } from "remotion";
import { Band, Title } from "./Band";
import { plan } from "./camera";
import { Backdrop, Stage } from "./Stage";
import { C } from "./theme";
import { build } from "./timeline";
import type { Capture } from "./types";

export type TutorialProps = { id: string; capture: Capture | null };

export const calculateMetadata: CalculateMetadataFunction<TutorialProps> = async ({ props }) => {
    const res = await fetch(staticFile(`captures/${props.id}/capture.json`));
    const capture = (await res.json()) as Capture;
    return { durationInFrames: build(capture).total, props: { ...props, capture } };
};

export const Tutorial: React.FC<TutorialProps> = ({ capture }) => {
    const c = capture;
    const tl = useMemo(() => (c ? build(c) : null), [c]);
    const p = useMemo(() => (c && tl ? plan(c, tl) : null), [c, tl]);
    if (!c || !tl || !p) return null;
    return (
        <AbsoluteFill style={{ background: C.navy, overflow: "hidden" }}>
            <Backdrop />
            <Stage c={c} tl={tl} p={p} />
            <Title c={c} tl={tl} />
            <Band c={c} tl={tl} />
        </AbsoluteFill>
    );
};
