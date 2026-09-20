"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
    X,
    CheckCircle2,
    AlertCircle,
    Wrench,
    Ticket,
    ArrowRight,
    Loader2,
    FileText,
    Tag,
    AlertTriangle,
} from "lucide-react";
import type { SupportConversationDetailDTO } from "@/lib/support/types";

interface ConvertSupportToTicketModalProps {
    isOpen: boolean;
    onClose: () => void;
    conversation: SupportConversationDetailDTO | null;
    onSuccess: (ticket: { id: string; number: number; title: string }) => void;
}

export function ConvertSupportToTicketModal({
    isOpen,
    onClose,
    conversation,
    onSuccess,
}: ConvertSupportToTicketModalProps) {
    const [mounted, setMounted] = useState(false);
    const [title, setTitle] = useState("");
    const [category, setCategory] = useState<"BUG" | "IMPROVEMENT" | "FEATURE_REQUEST" | "TECHNICAL_SUPPORT">("TECHNICAL_SUPPORT");
    const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");
    const [description, setDescription] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createdTicket, setCreatedTicket] = useState<{ id: string; number: number; title: string } | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Synchronize form fields whenever conversation changes or modal opens
    useEffect(() => {
        if (!conversation || !isOpen) return;

        const messages = conversation.messages || [];
        const lastClientMsg = messages.filter((m) => m.role === "CLIENT").at(-1);

        setTitle(`[Support - ${conversation.clientName || "Client"}] ${conversation.subject || "Demande d'assistance"}`);
        setCategory(conversation.lastIntent === "PROBLEME" ? "BUG" : "TECHNICAL_SUPPORT");
        setPriority("MEDIUM");
        setDescription(
            `Demande client : ${conversation.clientName || "Non renseigné"}
Auteur : ${conversation.createdByName ? `${conversation.createdByName} (${conversation.createdByRole || "Client"})` : "Client"}
Objet initial : ${conversation.subject || "(Aucun objet)"}

---
Dernier message du client :
${lastClientMsg?.content || "(Pas de texte)"}

---
Historique conversation support :
${messages
    .map(
        (m) =>
            `[${m.role}] ${m.author?.name || (m.role === "CLIENT" ? "Client" : "Support")} : ${m.content}`,
    )
    .join("\n\n")}`,
        );
        setError(null);
        setCreatedTicket(null);
    }, [conversation, isOpen]);

    if (!isOpen || !conversation || !mounted) return null;

    const lastClientMsg = (conversation.messages || []).filter((m) => m.role === "CLIENT").at(-1);

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
                    affectedRoles: ["DEVELOPER", "CLIENT"],
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

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
            style={{ zIndex: 9999 }}
            onClick={(e) => {
                if (e.target === e.currentTarget && !submitting) onClose();
            }}
        >
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 text-white flex items-center justify-between shrink-0 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/15 rounded-xl border border-white/20 backdrop-blur-sm shadow-inner">
                            <Ticket className="w-5 h-5 text-indigo-100" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-bold leading-tight">Convertir en Ticket Développeur</h3>
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-white/20 rounded-full text-indigo-100 uppercase tracking-wider">
                                    Triage
                                </span>
                            </div>
                            <p className="text-xs text-indigo-200 mt-0.5">
                                Escalade directe depuis le support vers le backlog technique
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                        aria-label="Fermer la modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {createdTicket ? (
                    <div className="p-10 text-center space-y-4">
                        <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm ring-8 ring-emerald-50">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <div className="space-y-1">
                            <h4 className="text-lg font-bold text-slate-900">
                                Ticket #TC-{createdTicket.number} créé avec succès !
                            </h4>
                            <p className="text-xs text-slate-500 max-w-sm mx-auto">
                                Le ticket est désormais assignable et visible dans l&apos;espace Support Technique pour les développeurs.
                            </p>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
                        {error && (
                            <div className="p-3.5 bg-red-50/90 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700 animate-in fade-in">
                                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div>
                            <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Titre du ticket *</span>
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                                placeholder="Ex: [Support - ACME] Problème synchronisation..."
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3.5">
                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                                    <Tag className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Catégorie</span>
                                </label>
                                <select
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value as any)}
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                                >
                                    <option value="BUG">Bug technique</option>
                                    <option value="TECHNICAL_SUPPORT">Support technique</option>
                                    <option value="IMPROVEMENT">Amélioration</option>
                                    <option value="FEATURE_REQUEST">Nouvelle fonctionnalité</option>
                                </select>
                            </div>

                            <div>
                                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                    <span>Priorité</span>
                                </label>
                                <select
                                    value={priority}
                                    onChange={(e) => setPriority(e.target.value as any)}
                                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
                                >
                                    <option value="LOW">Basse</option>
                                    <option value="MEDIUM">Moyenne</option>
                                    <option value="HIGH">Élevée</option>
                                    <option value="URGENT">Urgente</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                                    <Wrench className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Description & Contexte extrait</span>
                                </label>
                                <span className="text-[10px] text-slate-400 font-medium">Pré-rempli automatiquement</span>
                            </div>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={6}
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none font-mono leading-relaxed"
                                required
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
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
                                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/30 flex items-center gap-2 transition-all"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        <span>Création...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Créer le ticket Dev</span>
                                        <ArrowRight className="w-3.5 h-3.5" />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>,
        document.body,
    );
}
