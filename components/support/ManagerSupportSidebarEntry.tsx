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

    return (
        <>
            <SupportStyles />
            {/* A plain row like the nav above it: only unread messages earn colour. */}
            <button
                type="button"
                onClick={() => setIsWorkspaceOpen(true)}
                aria-label={`Support — ${unread} messages non lus${alertsUnread > 0 ? `, ${alertsUnread} alertes` : ""}`}
                className={cn("cp-nav-item w-full", !isExpanded && "justify-center px-0")}
                style={{ marginBottom: 4 }}
                title={!isExpanded ? `Support · ${active} actives · ${unread} non lus${alertsUnread > 0 ? ` · ${alertsUnread} alertes` : ""}` : undefined}
            >
                <span className="cp-nav-icon-wrap relative">
                    <LifeBuoy className="w-4 h-4" strokeWidth={1.8} />
                    {!isExpanded && totalBadge > 0 && (
                        <span
                            aria-hidden="true"
                            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
                            style={{ background: T.danger, boxShadow: "0 0 0 2px var(--ds-inverse)" }}
                        />
                    )}
                </span>
                {isExpanded && (
                    <>
                        <span className="min-w-0 flex-1 truncate text-left">Support clients</span>
                        {totalBadge > 0 ? (
                            <span
                                className="rounded-full px-1.5 text-[10.5px] font-semibold leading-4 text-white tabular-nums"
                                style={{ background: T.danger }}
                            >
                                {totalBadge > 99 ? "99+" : totalBadge}
                            </span>
                        ) : active > 0 ? (
                            <span className="text-[11px] font-normal tabular-nums text-white/45" title={`${active} conversation${active > 1 ? "s" : ""} active${active > 1 ? "s" : ""}`}>
                                {active}
                            </span>
                        ) : null}
                    </>
                )}
            </button>
            <ManagerSupportWorkspace
                isOpen={isWorkspaceOpen}
                onClose={() => setIsWorkspaceOpen(false)}
            />
        </>
    );
}
