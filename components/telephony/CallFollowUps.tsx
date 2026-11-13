"use client";

// ============================================
// CALL FOLLOW-UPS — under the proposed result: what the AI understood (and how
// sure it is), what nobody verified, and the next actions it proposes. Each
// action is applied or dismissed by the SDR (POST /api/post-call/proposals/[id]);
// those the organisation automated show as already done. Meetings and exclusions
// are only pointers: they are confirmed in their own forms.
// ============================================

import { useState } from "react";
import { Check, CircleHelp, Quote, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FollowUpProposal {
    id: string;
    kind: string;
    status: string;
    mode: string;
    title: string;
    evidence: string[];
    confidence: number | null;
    holdReason: string | null;
    blocked: string | null;
    decidedBy: string | null;
    applicable: boolean;
}

export interface CallInsight {
    interest: "high" | "medium" | "low" | null;
    decisionMakerStatus: "confirmed" | "other_person" | null;
    statedRole: string | null;
    confidence: number | null;
    evidence: string[];
}

const INTEREST: Record<string, string> = { high: "Intérêt fort", medium: "Intérêt modéré", low: "Intérêt faible" };
const DM: Record<string, string> = { confirmed: "Décideur confirmé", other_person: "Un autre décideur" };

function confidenceLabel(c: number | null): { text: string; tone: string } {
    if (c === null) return { text: "Non vérifié", tone: "bg-surface-3 text-ink-3" };
    if (c >= 0.8) return { text: `Confiance ${Math.round(c * 100)} %`, tone: "bg-success-soft text-success-ink" };
    if (c >= 0.6) return { text: `Confiance ${Math.round(c * 100)} %`, tone: "bg-accent-50 text-accent-700" };
    return { text: `Confiance faible (${Math.round(c * 100)} %)`, tone: "bg-warning-soft text-warning-ink" };
}

export function CallFollowUps({ proposals, gaps, insight }: { proposals: FollowUpProposal[]; gaps: string[]; insight: CallInsight | null }) {
    const [state, setState] = useState<Record<string, "applying" | "APPLIED" | "DISMISSED" | { error: string }>>({});
    const [showQuotes, setShowQuotes] = useState(false);

    const known = insight
        ? [insight.interest && INTEREST[insight.interest], insight.decisionMakerStatus && DM[insight.decisionMakerStatus], insight.statedRole].filter((x): x is string => Boolean(x))
        : [];
    const visible = proposals.filter((p) => state[p.id] !== "DISMISSED");
    if (known.length === 0 && gaps.length === 0 && visible.length === 0) return null;

    async function decide(id: string, decision: "apply" | "dismiss") {
        setState((s) => ({ ...s, [id]: "applying" }));
        try {
            const res = await fetch(`/api/post-call/proposals/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) throw new Error(json?.error || "Action impossible");
            setState((s) => ({ ...s, [id]: decision === "apply" ? "APPLIED" : "DISMISSED" }));
        } catch (e) {
            setState((s) => ({ ...s, [id]: { error: e instanceof Error ? e.message : "Action impossible" } }));
        }
    }

    const conf = confidenceLabel(insight?.confidence ?? null);
    return (
        <div className="border-t border-line bg-surface-2/40 px-4 py-3 text-[12.5px]" onKeyDown={(e) => e.stopPropagation()}>
            {known.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
                    {known.map((k) => (
                        <span key={k} className="rounded-full bg-surface px-2 py-0.5 font-medium text-ink-2 ring-1 ring-line">{k}</span>
                    ))}
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold", conf.tone)}>{conf.text}</span>
                    {insight && insight.evidence.length > 0 && (
                        <button type="button" onClick={() => setShowQuotes((v) => !v)} className="ml-auto flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink">
                            <Quote className="h-3 w-3" /> {showQuotes ? "Masquer" : "Citations"}
                        </button>
                    )}
                </div>
            )}
            {showQuotes && insight && (
                <ul className="mt-2 space-y-1 border-l-2 border-accent-200 pl-2.5 text-[12px] italic text-ink-2">
                    {insight.evidence.map((q) => (
                        <li key={q}>« {q} »</li>
                    ))}
                </ul>
            )}

            {gaps.length > 0 && (
                <div className={cn("space-y-1", known.length > 0 && "mt-2.5")}>
                    {gaps.map((g) => (
                        <p key={g} className="flex items-start gap-1.5 text-ink-3">
                            <CircleHelp className="mt-[1px] h-3.5 w-3.5 shrink-0 text-warning" aria-hidden /> {g}
                        </p>
                    ))}
                </div>
            )}

            {visible.length > 0 && (
                <ul className={cn("space-y-1.5", (known.length > 0 || gaps.length > 0) && "mt-2.5")}>
                    {visible.map((p) => {
                        const st = state[p.id];
                        const done = p.status === "APPLIED" || st === "APPLIED";
                        const error = typeof st === "object" ? st.error : null;
                        return (
                            <li key={p.id} className="rounded-control bg-surface px-2.5 py-2 ring-1 ring-line">
                                <div className="flex items-center gap-2">
                                    <span className={cn("min-w-0 flex-1 truncate", done ? "text-ink-3" : "text-ink")} title={p.title}>{p.title}</span>
                                    {done ? (
                                        <span className="flex items-center gap-1 text-[11.5px] font-medium text-success-ink">
                                            <Check className="h-3.5 w-3.5" /> {p.decidedBy === "auto" ? "Fait automatiquement" : "Fait"}
                                        </span>
                                    ) : p.applicable ? (
                                        <>
                                            <button type="button" aria-label="Écarter" onClick={() => void decide(p.id, "dismiss")} disabled={st === "applying"} className="cp-press rounded-full p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                            <button type="button" onClick={() => void decide(p.id, "apply")} disabled={st === "applying"} className="cp-press h-7 rounded-full bg-primary px-3 text-[12px] font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60">
                                                {st === "applying" ? "…" : "Appliquer"}
                                            </button>
                                        </>
                                    ) : (
                                        <span className="text-[11.5px] text-ink-3">{p.blocked ? "Bloqué" : "Dans la fiche"}</span>
                                    )}
                                </div>
                                {!done && (p.blocked || p.holdReason) && <p className="mt-1 text-[11.5px] text-ink-3">{p.blocked ?? p.holdReason}</p>}
                                {error && <p className="mt-1 text-[11.5px] text-danger-ink">{error}</p>}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
