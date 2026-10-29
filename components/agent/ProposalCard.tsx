"use client";

/**
 * One action the agent proposes and a manager must approve. Same reading
 * order as the chat confirmation card (components/assistant-ui/ActionConfirmationCard):
 * title, details, warning, then the decision; plus the agent's rationale and
 * the expiry countdown, which only exist for background proposals.
 */

import { AlertTriangle, Check, Clock, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiMark } from "@/components/ui/AiMark";
import { SecretCard, type RevealedSecret } from "@/components/vault/SecretCard";
import type { AgentProposalItem, AgentProposalState } from "@/lib/assistant/api-contract";
import { expiryLabel } from "@/lib/agent/client/format";
import { MINI_BUTTON, MINI_DANGER, MINI_PRIMARY, Pill, stagger, useNow } from "./shared";

export interface ProposalResult {
    ok: boolean;
    state: AgentProposalState;
    error?: string;
    outcome?: string | null;
}

export function ProposalCard({
    proposal,
    context,
    busy,
    result,
    secret,
    onSecretExpire,
    selected,
    index = 0,
    onDecide,
    onFocusCard,
}: {
    proposal: AgentProposalItem;
    /** One line of provenance, e.g. « Acme · Veille clients ». */
    context?: string | null;
    busy?: "approve" | "reject" | null;
    result?: ProposalResult | null;
    secret?: RevealedSecret | null;
    onSecretExpire?: () => void;
    selected?: boolean;
    index?: number;
    onDecide: (decision: "approve" | "reject") => void;
    onFocusCard?: () => void;
}) {
    const now = useNow(30_000);
    const state: AgentProposalState = result?.state ?? proposal.state;
    const pending = state === "PENDING" && !(result && result.ok);
    const expiry = expiryLabel(proposal.expiresAt, now);
    const danger = proposal.card.danger;
    const outcome = result?.outcome ?? proposal.outcome;

    return (
        <article
            data-proposal-id={proposal.id}
            onFocus={onFocusCard}
            onClick={onFocusCard}
            aria-label={`Proposition : ${proposal.card.title}`}
            style={stagger(index)}
            className={cn(
                "relative rounded-panel border p-4 motion-safe:animate-ds-enter",
                "transition-[border-color,box-shadow,background-color,opacity] duration-200 ease-snappy",
                pending
                    ? danger
                        ? "border-warning-line bg-warning-soft/50"
                        : "border-line bg-surface shadow-2xs hover:border-line-strong"
                    : state === "FAILED" || (result && !result.ok)
                      ? "border-danger-line bg-danger-soft/50"
                      : state === "EXECUTED" || state === "APPROVED"
                        ? "border-success-line bg-success-soft/40"
                        : "border-line bg-surface-2 opacity-80",
                selected && "ring-2 ring-focus ring-offset-2 ring-offset-surface",
            )}
        >
            <header className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-accent-200 bg-accent-50 text-accent-700">
                    <AiMark className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className="text-sm font-bold leading-snug text-ink">{proposal.card.title}</h3>
                        {proposal.risk === "safe_write" ? (
                            <Pill tone="neutral">Écriture sûre</Pill>
                        ) : danger ? (
                            <Pill tone="danger">Action sensible</Pill>
                        ) : null}
                    </div>
                    {context && <p className="mt-0.5 truncate text-[11px] font-medium text-ink-3">{context}</p>}
                </div>
                {pending && (
                    <span
                        className={cn(
                            "inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold tabular-nums",
                            expiry.urgent ? "text-danger" : "text-ink-3",
                        )}
                        title={new Date(proposal.expiresAt).toLocaleString("fr-FR")}
                    >
                        <Clock className="size-3.5" aria-hidden />
                        {expiry.label}
                    </span>
                )}
            </header>

            {proposal.rationale && (
                <p className="mt-3 flex gap-2 text-xs leading-relaxed text-ink-2">
                    <span className="mt-[3px] text-accent-600" aria-hidden>
                        <AiMark className="size-3.5" />
                    </span>
                    <span>
                        <span className="font-semibold text-ink">Pourquoi : </span>
                        {proposal.rationale}
                    </span>
                </p>
            )}

            {proposal.card.details.length > 0 && (
                <dl className="mt-3 divide-y divide-line-subtle rounded-[12px] border border-line bg-surface px-3 py-1">
                    {proposal.card.details.map((d, i) => (
                        <div key={`${d.label}-${i}`} className="flex items-start justify-between gap-4 py-1.5 text-xs">
                            <dt className="shrink-0 font-medium text-ink-3">{d.label}</dt>
                            <dd className="min-w-0 break-words text-right font-semibold text-ink">{d.value}</dd>
                        </div>
                    ))}
                </dl>
            )}

            {proposal.card.warning && pending && (
                <div className="mt-2.5 flex items-start gap-2 rounded-[10px] border border-warning-line bg-warning-soft px-3 py-2 text-[11.5px] text-warning-ink">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>{proposal.card.warning}</span>
                </div>
            )}

            {pending ? (
                <footer className="mt-3.5 flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle pt-3">
                    <button type="button" className={MINI_BUTTON} disabled={!!busy || expiry.expired} onClick={() => onDecide("reject")}>
                        {busy === "reject" ? <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                        Refuser
                    </button>
                    <button
                        type="button"
                        className={danger ? MINI_DANGER : MINI_PRIMARY}
                        disabled={!!busy || expiry.expired}
                        onClick={() => onDecide("approve")}
                    >
                        {busy === "approve" ? <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                        {busy === "approve" ? "Exécution…" : proposal.card.confirmLabel || "Approuver"}
                    </button>
                </footer>
            ) : (
                <SettledLine state={state} result={result ?? null} outcome={outcome} decidedBy={proposal.decidedByName} />
            )}

            {secret && onSecretExpire && <SecretCard secret={secret} onExpire={onSecretExpire} />}
        </article>
    );
}

function SettledLine({ state, result, outcome, decidedBy }: { state: AgentProposalState; result: ProposalResult | null; outcome: string | null; decidedBy: string | null }) {
    if (result && !result.ok) {
        return (
            <p role="alert" className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-danger animate-ds-pop">
                <AlertTriangle className="size-4" aria-hidden />
                {result.error ?? "La décision n’a pas pu être enregistrée."}
            </p>
        );
    }
    const by = decidedBy ? ` par ${decidedBy}` : "";
    const lines: Record<AgentProposalState, { cls: string; text: string; icon: typeof Check }> = {
        PENDING: { cls: "text-ink-3", text: "En attente", icon: Clock },
        EXECUTING: { cls: "text-accent-700", text: "Exécution en cours…", icon: Loader2 },
        APPROVED: { cls: "text-success-ink", text: outcome ?? `Approuvée${by}`, icon: Check },
        EXECUTED: { cls: "text-success-ink", text: outcome ?? `Exécutée${by}`, icon: Check },
        REJECTED: { cls: "text-ink-3", text: `Refusée${by}`, icon: X },
        EXPIRED: { cls: "text-ink-3", text: "Expirée sans décision", icon: Clock },
        FAILED: { cls: "text-danger", text: outcome ?? "L’exécution a échoué", icon: AlertTriangle },
    };
    const { cls, text, icon: Icon } = lines[state];
    return (
        <p className={cn("mt-3 flex items-center gap-1.5 text-xs font-semibold animate-ds-pop", cls)} role="status">
            <Icon className={cn("size-4", state === "EXECUTING" && "motion-safe:animate-spin")} aria-hidden />
            {text}
        </p>
    );
}
