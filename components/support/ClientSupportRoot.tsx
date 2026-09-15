"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { SUP_LIGHT, SupportStyles } from "./supportStyles";
import { ClientSupportPanel } from "./ClientSupportPanel";
import type { SupportConversationDetailDTO } from "@/lib/support/types";

const POLL_INTERVAL_MS = 15_000;
const T = SUP_LIGHT;

interface FabProps {
    isOpen: boolean;
    unread: number;
    isManagerTyping: boolean;
    onClick: () => void;
}

function SupportFab({ isOpen, unread, isManagerTyping, onClick }: FabProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={isOpen ? "Fermer le support" : "Ouvrir le support"}
            aria-expanded={isOpen}
            style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: isOpen
                    ? T.paperRaised
                    : `linear-gradient(135deg, ${T.brand}, ${T.brandStrong})`,
                border: isOpen ? `1px solid ${T.line}` : "none",
                boxShadow: isOpen
                    ? "0 8px 24px rgba(31,43,31,0.14)"
                    : T.shadowFab,
                cursor: "pointer",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 300ms cubic-bezier(.34,1.56,.64,1)",
                animation: isOpen ? "none" : "cpSupFabPulse 3s ease-in-out infinite",
            }}
        >
            {!isOpen && (
                <span
                    aria-hidden="true"
                    style={{
                        position: "absolute",
                        inset: -3,
                        borderRadius: "50%",
                        border: `2px solid ${T.brand}`,
                        animation: "cpSupStatusPing 2s ease-in-out infinite",
                        opacity: 0.55,
                        pointerEvents: "none",
                    }}
                />
            )}
            <svg
                width={22}
                height={22}
                viewBox="0 0 24 24"
                fill="none"
                stroke={isOpen ? T.brandStrong : "#FFFFFF"}
                strokeWidth={isOpen ? 2.5 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                    transition: "transform 300ms ease",
                    transform: isOpen ? "rotate(45deg)" : "rotate(0)",
                }}
                aria-hidden="true"
            >
                {isOpen ? (
                    <>
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                    </>
                ) : (
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                )}
            </svg>
            {unread > 0 && !isOpen && (
                <span
                    style={{
                        position: "absolute",
                        top: -2,
                        right: -2,
                        minWidth: 20,
                        height: 20,
                        padding: "0 5px",
                        borderRadius: 999,
                        background: T.danger,
                        border: `2px solid ${T.paper}`,
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        animation: "cpSupBadgePop 0.3s cubic-bezier(.34,1.56,.64,1) both",
                    }}
                    aria-label={`${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}`}
                >
                    {unread > 9 ? "9+" : unread}
                </span>
            )}
            {isManagerTyping && !isOpen && unread === 0 && (
                <span
                    aria-label="Un manager est en train d'écrire"
                    style={{
                        position: "absolute",
                        top: -2,
                        right: -2,
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: T.brand,
                        border: `2px solid ${T.paper}`,
                        animation: "cpSupPulse 1s ease-in-out infinite",
                    }}
                />
            )}
        </button>
    );
}

/**
 * Client portal support launcher + panel. Mounted once from the client layout
 * so the FAB is available on every `/client/*` route without per-page work.
 */
