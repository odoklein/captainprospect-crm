"use client";

/**
 * One action the agent proposes and a manager must approve. Same reading
 * order as the chat confirmation card: title, details, warning, decision;
 * plus the agent's rationale and the expiry countdown, which only exist for
 * background proposals. Sensitive cards (card.danger) wear the danger
 * styling and their approval is confirmed in an AlertDialog (ProposalBatch).
 */

import { AlertTriangle, Check, Clock, Loader2, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiMark } from "@/components/ui/AiMark";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { SecretCard, type RevealedSecret } from "@/components/vault/SecretCard";
import type { AgentProposalItem, AgentProposalState } from "@/lib/assistant/api-contract";
import { expiryLabel } from "@/lib/agent/client/format";
import { stagger, useNow } from "./shared";

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
    onApprove,
    onReject,
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
    onApprove: () => void;
    onReject: () => void;
    onFocusCard?: () => void;
}) {
    const now = useNow(15_000);
    const state: AgentProposalState = result?.state ?? proposal.state;
    const pending = state === "PENDING" && !(result && result.ok);
    const expiry = expiryLabel(proposal.expiresAt, now);
    const danger = proposal.card.danger;
    const outcome = result?.outcome ?? proposal.outcome;
    const failed = state === "FAILED" || (result && !result.ok);
    const done = state === "EXECUTED" || state === "APPROVED";

    return (
        <Card
            data-proposal-id={proposal.id}
            onFocus={onFocusCard}
            onClick={onFocusCard}
            aria-label={`Proposition : ${proposal.card.title}`}
            aria-current={selected ? "true" : undefined}
            style={stagger(index)}
            className={cn(
                "relative gap-0 overflow-hidden rounded-panel py-0 shadow-2xs motion-safe:animate-ds-enter",
                "transition-[border-color,box-shadow,background-color,opacity] duration-200 ease-snappy",
                pending
                    ? danger
                        ? "border-danger-line hover:shadow-card"
                        : "hover:border-line-strong hover:shadow-card"
                    : failed
                      ? "border-danger-line bg-danger-soft/40"
                      : done
                        ? "border-success-line bg-success-soft/30"
                        : "bg-surface-2 opacity-80",
                selected && "ring-2 ring-focus ring-offset-2 ring-offset-canvas",
            )}
        >
            {pending && danger && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-danger" />}
            <div className="p-4">
                <header className="flex items-start gap-3">
                    <span
                        className={cn(
                            "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border",
                            pending && danger ? "border-danger-line bg-danger-soft text-danger-ink" : "border-accent-200 bg-accent-soft text-accent-soft-ink",
                        )}
                    >
                        {pending && danger ? <ShieldAlert className="size-4" aria-hidden /> : <AiMark className="size-4" aria-hidden />}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <h3 className="text-sm font-semibold leading-snug text-ink">{proposal.card.title}</h3>
                            {proposal.risk === "safe_write" ? (
                                <Badge variant="secondary">Écriture sûre</Badge>
                            ) : danger ? (
                                <Badge variant="danger">Action sensible</Badge>
                            ) : null}
                        </div>
                        {context && <p className="mt-0.5 truncate text-2xs font-medium text-ink-3">{context}</p>}
                    </div>
                    {pending && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Badge
                                    variant={expiry.expired || expiry.urgent ? "danger" : "secondary"}
                                    className="gap-1 tabular-nums"
                                    tabIndex={0}
                                >
                                    <Clock aria-hidden />
                                    {expiry.label}
                                </Badge>
                            </TooltipTrigger>
                            <TooltipContent>Expire le {new Date(proposal.expiresAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</TooltipContent>
                        </Tooltip>
                    )}
                </header>

                {proposal.rationale && (
                    <p className="mt-3 flex gap-2 rounded-[12px] bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-2">
                        <AiMark className="mt-[2px] size-3.5 shrink-0 text-accent" aria-hidden />
                        <span>
                            <span className="font-semibold text-ink">Pourquoi : </span>
                            {proposal.rationale}
                        </span>
                    </p>
                )}

                {proposal.card.details.length > 0 && (
                    <dl className="mt-3 divide-y divide-line-subtle rounded-[12px] border border-line-subtle px-3 py-0.5">
                        {proposal.card.details.map((d, i) => (
                            <div key={`${d.label}-${i}`} className="flex items-start justify-between gap-4 py-1.5 text-xs">
                                <dt className="shrink-0 font-medium text-ink-3">{d.label}</dt>
                                <dd className="min-w-0 break-words text-right font-semibold text-ink">{d.value}</dd>
                            </div>
                        ))}
                    </dl>
                )}

                {proposal.card.warning && pending && (
                    <div className="mt-2.5 flex items-start gap-2 rounded-[10px] border border-warning-line bg-warning-soft px-3 py-2 text-2xs leading-relaxed text-warning-ink">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>{proposal.card.warning}</span>
                    </div>
                )}

                {!pending && <SettledLine state={state} result={result ?? null} outcome={outcome} decidedBy={proposal.decidedByName} />}

                {secret && onSecretExpire && <SecretCard secret={secret} onExpire={onSecretExpire} />}
            </div>

            {pending && (
                <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle bg-surface-2/50 px-4 py-2.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!!busy || expiry.expired}
                        onClick={(e) => {
                            e.stopPropagation();
                            onReject();
                        }}
                    >
                        {busy === "reject" ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <X aria-hidden />}
                        Refuser
                    </Button>
                    <Button
                        type="button"
                        variant={danger ? "destructive" : "default"}
                        size="sm"
                        disabled={!!busy || expiry.expired}
                        onClick={(e) => {
                            e.stopPropagation();
                            onApprove();
                        }}
                    >
                        {busy === "approve" ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <Check aria-hidden />}
                        {busy === "approve" ? "Exécution…" : proposal.card.confirmLabel || "Approuver"}
                    </Button>
                </footer>
            )}
        </Card>
    );
}

function SettledLine({ state, result, outcome, decidedBy }: { state: AgentProposalState; result: ProposalResult | null; outcome: string | null; decidedBy: string | null }) {
    if (result && !result.ok) {
        return (
            <p role="alert" className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-danger-ink motion-safe:animate-ds-pop">
                <AlertTriangle className="size-4" aria-hidden />
                {result.error ?? "La décision n’a pas pu être enregistrée."}
            </p>
        );
    }
    const by = decidedBy ? ` par ${decidedBy}` : "";
    const lines: Record<AgentProposalState, { cls: string; text: string; icon: typeof Check }> = {
        PENDING: { cls: "text-ink-3", text: "En attente", icon: Clock },
        EXECUTING: { cls: "text-accent-soft-ink", text: "Exécution en cours…", icon: Loader2 },
        APPROVED: { cls: "text-success-ink", text: outcome ?? `Approuvée${by}`, icon: Check },
        EXECUTED: { cls: "text-success-ink", text: outcome ?? `Exécutée${by}`, icon: Check },
        REJECTED: { cls: "text-ink-3", text: `Refusée${by}`, icon: X },
        EXPIRED: { cls: "text-ink-3", text: "Expirée sans décision", icon: Clock },
        FAILED: { cls: "text-danger-ink", text: outcome ?? "L’exécution a échoué", icon: AlertTriangle },
    };
    const { cls, text, icon: Icon } = lines[state];
    return (
        <p className={cn("mt-3 flex items-center gap-1.5 text-xs font-semibold motion-safe:animate-ds-pop", cls)} role="status">
            <Icon className={cn("size-4", state === "EXECUTING" && "motion-safe:animate-spin")} aria-hidden />
            {text}
        </p>
    );
}
