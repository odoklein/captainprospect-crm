/**
 * Turning an assistant answer into what the chat shows: follow-up questions
 * split off, citation markers made clickable, and the NDJSON stream read line
 * by line. Pure — shared by the workspace and its tests.
 */

import type { StreamEvent } from "@/lib/ai/agent/protocol";

const FOLLOW_UPS = /(^|\n)[ \t]*:::\s*suivi[ \t]*\n([\s\S]*?)(?:\n[ \t]*:::[ \t]*(?=\n|$)|$)/i;

/**
 * Splits the `:::suivi` block the prompt asks for (see buildReasoningPrompt)
 * off the answer. Tolerates a block still being streamed (no closing fence).
 */
export function splitFollowUps(content: string): { body: string; followUps: string[] } {
    const match = FOLLOW_UPS.exec(content);
    if (!match) return { body: content, followUps: [] };
    const followUps = match[2]
        .split("\n")
        .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
        .filter((line) => line.length > 0 && line.length <= 160 && line !== ":::")
        .slice(0, 4);
    const body = (content.slice(0, match.index) + content.slice(match.index + match[0].length)).trimEnd();
    return { body, followUps };
}

/** Prefix of the links the renderer turns into source chips. */
export const CITATION_HREF = "#source-";

/**
 * `[E1]`, `[E1, E3]` or `[E1][E2]` → markdown links the renderer recognises.
 * A marker already followed by `(` is a real link and is left alone.
 */
export function linkCitations(markdown: string): string {
    return markdown.replace(/\[(E\d{1,3}(?:\s*[,;]\s*E\d{1,3})*)\](?!\()/g, (_m, labels: string) =>
        labels
            .split(/\s*[,;]\s*/)
            .map((label) => `[${label}](${CITATION_HREF}${label})`)
            .join(""),
    );
}

/** Reads an NDJSON body, calling `onEvent` per line. Unparseable lines are skipped. */
export async function readNdjson(body: ReadableStream<Uint8Array>, onEvent: (event: StreamEvent) => void): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const flush = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
            onEvent(JSON.parse(trimmed) as StreamEvent);
        } catch {
            // A half-written line at a cancel: nothing to show.
        }
    };
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
            flush(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
        }
    }
    flush(buffer + decoder.decode());
}

export type BodySegment = { type: "md"; text: string } | { type: "visual"; index: number };

const VISUAL_MARKER = /^[ \t]*\[\[visuel\s+(\d+)\]\][ \t]*$/gm;

/**
 * Cuts an answer at its `[[visuel N]]` marker lines. A visual the answer never
 * placed goes after the first paragraph (when nothing is placed) or at the end;
 * a marker without a visual disappears. A marker still being streamed
 * ("[[visu") is hidden rather than shown raw.
 */
export function splitVisualMarkers(body: string, visualCount: number): BodySegment[] {
    const text = body.replace(/\[\[[^\]\n]*$/, "");
    const segments: BodySegment[] = [];
    const used = new Set<number>();
    let last = 0;
    let match: RegExpExecArray | null;
    VISUAL_MARKER.lastIndex = 0;
    while ((match = VISUAL_MARKER.exec(text))) {
        const chunk = text.slice(last, match.index).trim();
        if (chunk) segments.push({ type: "md", text: chunk });
        const index = Number(match[1]);
        if (index >= 1 && index <= visualCount && !used.has(index)) {
            used.add(index);
            segments.push({ type: "visual", index });
        }
        last = match.index + match[0].length;
    }
    const tail = text.slice(last).trim();
    if (tail) segments.push({ type: "md", text: tail });

    const unplaced = Array.from({ length: visualCount }, (_, i) => i + 1).filter((i) => !used.has(i));
    if (unplaced.length === 0) return segments;
    if (used.size === 0 && segments.length > 0 && segments[0].type === "md") {
        const [first, ...rest] = segments[0].text.split(/\n{2,}/);
        const head: BodySegment[] = [{ type: "md", text: first }, ...unplaced.map((index): BodySegment => ({ type: "visual", index }))];
        const remainder = rest.join("\n\n").trim();
        return [...head, ...(remainder ? [{ type: "md", text: remainder } as BodySegment] : []), ...segments.slice(1)];
    }
    return [...segments, ...unplaced.map((index): BodySegment => ({ type: "visual", index }))];
}
