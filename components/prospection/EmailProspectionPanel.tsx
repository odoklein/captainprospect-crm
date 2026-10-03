"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button, useToast } from "@/components/ui";
import { Mail, User, Building2, Loader2, ChevronRight } from "lucide-react";
import { QuickEmailModal } from "@/components/email/QuickEmailModal";
import type { ProspectionActionData } from "./ProspectionChannelWorkspace";

interface EmailProspectionPanelProps {
    missionId?: string | null;
    listId?: string | null;
}

export function EmailProspectionPanel({ missionId, listId }: EmailProspectionPanelProps) {
    const { success, error: showError } = useToast();
    const [currentAction, setCurrentAction] = useState<ProspectionActionData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showEmailModal, setShowEmailModal] = useState(false);

    const fetchNext = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ channel: "EMAIL" });
            if (missionId) params.set("missionId", missionId);
            if (listId) params.set("listId", listId);
            const res = await fetch(`/api/actions/next?${params.toString()}`);
            const json = await res.json();
            const n = json.data;
            if (json.success && json.hasNext && n) {
                setCurrentAction({
                    contactId: n.contact?.id ?? null,
                    companyId: n.company?.id,
                    contact: n.contact,
                    company: n.company,
                    campaignId: n.campaignId,
                    channel: "EMAIL",
                    missionName: n.missionName,
                    script: n.script,
                    clientBookingUrl: n.clientBookingUrl,
                    lastAction: n.lastAction,
                });
            } else {
                setCurrentAction(null);
            }
        } catch (err) {
            console.error(err);
            showError("Erreur", "Impossible de charger le prochain contact");
            setCurrentAction(null);
        } finally {
            setIsLoading(false);
        }
    }, [missionId, listId, showError]);

    useEffect(() => {
        fetchNext();
    }, [fetchNext]);

    const handleEmailSent = useCallback(async () => {
        if (!currentAction) return;
        setIsSubmitting(true);
        try {
            const res = await fetch("/api/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contactId: currentAction.contactId,
                    companyId: currentAction.companyId,
                    campaignId: currentAction.campaignId,
                    channel: "EMAIL",
                    result: "MAIL_ENVOYE",
                    note: "Email envoyé",
                }),
            });
            const json = await res.json();
            if (json.success) {
                success("Email envoyé", "Passons au contact suivant.");
                setShowEmailModal(false);
                fetchNext();
            } else {
                showError("Erreur", json.error || "Impossible d'enregistrer l'action");
            }
        } catch (err) {
            showError("Erreur", "Une erreur est survenue");
        } finally {
            setIsSubmitting(false);
        }
    }, [currentAction, fetchNext, success, showError]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-24">
                <Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-4" />
                <p className="text-slate-500 font-medium">Chargement du prochain contact...</p>
            </div>
        );
    }

    if (!currentAction) {
        return (
            <Card className="text-center py-16 border border-slate-200 rounded-2xl">
                <Mail className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-700">Aucun contact à contacter par email</h3>
                <p className="text-slate-500 mt-1">Tous les contacts de la file ont été traités ou la file est vide.</p>
            </Card>
        );
    }

    const contact = currentAction.contact;
    const company = currentAction.company;
    const displayName = contact
        ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") || company?.name
        : company?.name;

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <Card className="p-6 border border-slate-200 rounded-2xl shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-accent-100 flex items-center justify-center">
                        <User className="w-6 h-6 text-accent-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">{displayName}</h2>
                        {company?.name && (
                            <p className="text-sm text-slate-500 flex items-center gap-1">
                                <Building2 className="w-4 h-4" />
                                {company.name}
                            </p>
                        )}
                        {contact?.email && (
                            <p className="text-sm text-slate-600 mt-0.5">{contact.email}</p>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap gap-3">
                    <Button
                        variant="primary"
                        onClick={() => setShowEmailModal(true)}
                        className="gap-2"
                    >
                        <Mail className="w-4 h-4" />
                        Envoyer un email
                    </Button>
                    <Button
                        variant="outline"
                        onClick={fetchNext}
                        disabled={isSubmitting}
                        className="gap-2"
                    >
                        <ChevronRight className="w-4 h-4" />
                        Passer au suivant
                    </Button>
                </div>
            </Card>

            <QuickEmailModal
                isOpen={showEmailModal}
                onClose={() => setShowEmailModal(false)}
                onSent={handleEmailSent}
                contact={contact ? {
                    id: contact.id,
                    firstName: contact.firstName,
                    lastName: contact.lastName,
                    email: contact.email ?? undefined,
                    title: contact.title,
                    company: company ? { id: company.id, name: company.name } : undefined,
                } : undefined}
                company={company ? { id: company.id, name: company.name } : undefined}
                missionId={undefined}
                missionName={currentAction.missionName ?? undefined}
            />
        </div>
    );
}
