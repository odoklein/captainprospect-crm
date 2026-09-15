"use client";

import type { CSSProperties } from "react";
import { SUP_DARK, SUP_LIGHT } from "./supportStyles";
import { SupportAttachmentGallery } from "./SupportAttachments";
import type { SupportMessageDTO } from "@/lib/support/types";

type SupportTheme = "light" | "dark";

function tokensFor(theme: SupportTheme) {
    return theme === "light" ? SUP_LIGHT : SUP_DARK;
}

function initialsFor(name: string | null | undefined): string {
    if (!name) return "?";
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

interface AvatarRingProps {
    name: string | null | undefined;
    size?: number;
    status?: "online" | "away" | "offline";
    theme?: SupportTheme;
}

export function AvatarRing({ name, size = 28, status = "online", theme = "light" }: AvatarRingProps) {
    const t = tokensFor(theme);
    const surface = theme === "light" ? t.paper : (t as typeof SUP_DARK).surface;
    const color =
        status === "online"
            ? t.brand
            : status === "away"
                ? t.accentAmber
                : t.ink4;
    return (
        <div style={{ width: size, height: size, position: "relative", flexShrink: 0 }}>
            <div
                style={{
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${t.brand}, ${t.brandStrong})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: size * 0.36,
                    fontWeight: 600,
                    color: "#fff",
                    letterSpacing: "-0.01em",
                    boxShadow: `0 0 0 2px ${surface}, 0 0 0 3.5px ${color}`,
                }}
            >
                {initialsFor(name)}
            </div>
            {size >= 28 && (
                <span
                    style={{
                        position: "absolute",
                        bottom: 0,
                        right: 0,
                        width: Math.max(8, size * 0.3),
                        height: Math.max(8, size * 0.3),
                        borderRadius: "50%",
                        background: color,
                        border: `1.5px solid ${surface}`,
                    }}
                />
            )}
        </div>
    );
}

interface SupportBubbleProps {
    message: SupportMessageDTO;
    viewpoint: "client" | "manager";
    theme?: SupportTheme;
    isLast?: boolean;
    seen?: boolean;
}

