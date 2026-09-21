"use client";

import { useEffect, useState } from "react";
import { Modal, ModalFooter, Button, Input, Select, MultiSelect, useToast } from "@/components/ui";
import {
    TICKET_AFFECTED_ROLE_OPTIONS,
    TICKET_PRIORITY_LABELS,
    USER_ROLE_LABELS,
    formatTicketRef,
} from "@/lib/tickets/constants";
import type { TicketDetail } from "./types";

interface Option {
    id: string;
    name: string;
}

interface TicketValidationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDecided: () => void;
    ticket: TicketDetail | null;
    developers: Option[];
}

const PRIORITY_OPTIONS = Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => ({ value, label }));
const ROLE_OPTIONS = TICKET_AFFECTED_ROLE_OPTIONS.map((role) => ({ value: role, label: USER_ROLE_LABELS[role] }));

/**
 * A manager's ruling on a request filed by the sales team. Accepting is the
 * triage step the requester could not do: priority, affected roles (which build
 * the release checklist), assignee and due date are all set here.
 */
export function TicketValidationModal({
    isOpen,
    onClose,
    onDecided,
    ticket,
    developers,
}: TicketValidationModalProps) {
    const toast = useToast();

    const [priority, setPriority] = useState("MEDIUM");
    const [affectedRoles, setAffectedRoles] = useState<string[]>([]);
    const [assigneeId, setAssigneeId] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [rejectionReason, setRejectionReason] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setPriority(ticket?.priority ?? "MEDIUM");
        setAffectedRoles(ticket?.affectedRoles ?? []);
        setAssigneeId(ticket?.assignee?.id ?? "");
        setDueDate(ticket?.dueDate ? ticket.dueDate.slice(0, 10) : "");
        setRejectionReason("");
    }, [isOpen, ticket]);

    const submit = async (decision: "ACCEPTED" | "REJECTED") => {
        if (!ticket) return;

        if (decision === "ACCEPTED" && !affectedRoles.length) {
            toast.error("Sélectionnez au moins un rôle impacté");
            return;
        }
        if (decision === "REJECTED" && !rejectionReason.trim()) {
            toast.error("Expliquez le refus au demandeur");
            return;
        }

        setIsSaving(true);
        try {
            const response = await fetch(`/api/tickets/${ticket.id}/validate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    decision === "ACCEPTED"
                        ? {
                              decision,
                              priority,
                              affectedRoles,
                              assigneeId: assigneeId || null,
                              dueDate: dueDate || null,
                          }
                        : { decision, rejectionReason: rejectionReason.trim() },
                ),
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || "Décision impossible");
            }

            toast.success(decision === "ACCEPTED" ? "Demande acceptée" : "Demande refusée");
            onDecided();
            onClose();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Erreur serveur");
        } finally {
            setIsSaving(false);
        }
    };

    if (!ticket) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Valider ${formatTicketRef(ticket.number)}`}
            description={`Demande déposée par ${ticket.requester.name}.`}
            size="lg"
        >
            <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">{ticket.title}</p>
                    {ticket.description && (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{ticket.description}</p>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Select label="Priorité" options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} />
                    <Select
                        label="Développeur assigné"
                        options={[
                            { value: "", label: "Non assigné" },
                            ...developers.map((dev) => ({ value: dev.id, label: dev.name })),
                        ]}
                        value={assigneeId}
                        onChange={setAssigneeId}
                        placeholder="Non assigné"
                    />
                </div>

                <MultiSelect
                    label="Rôles impactés"
                    options={ROLE_OPTIONS}
                    value={affectedRoles}
                    onChange={setAffectedRoles}
                    placeholder="Qui est affecté par ce changement ?"
                />
                <p className="-mt-2 text-xs text-slate-500">
                    Chaque rôle sélectionné devra être testé avant de pouvoir clôturer le ticket.
                </p>

                <Input
                    label="Échéance"
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                />

                <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        Motif de refus <span className="text-slate-400">(requis pour refuser)</span>
                    </label>
                    <textarea
                        value={rejectionReason}
                        onChange={(event) => setRejectionReason(event.target.value)}
                        rows={3}
                        placeholder="Pourquoi cette demande n'est pas retenue…"
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                </div>
            </div>

            <ModalFooter>
                <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                    Annuler
                </Button>
                <Button variant="danger" onClick={() => submit("REJECTED")} disabled={isSaving}>
                    Refuser
                </Button>
                <Button onClick={() => submit("ACCEPTED")} isLoading={isSaving}>
                    Accepter
                </Button>
            </ModalFooter>
        </Modal>
    );
}

export default TicketValidationModal;
