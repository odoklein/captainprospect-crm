"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Copy, Check, RefreshCw } from "lucide-react";
import { AiMark } from "@/components/ui/AiMark";
import { Button, Callout, Chip, Modal, ModalFooter, Textarea } from "@/components/ui";

// Basic HTML sanitization for the preview
function sanitizeHtml(html: string): string {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
        .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
        .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
        .replace(/javascript\s*:/gi, "");
}

// ============================================
// TYPES
// ============================================

/** What the AI knows about the conversation (all optional). */
export interface AiDraftContext {
    mode?: "new" | "reply" | "forward";
    /** Plain text of the message being answered. */
    lastMessage?: string;
    lastMessageFrom?: string;
    recipientName?: string;
    recipientTitle?: string;
    companyName?: string;
    missionName?: string;
    senderName?: string;
}

export interface AiEmailDraftDialogProps {
    open: boolean;
    onClose: () => void;
    onInsert: (html: string) => void;
    subject?: string;
    context?: AiDraftContext;
}

const TONES = [
    { id: "professional", label: "Professionnel" },
    { id: "friendly", label: "Chaleureux" },
    { id: "formal", label: "Formel" },
    { id: "concise", label: "Concis" },
    { id: "persuasive", label: "Persuasif" },
] as const;

type ToneId = (typeof TONES)[number]["id"];

const REPLY_SUGGESTIONS = [
    "Remercier et proposer deux créneaux de rendez-vous la semaine prochaine",
    "Répondre à sa question et relancer sur l'intérêt pour un échange",
    "Accuser réception et indiquer qu'on revient vers lui rapidement",
];

const NEW_SUGGESTIONS = [
    "Faire suite à notre appel et proposer un rendez-vous",
    "Envoyer une présentation courte de l'offre",
    "Relancer poliment sans réponse depuis une semaine",
];

// ============================================
// AI EMAIL DRAFT DIALOG
// ============================================

export function AiEmailDraftDialog({ open, onClose, onInsert, subject, context }: AiEmailDraftDialogProps) {
    const [instruction, setInstruction] = useState("");
    const [tone, setTone] = useState<ToneId>("professional");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [bodyHtml, setBodyHtml] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const isReply = context?.mode === "reply" && !!context.lastMessage;

    useEffect(() => {
        if (!open) return;
        setError(null);
        setBodyHtml(null);
        setCopied(false);
    }, [open]);

    const handleGenerate = useCallback(async () => {
        const trimmed = instruction.trim();
        if (!trimmed) return;
        setIsLoading(true);
        setError(null);
        setBodyHtml(null);
        setCopied(false);
        try {
            const toneLabel = TONES.find((t) => t.id === tone)?.label || "Professionnel";
            const res = await fetch("/api/ai/mistral/email-draft", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instruction: `${trimmed}\n\nTon : ${toneLabel}`,
                    subject: subject || undefined,
                    context: context
                        ? Object.fromEntries(Object.entries(context).filter(([, v]) => typeof v === "string" && v.trim() !== ""))
                        : undefined,
                }),
            });
            const json = await res.json();
            if (json.success && json.data?.bodyHtml) setBodyHtml(json.data.bodyHtml);
            else setError(json.error || "La génération a échoué. Réessayez.");
        } catch {
            setError("Erreur de connexion. Vérifiez votre réseau.");
        } finally {
            setIsLoading(false);
        }
    }, [instruction, tone, subject, context]);

    const handleCopy = async () => {
        if (!bodyHtml) return;
        try {
            const div = document.createElement("div");
            div.innerHTML = bodyHtml;
            await navigator.clipboard.writeText(div.innerText || div.textContent || "");
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // clipboard unavailable
        }
    };

    const reset = () => {
        setInstruction("");
        setBodyHtml(null);
        setError(null);
        setCopied(false);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleInsert = () => {
        if (!bodyHtml) return;
        onInsert(bodyHtml);
        reset();
        onClose();
    };

    const suggestions = isReply ? REPLY_SUGGESTIONS : NEW_SUGGESTIONS;

    return (
        <Modal
            isOpen={open}
            onClose={handleClose}
            title={isReply ? "Rédiger la réponse avec l'IA" : "Rédiger avec l'IA"}
            description={
                isReply
                    ? `L'IA lit le dernier message${context?.lastMessageFrom ? ` de ${context.lastMessageFrom}` : ""} et rédige une réponse selon vos consignes.`
                    : "Décrivez le message à écrire : l'IA rédige le corps, vous relisez avant d'insérer."
            }
            size="lg"
        >
            <div className="space-y-4">
                {(context?.recipientName || context?.companyName || context?.missionName) && (
                    <p className="text-xs text-ink-3">
                        Contexte transmis :{" "}
                        {[
                            context?.recipientName && `destinataire ${context.recipientName}`,
                            context?.companyName && `entreprise ${context.companyName}`,
                            context?.missionName && `mission ${context.missionName}`,
                        ]
                            .filter(Boolean)
                            .join(" · ")}
                    </p>
                )}

                <Textarea
                    label="Consignes"
                    rows={3}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder={isReply ? "Ex. : accepter le rendez-vous de jeudi et confirmer l'adresse" : "Ex. : proposer un rendez-vous la semaine prochaine pour présenter l'offre"}
                    disabled={isLoading}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            handleGenerate();
                        }
                    }}
                />

                {!instruction && !bodyHtml && (
                    <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((s) => (
                            <Chip key={s} onClick={() => setInstruction(s)} className="h-auto whitespace-normal py-1 text-left font-medium">
                                {s}
                            </Chip>
                        ))}
                    </div>
                )}

                <div>
                    <p className="mb-1.5 text-xs font-medium text-ink-2">Ton</p>
                    <div className="flex flex-wrap gap-1.5">
                        {TONES.map((t) => (
                            <Chip key={t.id} selected={tone === t.id} onClick={() => setTone(t.id)} disabled={isLoading}>
                                {t.label}
                            </Chip>
                        ))}
                    </div>
                </div>

                {error && <Callout tone="danger">{error}</Callout>}

                {bodyHtml && (
                    <div>
                        <div className="mb-1.5 flex items-center justify-between">
                            <p className="text-xs font-medium text-ink-2">Proposition</p>
                            <div className="flex items-center gap-1">
                                <Button size="xs" variant="ghost" leftIcon={copied ? <Check className="size-3" /> : <Copy className="size-3" />} onClick={handleCopy}>
                                    {copied ? "Copié" : "Copier"}
                                </Button>
                                <Button size="xs" variant="ghost" leftIcon={<RefreshCw className="size-3" />} onClick={handleGenerate} disabled={isLoading}>
                                    Régénérer
                                </Button>
                            </div>
                        </div>
                        <div
                            className="max-h-64 overflow-y-auto rounded-control border border-line bg-surface-2 p-3 text-sm leading-relaxed text-ink [&_p]:mb-2 email-scrollbar"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(bodyHtml) }}
                        />
                    </div>
                )}
            </div>

            <ModalFooter>
                <Button variant="ghost" onClick={handleClose}>Annuler</Button>
                {bodyHtml ? (
                    <Button onClick={handleInsert} leftIcon={<Check className="size-4" />}>Insérer dans l&apos;email</Button>
                ) : (
                    <Button
                        onClick={handleGenerate}
                        disabled={!instruction.trim()}
                        isLoading={isLoading}
                        leftIcon={!isLoading ? <AiMark className="size-4" /> : undefined}
                    >
                        Générer
                    </Button>
                )}
            </ModalFooter>
        </Modal>
    );
}

export default AiEmailDraftDialog;
