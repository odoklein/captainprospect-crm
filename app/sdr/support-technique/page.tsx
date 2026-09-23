"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Plus, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input, Select, EmptyState, LoadingState, useToast } from "@/components/ui";
import { TICKET_CATEGORY_LABELS, formatTicketRef } from "@/lib/tickets/constants";
import { TicketStatusBadge } from "@/components/tickets/TicketBadges";
import type { TicketCategory, TicketStatus, TicketValidation } from "@prisma/client";

interface RequestItem {
    id: string;
    number: number;
    title: string;
    category: TicketCategory;
    validation: TicketValidation;
    rejectionReason: string | null;
    createdAt: string;
    status: TicketStatus;
    assignee: { name: string } | null;
}

const CATEGORY_OPTIONS = Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));

const VALIDATION_LABELS: Record<TicketValidation, { label: string; className: string }> = {
    PENDING: { label: "En attente de validation", className: "bg-amber-100 text-amber-800" },
    ACCEPTED: { label: "Acceptée", className: "bg-emerald-100 text-emerald-800" },
    REJECTED: { label: "Refusée", className: "bg-red-100 text-red-700" },
    NOT_REQUIRED: { label: "Ticket interne", className: "bg-slate-100 text-slate-600" },
};

/**
 * Support Technique, sales-team side: file a request and follow it. The board
 * itself stays out of reach — a requester only ever sees what they sent.
 */
export default function SupportTechniquePage() {
    const toast = useToast();

    const [requests, setRequests] = useState<RequestItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState<string>("BUG");

    const fetchRequests = useCallback(async () => {
        try {
            const response = await fetch("/api/tickets/requests");
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || "Chargement impossible");
            setRequests(result.data);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Erreur serveur");
        } finally {
            setIsLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const submit = async () => {
        if (title.trim().length < 3) {
            toast.error("Titre trop court");
            return;
        }
        if (description.trim().length < 10) {
            toast.error("Décrivez le problème en quelques mots");
            return;
        }

        setIsSaving(true);
        try {
            const response = await fetch("/api/tickets/requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim(),
                    category,
                }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || "Envoi impossible");

            toast.success("Demande envoyée — un manager va la valider");
            setTitle("");
            setDescription("");
            setCategory("BUG");
            setIsFormOpen(false);
            await fetchRequests();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Erreur serveur");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Support technique</h1>
                    <p className="text-sm text-slate-500">
                        Signalez un bug ou demandez une amélioration. Un manager valide la demande avant
                        qu&apos;elle parte en développement.
                    </p>
                </div>
                <Button onClick={() => setIsFormOpen((open) => !open)}>
                    <Plus className="h-4 w-4" /> Nouvelle demande
                </Button>
            </div>

            {isFormOpen && (
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <Input
                        label="Titre"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="Ex : Le filtre de la liste ne conserve pas la sélection"
                    />
                    <Select label="Catégorie" options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
                        <textarea
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            rows={5}
                            placeholder="Ce que vous faisiez, ce qui s'est passé, ce que vous attendiez…"
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setIsFormOpen(false)} disabled={isSaving}>
                            Annuler
                        </Button>
                        <Button onClick={submit} isLoading={isSaving}>
                            <Send className="h-4 w-4" /> Envoyer
                        </Button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <LoadingState message="Chargement de vos demandes..." />
            ) : requests.length === 0 ? (
                <EmptyState
                    icon={LifeBuoy}
                    title="Aucune demande"
                    description="Vos demandes de support technique apparaîtront ici."
                />
            ) : (
                <div className="space-y-2">
                    {requests.map((req) => {
                        const badge = VALIDATION_LABELS[req.validation];
                        return (
                            <div key={req.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-xs text-slate-400">
                                        {formatTicketRef(req.number)}
                                    </span>
                                    <span className="text-sm font-semibold text-slate-900">{req.title}</span>
                                    <span
                                        className={cn(
                                            "ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                            badge.className,
                                        )}
                                    >
                                        {badge.label}
                                    </span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    <span>
                                        {TICKET_CATEGORY_LABELS[req.category]} ·{" "}
                                        {new Date(req.createdAt).toLocaleDateString("fr-FR")}
                                    </span>
                                    {/* Once accepted, the request is real work: show where it
                                        stands so the requester doesn't have to ask. */}
                                    {req.validation === "ACCEPTED" && (
                                        <>
                                            <TicketStatusBadge status={req.status} />
                                            <span>
                                                {req.assignee?.name ? `Pris en charge par ${req.assignee.name}` : "En attente d'attribution"}
                                            </span>
                                        </>
                                    )}
                                </div>
                                {req.validation === "REJECTED" && req.rejectionReason && (
                                    <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                                        Motif du refus : {req.rejectionReason}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
