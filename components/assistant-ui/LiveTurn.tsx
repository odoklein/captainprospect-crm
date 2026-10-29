"use client";

/**
 * The turn being answered, as it really happens: each tool call the runtime
 * starts and finishes (from the NDJSON stream), the current phase, and the
 * answer text as it is written. Replaces the old ThinkingStatus, whose steps
 * were guessed from the question by regex on a timer.
 */

import { AlertCircle, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
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

export function LiveTurn({ state, elapsedMs, deep, handlers }: { state: LiveTurnState; elapsedMs: number; deep: boolean; handlers?: VisualHandlers }) {
    const [showSteps, setShowSteps] = useState(false);
    const writing = state.draft.trim().length > 0 || state.visuals.length > 0;
    const running = state.steps.filter((s) => s.state === "running").length;
    // While tools run the list is the news; once the answer flows it folds into one line.
    const stepsOpen = !writing || showSteps;

    return (
        <div className="cp-ai-answer min-w-0" aria-live="polite" aria-busy="true">
            <div className="mb-2 flex items-center gap-2 text-[12.5px] text-[var(--ds-ink-3)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--ds-accent)]" aria-hidden />
                <span className="font-medium text-[var(--ds-ink-2)]">{PHASE_LABEL[state.phase]}</span>
                <span className="tabular-nums">{formatSeconds(Math.round(elapsedMs / 100) * 100)}</span>
                {deep && (
                    <span className="rounded bg-[var(--ds-accent-soft)] px-1.5 py-px text-[11px] font-medium text-[var(--ds-accent-soft-ink)]">
                        Réflexion approfondie
                    </span>
                )}
            </div>

            {state.steps.length > 0 && (
                <div className="mb-3 text-[12.5px]">
                    {writing && (
                        <button
                            type="button"
                            onClick={() => setShowSteps((v) => !v)}
                            aria-expanded={stepsOpen}
                            className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[var(--ds-ink-3)] hover:text-[var(--ds-ink)]"
                        >
                            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", stepsOpen && "rotate-90")} />
                            {state.steps.length} source{state.steps.length > 1 ? "s" : ""} consultée{state.steps.length > 1 ? "s" : ""}
                        </button>
                    )}
                    {stepsOpen && (
                        <ol className="space-y-1 border-l border-[var(--ds-line)] pl-3">
                            {state.steps.map((step) => (
                                <li key={step.id} className="flex items-center gap-2">
                                    {step.state === "running" ? (
                                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--ds-ink-4)]" aria-label="En cours" />
                                    ) : step.state === "ok" ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--ds-success)]" aria-label="Terminé" />
                                    ) : (
                                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[var(--ds-warning)]" aria-label="Échec" />
                                    )}
                                    <span className={cn("min-w-0 truncate", step.state === "running" ? "text-[var(--ds-ink)]" : "text-[var(--ds-ink-2)]")}>
                                        {step.label}
                                    </span>
                                    {step.durationMs !== undefined && (
                                        <span className="shrink-0 tabular-nums text-[11px] text-[var(--ds-ink-4)]">
                                            {step.cached ? "déjà lu" : formatSeconds(step.durationMs)}
                                        </span>
                                    )}
                                </li>
                            ))}
                            {running === 0 && !writing && state.phase === "thinking" && (
                                <li className="text-[var(--ds-ink-4)]">Analyse des résultats…</li>
                            )}
                        </ol>
                    )}
                </div>
            )}

            {writing && (
                <div className="cp-ai-caret">
                    <AnswerBody content={state.draft} visuals={state.visuals} handlers={handlers} />
                </div>
            )}
        </div>
    );
}
