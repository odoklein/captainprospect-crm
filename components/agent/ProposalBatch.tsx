"use client";

/**
 * The pending proposals as a batch: one card each, « Tout approuver » on top
 * (always confirmed in an AlertDialog), sensitive cards confirmed one by one,
 * per-item results inline, a revealed secret shown once under its card.
 *
 * Decided cards stay in place with their outcome until the list unmounts, so
 * the result is read where the decision was made.
 */

import { useCallback, useMemo, useState } from "react";
import { CheckCheck, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { useToast } from "@/components/ui/Toast";
import type { RevealedSecret } from "@/components/vault/SecretCard";
import type { AgentProposalItem } from "@/lib/assistant/api-contract";
import { KIND_LABEL } from "@/lib/agent/client/format";
import { decideBatch, decideProposal, type PendingProposal } from "@/lib/agent/client/hooks";
import { ProposalCard, type ProposalResult } from "./ProposalCard";
import { useNow } from "./shared";

export type BatchItem = AgentProposalItem & { run?: PendingProposal["run"] };

export interface ProposalController {
    busy: Record<string, "approve" | "reject">;
    results: Record<string, ProposalResult>;
    secrets: Record<string, RevealedSecret>;
    batchBusy: boolean;
    decide: (proposal: BatchItem, decision: "approve" | "reject") => Promise<void>;
    decideAll: (proposals: BatchItem[], decision: "approve" | "reject") => Promise<void>;
    /** Approve, through the confirmation dialog when the card is sensitive. */
    requestApprove: (proposal: BatchItem) => void;
    /** The sensitive card waiting for confirmation. */
    confirming: BatchItem | null;
    setConfirming: (proposal: BatchItem | null) => void;
    clearSecret: (id: string) => void;
    /** Items decided here, kept on screen after they leave the pending list. */
    retained: Record<string, BatchItem>;
}

export function useProposalController(): ProposalController {
    const toast = useToast();
    const [busy, setBusy] = useState<Record<string, "approve" | "reject">>({});
    const [results, setResults] = useState<Record<string, ProposalResult>>({});
    const [secrets, setSecrets] = useState<Record<string, RevealedSecret>>({});
    const [retained, setRetained] = useState<Record<string, BatchItem>>({});
    const [batchBusy, setBatchBusy] = useState(false);
    const [confirming, setConfirming] = useState<BatchItem | null>(null);

    const decide = useCallback(
        async (proposal: BatchItem, decision: "approve" | "reject") => {
            setBusy((b) => ({ ...b, [proposal.id]: decision }));
            setRetained((r) => ({ ...r, [proposal.id]: proposal }));
            try {
                const res = await decideProposal(proposal.id, decision);
                setResults((r) => ({ ...r, [proposal.id]: { ok: true, state: res.proposal.state, outcome: res.proposal.outcome } }));
                setRetained((r) => ({ ...r, [proposal.id]: { ...proposal, ...res.proposal } }));
                if (res.secret) setSecrets((s) => ({ ...s, [proposal.id]: res.secret as RevealedSecret }));
                if (decision === "approve") {
                    if (res.proposal.state === "FAILED") toast.error("L’action a échoué", res.proposal.outcome ?? undefined);
                    else toast.success("Proposition approuvée", res.proposal.outcome ?? proposal.card.title);
                } else {
                    toast.info("Proposition refusée", proposal.card.title);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : "Décision impossible.";
                setResults((r) => ({ ...r, [proposal.id]: { ok: false, state: proposal.state, error: message } }));
                toast.error("Décision non enregistrée", message);
            } finally {
                setBusy((b) => {
                    const next = { ...b };
                    delete next[proposal.id];
                    return next;
                });
            }
        },
        [toast],
    );

    const decideAll = useCallback(
        async (proposals: BatchItem[], decision: "approve" | "reject") => {
            if (proposals.length === 0) return;
            setBatchBusy(true);
            setBusy((b) => Object.fromEntries([...Object.entries(b), ...proposals.map((p) => [p.id, decision] as const)]));
            setRetained((r) => ({ ...r, ...Object.fromEntries(proposals.map((p) => [p.id, p])) }));
            try {
                const res = await decideBatch(
                    proposals.map((p) => p.id),
                    decision,
                );
                const next: Record<string, ProposalResult> = {};
                for (const item of res.results) next[item.id] = { ok: item.ok, state: item.state, error: item.error };
                setResults((r) => ({ ...r, ...next }));
                const okCount = res.results.filter((r) => r.ok).length;
                const failed = res.results.length - okCount;
                if (failed === 0) toast.success(decision === "approve" ? `${okCount} proposition(s) approuvée(s)` : `${okCount} proposition(s) refusée(s)`);
                else toast.warning(`${okCount} sur ${res.results.length} traitée(s)`, `${failed} n’a pas pu l’être : le détail est sur chaque carte.`);
            } catch (error) {
                const message = error instanceof Error ? error.message : "Décision impossible.";
                toast.error("Lot non traité", message);
            } finally {
                setBatchBusy(false);
                setBusy((b) => {
                    const next = { ...b };
                    for (const p of proposals) delete next[p.id];
                    return next;
                });
            }
        },
        [toast],
    );

    const requestApprove = useCallback(
        (proposal: BatchItem) => {
            if (proposal.card.danger) setConfirming(proposal);
            else void decide(proposal, "approve");
        },
        [decide],
    );

    const clearSecret = useCallback((id: string) => {
        setSecrets((s) => {
            const next = { ...s };
            delete next[id];
            return next;
        });
    }, []);

    return { busy, results, secrets, batchBusy, decide, decideAll, requestApprove, confirming, setConfirming, clearSecret, retained };
}

export function proposalContext(p: BatchItem): string | null {
    if (!p.run) return null;
    const what = p.run.jobName ?? (p.run.goal ? p.run.goal.slice(0, 80) : KIND_LABEL[p.run.kind]);
    return [p.run.clientName ?? "Vue agence", what].filter(Boolean).join(" · ");
}

/** Pending list ∪ cards decided here, in expiry order so nothing jumps. */
export function useVisibleProposals(proposals: BatchItem[], controller: ProposalController): BatchItem[] {
    return useMemo(() => {
        const byId = new Map<string, BatchItem>();
        for (const p of proposals) byId.set(p.id, p);
        for (const [id, p] of Object.entries(controller.retained)) {
            if (!byId.has(id)) byId.set(id, p);
            else if (controller.results[id]) byId.set(id, { ...byId.get(id)!, ...p });
        }
        return [...byId.values()].sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());
    }, [proposals, controller.retained, controller.results]);
}

export function ProposalBatch({
    proposals,
    controller: external,
    selectedId,
    onSelect,
    showContext = true,
    className,
}: {
    proposals: BatchItem[];
    controller?: ProposalController;
    selectedId?: string | null;
    onSelect?: (id: string) => void;
    showContext?: boolean;
    className?: string;
}) {
    const internal = useProposalController();
    const controller = external ?? internal;
    const visible = useVisibleProposals(proposals, controller);
    const [confirmingAll, setConfirmingAll] = useState(false);
    const now = useNow(30_000);

    const stillPending = visible.filter(
        (p) => p.state === "PENDING" && !controller.results[p.id]?.ok && new Date(p.expiresAt).getTime() > now.getTime(),
    );
    const dangerCount = stillPending.filter((p) => p.card.danger).length;
    const confirming = controller.confirming;

    if (visible.length === 0) return null;

    return (
        <div className={cn("space-y-2.5", className)}>
            {stillPending.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-panel border border-line bg-surface-2 py-1.5 pr-1.5 pl-3.5 motion-safe:animate-ds-enter">
                    <p className="text-xs font-medium text-ink-2">
                        <span className="font-semibold text-ink tabular-nums">{stillPending.length}</span> propositions attendent ta décision
                        {dangerCount > 0 && <span className="text-danger-ink"> · dont {dangerCount} sensible{dangerCount > 1 ? "s" : ""}</span>}
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmingAll(true)} disabled={controller.batchBusy}>
                        {controller.batchBusy ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : <CheckCheck aria-hidden />}
                        Tout approuver
                    </Button>
                </div>
            )}
            {visible.map((p, i) => (
                <ProposalCard
                    key={p.id}
                    proposal={p}
                    index={i}
                    context={showContext ? proposalContext(p) : null}
                    busy={controller.busy[p.id] ?? null}
                    result={controller.results[p.id] ?? null}
                    secret={controller.secrets[p.id] ?? null}
                    onSecretExpire={() => controller.clearSecret(p.id)}
                    selected={selectedId === p.id}
                    onFocusCard={onSelect ? () => onSelect(p.id) : undefined}
                    onApprove={() => controller.requestApprove(p)}
                    onReject={() => void controller.decide(p, "reject")}
                />
            ))}

            <AlertDialog open={confirmingAll} onOpenChange={setConfirmingAll}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Tout approuver ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {stillPending.length} action{stillPending.length > 1 ? "s vont être exécutées" : " va être exécutée"}
                            {dangerCount > 0 ? `, dont ${dangerCount} sensible${dangerCount > 1 ? "s" : ""}. Relis les cartes signalées avant de confirmer.` : "."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <ul className="max-h-48 space-y-1 overflow-y-auto rounded-[12px] border border-line-subtle bg-surface-2 p-2 text-xs">
                        {stillPending.map((p) => (
                            <li key={p.id} className="flex items-center gap-2 px-1 py-0.5">
                                {p.card.danger ? <ShieldAlert className="size-3.5 shrink-0 text-danger" aria-label="Sensible" /> : <CheckCheck className="size-3.5 shrink-0 text-ink-4" aria-hidden />}
                                <span className={cn("truncate", p.card.danger ? "font-semibold text-ink" : "text-ink-2")}>{p.card.title}</span>
                            </li>
                        ))}
                    </ul>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            className={dangerCount > 0 ? buttonVariants({ variant: "destructive" }) : undefined}
                            onClick={() => void controller.decideAll(stillPending, "approve")}
                        >
                            Tout approuver
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && controller.setConfirming(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Approuver cette action sensible ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirming?.card.title}
                            {confirming?.card.warning ? ` — ${confirming.card.warning}` : ""}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            className={buttonVariants({ variant: "destructive" })}
                            onClick={() => {
                                if (confirming) void controller.decide(confirming, "approve");
                                controller.setConfirming(null);
                            }}
                        >
                            {confirming?.card.confirmLabel || "Approuver"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
