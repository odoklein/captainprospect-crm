"use client";

import { useEffect, useState } from "react";
import { Check, CalendarDays, User2, Building2, Globe2, ShieldCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input, Modal, ModalFooter, useToast } from "@/components/ui";
import { TICKET_STATUS_TRANSITIONS, TICKET_STATUS_LABELS, USER_ROLE_LABELS } from "@/lib/tickets/constants";
import { TicketCategoryBadge, TicketPriorityBadge, TicketScopeBadge } from "./TicketBadges";
import type { TicketDetail, TicketStatus } from "./types";

interface TicketSidePanelProps {
    ticket: TicketDetail;
    currentUserId: string;
    isManager: boolean;
    onRefresh: () => void;
}

export function TicketSidePanel({ ticket, currentUserId, isManager, onRefresh }: TicketSidePanelProps) {
    const toast = useToast();
    const [isBusy, setIsBusy] = useState(false);

    const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
    const [blockReason, setBlockReason] = useState("");

    const canChangeStatus = isManager || ticket.assignee?.id === currentUserId;
    const nextStatuses = TICKET_STATUS_TRANSITIONS[ticket.status] ?? [];
    const pendingChecks = ticket.releaseChecks.filter((check) => !check.checked);

    const executeStatusChange = async (status: TicketStatus, comment?: string | null) => {
        setIsBusy(true);
        try {
            const response = await fetch(`/api/tickets/${ticket.id}/status`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status, comment: comment ?? null }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || "Changement de statut impossible");
            }
            toast.success(`Statut : ${TICKET_STATUS_LABELS[status]}`);
            onRefresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Erreur serveur");
        } finally {
            setIsBusy(false);
            setIsBlockModalOpen(false);
            setBlockReason("");
        }
    };

    const changeStatus = async (status: TicketStatus) => {
        if (status === "BLOCKED") {
            setIsBlockModalOpen(true);
            return;
        }
        await executeStatusChange(status);
    };

    const toggleCheck = async (role: string, checked: boolean) => {
        setIsBusy(true);
        try {
            const response = await fetch(`/api/tickets/${ticket.id}/release-checks/${role.toLowerCase()}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ checked }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || "Validation impossible");
            }
            onRefresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Erreur serveur");
        } finally {
            setIsBusy(false);
        }
    };

    const currentStepIndex = [
        "NEW",
        "TODO",
        "IN_PROGRESS",
        "TESTING",
        "COMPLETED",
    ].indexOf(ticket.status);

    return (
        <div className="h-full overflow-y-auto p-5 space-y-6">
            {/* Lifecycle Stepper / Blocked Alert */}
            {ticket.status === "BLOCKED" ? (
                <div className="flex items-start gap-2.5 p-3.5 bg-red-50/80 border border-red-200 rounded-xl text-red-700 text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                    <div>
                        <p className="font-semibold text-red-800">Ticket bloqué</p>
                        <p className="text-red-600/90 text-[11px] mt-0.5 leading-relaxed">
                            Ce ticket est en attente d&apos;un déblocage technique ou d&apos;informations complémentaires.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-1.5 p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <span>Cycle de vie</span>
                        <span className="text-indigo-600 font-medium normal-case">
                            {TICKET_STATUS_LABELS[ticket.status]}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                        {[
                            { status: "NEW", label: "Nouveau" },
                            { status: "TODO", label: "À faire" },
                            { status: "IN_PROGRESS", label: "En cours" },
                            { status: "TESTING", label: "Recette" },
                            { status: "COMPLETED", label: "Terminé" },
                        ].map((step, idx) => {
                            const isPassed = currentStepIndex >= idx;
                            const isCurrent = ticket.status === step.status;
                            return (
                                <div
                                    key={step.status}
                                    className={cn(
                                        "h-2 flex-1 rounded-full transition-all",
                                        isCurrent
                                            ? "bg-indigo-600 ring-2 ring-indigo-200"
                                            : isPassed
                                            ? "bg-indigo-400"
                                            : "bg-slate-200",
                                    )}
                                    title={step.label}
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            <section className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Détails</h3>
                <div className="flex flex-wrap gap-2">
                    <TicketCategoryBadge category={ticket.category} />
                    <TicketPriorityBadge priority={ticket.priority} />
                    <TicketScopeBadge scope={ticket.scope} />
                </div>
                <dl className="space-y-2 text-sm">
                    <Row icon={User2} label="Demandeur" value={ticket.requester.name} />
                    <Row icon={User2} label="Assigné à" value={ticket.assignee?.name ?? "Non assigné"} />
                    {ticket.client && <Row icon={Building2} label="Client" value={ticket.client.name} />}
                    {ticket.mission && <Row icon={Globe2} label="Mission" value={ticket.mission.name} />}
                    <Row
                        icon={CalendarDays}
                        label="Échéance"
                        value={ticket.dueDate ? new Date(ticket.dueDate).toLocaleDateString("fr-FR") : "—"}
                    />
                </dl>
            </section>

            {canChangeStatus && nextStatuses.length > 0 && (
                <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Changer le statut</h3>
                    <div className="flex flex-wrap gap-2">
                        {nextStatuses.map((status) => (
                            <Button
                                key={status}
                                size="sm"
                                variant={status === "COMPLETED" ? "success" : "secondary"}
                                disabled={isBusy}
                                onClick={() => changeStatus(status)}
                            >
                                {TICKET_STATUS_LABELS[status]}
                            </Button>
                        ))}
                    </div>
                    {ticket.status === "TESTING" && pendingChecks.length > 0 && (
                        <p className="text-xs text-amber-600">
                            {pendingChecks.length} rôle(s) restent à tester avant de pouvoir clôturer.
                        </p>
                    )}
                </section>
            )}

            <section className="space-y-2">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Tests par rôle impacté
                </h3>
                {ticket.releaseChecks.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucun rôle impacté déclaré.</p>
                ) : (
                    <ul className="space-y-2">
                        {ticket.releaseChecks.map((check) => {
                            const canToggle =
                                isManager ||
                                (check.role === "DEVELOPER" && ticket.assignee?.id === currentUserId);

                            return (
                                <li
                                    key={check.id}
                                    className="flex items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-xl"
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-slate-800">
                                            {USER_ROLE_LABELS[check.role]}
                                        </p>
                                        {check.checked && check.checkedBy && (
                                            <p className="text-[11px] text-slate-400 truncate">
                                                Validé par {check.checkedBy.name}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        disabled={!canToggle || isBusy}
                                        onClick={() => toggleCheck(check.role, !check.checked)}
                                        className={cn(
                                            "w-7 h-7 shrink-0 rounded-lg border flex items-center justify-center transition-colors",
                                            check.checked
                                                ? "bg-emerald-500 border-emerald-500 text-white"
                                                : "bg-white border-slate-300 text-transparent",
                                            canToggle ? "cursor-pointer hover:border-emerald-400" : "cursor-not-allowed opacity-60",
                                        )}
                                        aria-label={`Valider ${USER_ROLE_LABELS[check.role]}`}
                                    >
                                        <Check className="w-4 h-4" />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            {isManager && ticket.scope === "CLIENT_FACING" && (
                <PublicationSection ticket={ticket} onRefresh={onRefresh} />
            )}

            {/* Modal for blocking ticket */}
            <Modal
                isOpen={isBlockModalOpen}
                onClose={() => {
                    setIsBlockModalOpen(false);
                    setBlockReason("");
                }}
                title="Indiquer le motif du blocage"
                description="Expliquez ce qui empêche la résolution du ticket pour informer l'équipe."
                size="sm"
            >
                <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">
                        Motif du blocage <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        value={blockReason}
                        onChange={(e) => setBlockReason(e.target.value)}
                        rows={3}
                        placeholder="Ex : En attente des accès API, bug bloquant sur librairie tierce..."
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                        autoFocus
                    />
                </div>
                <ModalFooter>
                    <Button variant="secondary" onClick={() => setIsBlockModalOpen(false)}>
                        Annuler
                    </Button>
                    <Button
                        variant="danger"
                        disabled={!blockReason.trim() || isBusy}
                        isLoading={isBusy}
                        onClick={() => executeStatusChange("BLOCKED", blockReason.trim())}
                    >
                        Confirmer le blocage
                    </Button>
                </ModalFooter>
            </Modal>
        </div>
    );
}

function PublicationSection({ ticket, onRefresh }: { ticket: TicketDetail; onRefresh: () => void }) {
    const toast = useToast();
    const [publicTitle, setPublicTitle] = useState(ticket.publicTitle ?? "");
    const [publicDescription, setPublicDescription] = useState(ticket.publicDescription ?? "");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setPublicTitle(ticket.publicTitle ?? "");
        setPublicDescription(ticket.publicDescription ?? "");
    }, [ticket.id, ticket.publicTitle, ticket.publicDescription]);

    const save = async (publishToRoadmap: boolean) => {
        setIsSaving(true);
        try {
            const response = await fetch(`/api/tickets/${ticket.id}/publish`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ publishToRoadmap, publicTitle, publicDescription }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || "Publication impossible");
            }
            toast.success(publishToRoadmap ? "Publié sur la roadmap client" : "Retiré de la roadmap client");
            onRefresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Erreur serveur");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="space-y-3 pt-4 border-t border-slate-200">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Roadmap client</h3>
            <p className="text-xs text-slate-500">
                Le client ne voit que ces deux champs — jamais le titre ni la description internes.
            </p>

            <Input
                label="Titre public"
                value={publicTitle}
                onChange={(event) => setPublicTitle(event.target.value)}
                placeholder="Ex : Amélioration de la fiabilité des synchronisations"
            />
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Description publique</label>
                <textarea
                    value={publicDescription}
                    onChange={(event) => setPublicDescription(event.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
            </div>

            {/* Live preview for manager */}
            <div className="p-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Aperçu sur la roadmap client
                    </span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {TICKET_STATUS_LABELS[ticket.status]}
                    </span>
                </div>
                <p className="text-xs font-semibold text-slate-800">
                    {publicTitle.trim() || "Titre public du ticket…"}
                </p>
                <p className="text-xs text-slate-500 line-clamp-2">
                    {publicDescription.trim() || "Description publique visible par le client…"}
                </p>
            </div>

            <div className="flex gap-2 pt-1">
                {ticket.publishToRoadmap ? (
                    <>
                        <Button size="sm" variant="secondary" isLoading={isSaving} onClick={() => save(true)}>
                            Mettre à jour
                        </Button>
                        <Button size="sm" variant="danger" isLoading={isSaving} onClick={() => save(false)}>
                            Retirer
                        </Button>
                    </>
                ) : (
                    <Button size="sm" isLoading={isSaving} onClick={() => save(true)}>
                        Publier sur la roadmap
                    </Button>
                )}
            </div>
        </section>
    );
}

function Row({
    icon: Icon,
    label,
    value,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-slate-500">
                <Icon className="w-3.5 h-3.5" />
                {label}
            </dt>
            <dd className="text-slate-800 font-medium text-right truncate">{value}</dd>
        </div>
    );
}

export default TicketSidePanel;
