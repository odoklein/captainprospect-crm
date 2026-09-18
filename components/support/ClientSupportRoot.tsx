"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { SUP_LIGHT, SupportStyles } from "./supportStyles";
import { ClientSupportPanel } from "./ClientSupportPanel";
import { ClientSupportListView } from "./ClientSupportListView";
import { ClientSupportNewRequestView } from "./ClientSupportNewRequestView";
import type {
    SupportConversationDetailDTO,
    SupportConversationSummaryDTO,
    SupportIntent,
    SupportMessageContext,
} from "@/lib/support/types";

import { supportApi } from "@/lib/support/api";

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
 * so the FAB is available on every `/client/*` and `/commercial/*` route without per-page work.
 * Supports multi-demand navigation: List of requests, Active thread, and New request form.
 */
export default function ClientSupportRoot() {
    const { data: session, status } = useSession();
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState<"LIST" | "THREAD" | "NEW">("THREAD");
    const [prefillIntent, setPrefillIntent] = useState<SupportIntent | undefined>();
    const [conversations, setConversations] = useState<SupportConversationSummaryDTO[]>([]);
    const [activeConversation, setActiveConversation] =
        useState<SupportConversationDetailDTO | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
    const isOpenRef = useRef(false);

    const canRender =
        status === "authenticated" &&
        (session?.user?.role === "CLIENT" || session?.user?.role === "COMMERCIAL");

    const fetchConversationsList = useCallback(async (): Promise<SupportConversationSummaryDTO[]> => {
        try {
            return await supportApi.listConversations();
        } catch {
            return [];
        }
    }, []);

    const fetchConversationDetail = useCallback(
        async (id?: string | null): Promise<SupportConversationDetailDTO | null> => {
            try {
                return await supportApi.getConversation(id);
            } catch {
                return null;
            }
        },
        [],
    );

    const markRead = useCallback(async (conversationId?: string) => {
        await supportApi.markRead(conversationId);
    }, []);

    useEffect(() => {
        isOpenRef.current = isOpen;
    }, [isOpen]);

    // Initial load
    useEffect(() => {
        if (!canRender) return;
        let cancelled = false;
        setIsLoading(true);

        Promise.all([fetchConversationsList(), fetchConversationDetail()]).then(
            ([list, detail]) => {
                if (cancelled) return;
                setConversations(list);
                if (detail) {
                    setActiveConversation(detail);
                }
                setHasFetchedOnce(true);
                setIsLoading(false);
            },
        );

        return () => {
            cancelled = true;
        };
    }, [canRender, fetchConversationsList, fetchConversationDetail]);

    // Periodic polling
    useEffect(() => {
        if (!canRender) return;
        const intervalId = window.setInterval(async () => {
            const list = await fetchConversationsList();
            setConversations(list);

            if (activeConversation?.id) {
                const detail = await fetchConversationDetail(activeConversation.id);
                if (detail) {
                    let fresh = detail;
                    if (isOpenRef.current) {
                        void markRead(detail.id);
                        fresh = { ...detail, unreadCount: 0 };
                    }
                    setActiveConversation(fresh);
                }
            }
        }, POLL_INTERVAL_MS);

        return () => window.clearInterval(intervalId);
    }, [canRender, activeConversation?.id, fetchConversationsList, fetchConversationDetail, markRead]);

    // Select a conversation from list
    const handleSelectConversation = useCallback(
        async (id: string) => {
            setIsLoading(true);
            const detail = await fetchConversationDetail(id);
            if (detail) {
                setActiveConversation(detail);
                setView("THREAD");
                void markRead(id);
                setConversations((prev) =>
                    prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
                );
            }
            setIsLoading(false);
        },
        [fetchConversationDetail, markRead],
    );

    // Create a new conversation
    const handleCreateConversation = useCallback(
        async (data: {
            subject: string;
            content: string;
            intent?: SupportIntent;
            attachmentIds?: string[];
            context?: SupportMessageContext;
        }) => {
            const created = await supportApi.createConversation(data);
            setActiveConversation(created);
            setView("THREAD");
            const updatedList = await fetchConversationsList();
            setConversations(updatedList);
        },
        [fetchConversationsList],
    );

    const handleOpen = useCallback(async () => {
        setIsOpen(true);
        const list = await fetchConversationsList();
        setConversations(list);

        if (list.length === 0) {
            setView("NEW");
        } else if (list.length === 1) {
            await handleSelectConversation(list[0].id);
            setView("THREAD");
        } else {
            // If there's an unread conversation, open it
            const unreadConv = list.find((c) => c.unreadCount > 0);
            if (unreadConv) {
                await handleSelectConversation(unreadConv.id);
                setView("THREAD");
            } else if (activeConversation) {
                setView("THREAD");
            } else {
                setView("LIST");
            }
        }
    }, [fetchConversationsList, handleSelectConversation, activeConversation]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
        if (activeConversation) {
            void markRead(activeConversation.id);
            setActiveConversation((cur) => (cur ? { ...cur, unreadCount: 0 } : cur));
        }
    }, [activeConversation, markRead]);

    const handleConversationUpdate = useCallback((next: SupportConversationDetailDTO) => {
        setActiveConversation(next);
        setConversations((prev) =>
            prev.map((c) =>
                c.id === next.id
                    ? {
                        ...c,
                        lastMessageAt: next.lastMessageAt,
                        lastMessagePreview: next.lastMessagePreview,
                        messageCount: next.messageCount,
                        status: next.status,
                    }
                    : c,
            ),
        );
    }, []);

    if (!canRender) return null;

    // Total unread count across all accessible conversations
    const totalUnread = useMemo(() => {
        if (conversations.length > 0) {
            return conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        }
        return activeConversation?.unreadCount ?? 0;
    }, [conversations, activeConversation]);

    return (
        <>
            <SupportStyles />
            <div
                className="cp-support-root"
                style={{ position: "fixed", bottom: 24, right: 24, zIndex: 100 }}
            >
                <SupportFab
                    isOpen={isOpen}
                    unread={totalUnread}
                    isManagerTyping={false}
                    onClick={() => (isOpen ? handleClose() : handleOpen())}
                />
            </div>

            {isOpen && view === "LIST" && (
                <ClientSupportListView
                    conversations={conversations}
                    onSelectConversation={handleSelectConversation}
                    onNewRequest={(intent) => {
                        setPrefillIntent(intent);
                        setView("NEW");
                    }}
                    onClose={handleClose}
                    userRole={session?.user?.role}
                    currentUserId={session?.user?.id}
                />
            )}

            {isOpen && view === "NEW" && (
                <ClientSupportNewRequestView
                    onSubmit={handleCreateConversation}
                    prefillIntent={prefillIntent}
                    onCancel={() => {
                        if (conversations.length > 0) {
                            setView(activeConversation ? "THREAD" : "LIST");
                        } else {
                            handleClose();
                        }
                    }}
                    onClose={handleClose}
                />
            )}

            {isOpen && view === "THREAD" && activeConversation && (
                <ClientSupportPanel
                    conversation={activeConversation}
                    onClose={handleClose}
                    onConversationUpdate={handleConversationUpdate}
                    onBackToList={() => setView("LIST")}
                    onNewRequest={() => {
                        setPrefillIntent(undefined);
                        setView("NEW");
                    }}
                />
            )}

            {isOpen && !activeConversation && conversations.length === 0 && view === "THREAD" && hasFetchedOnce && !isLoading && (
                <ClientSupportNewRequestView
                    onSubmit={handleCreateConversation}
                    prefillIntent={prefillIntent}
                    onCancel={handleClose}
                    onClose={handleClose}
                />
            )}
        </>
    );
}
