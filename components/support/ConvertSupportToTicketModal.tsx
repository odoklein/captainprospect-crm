"use client";

import { useState } from "react";
import { X, CheckCircle2, AlertCircle, Wrench } from "lucide-react";
import type { SupportConversationDetailDTO } from "@/lib/support/types";

interface ConvertSupportToTicketModalProps {
    isOpen: boolean;
    onClose: () => void;
    conversation: SupportConversationDetailDTO;
    onSuccess: (ticket: { id: string; number: number; title: string }) => void;
}

export function ConvertSupportToTicketModal({
    isOpen,
    onClose,
    conversation,
    onSuccess,
}: ConvertSupportToTicketModalProps) {
    const lastClientMsg = conversation.messages.filter((m) => m.role === "CLIENT").at(-1);

    const [title, setTitle] = useState(
        `[Support - ${conversation.clientName}] ${conversation.subject || "Demande d'assistance"}`,
    );
    const [category, setCategory] = useState<"BUG" | "IMPROVEMENT" | "FEATURE_REQUEST" | "TECHNICAL_SUPPORT">(
        conversation.lastIntent === "PROBLEME" ? "BUG" : "TECHNICAL_SUPPORT",
    );
    const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");
    const [description, setDescription] = useState(
        `Demande client : ${conversation.clientName}
Auteur : ${conversation.createdByName ? `${conversation.createdByName} (${conversation.createdByRole || "Client"})` : "Client"}
Objet initial : ${conversation.subject}

---
Dernier message du client :
${lastClientMsg?.content || "(Pas de texte)"}

---
Historique conversation support :
${conversation.messages
    .map(
        (m) =>
            `[${m.role}] ${m.author?.name || (m.role === "CLIENT" ? "Client" : "Support")} : ${m.content}`,
    )
    .join("\n\n")}`,
    );
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createdTicket, setCreatedTicket] = useState<{ id: string; number: number; title: string } | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            setError("Le titre du ticket est obligatoire.");
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch("/api/tickets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim(),
                    category,
                    priority,
                    scope: "CLIENT_FACING",
                    affectedRoles: ["CLIENT"],
                    clientId: conversation.clientId,
                    sourceSupportMessageId: lastClientMsg?.id ?? undefined,
                }),
            });

            const json = await res.json();
            if (!res.ok || !json?.success) {
                throw new Error(json?.error || "Impossible de créer le ticket de développement");
            }

            const ticket = json.data as { id: string; number: number; title: string };
            setCreatedTicket(ticket);
            onSuccess(ticket);
            setTimeout(() => {
                onClose();
            }, 1800);
        } catch (err: any) {
            setError(err?.message || "Erreur de création du ticket");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={(e) => {
                if (e.target === e.currentTarget && !submitting) onClose();
            }}
        >
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-white/20 rounded-lg">
                            <Wrench className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold leading-tight">Convertir en Ticket Développeur</h3>
                            <p className="text-xs text-indigo-100 mt-0.5">Triage Manager vers l'équipe technique</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {createdTicket ? (
                    <div className="p-8 text-center space-y-3">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <h4 className="text-base font-bold text-slate-900">
                            Ticket #TC-{createdTicket.number} créé !
                        </h4>
                        <p className="text-xs text-slate-500">
                            Le ticket est désormais visible dans le module Support Technique pour les développeurs.
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                Titre du ticket
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                    Catégorie
                                </label>
                                <select
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value as any)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                >
                                    <option value="BUG">Bug technique</option>
                                    <option value="TECHNICAL_SUPPORT">Support technique</option>
                                    <option value="IMPROVEMENT">Amélioration</option>
                                    <option value="FEATURE_REQUEST">Nouvelle fonctionnalité</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                    Priorité
                                </label>
                                <select
                                    value={priority}
                                    onChange={(e) => setPriority(e.target.value as any)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                >
                                    <option value="LOW">Basse</option>
                                    <option value="MEDIUM">Moyenne</option>
                                    <option value="HIGH">Élevée</option>
                                    <option value="URGENT">Urgente</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                Description & Contexte client
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={6}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none font-mono"
                                required
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={submitting}
                                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors"
                            >
                                Annuler
                            </button>
                            <button
                                type="submit"
                                disabled={submitting || !title.trim()}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow transition-colors"
                            >
                                {submitting ? "Création en cours..." : "Créer le ticket Dev →"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
