"use client";

/**
 * The turn being answered, as it really happens: each tool call the runtime
 * starts and finishes (from the NDJSON stream), the current phase, one muted
 * line of the model's reasoning summary when it sends one, and the answer
 * text as it is written.
 */

import { AlertCircle, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { FOCUS } from "@/components/accueil/AccueilUI";
import { AiMark } from "@/components/ui/AiMark";
import type { StoredVisual } from "@/lib/assistant/visuals/spec";
import { AnswerBody, type VisualHandlers } from "./AnswerBody";

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

const PHASE_LABEL: Record<LivePhase, string> = {
    connecting: "Connexion…",
    thinking: "Réflexion…",
    tools: "Consultation des données…",
    writing: "Rédaction…",
    verifying: "Vérification des chiffres…",
    repairing: "Correction des chiffres non sourcés…",
    retrying: "Le service répond lentement, nouvelle tentative…",
};

const formatSeconds = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace(".", ",")} s`);

/** The last ~140 chars of the reasoning, on one line. */
function reasoningLine(text: string | undefined): string {
    if (!text) return "";
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length <= 140 ? flat : `…${flat.slice(flat.length - 140).trimStart()}`;
}

export function LiveTurn({ state, elapsedMs, deep, handlers }: { state: LiveTurnState; elapsedMs: number; deep: boolean; handlers?: VisualHandlers }) {
    const [showSteps, setShowSteps] = useState(false);
    const writing = state.draft.trim().length > 0 || state.visuals.length > 0;
    const running = state.steps.filter((s) => s.state === "running").length;
    // While tools run the list is the news; once the answer flows it folds into one line.
    const stepsOpen = !writing || showSteps;
    const reasoning = writing ? "" : reasoningLine(state.reasoning);

    return (
        <div className="cp-ai-answer min-w-0 motion-safe:animate-ds-enter" aria-live="polite" aria-busy="true">
            <div className="mb-2 flex items-center gap-2 text-[12.5px] text-ink-3">
                <span className="relative flex size-5 items-center justify-center rounded-md bg-accent-soft text-accent-soft-ink" aria-hidden>
                    <AiMark className="size-3.5 motion-safe:animate-pulse" />
                </span>
                <span className="font-medium text-ink-2">{PHASE_LABEL[state.phase]}</span>
                <span className="tabular-nums text-ink-4">{formatSeconds(Math.round(elapsedMs / 100) * 100)}</span>
                {deep && (
                    <span className="rounded-md bg-accent-soft px-1.5 py-px text-[11px] font-medium text-accent-soft-ink">
                        Réflexion approfondie
                    </span>
                )}
            </div>

            {reasoning && (
                <p className="-mt-1 mb-2 truncate pl-7 text-[12px] italic text-ink-4" title={state.reasoning}>
                    {reasoning}
                </p>
            )}

            {state.steps.length > 0 && (
                <div className="mb-3 text-[12.5px]">
                    {writing && (
                        <button
                            type="button"
                            onClick={() => setShowSteps((v) => !v)}
                            aria-expanded={stepsOpen}
                            className={cn("-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-ink-3 transition-colors duration-150 hover:text-ink", FOCUS)}
                        >
                            <ChevronRight className={cn("size-3.5 transition-transform duration-200 ease-[var(--ease-snappy)]", stepsOpen && "rotate-90")} aria-hidden />
                            {state.steps.length} source{state.steps.length > 1 ? "s" : ""} consultée{state.steps.length > 1 ? "s" : ""}
                        </button>
                    )}
                    {stepsOpen && (
                        <ol className="ml-2 space-y-1 border-l border-line pl-3">
                            {state.steps.map((step) => (
                                <li key={step.id} className="flex items-center gap-2 motion-safe:animate-ds-enter">
                                    {step.state === "running" ? (
                                        <Loader2 className="size-3.5 shrink-0 animate-spin text-ink-4" aria-label="En cours" />
                                    ) : step.state === "ok" ? (
                                        <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-label="Terminé" />
                                    ) : (
                                        <AlertCircle className="size-3.5 shrink-0 text-warning" aria-label="Échec" />
                                    )}
                                    <span className={cn("min-w-0 truncate", step.state === "running" ? "text-ink" : "text-ink-2")}>{step.label}</span>
                                    {step.durationMs !== undefined && (
                                        <span className="shrink-0 tabular-nums text-[11px] text-ink-4">
                                            {step.cached ? "déjà lu" : formatSeconds(step.durationMs)}
                                        </span>
                                    )}
                                </li>
                            ))}
                            {running === 0 && !writing && state.phase === "thinking" && <li className="text-ink-4">Analyse des résultats…</li>}
                        </ol>
                    )}
                </div>
            )}

            {writing ? (
                <div className="cp-ai-caret">
                    <AnswerBody content={state.draft} visuals={state.visuals} handlers={handlers} />
                </div>
            ) : (
                state.steps.length === 0 && (
                    <div className="space-y-2 pt-1" aria-hidden>
                        <div className="h-3 w-[72%] rounded-full bg-surface-3 motion-safe:animate-pulse" />
                        <div className="h-3 w-[54%] rounded-full bg-surface-3 motion-safe:animate-pulse [animation-delay:120ms]" />
                    </div>
                )
            )}
        </div>
    );
}
