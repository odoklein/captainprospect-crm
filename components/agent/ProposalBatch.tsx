"use client";

/**
 * The pending proposals as a batch: one card each, « Tout approuver » on top
 * (confirmed in a modal as soon as one card is sensitive), per-item results
 * shown inline, a revealed secret shown once under its card.
 *
 * Decided cards stay in place with their outcome until the list unmounts,
 * so the result is read where the decision was made.
 */

import { useCallback, useMemo, useState } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { RevealedSecret } from "@/components/vault/SecretCard";
import type { AgentProposalItem } from "@/lib/assistant/api-contract";
import { KIND_LABEL } from "@/lib/agent/client/format";
import { decideBatch, decideProposal, type PendingProposal } from "@/lib/agent/client/hooks";
import { ProposalCard, type ProposalResult } from "./ProposalCard";
import { MINI_BUTTON, useNow } from "./shared";

type BatchItem = AgentProposalItem & { run?: PendingProposal["run"] };

export interface ProposalController {
    busy: Record<string, "approve" | "reject">;
    results: Record<string, ProposalResult>;
    secrets: Record<string, RevealedSecret>;
    batchBusy: boolean;
    decide: (proposal: BatchItem, decision: "approve" | "reject") => Promise<void>;
    decideAll: (proposals: BatchItem[], decision: "approve" | "reject") => Promise<void>;
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

    const clearSecret = useCallback((id: string) => {
        setSecrets((s) => {
            const next = { ...s };
            delete next[id];
            return next;
        });
    }, []);

    return { busy, results, secrets, batchBusy, decide, decideAll, clearSecret, retained };
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
    const [confirming, setConfirming] = useState(false);
    const now = useNow(30_000);

    const stillPending = visible.filter(
        (p) => p.state === "PENDING" && !controller.results[p.id]?.ok && new Date(p.expiresAt).getTime() > now.getTime(),
    );
    const anyDanger = stillPending.some((p) => p.card.danger);

    if (visible.length === 0) return null;

    const approveAll = () => {
        if (anyDanger) setConfirming(true);
        else void controller.decideAll(stillPending, "approve");
    };

    return (
        <div className={cn("space-y-3", className)}>
            {stillPending.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-panel border border-line bg-surface-2 px-3 py-2">
                    <p className="text-xs font-semibold text-ink-2">
                        {stillPending.length} propositions attendent ta décision
                        {anyDanger && <span className="text-warning-ink"> · dont des actions sensibles</span>}
                    </p>
                    <button type="button" className={MINI_BUTTON} onClick={approveAll} disabled={controller.batchBusy}>
                        {controller.batchBusy ? <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden /> : <CheckCheck className="size-3.5" aria-hidden />}
                        Tout approuver
                    </button>
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
                    onDecide={(decision) => void controller.decide(p, decision)}
                />
            ))}
            <ConfirmModal
                isOpen={confirming}
                onClose={() => setConfirming(false)}
                onConfirm={() => {
                    setConfirming(false);
                    void controller.decideAll(stillPending, "approve");
                }}
                variant="danger"
                title="Tout approuver ?"
                message={`${stillPending.length} actions vont être exécutées, dont ${stillPending.filter((p) => p.card.danger).length} sensible(s). Relis les cartes signalées avant de confirmer.`}
                confirmText="Tout approuver"
            />
        </div>
    );
}
