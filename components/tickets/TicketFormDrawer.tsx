"use client";

import { useEffect, useState } from "react";
import { Drawer, Button, Input, Select, MultiSelect, useToast } from "@/components/ui";
import {
    TICKET_AFFECTED_ROLE_OPTIONS,
    TICKET_CATEGORY_LABELS,
    TICKET_PRIORITY_LABELS,
    TICKET_SCOPE_LABELS,
    USER_ROLE_LABELS,
} from "@/lib/tickets/constants";
import { ticketAttachmentUrl } from "@/lib/tickets/attachments";
import { TicketAttachmentsField, useTicketAttachments } from "./TicketAttachmentsField";
import type { TicketDetail } from "./types";

interface Option {
    id: string;
    name: string;
}

interface TicketFormDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    ticket?: TicketDetail | null;
    developers: Option[];
    clients: Option[];
}

const CATEGORY_OPTIONS = Object.entries(TICKET_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
const SCOPE_OPTIONS = [
    { value: "INTERNAL", label: TICKET_SCOPE_LABELS.INTERNAL },
    { value: "CLIENT_FACING", label: TICKET_SCOPE_LABELS.CLIENT_FACING },
];
const PRIORITY_OPTIONS = Object.entries(TICKET_PRIORITY_LABELS).map(([value, label]) => ({ value, label }));
const ROLE_OPTIONS = TICKET_AFFECTED_ROLE_OPTIONS.map((role) => ({ value: role, label: USER_ROLE_LABELS[role] }));

export function TicketFormDrawer({ isOpen, onClose, onSaved, ticket, developers, clients }: TicketFormDrawerProps) {
    const toast = useToast();
    const isEdit = Boolean(ticket);

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("BUG");
    const [scope, setScope] = useState("INTERNAL");
    const [priority, setPriority] = useState("MEDIUM");
    // No default: "DEVELOPER" used to be pre-filled, so tickets nobody edited
    // shipped with a developer-only release checklist regardless of who the
    // change actually affected. An empty field forces a deliberate answer.
    const [affectedRoles, setAffectedRoles] = useState<string[]>([]);
    const [clientId, setClientId] = useState("");
    const [assigneeId, setAssigneeId] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const attachments = useTicketAttachments(ticket?.attachments.length ?? 0);

    useEffect(() => {
        if (!isOpen) return;
        setTitle(ticket?.title ?? "");
        setDescription(ticket?.description ?? "");
        setCategory(ticket?.category ?? "BUG");
        setScope(ticket?.scope ?? "INTERNAL");
        setPriority(ticket?.priority ?? "MEDIUM");
        setAffectedRoles(ticket?.affectedRoles ?? []);
        setClientId(ticket?.client?.id ?? "");
        setAssigneeId(ticket?.assignee?.id ?? "");
        setDueDate(ticket?.dueDate ? ticket.dueDate.slice(0, 10) : "");
        attachments.clear();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, ticket]);

    // Switching to a client ticket implies the client experience changes, so
    // pre-select CLIENT instead of letting the checklist be signed off without it.
    const handleScopeChange = (next: string) => {
        setScope(next);
        if (next === "CLIENT_FACING" && !affectedRoles.includes("CLIENT")) {
            setAffectedRoles([...affectedRoles, "CLIENT"]);
        }
    };

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
        if (scope === "CLIENT_FACING" && !affectedRoles.includes("CLIENT")) {
            toast.error("Un ticket client doit inclure le rôle Client dans les rôles impactés");
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

            const { failed } = await attachments.uploadAll(result.data?.id ?? ticket!.id);
            if (failed > 0) {
                toast.warning(
                    `Ticket enregistré, mais ${failed} capture${failed > 1 ? "s" : ""} n'${failed > 1 ? "ont" : "a"} pas pu être jointe${failed > 1 ? "s" : ""}.`,
                );
            } else {
                toast.success(isEdit ? "Ticket mis à jour" : "Ticket créé");
            }
            attachments.clear();
            onSaved();
            onClose();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Erreur serveur");
        } finally {
            setIsSaving(false);
        }
    };

    const existingImages = (ticket?.attachments ?? [])
        .filter((file) => file.mimeType.startsWith("image/"))
        .map((file) => ({
            id: file.id,
            name: file.originalName,
            src: ticketAttachmentUrl(ticket!.id, file.id),
        }));

    const handleClose = () => {
        if (!isSaving) onClose();
    };

    return (
        <Drawer
            isOpen={isOpen}
            onClose={handleClose}
            title={isEdit ? "Modifier le ticket" : "Nouveau ticket"}
            description="Les tickets internes ne sont jamais visibles par les clients."
            size="md"
            // A half-written ticket is easy to lose to a stray click outside.
            closeOnOverlay={false}
            footer={
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={handleClose} disabled={isSaving}>
                        Annuler
                    </Button>
                    <Button onClick={handleSubmit} isLoading={isSaving}>
                        {isEdit ? "Enregistrer" : "Créer le ticket"}
                    </Button>
                </div>
            }
        >
            <div className="space-y-5">
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
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                    />
                </div>

                <TicketAttachmentsField
                    controller={attachments}
                    active={isOpen}
                    disabled={isSaving}
                    existing={existingImages}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Select label="Catégorie" options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
                    <Select label="Priorité" options={PRIORITY_OPTIONS} value={priority} onChange={setPriority} />
                    <Select label="Portée" options={SCOPE_OPTIONS} value={scope} onChange={handleScopeChange} />
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
        </Drawer>
    );
}

export default TicketFormDrawer;
