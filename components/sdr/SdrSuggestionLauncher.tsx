"use client";

import { useState } from "react";
import { Lightbulb, X, Send, AlertCircle, CheckCircle2 } from "lucide-react";

export function SdrSuggestionLauncher() {
    const [isOpen, setIsOpen] = useState(false);
    const [type, setType] = useState<"IMPROVEMENT" | "BUG" | "MISSING_DATA" | "OTHER">("IMPROVEMENT");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [urgency, setUrgency] = useState<"NORMAL" | "URGENT">("NORMAL");
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !description.trim()) {
            setError("Veuillez remplir le titre et la description.");
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch("/api/sdr/suggestions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type,
                    title: title.trim(),
                    description: description.trim(),
                    urgency,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json?.success) {
                throw new Error(json?.error || "Erreur lors de l'envoi");
            }
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setIsOpen(false);
                setTitle("");
                setDescription("");
                setType("IMPROVEMENT");
                setUrgency("NORMAL");
            }, 2000);
        } catch (err: any) {
            setError(err?.message || "Impossible d'envoyer votre suggestion");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            {/* Floating button on SDR interface */}
            <div className="fixed bottom-6 left-6 z-40">
                <button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-lg hover:shadow-xl transition-all border border-amber-400/50"
                    title="Proposer une amélioration ou signaler un problème"
                >
                    <Lightbulb className="w-4 h-4 text-amber-100" />
                    <span>Une idée / Besoin</span>
                </button>
            </div>

            {/* Modal */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
                    onClick={(e) => {
                        if (e.target === e.currentTarget && !submitting) setIsOpen(false);
                    }}
                >
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-white flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-white/20 rounded-lg">
                                    <Lightbulb className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold leading-tight">Boîte à Idées & Remontées SDR</h3>
                                    <p className="text-xs text-amber-100 mt-0.5">Transmis directement aux managers</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                disabled={submitting}
                                className="p-1 text-white/80 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        {success ? (
                            <div className="p-10 text-center space-y-3">
                                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                                    <CheckCircle2 className="w-6 h-6" />
                                </div>
                                <h4 className="text-base font-bold text-slate-900">Merci pour votre retour !</h4>
                                <p className="text-xs text-slate-500">
                                    Votre proposition a été envoyée sur le bureau des managers.
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

                                {/* Type selector */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                                        Type de remontée
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { id: "IMPROVEMENT", label: "💡 Amélioration", desc: "Idée pour aller plus vite" },
                                            { id: "BUG", label: "🔧 Problème", desc: "Bouton ou bug d'affichage" },
                                            { id: "MISSING_DATA", label: "📁 Donnée manquante", desc: "LinkedIn, info, champ" },
                                            { id: "OTHER", label: "💬 Autre", desc: "Question ou remarque" },
                                        ].map((t) => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => setType(t.id as any)}
                                                className={`p-2.5 rounded-xl text-left border transition-all ${
                                                    type === t.id
                                                        ? "border-amber-500 bg-amber-50/70 text-amber-900 font-semibold"
                                                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                                                }`}
                                            >
                                                <div className="text-xs">{t.label}</div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">{t.desc}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Title */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                        Titre court
                                    </label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="Ex: Ajouter le site web sous le téléphone..."
                                        maxLength={100}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                        required
                                    />
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                        Détails de la suggestion
                                    </label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Décrivez votre idée ou le problème rencontré sur le terrain..."
                                        rows={4}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
                                        required
                                    />
                                </div>

                                {/* Urgency & Actions */}
                                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600">
                                        <input
                                            type="checkbox"
                                            checked={urgency === "URGENT"}
                                            onChange={(e) => setUrgency(e.target.checked ? "URGENT" : "NORMAL")}
                                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                        />
                                        <span>Bloquant / Urgent</span>
                                    </label>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsOpen(false)}
                                            disabled={submitting}
                                            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors"
                                        >
                                            Annuler
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submitting || !title.trim() || !description.trim()}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow transition-colors"
                                        >
                                            <Send className="w-3.5 h-3.5" />
                                            <span>{submitting ? "Envoi..." : "Envoyer"}</span>
                                        </button>
                                    </div>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