export default function ClientSupportRoot() {
    const { data: session, status } = useSession();
    const [isOpen, setIsOpen] = useState(false);
    const [conversation, setConversation] =
        useState<SupportConversationDetailDTO | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
    const [isManagerTyping, setIsManagerTyping] = useState(false);
    const lastMessageAtRef = useRef<string | null>(null);
    const isOpenRef = useRef(false);

    const canRender =
        status === "authenticated" &&
        (session?.user?.role === "CLIENT" || session?.user?.role === "COMMERCIAL");

    const fetchConversation = useCallback(
        async (): Promise<SupportConversationDetailDTO | null> => {
            try {
                const res = await fetch("/api/support/conversation");
                if (!res.ok) return null;
                const json = await res.json();
                if (!json?.success) return null;
                return json.data as SupportConversationDetailDTO;
            } catch {
                return null;
            }
        },
        [],
    );

    const markRead = useCallback(async () => {
        await fetch("/api/support/conversation/read", { method: "POST" }).catch(
            () => undefined,
        );
    }, []);

    useEffect(() => {
        isOpenRef.current = isOpen;
    }, [isOpen]);

    useEffect(() => {
        if (!canRender) return;
        let cancelled = false;
        setIsLoading(true);
        fetchConversation().then((next) => {
            if (cancelled) return;
            if (next) {
                setConversation(next);
                lastMessageAtRef.current = next.lastMessageAt;
            }
            setHasFetchedOnce(true);
            setIsLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [canRender, fetchConversation]);

    useEffect(() => {
        if (!canRender) return;
        const intervalId = window.setInterval(async () => {
            const next = await fetchConversation();
            if (!next) return;
            // Panel open = the client is reading, so keep the marker fresh
            // instead of letting replies pile up as "unread".
            let fresh = next;
            if (isOpenRef.current) {
                void markRead();
                fresh = { ...next, unreadCount: 0 };
            }
            setConversation((current) => {
                if (!current) {
                    lastMessageAtRef.current = fresh.lastMessageAt;
                    return fresh;
                }
                const newer =
                    fresh.lastMessageAt !== null &&
                    (!current.lastMessageAt ||
                        new Date(fresh.lastMessageAt).getTime() >
                            new Date(current.lastMessageAt).getTime());
                lastMessageAtRef.current = fresh.lastMessageAt;
                return newer ? fresh : { ...current, unreadCount: fresh.unreadCount };
            });
        }, POLL_INTERVAL_MS);
        return () => window.clearInterval(intervalId);
    }, [canRender, fetchConversation, markRead]);

    const handleOpen = useCallback(async () => {
        setIsOpen(true);
        // Read marker first, so the refetch below already comes back at 0 and the
        // badge doesn't flash back on the next poll.
        await markRead();
        const next = await fetchConversation();
        if (next) setConversation({ ...next, unreadCount: 0 });
    }, [fetchConversation, markRead]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
        setConversation((current) =>
            current ? { ...current, unreadCount: 0 } : current,
        );
        void markRead();
    }, [markRead]);

    const handleConversationUpdate = useCallback((next: SupportConversationDetailDTO) => {
        setConversation(next);
    }, []);

    if (!canRender) return null;

    const unread = conversation?.unreadCount ?? 0;

    return (
        <>
            <SupportStyles />
            <div
                className="cp-support-root"
                style={{ position: "fixed", bottom: 24, right: 24, zIndex: 100 }}
            >
                <SupportFab
                    isOpen={isOpen}
                    unread={unread}
                    isManagerTyping={isManagerTyping}
                    onClick={() => (isOpen ? handleClose() : handleOpen())}
                />
            </div>
            {isOpen && conversation && (
                <ClientSupportPanel
                    conversation={conversation}
                    onClose={handleClose}
                    onConversationUpdate={handleConversationUpdate}
                    onManagerTypingChange={setIsManagerTyping}
                />
            )}
            {isOpen && !conversation && hasFetchedOnce && !isLoading && (
                <div
                    className="cp-support-root"
                    role="alert"
                    style={{
                        position: "fixed",
                        bottom: 96,
                        right: 24,
                        zIndex: 99,
                        width: 320,
                        padding: 16,
                        borderRadius: T.radiusM,
                        background: T.paperRaised,
                        border: `1px solid ${T.line}`,
                        color: T.ink,
                        fontSize: 13,
                        animation: "cpSupPanelIn 0.3s ease both",
                    }}
                >
                    Le support est indisponible pour le moment. Réessayez dans quelques
                    minutes.
                </div>
            )}
        </>
    );
}