export function SupportBubble({ message, viewpoint, theme = "light", isLast, seen = true }: SupportBubbleProps) {
    const t = tokensFor(theme);

    if (message.role === "SYSTEM") {
        return (
            <div style={{ textAlign: "center", margin: "12px 0", animation: "cpSupBubbleIn 0.25s ease both" }}>
                <span
                    style={{
                        display: "inline-block",
                        padding: "4px 12px",
                        borderRadius: 999,
                        background: t.brandSoft,
                        border: `1px solid ${theme === "light" ? "rgba(99,102,241,0.24)" : "rgba(124,92,252,0.35)"}`,
                        color: theme === "light" ? t.brandStrong : t.brand,
                        fontSize: 11.5,
                        fontWeight: 500,
                    }}
                >
                    {message.content}
                </span>
            </div>
        );
    }

    const isOwn =
        viewpoint === "client" ? message.role === "CLIENT" : message.role === "MANAGER";
    const attachments = message.attachments ?? [];
    const hasText = message.content.trim().length > 0;
    const isManagerViewClientMessage = viewpoint === "manager" && message.role === "CLIENT";
    const senderIsCommercial = message.author?.role === "COMMERCIAL";
    const senderTag = isManagerViewClientMessage
        ? (senderIsCommercial ? "Commercial" : "Client")
        : null;
    const time = new Date(message.createdAt).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
    });

    const ownBg =
        theme === "light"
            ? `linear-gradient(135deg, ${t.brand}, ${t.brandStrong})`
            : `linear-gradient(135deg, ${t.brandStrong}, ${t.brand})`;
    const otherBg = theme === "light" ? t.paperRaised : (t as typeof SUP_DARK).surfaceRaised;
    const otherBorder = t.line;
    const otherInk = theme === "light" ? t.ink : t.ink;
    const ownShadow =
        theme === "light"
            ? "0 6px 18px rgba(99,102,241,0.24)"
            : "0 6px 18px rgba(79,158,107,0.22)";

    const bubbleStyle: CSSProperties = {
        padding: "10px 14px",
        borderRadius: isOwn ? `${t.radiusM}px ${t.radiusM}px 6px ${t.radiusM}px` : `6px ${t.radiusM}px ${t.radiusM}px ${t.radiusM}px`,
        background: isOwn ? ownBg : otherBg,
        border: isOwn ? "none" : `1px solid ${otherBorder}`,
        color: isOwn ? "#fff" : otherInk,
        fontSize: 13.5,
        lineHeight: 1.5,
        boxShadow: isOwn ? ownShadow : "0 1px 2px rgba(31,43,31,0.04)",
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
        letterSpacing: "-0.005em",
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: isOwn ? "row-reverse" : "row",
                alignItems: "flex-end",
                gap: 8,
                marginBottom: 8,
                animation: "cpSupBubbleIn 0.28s cubic-bezier(.34,1.56,.64,1) both",
            }}
        >
            {!isOwn && <AvatarRing name={message.author?.name ?? null} size={28} theme={theme} />}
            <div
                style={{
                    maxWidth: "72%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isOwn ? "flex-end" : "flex-start",
                    minWidth: 0,
                }}
            >
                {!isOwn && (message.author?.name || senderTag) && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 3,
                            minWidth: 0,
                        }}
                    >
                        {message.author?.name && (
                            <span
                                style={{
                                    fontSize: 10.5,
                                    color: t.ink3,
                                    fontWeight: 600,
                                    letterSpacing: "0.02em",
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                {message.author.name}
                            </span>
                        )}
                        {senderTag && (
                            <span
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    height: 18,
                                    padding: "0 7px",
                                    borderRadius: 999,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: "0.02em",
                                    background: senderIsCommercial
                                        ? "rgba(99,102,241,0.16)"
                                        : "rgba(148,163,184,0.18)",
                                    border: senderIsCommercial
                                        ? "1px solid rgba(99,102,241,0.26)"
                                        : "1px solid rgba(148,163,184,0.28)",
                                    color: senderIsCommercial
                                        ? (theme === "light" ? "#4F46E5" : "#A996FF")
                                        : t.ink3,
                                }}
                                aria-label={`Expéditeur: ${senderTag}`}
                            >
                                {senderTag}
                            </span>
                        )}
                    </div>
                )}
                {hasText && <div style={bubbleStyle}>{message.content}</div>}
                {attachments.length > 0 && (
                    <SupportAttachmentGallery
                        attachments={attachments}
                        theme={theme}
                        hasText={hasText}
                    />
                )}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        marginTop: 4,
                        opacity: 0.75,
                        flexDirection: isOwn ? "row-reverse" : "row",
                    }}
                >
                    <span
                        className="cp-support-root-mono"
                        style={{ fontSize: 10.5, color: t.ink3, letterSpacing: "0.02em" }}
                    >
                        {time}
                    </span>
                    {isOwn && isLast && (
                        <svg
                            width={14}
                            height={14}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke={seen ? t.brand : t.ink4}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-label={seen ? "Vu" : "Envoyé"}
                        >
                            <path d="M18 6 7 17l-5-5" />
                            <path d="m22 6-11.5 11" />
                        </svg>
                    )}
                </div>
            </div>
        </div>
    );
}

export function SupportTypingIndicator({
    name,
    theme = "light",
}: {
    name?: string | null;
    theme?: SupportTheme;
}) {
    const t = tokensFor(theme);
    const bubbleBg = theme === "light" ? t.paperRaised : (t as typeof SUP_DARK).surfaceRaised;
    return (
        <div
            style={{
                display: "flex",
                alignItems: "flex-end",
                gap: 8,
                marginBottom: 8,
                animation: "cpSupBubbleIn 0.28s ease both",
            }}
        >
            <AvatarRing name={name ?? "Équipe"} size={28} theme={theme} />
            <div
                style={{
                    padding: "12px 16px",
                    borderRadius: `6px ${t.radiusM}px ${t.radiusM}px ${t.radiusM}px`,
                    background: bubbleBg,
                    border: `1px solid ${t.line}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    boxShadow: "0 1px 2px rgba(31,43,31,0.04)",
                }}
                aria-label="L'équipe est en train d'écrire"
            >
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: t.brand,
                            animation: `cpSupTypingDot 1.2s ease-in-out ${i * 0.2}s infinite`,
                            display: "inline-block",
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
