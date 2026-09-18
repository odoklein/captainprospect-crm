"use client";

import { useMemo } from "react";
import { SUP_LIGHT } from "./supportStyles";
import { SupportBubble, SupportTypingIndicator } from "./SupportBubble";
import { SupportIntentSelector } from "./SupportIntentSelector";
import type { SupportMessageDTO, SupportIntent } from "@/lib/support/types";

const T = SUP_LIGHT;

function formatDayDivider(isoString: string): string {
    const d = new Date(isoString);
    const today = new Date();
    const isToday =
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear();

    if (isToday) return "Aujourd'hui";

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const isYesterday =
        d.getDate() === yesterday.getDate() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getFullYear() === yesterday.getFullYear();

    if (isYesterday) return "Hier";

    return d.toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
    });
}

function shouldGroupWithPrevious(
    current: SupportMessageDTO,
    previous: SupportMessageDTO | undefined,
): boolean {
    if (!previous) return false;
    if (current.role === "SYSTEM" || previous.role === "SYSTEM") return false;
    if (current.role !== previous.role) return false;
    if (current.author?.id !== previous.author?.id) return false;

    const diffMs =
        new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime();
    return diffMs < 2 * 60 * 1000; // within 2 minutes
}

interface SupportMessageListProps {
    messages: SupportMessageDTO[];
    isResolved: boolean;
    pageLabel?: string;
    showContextBanner?: boolean;
    onDismissContextBanner?: () => void;
    onAddContextTag?: () => void;
    showIntentSelector: boolean;
    onSelectIntent: (intent: SupportIntent) => void;
    scrollRef: React.RefObject<HTMLDivElement | null>;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    onScroll: () => void;
    unreadIncomingCount: number;
    scrollToBottom: () => void;
    isTyping?: boolean;
    typingAgentName?: string | null;
}

export function SupportMessageList({
    messages,
    isResolved,
    pageLabel,
    showContextBanner,
    onDismissContextBanner,
    onAddContextTag,
    showIntentSelector,
    onSelectIntent,
    scrollRef,
    messagesEndRef,
    onScroll,
    unreadIncomingCount,
    scrollToBottom,
    isTyping,
    typingAgentName,
}: SupportMessageListProps) {
    const lastClientMessage = useMemo(() => {
        return [...messages].reverse().find((m) => m.role === "CLIENT");
    }, [messages]);

    return (
        <div
            ref={scrollRef}
            onScroll={onScroll}
            className="cp-support-scroll"
            style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px",
                position: "relative",
                background: isResolved ? "rgba(124,92,252,0.04)" : T.paper,
                transition: "background 0.4s ease",
            }}
            role="log"
            aria-live="polite"
        >
            {/* Context Page Banner */}
            {showContextBanner && pageLabel && !isResolved && (
                <div
                    style={{
                        margin: "0 0 12px",
                        padding: "9px 12px",
                        borderRadius: T.radiusS,
                        border: "1px solid rgba(201,123,42,0.22)",
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
                            gap: 6,
                            minWidth: 0,
                        }}
                    >
                        <span style={{ fontSize: 13 }}>📍</span>
                        <span
                            style={{
                                fontSize: 12,
                                color: "#8A4A00",
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            Page : {pageLabel}
                        </span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {onAddContextTag && (
                            <button
                                type="button"
                                onClick={onAddContextTag}
                                style={{
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: "#FDE9CA",
                                    border: "1px solid rgba(201,123,42,0.3)",
                                    color: "#8A4A00",
                                    cursor: "pointer",
                                }}
                            >
                                + Joindre
                            </button>
                        )}
                        {onDismissContextBanner && (
                            <button
                                type="button"
                                onClick={onDismissContextBanner}
                                aria-label="Fermer le bandeau"
                                style={{
                                    width: 20,
                                    height: 20,
                                    borderRadius: 4,
                                    fontSize: 10,
                                    background: "transparent",
                                    border: "none",
                                    color: T.ink3,
                                    cursor: "pointer",
                                }}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Messages with Day Dividers and Grouping */}
            {messages.map((msg, idx) => {
                const prevMsg = messages[idx - 1];
                const isGrouped = shouldGroupWithPrevious(msg, prevMsg);

                // Check if day changed
                const currentDay = new Date(msg.createdAt).toDateString();
                const prevDay = prevMsg ? new Date(prevMsg.createdAt).toDateString() : null;
                const showDayDivider = currentDay !== prevDay;

                return (
                    <div key={msg.id}>
                        {showDayDivider && (
                            <div
                                style={{
                                    textAlign: "center",
                                    margin: "16px 0 10px",
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: 10.5,
                                        fontWeight: 600,
                                        letterSpacing: "0.03em",
                                        padding: "3px 10px",
                                        borderRadius: 999,
                                        background: T.paperSunken,
                                        border: `1px solid ${T.line}`,
                                        color: T.ink3,
                                    }}
                                >
                                    {formatDayDivider(msg.createdAt)}
                                </span>
                            </div>
                        )}

                        <SupportBubble
                            message={msg}
                            viewpoint="client"
                            theme="light"
                            isLast={lastClientMessage?.id === msg.id}
                            seen={!msg.id.startsWith("tmp-")}
                            isGrouped={isGrouped}
                            showAvatar={!isGrouped}
                        />
                    </div>
                );
            })}

            {/* First-time intent selector card */}
            {showIntentSelector && !isResolved && (
                <SupportIntentSelector onSelectIntent={onSelectIntent} />
            )}

            {isTyping && !isResolved && (
                <SupportTypingIndicator name={typingAgentName ?? "Équipe support"} theme="light" />
            )}

            <div ref={messagesEndRef} />

            {/* Scroll to bottom button when unread incoming */}
            {unreadIncomingCount > 0 && (
                <div
                    style={{
                        position: "sticky",
                        bottom: 4,
                        display: "flex",
                        justifyContent: "center",
                        pointerEvents: "none",
                        zIndex: 10,
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
                            color: "#FFFFFF",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            boxShadow: "0 6px 16px rgba(99,102,241,0.3)",
                            animation: "cpSupBubbleIn 0.2s ease both",
                        }}
                    >
                        ⬇ {unreadIncomingCount} nouveau{unreadIncomingCount > 1 ? "x" : ""} message
                        {unreadIncomingCount > 1 ? "s" : ""}
                    </button>
                </div>
            )}
        </div>
    );
}
