"use client";

/**
 * The pieces of a turn being answered, as it really happens: the phase the
 * runtime is in, the elapsed time and one muted line of the model's
 * reasoning summary.
 *
 * There is no separate « live » component any more: the answer is drawn by
 * one component (workspace/thread/AssistantMessage) from the first event to
 * the saved message, so the hand-over updates in place instead of remounting.
 */

import { useEffect, useState } from "react";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";

export type LivePhase = "connecting" | "thinking" | "tools" | "writing" | "verifying" | "repairing" | "retrying";

export interface LiveStep {
    id: string;
    tool: string;
    label: string;
    state: "running" | "ok" | "error";
    durationMs?: number;
    cached?: boolean;
}

export interface LiveTurnState {
    phase: LivePhase;
    steps: LiveStep[];
    draft: string;
    visuals: StoredVisual[];
    /** Reasoning summary streamed so far (reasoning models only); cleared by `reset`. */
    reasoning?: string;
}

export const PHASE_LABEL: Record<LivePhase, string> = {
    connecting: "Connexion…",
    thinking: "Réflexion…",
    tools: "Consultation des données…",
    writing: "Rédaction…",
    verifying: "Vérification des chiffres…",
    repairing: "Correction des chiffres non sourcés…",
    retrying: "Le service répond lentement, nouvelle tentative…",
};

export const formatSeconds = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace(".", ",")} s`);

/** The last ~140 chars of the reasoning, on one line. */
export function reasoningLine(text: string | undefined): string {
    if (!text) return "";
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length <= 140 ? flat : `…${flat.slice(flat.length - 140).trimStart()}`;
}

/** Seconds since `startedAt`, ticking on its own so the answer above it does not re-render. */
export function Elapsed({ startedAt, className }: { startedAt: number; className?: string }) {
    const [now, setNow] = useState(startedAt);
    useEffect(() => {
        const tick = setInterval(() => setNow(Date.now()), 100);
        return () => clearInterval(tick);
    }, []);
    return <span className={className}>{formatSeconds(Math.round(Math.max(0, now - startedAt) / 100) * 100)}</span>;
}
