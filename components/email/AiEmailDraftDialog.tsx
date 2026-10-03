"use client";

import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { X, Loader2, AlertCircle, Copy, Check, RefreshCw } from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";

// Basic HTML sanitization for preview
function sanitizeHtml(html: string): string {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
        .replace(/on\w+\s*=\s*'[^']*'/gi, "")
        .replace(/on\w+\s*=\s*[^\s>]*/gi, "")
        .replace(/javascript\s*:/gi, "");
}

// ============================================
// TYPES
// ============================================

export interface AiEmailDraftDialogProps {
    open: boolean;
    onClose: () => void;
    onInsert: (html: string) => void;
    subject?: string;
}

// ============================================
// TONE OPTIONS
// ============================================

const TONES = [
    { id: "professional", label: "Professionnel" },
    { id: "friendly", label: "Amical" },
    { id: "formal", label: "Formel" },
    { id: "concise", label: "Concis" },
    { id: "persuasive", label: "Persuasif" },
] as const;

type ToneId = (typeof TONES)[number]["id"];

// ============================================
// AI EMAIL DRAFT DIALOG
// ============================================

export function AiEmailDraftDialog({
    open,
    onClose,
    onInsert,
    subject,
}: AiEmailDraftDialogProps) {
    const [instruction, setInstruction] = useState("");
    const [selectedTone, setSelectedTone] = useState<ToneId>("professional");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [bodyHtml, setBodyHtml] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleGenerate = useCallback(async () => {
        const trimmed = instruction.trim();
        if (!trimmed) return;

        setIsLoading(true);
        setError(null);
        setBodyHtml(null);
        setCopied(false);

        try {
            const toneLabel = TONES.find(t => t.id === selectedTone)?.label || "professionnel";
            const enhancedInstruction = `${trimmed}\n\nTon: ${toneLabel}`;

            const res = await fetch("/api/ai/mistral/email-draft", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instruction: enhancedInstruction,
                    subject: subject || undefined,
                }),
            });

            const json = await res.json();

            if (json.success && json.data?.bodyHtml) {
                setBodyHtml(json.data.bodyHtml);
            } else {
                setError(json.error || "Erreur lors de la génération. Réessayez.");
            }
        } catch {
            setError("Erreur de connexion. Vérifiez votre réseau.");
        } finally {
            setIsLoading(false);
        }
    }, [instruction, selectedTone, subject]);

    const handleRegenerate = () => {
        handleGenerate();
    };

    const handleCopy = async () => {
        if (!bodyHtml) return;
        try {
            // Extract text from HTML for clipboard
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = bodyHtml;
            const text = tempDiv.textContent || tempDiv.innerText || "";
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback: just ignore
        }
    };

    const handleInsert = () => {
        if (bodyHtml) {
            onInsert(bodyHtml);
            setBodyHtml(null);
            setInstruction("");
            setError(null);
            setCopied(false);
            onClose();
        }
    };

    const handleClose = () => {
        setInstruction("");
        setBodyHtml(null);
        setError(null);
        setCopied(false);
        onClose();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={handleClose}
            />
            <div
                className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-primary-600">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                            <AiMark className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-[15px] font-semibold text-white">Rédaction assistée par IA</h2>
                            <p className="text-[11px] text-white/70">Décrivez ce que vous voulez écrire</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                    >
                        <X className="w-4.5 h-4.5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 space-y-4">
                    {/* Instruction */}
                    <div>
                        <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">
                            Instructions
                        </label>
                        <textarea
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            placeholder="Ex. : proposer un rendez-vous la semaine prochaine pour présenter notre offre de services..."
                            className="w-full h-24 px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none transition-all"
                            disabled={isLoading}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                    e.preventDefault();
                                    handleGenerate();
                                }
                            }}
                        />
                    </div>

                    {/* Tone Selector */}
                    <div>
                        <label className="block text-[13px] font-semibold text-slate-700 mb-2">
                            Ton du message
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {TONES.map((tone) => (
                                <button
                                    key={tone.id}
                                    onClick={() => setSelectedTone(tone.id)}
                                    disabled={isLoading}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-all duration-150",
                                        selectedTone === tone.id
                                            ? "bg-primary-50 border-primary-300 text-primary-700 shadow-sm"
                                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300",
                                        isLoading && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    {tone.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl">
                            <AlertCircle className="w-4.5 h-4.5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-[13px] text-red-700 font-medium">{error}</p>
                            </div>
                            <button
                                onClick={() => setError(null)}
                                className="text-red-400 hover:text-red-600 flex-shrink-0"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    {/* Generate Button */}
                    {!bodyHtml && (
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-400">
                                Ctrl+Entrée pour générer
                            </span>
                            <button
                                onClick={handleGenerate}
                                disabled={isLoading || !instruction.trim()}
                                className={cn(
                                    "flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200",
                                    isLoading || !instruction.trim()
                                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                        : "bg-primary-600 text-white hover:bg-primary-500"
                                )}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Génération...
                                    </>
                                ) : (
                                    <>
                                        <AiMark className="w-4 h-4" />
                                        Générer
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Preview */}
                    {bodyHtml && (
                        <div className="space-y-3 animate-in slide-in-from-bottom-3 fade-in duration-300">
                            <div className="border-t border-slate-200 pt-4">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                        Aperçu
                                    </p>
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={handleCopy}
                                            className={cn(
                                                "flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] font-medium transition-all",
                                                copied
                                                    ? "bg-emerald-50 text-emerald-600"
                                                    : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                            )}
                                            title="Copier le texte"
                                        >
                                            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                            {copied ? "Copié" : "Copier"}
                                        </button>
                                        <button
                                            onClick={handleRegenerate}
                                            disabled={isLoading}
                                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] font-medium bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all disabled:opacity-50"
                                            title="Régénérer"
                                        >
                                            <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
                                            Régénérer
                                        </button>
                                    </div>
                                </div>
                                <div
                                    className="min-h-[100px] max-h-[200px] overflow-y-auto p-4 rounded-xl border border-slate-200 bg-slate-50/50 prose prose-sm prose-slate max-w-none text-slate-700 email-scrollbar"
                                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(bodyHtml) }}
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 justify-end pt-1">
                                <button
                                    onClick={handleClose}
                                    className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={handleInsert}
                                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-primary-600 text-white hover:bg-primary-500 rounded-xl transition-colors"
                                >
                                    <Check className="w-4 h-4" />
                                    Insérer dans l&apos;email
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AiEmailDraftDialog;
