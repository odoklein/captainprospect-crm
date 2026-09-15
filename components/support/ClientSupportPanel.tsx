"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { SUP_LIGHT } from "./supportStyles";
import { AvatarRing, SupportBubble, SupportTypingIndicator } from "./SupportBubble";
import {
    SupportAttachButton,
    SupportAttachmentPreviews,
    useSupportAttachments,
} from "./SupportAttachments";
import { SUPPORT_INTENTS } from "@/lib/support/types";
import type {
    SupportConversationDetailDTO,
    SupportIntent,
    SupportMessageContext,
    SupportMessageDTO,
} from "@/lib/support/types";

const QUICK_REPLIES: string[] = [
    "Merci pour le suivi.",
    "Pouvez-vous me rappeler demain ?",
    "J'ai bien reçu le document, merci !",
    "Pouvez-vous m'envoyer un rapport détaillé ?",
    "Quand aura lieu la prochaine mise à jour ?",
];

const PAGE_LABELS: Record<string, string> = {
    "/client/portal": "Tableau de bord",
    "/client/portal/meetings": "Mes RDV",
    "/client/portal/reporting": "Rapports",
    "/client/portal/activite": "Activité",
    "/client/contact": "Messages",
    "/client/portal/email": "Mon Email",
    "/client/portal/database": "Base de données",
    "/client/portal/files": "Fichiers",
    "/client/portal/sales-playbook": "Sales Playbook",
    "/client/portal/aide": "Aide",
    "/client/portal/settings": "Paramètres",
};

function currentPageLabel(pathname: string | null): string {
    if (!pathname) return "Portail client";
    const exact = PAGE_LABELS[pathname];
    if (exact) return exact;
    const prefix = Object.keys(PAGE_LABELS)
        .filter((k) => pathname.startsWith(k))
        .sort((a, b) => b.length - a.length)[0];
    return prefix ? PAGE_LABELS[prefix] : "Portail client";
}

const T = SUP_LIGHT;

const INTENT_STYLES: Record<
    SupportIntent,
    { color: string; bg: string; border: string; icon: string; label: string }
> = {
    RDV: {
        color: "#4F46E5",
        bg: "#ECE8FF",
        border: "rgba(99,102,241,0.25)",
        icon: "📅",
        label: "Question RDV",
    },
    RAPPORT: {
        color: "#155B7A",
        bg: "#E4EEF4",
        border: "rgba(21,91,122,0.18)",
        icon: "📊",
        label: "Rapport",
    },
    PROBLEME: {
        color: "#8A4A00",
        bg: T.accentAmberSoft,
        border: "rgba(201,123,42,0.22)",
        icon: "🔧",
        label: "Problème",
    },
    AUTRE: {
        color: "#2B3A2B",
        bg: "#EFEEE7",
        border: "rgba(43,58,43,0.14)",
        icon: "💬",
        label: "Autre",
    },
};

interface ClientSupportPanelProps {
    conversation: SupportConversationDetailDTO;
    onClose: () => void;
    onConversationUpdate: (next: SupportConversationDetailDTO) => void;
    onManagerTypingChange?: (typing: boolean) => void;
}

interface UpcomingMeeting {
    id: string;
    label: string;
    date: string;
}

