"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Inbox, X } from "lucide-react";
import { Button, Callout, EmptyState, Modal, ModalFooter, Select, Textarea, useToast } from "@/components/ui";
import { DUPLICATE_REASON_LABELS } from "@/lib/prospect-submissions/matching";
import { PROSPECT_SOURCE_LABELS } from "@/lib/prospect-submissions/types";
import type { ReviewItem } from "@/lib/prospect-submissions/review";

export const PENDING_SUBMISSIONS_QUERY_KEY = ["prospect-submissions", "pending"] as const;

function ago(iso: string): string {
    const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
    if (hours < 1) return "à l'instant";
    if (hours < 24) return `il y a ${hours} h`;
    const days = Math.round(hours / 24);
    return `il y a ${days} j`;
}

/** Pending SDR additions, with the manager's approve / reject. Mission-scoped when missionId is set. */
export function PendingProspectSubmissionsPanel({ missionId, showMission = false }: { missionId?: string; showMission?: boolean }) {
    const queryClient = useQueryClient();
    const { success, error: showError } = useToast();
    const [listChoice, setListChoice] = useState<Record<string, string>>({});
    const [busyId, setBusyId] = useState<string | null>(null);
    const [rejecting, setRejecting] = useState<ReviewItem | null>(null);
    const [reason, setReason] = useState("");

    const { data: items = [], isLoading, isError, refetch } = useQuery<ReviewItem[]>({
        queryKey: [...PENDING_SUBMISSIONS_QUERY_KEY, missionId ?? "all"],
        queryFn: async () => {
            const url = missionId
                ? `/api/missions/${missionId}/prospect-submissions`
                : "/api/manager/prospect-submissions";
            const res = await fetch(url);
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Chargement impossible");
            return json.data;
        },
        staleTime: 15_000,
    });

    async function decide(item: ReviewItem, body: Record<string, unknown>) {
        setBusyId(item.id);
        try {
            const res = await fetch(`/api/missions/${item.missionId}/prospect-submissions/${item.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!json.success) {
                showError("Action impossible", json.error);
            } else if (body.decision === "APPROVE") {
                success("Société validée", `${item.company.name} est dans la file des SDR.`);
            } else {
                success("Proposition refusée", `${item.sdrName} a été prévenu(e).`);
            }
        } catch {
            showError("Action impossible", "Vérifiez votre connexion et réessayez.");
        } finally {
            setBusyId(null);
            queryClient.invalidateQueries({ queryKey: PENDING_SUBMISSIONS_QUERY_KEY });
        }
    }

    if (isLoading) return <p className="text-sm text-ink-3">Chargement des propositions…</p>;
    if (isError) {
        return (
            <Callout tone="danger" title="Impossible de charger les propositions" action={<Button size="sm" variant="secondary" onClick={() => refetch()}>Réessayer</Button>} />
        );
    }
    if (items.length === 0) {
        return <EmptyState icon={Inbox} variant="inline" title="Aucune proposition en attente" description="Les sociétés ajoutées par les SDR en mode « Avec validation » apparaîtront ici." />;
    }

    return (
        <div className="space-y-3">
            {items.map((item) => {
                const person = [item.contact?.civility, item.contact?.firstName, item.contact?.lastName].filter(Boolean).join(" ");
                const blocked = !!item.check.blacklistHit || item.check.duplicates.length > 0;
                const listId = listChoice[item.id] ?? item.listId;
                return (
                    <article key={item.id} className="rounded-xl border border-line bg-surface p-4 shadow-2xs">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                                <p className="text-sm font-semibold text-ink">
                                    {item.existingCompanyId ? `${person} — ${item.company.name}` : item.company.name}
                                </p>
                                <p className="text-xs text-ink-3">
                                    {[item.company.phone, item.company.website, item.company.city].filter(Boolean).join(" · ") || "Pas de coordonnées société"}
                                </p>
                                {person && !item.existingCompanyId && (
                                    <p className="text-xs text-ink-2">
                                        {person}
                                        {item.contact?.title ? `, ${item.contact.title}` : ""}
                                        {" · "}
                                        {[item.contact?.phone, item.contact?.email].filter(Boolean).join(" · ")}
                                    </p>
                                )}
                                <p className="text-xs text-ink-3">
                                    Proposée par {item.sdrName} {ago(item.createdAt)}
                                    {showMission ? ` · ${item.clientName} — ${item.missionName}` : ""}
                                    {" · "}
                                    {item.source === "REFERRAL" && item.referrer
                                        ? `Recommandée par ${item.referrer.label}`
                                        : PROSPECT_SOURCE_LABELS[item.source]}
                                </p>
                                {item.note && <p className="text-xs italic text-ink-2">« {item.note} »</p>}
                            </div>
                            <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                                <div className="min-w-[180px]">
                                    <Select
                                        options={item.lists.map((l) => ({ value: l.id, label: l.name }))}
                                        value={listId}
                                        onChange={(value) => setListChoice((c) => ({ ...c, [item.id]: value }))}
                                    />
                                </div>
                                <Button
                                    size="sm"
                                    variant="primary"
                                    leftIcon={<Check className="h-4 w-4" aria-hidden />}
                                    disabled={blocked}
                                    isLoading={busyId === item.id}
                                    onClick={() => decide(item, { decision: "APPROVE", listId })}
                                >
                                    Valider et ajouter
                                </Button>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    leftIcon={<X className="h-4 w-4" aria-hidden />}
                                    disabled={busyId === item.id}
                                    onClick={() => {
                                        setReason(blocked ? "Déjà présente dans la base" : "");
                                        setRejecting(item);
                                    }}
                                >
                                    Refuser
                                </Button>
                            </div>
                        </div>
                        {item.check.blacklistHit && (
                            <Callout tone="danger" className="mt-3">
                                Ce prospect est sur la BlackList de ce client : refusez la proposition.
                            </Callout>
                        )}
                        {!item.check.blacklistHit && item.check.duplicates.length > 0 && (
                            <Callout tone="warning" className="mt-3" title="Déjà dans la base de la mission">
                                {item.check.duplicates
                                    .slice(0, 3)
                                    .map((d) => `${d.label}${d.listName ? ` (${d.listName})` : ""} — ${DUPLICATE_REASON_LABELS[d.reason]}`)
                                    .join(" · ")}
                            </Callout>
                        )}
                    </article>
                );
            })}

            <Modal
                isOpen={!!rejecting}
                onClose={() => setRejecting(null)}
                size="sm"
                title="Refuser la proposition"
                description={rejecting ? `${rejecting.company.name}, proposée par ${rejecting.sdrName}` : undefined}
            >
                <Textarea
                    label="Motif (envoyé au SDR)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Ex. : hors cible, déjà client, coordonnées incomplètes"
                />
                <ModalFooter>
                    <Button variant="ghost" onClick={() => setRejecting(null)}>
                        Annuler
                    </Button>
                    <Button
                        variant="danger"
                        disabled={reason.trim().length < 3}
                        isLoading={!!rejecting && busyId === rejecting.id}
                        onClick={async () => {
                            if (!rejecting) return;
                            await decide(rejecting, { decision: "REJECT", reason: reason.trim() });
                            setRejecting(null);
                        }}
                    >
                        Refuser
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
}
