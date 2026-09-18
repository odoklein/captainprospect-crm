"use client";

import { useState, useRef, useEffect } from "react";
import { SUP_LIGHT } from "./supportStyles";
import { INTENT_CARD_CONFIG } from "@/lib/support/constants";
import { SupportAttachButton, SupportAttachmentPreviews, useSupportAttachments } from "./SupportAttachments";
import type { SupportIntent, SupportMessageContext } from "@/lib/support/types";

const T = SUP_LIGHT;

const PLACEHOLDER_BY_INTENT: Record<SupportIntent, string> = {
    RDV: "Ex: Demande de report pour le RDV de mardi avec la société...",
    RAPPORT: "Ex: Demande de point sur les performances et métriques de la mission...",
    PROBLEME: "Ex: Erreur constatée lors de l'accès aux fiches prospects...",
    AUTRE: "Ex: Précision sur les consignes de prospection...",
};

interface ClientSupportNewRequestViewProps {
    onSubmit: (data: {
        subject: string;
        content: string;
        intent?: SupportIntent;
        attachmentIds?: string[];
        context?: SupportMessageContext;
    }) => Promise<void>;
    onCancel: () => void;
    onClose: () => void;
    pageLabel?: string;
    prefillIntent?: SupportIntent;
}

export function ClientSupportNewRequestView({
    onSubmit,
    onCancel,
    onClose,
    pageLabel,
    prefillIntent,
}: ClientSupportNewRequestViewProps) {
    const [selectedIntent, setSelectedIntent] = useState<SupportIntent>(prefillIntent ?? "AUTRE");
    const [subject, setSubject] = useState("");
    const [content, setContent] = useState("");
    const [includeContext, setIncludeContext] = useState(Boolean(pageLabel));
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const attachments = useSupportAttachments({
        conversationId: null,
        disabled: submitting,
    });

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (prefillIntent) {
            setSelectedIntent(prefillIntent);
        }
    }, [prefillIntent]);

    useEffect(() => {
        textareaRef.current?.focus();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanContent = content.trim();
        if (!cleanContent && attachments.readyIds.length === 0) {
            setError("Veuillez formuler votre demande ou joindre une capture.");
            return;
        }

        setError(null);
        setSubmitting(true);
        try {
            await onSubmit({
                subject: subject.trim(),
                content: cleanContent,
                intent: selectedIntent,
                attachmentIds: attachments.readyIds.length > 0 ? attachments.readyIds : undefined,
                context: includeContext && pageLabel ? { pageLabel } : undefined,
            });
        } catch (err: any) {
            setError(err?.message || "Une erreur est survenue lors de l'envoi.");
            setSubmitting(false);
        }
    };

    const intentKeys = Object.keys(INTENT_CARD_CONFIG) as SupportIntent[];

    return (
        <div
            className="cp-support-root cp-support-panel-responsive"
            role="dialog"
            aria-modal="true"
            aria-label="Créer une nouvelle demande"
            style={{
                position: "fixed",
                bottom: 96,
                right: 24,
                width: 420,
                maxWidth: "calc(100vw - 32px)",
                height: 600,
                maxHeight: "calc(100vh - 120px)",
                borderRadius: T.radiusL,
                background: T.paper,
                boxShadow: T.shadowPanel,
                border: `1px solid ${T.line}`,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                zIndex: 99,
                animation: "cpSupPanelIn 0.35s cubic-bezier(.34,1.4,.64,1) both",
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    borderBottom: `1px solid ${T.line}`,
                    background: T.paperRaised,
                    flexShrink: 0,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={submitting}
                        style={{
                            background: T.paperSunken,
                            border: `1px solid ${T.line}`,
                            borderRadius: T.radiusS,
                            padding: "4px 8px",
                            color: T.ink2,
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                        }}
                    >
                        ← Retour
                    </button>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>
                        Nouvelle demande
                    </span>
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Fermer"
                    style={{
                        width: 30,
                        height: 30,
                        borderRadius: T.radiusS,
                        background: T.paperSunken,
                        border: `1px solid ${T.line}`,
                        color: T.ink3,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                    }}
                >
                    ✕
                </button>
            </div>

            {/* Form */}
            <form
                onSubmit={handleSubmit}
                className="cp-support-scroll"
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                }}
            >
                {/* Category Selection */}
                <div>
                    <label
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: T.ink3,
                            display: "block",
                            marginBottom: 8,
                        }}
                    >
                        Catégorie de la demande
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {intentKeys.map((id) => {
                            const card = INTENT_CARD_CONFIG[id];
                            const isSelected = selectedIntent === id;
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setSelectedIntent(id)}
                                    style={{
                                        padding: "10px",
                                        borderRadius: T.radiusS,
                                        background: isSelected ? card.bg : T.paperRaised,
                                        border: isSelected
                                            ? `2px solid ${card.color}`
                                            : `1px solid ${T.line}`,
                                        textAlign: "left",
                                        cursor: "pointer",
                                        transition: "all 150ms ease",
                                        boxShadow: isSelected ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ fontSize: 15 }}>{card.icon}</span>
                                            <span
                                                style={{
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    color: isSelected ? card.color : T.ink,
                                                }}
                                            >
                                                {card.label}
                                            </span>
                                        </div>
                                        {isSelected && (
                                            <span style={{ color: card.color, fontSize: 11, fontWeight: 700 }}>✓</span>
                                        )}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 10.5,
                                            color: T.ink3,
                                            marginTop: 3,
                                            lineHeight: 1.3,
                                        }}
                                    >
                                        {card.desc}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Subject / Objet */}
                <div>
                    <label
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: T.ink3,
                            display: "block",
                            marginBottom: 6,
                        }}
                    >
                        Objet de votre demande <span style={{ color: T.ink4, fontWeight: 400 }}>(optionnel)</span>
                    </label>
                    <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder={PLACEHOLDER_BY_INTENT[selectedIntent]}
                        maxLength={120}
                        style={{
                            width: "100%",
                            padding: "9px 12px",
                            borderRadius: T.radiusS,
                            border: `1px solid ${T.line}`,
                            background: T.paperRaised,
                            color: T.ink,
                            fontSize: 13,
                            outline: "none",
                            boxSizing: "border-box",
                        }}
                    />
                </div>

                {/* Message Content */}
                <div>
                    <label
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: T.ink3,
                            display: "block",
                            marginBottom: 6,
                        }}
                    >
                        Message détaillé *
                    </label>
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Décrivez votre besoin ou votre question avec le plus de précisions possible..."
                        rows={4}
                        style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: T.radiusS,
                            border: `1px solid ${T.line}`,
                            background: T.paperRaised,
                            color: T.ink,
                            fontSize: 13,
                            lineHeight: 1.5,
                            resize: "vertical",
                            outline: "none",
                            boxSizing: "border-box",
                            fontFamily: "inherit",
                        }}
                    />
                </div>

                {/* Context Attachment checkbox if pageLabel exists */}
                {pageLabel && (
                    <label
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 12px",
                            borderRadius: T.radiusS,
                            background: T.paperSunken,
                            border: `1px solid ${T.line}`,
                            cursor: "pointer",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={includeContext}
                            onChange={(e) => setIncludeContext(e.target.checked)}
                            style={{ accentColor: T.brand }}
                        />
                        <span style={{ fontSize: 12, color: T.ink2 }}>
                            Joindre le contexte de ma page actuelle : <strong>{pageLabel}</strong>
                        </span>
                    </label>
                )}

                {/* Attachments */}
                <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <label
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                color: T.ink3,
                            }}
                        >
                            Captures d&apos;écran / Fichiers
                        </label>
                        <SupportAttachButton onFiles={attachments.addFiles} disabled={submitting} theme="light" />
                    </div>

                    <SupportAttachmentPreviews
                        pending={attachments.pending}
                        onRemove={attachments.remove}
                        theme="light"
                    />
                </div>

                {error && (
                    <div
                        style={{
                            padding: "8px 12px",
                            borderRadius: T.radiusS,
                            background: T.dangerSoft,
                            border: "1px solid rgba(178,59,59,0.25)",
                            color: T.danger,
                            fontSize: 12,
                            fontWeight: 600,
                        }}
                    >
                        {error}
                    </div>
                )}

                {/* Service Promise Notice */}
                <div
                    style={{
                        padding: "8px 12px",
                        borderRadius: T.radiusS,
                        background: T.brandSofter,
                        border: "1px solid rgba(99,102,241,0.2)",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <span style={{ fontSize: 14 }}>⚡</span>
                    <span style={{ fontSize: 11.5, color: T.brandStrong, fontWeight: 500, lineHeight: 1.3 }}>
                        Prise en charge directe par l&apos;équipe des managers. Un accusé de réception automatique vous confirme la création du ticket.
                    </span>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, marginTop: "auto", paddingTop: 8 }}>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={submitting}
                        style={{
                            padding: "8px 14px",
                            borderRadius: T.radiusS,
                            background: T.paperSunken,
                            border: `1px solid ${T.line}`,
                            color: T.ink2,
                            fontSize: 12.5,
                            fontWeight: 600,
                            cursor: "pointer",
                        }}
                    >
                        Annuler
                    </button>

                    <button
                        type="submit"
                        disabled={submitting || attachments.isUploading}
                        style={{
                            padding: "8px 18px",
                            borderRadius: T.radiusS,
                            background: `linear-gradient(135deg, ${T.brand}, ${T.brandStrong})`,
                            border: "none",
                            color: "#FFFFFF",
                            fontSize: 12.5,
                            fontWeight: 700,
                            cursor: submitting || attachments.isUploading ? "not-allowed" : "pointer",
                            opacity: submitting || attachments.isUploading ? 0.6 : 1,
                            boxShadow: "0 2px 8px rgba(79,70,229,0.25)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                        }}
                    >
                        {submitting ? (
                            <>
                                <span
                                    style={{
                                        width: 12,
                                        height: 12,
                                        border: "2px solid #fff",
                                        borderTopColor: "transparent",
                                        borderRadius: "50%",
                                        animation: "cpSupSpin 0.8s linear infinite",
                                    }}
                                />
                                <span>Création en cours…</span>
                            </>
                        ) : (
                            <span>Envoyer la demande</span>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
