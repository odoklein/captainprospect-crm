"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";
import { ManagerSupportWorkspace } from "./ManagerSupportWorkspace";
import { SUP_DARK, SupportStyles } from "./supportStyles";

interface Stats {
    totalUnread: number;
    activeConversations: number;
    resolvedConversations: number;
    alertsUnread?: number;
}

interface ManagerSupportSidebarEntryProps {
    isExpanded: boolean;
}

const POLL_INTERVAL_MS = 30_000;
const T = SUP_DARK;

/**
 * Compact sidebar entry rendered above the profile area for MANAGER users.
 * Shows an unread rollup pill and opens the full support workspace overlay.
 * Uses the indigo support palette so it visually pairs with the client-side
 * FAB without drifting from the dark sidebar aesthetic.
 */
export function ManagerSupportSidebarEntry({ isExpanded }: ManagerSupportSidebarEntryProps) {
    const { data: session, status } = useSession();
    const [stats, setStats] = useState<Stats | null>(null);
    const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);

    const canRender = status === "authenticated" && session?.user?.role === "MANAGER";

    const fetchStats = useCallback(async () => {
        try {
            const [statsRes, alertsRes] = await Promise.all([
                fetch("/api/support/manager/stats"),
                fetch("/api/support/manager/alerts"),
            ]);
            const statsJson = await statsRes.json();
            const alertsJson = await alertsRes.json();
            if (statsJson?.success) {
                const data = statsJson.data as Stats;
                data.alertsUnread = alertsJson?.success ? (alertsJson.data?.unreadCount ?? 0) : 0;
                setStats(data);
            }
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        if (!canRender) return;
        fetchStats();
        const id = window.setInterval(fetchStats, POLL_INTERVAL_MS);
        return () => window.clearInterval(id);
    }, [canRender, fetchStats]);

    // Refresh stats when the workspace closes, since the manager may have
    // read / resolved something inside.
    useEffect(() => {
        if (!isWorkspaceOpen) fetchStats();
    }, [isWorkspaceOpen, fetchStats]);

    // Deep link: `?support=1` opens the workspace straight away. The Slack
    // #clients-live alerts link here so a manager lands on the conversation
    // instead of having to hunt for the sidebar entry. The param is stripped
    // once consumed so a refresh doesn't reopen it.
    useEffect(() => {
        if (!canRender) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get("support") !== "1") return;
        // Reading location during render would desync SSR, so the open has to
        // happen here. It fires once, on a param the server never sees.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsWorkspaceOpen(true);
        params.delete("support");
        const query = params.toString();
        window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
        );
    }, [canRender]);

    if (!canRender) return null;

    const unread = stats?.totalUnread ?? 0;
    const alertsUnread = stats?.alertsUnread ?? 0;
    const totalBadge = unread + alertsUnread;
    const active = stats?.activeConversations ?? 0;

    const idleBg = totalBadge > 0
        ? "linear-gradient(135deg, rgba(124,92,252,0.24), rgba(99,102,241,0.14))"
        : "rgba(124,92,252,0.09)";
    const hoverBg = "rgba(124,92,252,0.24)";

    return (
        <>
            <SupportStyles />
            <button
                type="button"
                onClick={() => setIsWorkspaceOpen(true)}
                aria-label={`Support — ${unread} messages non lus${alertsUnread > 0 ? `, ${alertsUnread} alertes` : ""}`}
                className={cn(
                    "cp-support-sidebar-entry",
                    isExpanded && "cp-support-sidebar-entry-expanded",
                )}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: isExpanded ? "8px 10px" : "8px 6px",
                    justifyContent: isExpanded ? "flex-start" : "center",
                    borderRadius: 10,
                    border: `1px solid rgba(124,92,252,0.32)`,
                    background: idleBg,
                    color: "#E8F1EB",
                    cursor: "pointer",
                    fontSize: 12.5,
                    fontWeight: 600,
                    letterSpacing: "0.01em",
                    position: "relative",
                    transition: "all 150ms ease",
                    marginBottom: 8,
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = hoverBg;
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = idleBg;
                }}
                title={!isExpanded ? `Support · ${active} actives · ${unread} non lus${alertsUnread > 0 ? ` · ${alertsUnread} alertes` : ""}` : undefined}
            >
                <span
                    style={{
                        position: "relative",
                        width: 24,
                        height: 24,
                        borderRadius: 7,
                        background: "rgba(124,92,252,0.28)",
                        color: T.brand,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                    }}
                >
                    <LifeBuoy className="w-3.5 h-3.5" strokeWidth={2} />
                    {totalBadge > 0 && (
                        <span
                            aria-hidden="true"
                            style={{
                                position: "absolute",
                                top: -3,
                                right: -3,
                                minWidth: 14,
                                height: 14,
                                padding: "0 4px",
                                borderRadius: 999,
                                background: T.danger,
                                border: "1.5px solid #12122A",
                                color: "#fff",
                                fontSize: 9,
                                fontWeight: 700,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                animation: "cpSupBadgePop 0.3s cubic-bezier(.34,1.56,.64,1) both",
                            }}
                        >
                            {totalBadge > 9 ? "9+" : totalBadge}
                        </span>
                    )}
                </span>
                {isExpanded && (
                    <span style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                        <span style={{ display: "block", color: "#fff", fontWeight: 700, whiteSpace: "nowrap" }}>
                            Support clients
                        </span>
                        <span
                            style={{
                                display: "block",
                                fontSize: 10.5,
                                fontWeight: 500,
                                color: "#A8B8AD",
                                marginTop: 1,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {active} {active > 1 ? "conversations actives" : "conversation active"}
                        </span>
                    </span>
                )}
                {isExpanded && totalBadge > 0 && (
                    <span
                        style={{
                            padding: "1px 7px",
                            borderRadius: 999,
                            background: T.danger,
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: 700,
                        }}
                    >
                        {totalBadge}
                    </span>
                )}
            </button>
            <ManagerSupportWorkspace
                isOpen={isWorkspaceOpen}
                onClose={() => setIsWorkspaceOpen(false)}
            />
        </>
    );
}
