"use client";

/**
 * An answer as the reader sees it: markdown paragraphs with the visuals the
 * model drew set where it put its `[[visuel N]]` markers. Used for the answer
 * being streamed and for the saved one, so nothing jumps when the turn ends:
 * markdown runs are keyed by their order among markdown runs and visuals by
 * their id, so both keep their DOM identity through the hand-over.
 */

import { useMemo } from "react";
import type { CitationRef } from "@/lib/ai/agent/protocol";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import { splitFollowUps, splitVisualMarkers } from "@/lib/assistant/answer";
import AnswerMarkdown from "./AnswerMarkdown";
import { VisualCard } from "./visuals/VisualCard";

export interface VisualHandlers {
    onOpen?: (visual: StoredVisual) => void;
    onTogglePin?: (visual: StoredVisual) => void;
    isPinned?: (visual: StoredVisual) => boolean;
}

const NO_VISUALS: StoredVisual[] = [];
const NO_HANDLERS: VisualHandlers = {};

export function AnswerBody({
    content,
    citations,
    visuals = NO_VISUALS,
    handlers = NO_HANDLERS,
}: {
    content: string;
    citations?: CitationRef[];
    visuals?: StoredVisual[];
    handlers?: VisualHandlers;
}) {
    const segments = useMemo(() => {
        let md = 0;
        return splitVisualMarkers(splitFollowUps(content).body, visuals.length).map((segment) =>
            segment.type === "md" ? { ...segment, key: `m${md++}` } : { ...segment, key: `v:${visuals[segment.index - 1].id}` },
        );
    }, [content, visuals]);
    return (
        <>
            {segments.map((segment) =>
                segment.type === "md" ? (
                    <AnswerMarkdown key={segment.key} content={segment.text} citations={citations} />
                ) : (
                    <VisualCard
                        key={segment.key}
                        visual={visuals[segment.index - 1]}
                        onOpen={handlers.onOpen}
                        onTogglePin={handlers.onTogglePin}
                        pinned={handlers.isPinned?.(visuals[segment.index - 1])}
                    />
                ),
            )}
        </>
    );
}
