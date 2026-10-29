"use client";

/**
 * An answer as the reader sees it: markdown paragraphs with the visuals the
 * model drew set where it put its `[[visuel N]]` markers. Used for the answer
 * being streamed and for the saved one, so nothing jumps when the turn ends.
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

export function AnswerBody({
    content,
    citations,
    visuals = [],
    handlers = {},
}: {
    content: string;
    citations?: CitationRef[];
    visuals?: StoredVisual[];
    handlers?: VisualHandlers;
}) {
    const segments = useMemo(() => splitVisualMarkers(splitFollowUps(content).body, visuals.length), [content, visuals.length]);
    return (
        <>
            {segments.map((segment, i) =>
                segment.type === "md" ? (
                    <AnswerMarkdown key={`m${i}`} content={segment.text} citations={citations} />
                ) : (
                    <VisualCard
                        key={visuals[segment.index - 1].id}
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
