"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Pencil, Rocket, SlidersHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Drawer, LoadingState, ConfirmModal, useToast } from "@/components/ui";
import { TicketStatusBadge, TicketPriorityBadge, TicketCategoryBadge } from "./TicketBadges";
import { TicketThread } from "./TicketThread";
import { TicketSidePanel } from "./TicketSidePanel";
import { USER_ROLE_LABELS, formatTicketRef } from "@/lib/tickets/constants";
import type { TicketDetail } from "./types";

interface TicketDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: TicketDetail | null;
    isLoading: boolean;
    currentUserId: string;
    isManager: boolean;
    onRefresh: () => void | Promise<void>;
    onEdit: (ticket: TicketDetail) => void;
    onValidate: (ticket: TicketDetail) => void;
    /** Called after a delete so the parent can drop the row and close. */
    onDeleted: () => void;
}

type DrawerTab = "thread" | "details";

/**
 * The full ticket, opened over the table. The table answers "what is going on
 * across everything"; this answers "what do I do about this one" — so every
 * action a ticket has lives here rather than being scattered across the row.
 */
export function TicketDrawer({
    isOpen,
    onClose,
    ticket,
    isLoading,
    currentUserId,
    isManager,
    onRefresh,
    onEdit,
    onValidate,
    onDeleted,
}: TicketDrawerProps) {
    const toast = useToast();
    const [tab, setTab] = useState<DrawerTab>("thread");
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);

    useEffect(() => {
        if (isOpen) setTab("thread");
    }, [isOpen, ticket?.id]);

    const remove = async () => {
        if (!ticket) return;
        setIsDeleting(true);
        try {
            const response = await fetch(`/api/tickets/${ticket.id}`, { method: "DELETE" });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || "Suppression impossible");
            toast.success("Ticket supprimé");
            setIsDeleteOpen(false);
            onDeleted();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Erreur serveur");
        } finally {
            setIsDeleting(false);
        }
    };

    /** Roadmap publication is a client-visible act, so it never happens implicitly. */
    const togglePublish = async () => {
        if (!ticket) return;
        const next = !ticket.publishToRoadmap;
        setIsPublishing(true);
        try {
            const response = await fetch(`/api/tickets/${ticket.id}/publish`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    publishToRoadmap: next,
                    publicTitle: ticket.publicTitle || ticket.title,
                    publicDescription: ticket.publicDescription,
                }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || "Publication impossible");
            toast.success(next ? "Publié sur la roadmap client" : "Retiré de la roadmap");
            await onRefresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Erreur serveur");
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <>
            <Drawer
                isOpen={isOpen}
                onClose={onClose}
                size="xl"
                title={ticket ? `${formatTicketRef(ticket.number)} · ${ticket.title}` : "Ticket"}
            >
                {isLoading && !ticket ? (
                    <LoadingState />
                ) : !ticket ? (
                    <p className="p-6 text-sm text-slate-500">Ticket introuvable.</p>
                ) : (
                    <div className="flex h-full min-h-0 flex-col">
                        {/* Status line + every action the ticket has */}
                        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
                            <TicketStatusBadge status={ticket.status} />
                            <TicketPriorityBadge priority={ticket.priority} />
                            <TicketCategoryBadge category={ticket.category} />
                            {ticket.validation === "PENDING" && (
                                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                                    À valider
                                </span>
                            )}
                            {ticket.publishToRoadmap && (
                                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                                    Sur la roadmap
                                </span>
                            )}
                            {/* Who asked is part of the decision, not a detail to
                                go hunting for once the drawer is open. */}
                            <span className="text-xs text-slate-500">
                                Demandé par <span className="font-medium text-slate-700">{ticket.requester.name}</span>
                                {ticket.requester.role ? ` · ${USER_ROLE_LABELS[ticket.requester.role]}` : ""}
                            </span>

                            <div className="ml-auto flex flex-wrap items-center gap-2">
                                {isManager && ticket.validation === "PENDING" && (
                                    <Button size="sm" onClick={() => onValidate(ticket)}>
                                        Valider la demande
                                    </Button>
                                )}
                                {isManager && (
                                    <>
                                        <Button size="sm" variant="secondary" onClick={() => onEdit(ticket)}>
                                            <Pencil className="h-3.5 w-3.5" />
                                            Modifier
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={togglePublish}
                                            disabled={isPublishing}
                                        >
                                            {isPublishing ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Rocket className="h-3.5 w-3.5" />
                                            )}
                                            {ticket.publishToRoadmap ? "Retirer de la roadmap" : "Publier"}
                                        </Button>
                                        <Button size="sm" variant="danger" onClick={() => setIsDeleteOpen(true)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                            Supprimer
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Thread and details are both full surfaces — tabs rather than a
                            cramped split, since the drawer is already narrower than the page. */}
                        <div className="flex gap-1 border-b border-slate-200 bg-slate-50 px-4">
                            {([
                                { id: "thread" as const, label: "Discussion", icon: MessageSquare },
                                { id: "details" as const, label: "Détails & checklist", icon: SlidersHorizontal },
                            ]).map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setTab(t.id)}
                                    aria-pressed={tab === t.id}
                                    className={cn(
                                        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                                        tab === t.id
                                            ? "border-indigo-600 text-indigo-700"
                                            : "border-transparent text-slate-500 hover:text-slate-800",
                                    )}
                                >
                                    <t.icon className="h-3.5 w-3.5" />
                                    {t.label}
                                    {t.id === "details" && ticket.releaseChecks?.some((c) => !c.checked) && (
                                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" aria-hidden />
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="min-h-0 flex-1 overflow-hidden">
                            {tab === "thread" ? (
                                <TicketThread
                                    ticket={ticket}
                                    currentUserId={currentUserId}
                                    canComment
                                    onRefresh={onRefresh}
                                />
                            ) : (
                                <TicketSidePanel
                                    ticket={ticket}
                                    currentUserId={currentUserId}
                                    isManager={isManager}
                                    onRefresh={onRefresh}
                                />
                            )}
                        </div>
                    </div>
                )}
            </Drawer>

            <ConfirmModal
                isOpen={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                onConfirm={remove}
                title="Supprimer ce ticket ?"
                message={
                    ticket
                        ? `${formatTicketRef(ticket.number)} · "${ticket.title}" sera supprimé, avec ses commentaires et son historique. Cette action est irréversible.`
                        : ""
                }
                confirmText="Supprimer"
                variant="danger"
                isLoading={isDeleting}
            />
        </>
    );
}

export default TicketDrawer;
