"use client";

import { useEffect, useState } from "react";
import { Modal, ModalFooter, Button, Input, Select, MultiSelect, useToast } from "@/components/ui";
import {
    TICKET_AFFECTED_ROLE_OPTIONS,
    TICKET_CATEGORY_LABELS,
    TICKET_PRIORITY_LABELS,
    TICKET_SCOPE_LABELS,
    USER_ROLE_LABELS,
} from "@/lib/tickets/constants";
import type { TicketDetail } from "./types";

interface Option {
    id: string;
    name: string;
}

interface TicketFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    ticket?: TicketDetail | null;
    developers: Option[];
    clients: Option[];
}

const CATEGORY_OPTIONS = Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
const SCOPE_OPTIONS = Object.entries(TICKET_SCOPE_LABELS).map(([value, label]) => ({ value, label }));
const PRIORITY_OPTIONS = Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => ({ value, label }));
const ROLE_OPTIONS = TICKET_AFFECTED_ROLE_OPTIONS.map((role) => ({ value: role, label: USER_ROLE_LABELS[role] }));

export function TicketFormModal({ isOpen, onClose, onSaved, ticket, developers, clients }: TicketFormModalProps) {
    const toast = useToast();
    const isEdit = Boolean(ticket);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("BUG");
    const [scope, setScope] = useState("INTERNAL");
    const [priority, setPriority] = useState("MEDIUM");
    const [affectedRoles, setAffectedRoles] = useState<string[]>(["DEVELOPER"]);
    const [clientId, setClientId] = useState("");
    const [assigneeId, setAssigneeId] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setTitle(ticket?.title ?? "");
        setDescription(ticket?.description ?? "");
        setCategory(ticket?.category ?? "BUG");
        setScope(ticket?.scope ?? "INTERNAL");
        setPriority(ticket?.priority ?? "MEDIUM");
        setAffectedRoles(ticket?.affectedRoles?.length ? ticket.affectedRoles : ["DEVELOPER"]);
        setClientId(ticket?.client?.id ?? "");
        setAssigneeId(ticket?.assignee?.id ?? "");
        setDueDate(ticket?.dueDate ? ticket.dueDate.slice(0, 10) : "");
    }, [isOpen, ticket]);

    const handleSubmit = async () => {
        if (title.trim().length < 3) {
            toast.error("Titre trop court");
            return;
        }
        if (!affectedRoles.length) {
            toast.error("Sélectionnez au moins un rôle impacté");
            return;
        }
        if (scope === "CLIENT_FACING" && !clientId) {
            toast.error("Un ticket client doit être rattaché à un client");
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                title: title.trim(),
                description: description.trim() || null,
                category,
                scope,
                priority,
                affectedRoles,
                clientId: scope === "INTERNAL" ? null : clientId || null,
                assigneeId: assigneeId || null,
                dueDate: dueDate || null,
            };

            const response = await fetch(isEdit ? `/api/tickets/${ticket!.id}` : "/api/tickets", {
                method: isEdit ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || "Enregistrement impossible");
            }

            toast.success(isEdit ? "Ticket mis à jour" : "Ticket créé");
            onSaved();
            onClose();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Erreur serveur");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEdit ? "Modifier le ticket" : "Nouveau ticket"}
            description="Les tickets internes ne sont jamais visibles par les clients."
            size="lg"
        >
            <div className="space-y-4">
                <Input
                    label="Titre"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Ex : Le filtre de la liste ne conserve pas la sélection"
                />

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                    <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={5}
                        placeholder="Contexte, étapes de reproduction, comportement attendu…"
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Select label="Catégorie" options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
                    <Select label="Priorité" options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} />
                    <Select label="Portée" options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
                    <Select
                        label="Développeur assigné"
                        options={[{ value: "", label: "Non assigné" }, ...developers.map((dev) => ({ value: dev.id, label: dev.name }))]}
                        value={assigneeId}
                        onChange={setAssigneeId}
                        placeholder="Non assigné"
                    />
                </div>

                {scope !== "INTERNAL" && (
                    <Select
                        label="Client concerné"
                        options={[{ value: "", label: "Aucun" }, ...clients.map((client) => ({ value: client.id, label: client.name }))]}
                        value={clientId}
                        onChange={setClientId}
                        searchable
                        placeholder="Sélectionner un client"
                    />
                )}

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
            </div>

            <ModalFooter>
                <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                    Annuler
                </Button>
                <Button onClick={handleSubmit} isLoading={isSaving}>
                    {isEdit ? "Enregistrer" : "Créer le ticket"}
                </Button>
            </ModalFooter>
        </Modal>
    );
}

export default TicketFormModal;
