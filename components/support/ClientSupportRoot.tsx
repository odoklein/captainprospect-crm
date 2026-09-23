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
    // The conversation the user most recently chose. Async responses (polls,
    // slow detail fetches, callbacks from a panel being torn down) for any other
    // id are stale and must be dropped — otherwise an old thread pops back in.
    const activeIdRef = useRef<string | null>(null);

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

    // Initial load — only the list (for the FAB badge). No "default" conversation
    // is pre-selected: that server fallback picked an arbitrary (often resolved)
    // thread, and handleOpen() routes to the right one anyway.
    useEffect(() => {
        if (!canRender) return;
        let cancelled = false;
        setIsLoading(true);

        fetchConversationsList().then((list) => {
            if (cancelled) return;
            setConversations(list);
            setHasFetchedOnce(true);
            setIsLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [canRender, fetchConversationsList]);

    // Periodic polling
    useEffect(() => {
        if (!canRender) return;
        const intervalId = window.setInterval(async () => {
            const list = await fetchConversationsList();
            setConversations(list);

            const polledId = activeIdRef.current;
            if (polledId) {
                const detail = await fetchConversationDetail(polledId);
                if (detail && detail.id === activeIdRef.current) {
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
    }, [canRender, fetchConversationsList, fetchConversationDetail, markRead]);

    // Select a conversation from list
    const handleSelectConversation = useCallback(
        async (id: string) => {
            activeIdRef.current = id;
            setIsLoading(true);
            const detail = await fetchConversationDetail(id);
            // User picked another conversation while this one was loading.
            if (activeIdRef.current !== id) return;
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
            activeIdRef.current = created.id;
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

        // Auto-routing, in priority order:
        //  1. no request yet          → NEW (straight to the form)
        //  2. exactly one request     → THREAD on it
        //  3. something unread        → THREAD on the most recent unread one
        //  4. otherwise               → LIST
        if (list.length === 0) {
            setView("NEW");
            return;
        }

        if (list.length === 1) {
            await handleSelectConversation(list[0].id);
            setView("THREAD");
            return;
        }

        const newestUnread = list
            .filter((c) => c.unreadCount > 0)
            .sort(
                (a, b) =>
                    new Date(b.lastMessageAt ?? 0).getTime() -
                    new Date(a.lastMessageAt ?? 0).getTime(),
            )[0];

        if (newestUnread) {
            await handleSelectConversation(newestUnread.id);
            setView("THREAD");
            return;
        }

        setView("LIST");
    }, [fetchConversationsList, handleSelectConversation]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
        if (activeConversation) {
            void markRead(activeConversation.id);
            setActiveConversation((cur) => (cur ? { ...cur, unreadCount: 0 } : cur));
        }
    }, [activeConversation, markRead]);

    // Esc backs out one level: THREAD/NEW → LIST when there is a list to go back
    // to, otherwise it closes the widget.
    useEffect(() => {
        if (!isOpen) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            // The image lightbox owns Esc while it is open.
            if (document.body.hasAttribute("data-cp-sup-lightbox")) return;

            e.preventDefault();
            if (view !== "LIST" && conversations.length > 1) {
                setView("LIST");
                return;
            }
            handleClose();
        };

        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, view, conversations.length, handleClose]);

    const handleConversationUpdate = useCallback((next: SupportConversationDetailDTO) => {
        // A late send/reopen on a thread the user already left updates its list
        // row, but must not pull that thread back into view.
        if (next.id === activeIdRef.current) setActiveConversation(next);
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

    // Total unread count across all accessible conversations.
    // NOTE: this hook must run on every render — it stays above the `canRender`
    // early return below so the hook order is stable when the session flips from
    // "loading" to "authenticated" (otherwise React throws "rendered more hooks
    // than during the previous render" and the support widget crashes).
    const totalUnread = useMemo(() => {
        if (conversations.length > 0) {
            return conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        }
        return activeConversation?.unreadCount ?? 0;
    }, [conversations, activeConversation]);

    if (!canRender) return null;

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
                    // Remount per thread so draft, pending images (uploaded to one
                    // conversation) and local message state never bleed into another.
                    key={activeConversation.id}
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

            {isOpen && view === "THREAD" && !activeConversation && (isLoading || !hasFetchedOnce) && (
                <div
                    className="cp-support-root cp-support-panel-responsive"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Chargement de l'assistance"
                    style={{
                        position: "fixed",
                        bottom: 96,
                        right: 24,
                        zIndex: 99,
                        width: 420,
                        maxWidth: "calc(100vw - 32px)",
                        height: 380,
                        borderRadius: T.radiusXL,
                        overflow: "hidden",
                        background: T.paper,
                        border: `1px solid ${T.line}`,
                        boxShadow: T.shadowPanel,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 12,
                        color: T.ink3,
                    }}
                >
                    <div
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            border: `3px solid ${T.line}`,
                            borderTopColor: T.brand,
                            animation: "cpSupSpin 0.8s linear infinite",
                        }}
                    />
                    <p style={{ fontSize: 13, color: T.ink2, fontWeight: 500 }}>
                        Chargement de vos échanges...
                    </p>
                </div>
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