export function ClientSupportPanel({
    conversation,
    onClose,
    onConversationUpdate,
    onManagerTypingChange,
}: ClientSupportPanelProps) {
    const pathname = usePathname();
    const pageLabel = useMemo(() => currentPageLabel(pathname), [pathname]);

    const [inputValue, setInputValue] = useState("");
    const [emailNotif, setEmailNotif] = useState(conversation.emailNotificationOnReply);
    const [selectedIntent, setSelectedIntent] = useState<SupportIntent | null>(null);
    const [showIntentCard, setShowIntentCard] = useState(
        conversation.messageCount === 0 ||
            conversation.messages.every((m) => m.role !== "CLIENT"),
    );
    const [showContextBanner, setShowContextBanner] = useState(true);
    const [showQuickReplies, setShowQuickReplies] = useState(false);
    const [showResolvedHistory, setShowResolvedHistory] = useState(false);
    const [isManagerTyping, setIsManagerTyping] = useState(false);
    const [sending, setSending] = useState(false);
    const [newMessageCount, setNewMessageCount] = useState(0);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [upcoming, setUpcoming] = useState<UpcomingMeeting[]>([]);
    const [injectedContext, setInjectedContext] = useState<{
        pageLabel?: string;
        rdvRefs: string[];
    }>({ rdvRefs: [] });

    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const messages = conversation.messages;
    const isResolved = conversation.status === "RESOLVED";
    const managerOnline = true;
    const latestNewThreadMarkerIndex = [...messages]
        .map((m, idx) => ({ m, idx }))
        .reverse()
        .find(({ m }) =>
            m.role === "SYSTEM" &&
            m.context?.pathname === "client-new-thread",
        )?.idx ?? -1;
    const hasResolvedHistory = latestNewThreadMarkerIndex > 0;
    const visibleMessages = hasResolvedHistory && !showResolvedHistory
        ? messages.slice(latestNewThreadMarkerIndex)
        : messages;

    useEffect(() => {
        onManagerTypingChange?.(isManagerTyping);
    }, [isManagerTyping, onManagerTypingChange]);

    useEffect(() => {
        fetch("/api/support/conversation/read", { method: "POST" }).catch(() => undefined);
    }, []);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/support/upcoming-meetings")
            .then((r) => r.json())
            .then((json) => {
                if (cancelled || !json?.success) return;
                setUpcoming(json.data?.meetings ?? []);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, []);

    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        setIsAtBottom(atBottom);
        if (atBottom) setNewMessageCount(0);
    }, []);

    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = "auto";
        ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }, [inputValue]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        setNewMessageCount(0);
    };

    const attachments = useSupportAttachments({
        conversationId: conversation.id,
        disabled: sending,
    });

    // An image-only message is legitimate, but never send while an upload is
    // still running — the ids would not exist yet server-side.
    const canSend =
        (inputValue.trim().length > 0 || attachments.readyIds.length > 0) &&
        !sending &&
        !attachments.isUploading;

    const appendMessage = useCallback(
        (next: SupportMessageDTO) => {
            const updated: SupportConversationDetailDTO = {
                ...conversation,
                messages: [...conversation.messages, next],
                messageCount: conversation.messageCount + 1,
                lastMessageAt: next.createdAt,
                status: "ACTIVE",
                resolvedAt: null,
                resolvedBy: null,
            };
            onConversationUpdate(updated);
            if (isAtBottom) {
                setTimeout(
                    () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
                    40,
                );
            } else {
                setNewMessageCount((c) => c + 1);
            }
        },
        [conversation, isAtBottom, onConversationUpdate],
    );

    const handleSend = async () => {
        const text = inputValue.trim();
        const attachmentIds = attachments.readyIds;
        const sentAttachments = attachments.pending
            .filter((a) => a.status === "ready" && a.remote)
            .map((a) => a.remote!);
        if ((!text && attachmentIds.length === 0) || sending || attachments.isUploading) return;
        setSending(true);
        const optimistic: SupportMessageDTO = {
            id: `tmp-${Date.now()}`,
            conversationId: conversation.id,
            role: "CLIENT",
            content: text,
            intent: selectedIntent,
            context: null,
            author: null,
            attachments: sentAttachments,
            createdAt: new Date().toISOString(),
        };
        appendMessage(optimistic);
        setInputValue("");
        attachments.clear();
        setShowIntentCard(false);

        const ctx: SupportMessageContext = {
            pathname: pathname ?? undefined,
            pageLabel: injectedContext.pageLabel,
            rdvRefs:
                injectedContext.rdvRefs.length > 0 ? injectedContext.rdvRefs : undefined,
            intent: selectedIntent ?? undefined,
        };
        setInjectedContext({ rdvRefs: [] });
        setSelectedIntent(null);

        try {
            const res = await fetch("/api/support/conversation/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    content: text,
                    intent: selectedIntent ?? undefined,
                    context: ctx,
                    attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json?.success) {
                throw new Error(json?.error ?? "Impossible d'envoyer le message");
            }
            const saved = json.data as SupportMessageDTO;
            onConversationUpdate({
                ...conversation,
                messages: [
                    ...conversation.messages.filter((m) => m.id !== optimistic.id),
                    saved,
                ],
                messageCount: conversation.messageCount + 1,
                lastMessageAt: saved.createdAt,
                status: "ACTIVE",
                resolvedAt: null,
                resolvedBy: null,
            });

            setIsManagerTyping(true);
            setTimeout(() => setIsManagerTyping(false), 1600 + Math.random() * 1400);
        } catch (err) {
            const failureMsg: SupportMessageDTO = {
                id: `err-${Date.now()}`,
                conversationId: conversation.id,
                role: "SYSTEM",
                content:
                    err instanceof Error
                        ? err.message
                        : "Votre message n'a pas pu être envoyé. Veuillez réessayer.",
                intent: null,
                context: null,
                author: null,
                attachments: [],
                createdAt: new Date().toISOString(),
            };
            appendMessage(failureMsg);
        } finally {
            setSending(false);
            textareaRef.current?.focus();
        }
    };

    const handleIntentSelect = (intent: SupportIntent) => {
        setSelectedIntent(intent);
        setShowIntentCard(false);
        textareaRef.current?.focus();
    };

    const handleAddContext = () => {
        setInputValue((v) => v + (v ? " " : "") + `[📍 ${pageLabel}]`);
        setInjectedContext((c) => ({ ...c, pageLabel }));
        setShowContextBanner(false);
        textareaRef.current?.focus();
    };

    const handleMeetingTag = (m: UpcomingMeeting) => {
        const ref = `[@RDV:${m.label}]`;
        setInputValue((v) => v + (v ? " " : "") + ref);
        setInjectedContext((c) => ({
            ...c,
            rdvRefs: Array.from(new Set([...c.rdvRefs, m.label])),
        }));
        textareaRef.current?.focus();
    };

    const handleQuickReply = (reply: string) => {
        setInputValue(reply);
        setShowQuickReplies(false);
        textareaRef.current?.focus();
    };

    const handleEmailNotifToggle = async () => {
        const next = !emailNotif;
        setEmailNotif(next);
        try {
            await fetch("/api/support/conversation/email-notification", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: next }),
            });
        } catch {
            setEmailNotif(!next);
        }
    };

    const handleReopen = async () => {
        try {
            const res = await fetch("/api/support/conversation/reopen", {
                method: "POST",
            });
            if (!res.ok) return;
            const detail = await fetch("/api/support/conversation").then((r) => r.json());
            if (detail?.success) {
                onConversationUpdate(detail.data);
                setShowResolvedHistory(false);
            }
        } catch {
            // ignore
        }
    };

    const lastClientMessage = [...visibleMessages].reverse().find((m) => m.role === "CLIENT");

    return (
        <div
            className="cp-support-root"
            role="dialog"
            aria-label="Panneau de support"
            style={{
                position: "fixed",
                bottom: 96,
                right: 24,
                zIndex: 99,
                width: 420,
                maxWidth: "calc(100vw - 32px)",
                height: 640,
                maxHeight: "calc(100vh - 128px)",
                borderRadius: T.radiusXL,
                overflow: "hidden",
                background: T.paper,
                border: `1px solid ${T.line}`,
                boxShadow: T.shadowPanel,
                display: "flex",
                flexDirection: "column",
                animation: "cpSupPanelIn 0.35s cubic-bezier(.34,1.4,.64,1) both",
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    borderBottom: `1px solid ${T.line}`,
                    background: T.paperRaised,
                    flexShrink: 0,
                }}
            >
                <AvatarRing
                    name="Équipe support"
                    size={40}
                    status={managerOnline ? "online" : "away"}
                    theme="light"
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                        style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: T.ink,
                            lineHeight: 1.2,
                            letterSpacing: "-0.01em",
                        }}
                    >
                        Équipe support Captain Prospect
                    </div>
                    <div
                        style={{
                            fontSize: 11.5,
                            color: managerOnline ? T.brandStrong : T.accentAmber,
                            marginTop: 2,
                            fontWeight: 500,
                        }}
                    >
                        {managerOnline ? "● En ligne · " : "◌ "}Répond en quelques minutes
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Fermer le panneau"
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: T.radiusS,
                        background: T.paperSunken,
                        border: `1px solid ${T.line}`,
                        color: T.ink3,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 16,
                        transition: "all 150ms ease",
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = T.brandSoft;
                        e.currentTarget.style.color = T.brandStrong;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = T.paperSunken;
                        e.currentTarget.style.color = T.ink3;
                    }}
                >
                    ✕
                </button>
            </div>

            {/* Messages area */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="cp-sup-scroll-hidden"
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "16px",
                    position: "relative",
                    background: isResolved ? "rgba(124,92,252,0.05)" : T.paper,
                    transition: "background 0.5s ease",
                }}
            >
                {showContextBanner && !isResolved && (
                    <div
                        style={{
                            margin: "0 0 12px",
                            padding: "10px 14px",
                            borderRadius: T.radiusS,
                            border: `1px solid rgba(201,123,42,0.22)`,
                            background: T.accentAmberSoft,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            animation: "cpSupSlideDown 0.3s ease both",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                minWidth: 0,
                            }}
                        >
                            <span style={{ fontSize: 14 }}>📍</span>
                            <span
                                style={{
                                    fontSize: 12,
                                    color: "#8A4A00",
                                    fontWeight: 500,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                Vous consultez : {pageLabel}
                            </span>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button
                                type="button"
                                onClick={handleAddContext}
                                style={{
                                    padding: "3px 10px",
                                    borderRadius: 999,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: "#FDE9CA",
                                    border: "1px solid rgba(201,123,42,0.3)",
                                    color: "#8A4A00",
                                    cursor: "pointer",
                                }}
                            >
                                + Ajouter
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowContextBanner(false)}
                                aria-label="Fermer le bandeau"
                                style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: 6,
                                    fontSize: 11,
                                    background: "transparent",
                                    border: "none",
                                    color: T.ink3,
                                    cursor: "pointer",
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}

                {hasResolvedHistory && (
                    <div
                        style={{
                            margin: "0 0 12px",
                            padding: "10px 12px",
                            borderRadius: T.radiusS,
                            border: `1px solid ${T.line}`,
                            background: T.paperRaised,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            animation: "cpSupSlideDown 0.2s ease both",
                        }}
                    >
                        <span style={{ fontSize: 12, color: T.ink3 }}>
                            {showResolvedHistory
                                ? "Tickets précédents affichés"
                                : "Tickets précédents masqués"}
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowResolvedHistory((v) => !v)}
                            style={{
                                padding: "4px 10px",
                                borderRadius: 999,
                                fontSize: 11.5,
                                fontWeight: 600,
                                background: T.brandSoft,
                                border: `1px solid rgba(99,102,241,0.2)`,
                                color: T.brandStrong,
                                cursor: "pointer",
                            }}
                        >
                            {showResolvedHistory ? "Masquer" : "Voir l'historique"}
                        </button>
                    </div>
                )}

                {visibleMessages.map((msg) => (
                    <SupportBubble
                        key={msg.id}
                        message={msg}
                        viewpoint="client"
                        theme="light"
                        isLast={lastClientMessage?.id === msg.id}
                        seen={!msg.id.startsWith("tmp-")}
                    />
                ))}

                {showIntentCard && !isResolved && (
                    <div
                        style={{
                            margin: "8px 0 12px",
                            padding: 16,
                            borderRadius: T.radiusM,
                            border: `1px solid ${T.line}`,
                            background: T.paperRaised,
                            boxShadow: "0 1px 2px rgba(31,43,31,0.04)",
                            animation: "cpSupBubbleIn 0.3s ease both",
                        }}
                    >
                        <p
                            style={{
                                fontSize: 11,
                                color: T.ink3,
                                marginBottom: 12,
                                fontWeight: 600,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                            }}
                        >
                            Que puis-je faire pour vous ?
                        </p>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: 8,
                            }}
                        >
                            {SUPPORT_INTENTS.map((intent) => {
                                const style = INTENT_STYLES[intent.id];
                                return (
                                    <button
                                        key={intent.id}
                                        type="button"
                                        onClick={() => handleIntentSelect(intent.id)}
                                        style={{
                                            padding: "10px 12px",
                                            borderRadius: T.radiusS,
                                            background: style.bg,
                                            border: `1px solid ${style.border}`,
                                            color: style.color,
                                            cursor: "pointer",
                                            textAlign: "left",
                                            fontSize: 13,
                                            fontWeight: 600,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                            transition: "all 150ms ease",
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = "translateY(-1px)";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = "translateY(0)";
                                        }}
                                    >
                                        <span style={{ fontSize: 16 }}>{style.icon}</span>
                                        <span>{style.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {isManagerTyping && !isResolved && (
                    <SupportTypingIndicator name="Équipe support" theme="light" />
                )}

                <div ref={messagesEndRef} />

                {newMessageCount > 0 && !isAtBottom && (
                    <div
                        style={{
                            position: "sticky",
                            bottom: 0,
                            display: "flex",
                            justifyContent: "center",
                            pointerEvents: "none",
                        }}
                    >
                        <button
                            type="button"
                            onClick={scrollToBottom}
                            style={{
                                pointerEvents: "auto",
                                padding: "6px 14px",
                                borderRadius: 999,
                                background: `linear-gradient(135deg, ${T.brand}, ${T.brandStrong})`,
                                border: "none",
                                color: "#fff",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                boxShadow: "0 6px 14px rgba(99,102,241,0.25)",
                                animation: "cpSupBubbleIn 0.2s ease both",
                                whiteSpace: "nowrap",
                            }}
                        >
                            ⬇ {newMessageCount} nouveau{newMessageCount > 1 ? "x" : ""} message
                            {newMessageCount > 1 ? "s" : ""}
                        </button>
                    </div>
                )}
            </div>

            {/* Resolved banner */}
            {isResolved && (
                <div
                    style={{
                        padding: "12px 16px",
                        background: T.brandSoft,
                        borderTop: `1px solid rgba(99,102,241,0.2)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        animation: "cpSupSlideDown 0.3s ease both",
                        flexShrink: 0,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>✅</span>
                        <span style={{ fontSize: 13, color: T.brandStrong, fontWeight: 600 }}>
                            Conversation résolue
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={handleReopen}
                        style={{
                            padding: "4px 12px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            background: "#fff",
                            border: `1px solid ${T.brand}`,
                            color: T.brandStrong,
                            cursor: "pointer",
                        }}
                    >
                        Rouvrir
                    </button>
                </div>
            )}

            {/* Quick replies */}
            {showQuickReplies && !isResolved && (
                <div
                    style={{
                        borderTop: `1px solid ${T.lineSoft}`,
                        padding: "12px 16px",
                        background: T.paperSunken,
                        animation: "cpSupSlideUp 0.2s ease both",
                        flexShrink: 0,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 10,
                        }}
                    >
                        <span
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: T.ink3,
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                            }}
                        >
                            Réponses rapides
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowQuickReplies(false)}
                            style={{
                                background: "none",
                                border: "none",
                                color: T.ink3,
                                cursor: "pointer",
                                fontSize: 14,
                            }}
                        >
                            ✕
                        </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {QUICK_REPLIES.map((reply) => (
                            <button
                                key={reply}
                                type="button"
                                onClick={() => handleQuickReply(reply)}
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: T.radiusS,
                                    textAlign: "left",
                                    background: T.paperRaised,
                                    border: `1px solid ${T.line}`,
                                    color: T.ink2,
                                    fontSize: 13,
                                    cursor: "pointer",
                                    transition: "all 150ms ease",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = T.brandSofter;
                                    e.currentTarget.style.borderColor = "rgba(99,102,241,0.24)";
                                    e.currentTarget.style.color = T.ink;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = T.paperRaised;
                                    e.currentTarget.style.borderColor = T.line;
                                    e.currentTarget.style.color = T.ink2;
                                }}
                            >
                                {reply}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Composer */}
            {!isResolved && (
                <div
                    style={{
                        borderTop: `1px solid ${T.lineSoft}`,
                        padding: "12px 14px",
                        background: T.paperRaised,
                        flexShrink: 0,
                    }}
                >
                    {selectedIntent && (
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
                                    padding: "4px 10px",
                                    borderRadius: 999,
                                    background: INTENT_STYLES[selectedIntent].bg,
                                    border: `1px solid ${INTENT_STYLES[selectedIntent].border}`,
                                    color: INTENT_STYLES[selectedIntent].color,
                                    fontSize: 12,
                                    fontWeight: 600,
                                }}
                            >
                                {INTENT_STYLES[selectedIntent].icon} {INTENT_STYLES[selectedIntent].label}
                                <button
                                    type="button"
                                    onClick={() => setSelectedIntent(null)}
                                    aria-label="Retirer l'intention"
                                    style={{
                                        background: "none",
                                        border: "none",
                                        color: INTENT_STYLES[selectedIntent].color,
                                        cursor: "pointer",
                                        fontSize: 12,
                                        padding: 0,
                                        marginLeft: 2,
                                    }}
                                >
                                    ✕
                                </button>
                            </span>
                        </div>
                    )}

                    {selectedIntent === "RDV" && upcoming.length > 0 && (
                        <div
                            style={{
                                display: "flex",
                                gap: 6,
                                marginBottom: 8,
                                flexWrap: "wrap",
                                animation: "cpSupSlideDown 0.2s ease both",
                            }}
                        >
                            {upcoming.map((m) => (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => handleMeetingTag(m)}
                                    style={{
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                        fontSize: 11.5,
                                        fontWeight: 500,
                                        background: T.brandSofter,
                                        border: `1px solid rgba(99,102,241,0.22)`,
                                        color: T.brandStrong,
                                        cursor: "pointer",
                                    }}
                                >
                                    📅 {m.label}
                                </button>
                            ))}
                        </div>
                    )}

                    <SupportAttachmentPreviews
                        pending={attachments.pending}
                        onRemove={attachments.remove}
                        theme="light"
                    />

                    <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                        <button
                            type="button"
                            onClick={() => setShowQuickReplies((v) => !v)}
                            title="Réponses rapides"
                            aria-label="Afficher les réponses rapides"
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: T.radiusS,
                                flexShrink: 0,
                                background: showQuickReplies ? T.brandSoft : T.paperSunken,
                                border: `1px solid ${showQuickReplies ? "rgba(99,102,241,0.28)" : T.line}`,
                                color: showQuickReplies ? T.brandStrong : T.ink3,
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
                            disabled={sending}
                            theme="light"
                        />

                        <div
                            style={{
                                flex: 1,
                                borderRadius: T.radiusS,
                                background: T.paperSunken,
                                border: `1px solid ${T.line}`,
                                padding: "8px 12px",
                            }}
                        >
                            <textarea
                                ref={textareaRef}
                                className="cp-sup-composer-input cp-sup-scroll-hidden"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                onPaste={attachments.handlePaste}
                                placeholder={
                                    selectedIntent === "RDV"
                                        ? "Quel rendez-vous vous pose question ?"
                                        : "Écrivez votre message..."
                                }
                                rows={1}
                                aria-label="Message au support"
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
                            onClick={handleSend}
                            disabled={!canSend}
                            aria-label="Envoyer"
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: T.radiusS,
                                flexShrink: 0,
                                background: canSend
                                    ? `linear-gradient(135deg, ${T.brand}, ${T.brandStrong})`
                                    : T.paperSunken,
                                border: canSend ? "none" : `1px solid ${T.line}`,
                                color: canSend ? "#fff" : T.ink4,
                                cursor: canSend ? "pointer" : "not-allowed",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 200ms cubic-bezier(.34,1.56,.64,1)",
                                transform: canSend ? "scale(1)" : "scale(0.95)",
                                boxShadow: canSend
                                    ? "0 6px 14px rgba(99,102,241,0.25)"
                                    : "none",
                            }}
                        >
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
                        </button>
                    </div>

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
                                : "Entrée pour envoyer · Maj+Entrée pour saut de ligne"}
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
                                onChange={handleEmailNotifToggle}
                                style={{ cursor: "pointer", accentColor: T.brand }}
                            />
                            <span style={{ fontSize: 10.5, color: T.ink3, fontWeight: 500, whiteSpace: "nowrap" }}>
                                M'avertir par email
                            </span>
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}
