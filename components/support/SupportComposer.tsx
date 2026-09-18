"use client";

import { useEffect, useRef } from "react";
import { SUP_LIGHT } from "./supportStyles";
import { INTENT_CARD_CONFIG } from "@/lib/support/constants";
import { SupportMeetingTags } from "./SupportMeetingTags";
import { SupportQuickReplies } from "./SupportQuickReplies";
import { SupportAttachButton, SupportAttachmentPreviews } from "./SupportAttachments";
import type { SupportIntent } from "@/lib/support/types";

const T = SUP_LIGHT;

interface SupportComposerProps {
    inputValue: string;
    onInputChange: (val: string) => void;
    selectedIntent: SupportIntent | null;
    onRemoveIntent: () => void;
    attachedRdvRefs: string[];
    onAddRdvRef: (label: string) => void;
    onRemoveRdvRef: (label: string) => void;
    quickRepliesOpen: boolean;
    onToggleQuickReplies: () => void;
    onCloseQuickReplies: () => void;
    onSelectQuickReply: (text: string) => void;
    attachments: any;
    canSend: boolean;
    isSending: boolean;
    onSend: () => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    emailNotif: boolean;
    onToggleEmailNotif: () => void;
}

export function SupportComposer({
    inputValue,
    onInputChange,
    selectedIntent,
    onRemoveIntent,
    attachedRdvRefs,
    onAddRdvRef,
    onRemoveRdvRef,
    quickRepliesOpen,
    onToggleQuickReplies,
    onCloseQuickReplies,
    onSelectQuickReply,
    attachments,
    canSend,
    isSending,
    onSend,
    onKeyDown,
    emailNotif,
    onToggleEmailNotif,
}: SupportComposerProps) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    // Auto-resize textarea smoothly
    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = "auto";
        ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    }, [inputValue]);

    const activeIntentConfig = selectedIntent ? INTENT_CARD_CONFIG[selectedIntent] : null;

    return (
        <div
            style={{
                borderTop: `1px solid ${T.lineSoft}`,
                padding: "12px 14px",
                background: T.paperRaised,
                flexShrink: 0,
            }}
        >
            {/* Active Intent Chip */}
            {activeIntentConfig && (
                <div
                    style={{
                        marginBottom: 8,
                        animation: "cpSupSlideDown 0.2s ease both",
                    }}
                >
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "3px 9px",
                            borderRadius: 999,
                            background: activeIntentConfig.bg,
                            border: `1px solid ${activeIntentConfig.border}`,
                            color: activeIntentConfig.color,
                            fontSize: 11.5,
                            fontWeight: 600,
                        }}
                    >
                        <span>{activeIntentConfig.icon}</span>
                        <span>{activeIntentConfig.label}</span>
                        <button
                            type="button"
                            onClick={onRemoveIntent}
                            aria-label="Retirer la catégorie"
                            style={{
                                background: "none",
                                border: "none",
                                color: activeIntentConfig.color,
                                cursor: "pointer",
                                fontSize: 12,
                                padding: "0 2px",
                            }}
                        >
                            ✕
                        </button>
                    </span>
                </div>
            )}

            {/* Upcoming meeting quick tags for RDV intent */}
            {selectedIntent === "RDV" && (
                <SupportMeetingTags
                    attachedRefs={attachedRdvRefs}
                    onAddRef={onAddRdvRef}
                    onRemoveRef={onRemoveRdvRef}
                />
            )}

            {/* Attachments preview */}
            <SupportAttachmentPreviews
                pending={attachments.pending}
                onRemove={attachments.remove}
                theme="light"
            />

            {/* Quick replies panel */}
            {quickRepliesOpen && (
                <SupportQuickReplies
                    onSelect={onSelectQuickReply}
                    onClose={onCloseQuickReplies}
                />
            )}

            {/* Input Row */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <button
                    type="button"
                    onClick={onToggleQuickReplies}
                    title="Réponses rapides"
                    aria-label="Afficher les réponses rapides"
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: T.radiusS,
                        flexShrink: 0,
                        background: quickRepliesOpen ? T.brandSoft : T.paperSunken,
                        border: `1px solid ${quickRepliesOpen ? "rgba(99,102,241,0.28)" : T.line}`,
                        color: quickRepliesOpen ? T.brandStrong : T.ink3,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 16,
                        transition: "all 150ms ease",
                    }}
                >
                    ⚡
                </button>

                <SupportAttachButton
                    onFiles={attachments.addFiles}
                    disabled={isSending}
                    theme="light"
                />

                <div
                    style={{
                        flex: 1,
                        borderRadius: T.radiusS,
                        background: T.paperSunken,
                        border: `1px solid ${T.line}`,
                        padding: "8px 12px",
                        display: "flex",
                        alignItems: "center",
                    }}
                >
                    <textarea
                        ref={textareaRef}
                        className="cp-sup-composer-input cp-sup-scroll-hidden"
                        value={inputValue}
                        onChange={(e) => onInputChange(e.target.value)}
                        onKeyDown={onKeyDown}
                        onPaste={attachments.handlePaste}
                        placeholder={
                            selectedIntent === "RDV"
                                ? "Précisez votre question sur ce rendez-vous..."
                                : "Écrivez votre message..."
                        }
                        rows={1}
                        aria-label="Message de support"
                        style={{
                            width: "100%",
                            background: "transparent",
                            border: "none",
                            resize: "none",
                            color: T.ink,
                            fontSize: 13.5,
                            fontFamily: "inherit",
                            lineHeight: 1.5,
                            maxHeight: 120,
                            overflowY: "auto",
                        }}
                    />
                </div>

                <button
                    type="button"
                    onClick={onSend}
                    disabled={!canSend}
                    aria-label="Envoyer le message"
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: T.radiusS,
                        flexShrink: 0,
                        background: canSend
                            ? `linear-gradient(135deg, ${T.brand}, ${T.brandStrong})`
                            : T.paperSunken,
                        border: canSend ? "none" : `1px solid ${T.line}`,
                        color: canSend ? "#FFFFFF" : T.ink4,
                        cursor: canSend ? "pointer" : "not-allowed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 200ms cubic-bezier(.34,1.56,.64,1)",
                        transform: canSend ? "scale(1)" : "scale(0.95)",
                        boxShadow: canSend ? "0 4px 12px rgba(99,102,241,0.25)" : "none",
                    }}
                >
                    {isSending ? (
                        <span
                            style={{
                                width: 14,
                                height: 14,
                                border: "2px solid #FFFFFF",
                                borderTopColor: "transparent",
                                borderRadius: "50%",
                                animation: "cpSupSpin 0.8s linear infinite",
                            }}
                        />
                    ) : (
                        <svg
                            width={16}
                            height={16}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M22 2 11 13" />
                            <path d="M22 2 15 22 11 13 2 9l20-7z" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Footer hints & Email checkbox */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 8,
                    gap: 8,
                }}
            >
                <p
                    className="cp-support-root-mono"
                    style={{
                        fontSize: 10.5,
                        color: T.ink4,
                        fontWeight: 500,
                        letterSpacing: "0.02em",
                        margin: 0,
                    }}
                >
                    {attachments.isUploading
                        ? "Envoi de l'image…"
                        : "Entrée pour envoyer · Maj+Entrée saut de ligne"}
                </p>
                <label
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        cursor: "pointer",
                        flexShrink: 0,
                    }}
                >
                    <input
                        type="checkbox"
                        checked={emailNotif}
                        onChange={onToggleEmailNotif}
                        style={{ cursor: "pointer", accentColor: T.brand }}
                    />
                    <span
                        style={{
                            fontSize: 10.5,
                            color: T.ink3,
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                        }}
                    >
                        M&apos;avertir par email
                    </span>
                </label>
            </div>
        </div>
    );
}
