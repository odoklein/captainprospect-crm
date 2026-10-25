"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    BarChart3,
    FileText,
    Inbox,
    LayoutDashboard,
    Megaphone,
    PenSquare,
    Send,
    Server,
    Workflow,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";

// ============================================
// EMAIL HUB LAYOUT
// One frame for every email page (/manager/emails/*, /sdr/emails/*).
// The top bar already says "Communication › Email Hub", so the hub only adds
// its page tabs, grouped by job: read & follow up | outreach | setup.
// Pages own their padding (EmailHubPage) except the inbox, which fills the frame.
// ============================================

interface EmailHubTab {
    id: string;
    label: string;
    href: string;
    icon: LucideIcon;
    /** Shown on hover: what the page is for. */
    hint: string;
}

const MANAGER_GROUPS: EmailHubTab[][] = [
    [
        { id: "overview", label: "Vue d'ensemble", href: "/manager/emails", icon: LayoutDashboard, hint: "Ce qui demande votre attention aujourd'hui" },
        { id: "inbox", label: "Réception", href: "/manager/emails/inbox", icon: Inbox, hint: "Réponses des prospects et conversations" },
        { id: "sent", label: "Envoyés", href: "/manager/emails/sent", icon: Send, hint: "Tous les emails envoyés par l'équipe" },
    ],
    [
        { id: "sequences", label: "Séquences", href: "/manager/emails/sequences", icon: Workflow, hint: "Relances automatiques en plusieurs étapes" },
        { id: "templates", label: "Templates", href: "/manager/emails/templates", icon: FileText, hint: "Modèles d'emails partagés avec les missions" },
        { id: "campaigns", label: "Campagnes", href: "/manager/emails/campaigns", icon: Megaphone, hint: "Statistiques des campagnes ReachInbox" },
    ],
    [
        { id: "mailboxes", label: "Boîtes mail", href: "/manager/emails/mailboxes", icon: Server, hint: "Comptes d'envoi, synchronisation et limites" },
        { id: "analytics", label: "Analytics", href: "/manager/emails/analytics", icon: BarChart3, hint: "Ouvertures, réponses et rebonds dans le temps" },
    ],
];

const SDR_GROUPS: EmailHubTab[][] = [
    [
        { id: "sent", label: "Mes envois", href: "/sdr/emails/sent", icon: Send, hint: "Les emails que vous avez envoyés" },
        { id: "inbox", label: "Réception", href: "/sdr/emails/inbox", icon: Inbox, hint: "Réponses des prospects" },
    ],
];

function findActive(pathname: string, tabs: EmailHubTab[]): string | undefined {
    // Longest matching href wins, so /manager/emails/sequences/123 → Séquences.
    let best: EmailHubTab | undefined;
    for (const tab of tabs) {
        const hit = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        if (hit && (!best || tab.href.length > best.href.length)) best = tab;
    }
    return best?.id;
}

/** Unread inbox threads, refreshed every minute while the hub is open. */
function useUnreadCount(team: boolean): number | null {
    const [count, setCount] = useState<number | null>(null);
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                // Managers read every mailbox, so their badge counts the team's unread.
                const res = await fetch(`/api/email/threads?folder=unread&limit=1${team ? "&scope=team" : ""}`);
                const json = await res.json();
                if (!cancelled && json?.success) setCount(json.data?.total ?? 0);
            } catch {
                /* the badge is a convenience */
            }
        };
        load();
        const timer = setInterval(load, 60_000);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [team]);
    return count;
}

interface EmailHubLayoutProps {
    children: React.ReactNode;
    variant?: "manager" | "sdr";
}

export function EmailHubLayout({ children, variant = "manager" }: EmailHubLayoutProps) {
    const pathname = usePathname() ?? "";
    const groups = variant === "manager" ? MANAGER_GROUPS : SDR_GROUPS;
    const activeId = findActive(pathname, groups.flat());
    const unread = useUnreadCount(variant === "manager");
    const composeHref = variant === "manager" ? "/manager/emails/inbox?compose=1" : "/sdr/emails/inbox?compose=1";

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex-shrink-0 border-b border-line bg-surface">
                <div className="flex items-center gap-3 px-4 sm:px-6">
                    <nav
                        aria-label="Email Hub"
                        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                        {groups.map((group, gi) => (
                            <React.Fragment key={gi}>
                                {gi > 0 && <span className="mx-1.5 h-4 w-px shrink-0 bg-line" aria-hidden />}
                                {group.map((tab) => {
                                    const active = tab.id === activeId;
                                    const Icon = tab.icon;
                                    const badge = tab.id === "inbox" && unread ? unread : null;
                                    return (
                                        <Link
                                            key={tab.id}
                                            href={tab.href}
                                            title={tab.hint}
                                            aria-current={active ? "page" : undefined}
                                            className={cn(
                                                "group relative flex h-11 shrink-0 items-center px-1 text-[13px] font-medium transition-colors",
                                                active ? "text-ink" : "text-ink-3 hover:text-ink",
                                                FOCUS_RING,
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors",
                                                    !active && "group-hover:bg-surface-2",
                                                )}
                                            >
                                                <Icon
                                                    className={cn("size-3.5", active ? "text-primary-600" : "text-ink-4 group-hover:text-ink-3")}
                                                    strokeWidth={active ? 2.2 : 1.8}
                                                    aria-hidden
                                                />
                                                {tab.label}
                                                {badge !== null && (
                                                    <span
                                                        className={cn(
                                                            "min-w-[18px] rounded-full px-1.5 text-center text-3xs font-bold leading-[18px] tabular-nums",
                                                            active ? "bg-accent text-accent-fg" : "bg-surface-3 text-ink-2",
                                                        )}
                                                        aria-label={`${badge} non lus`}
                                                    >
                                                        {badge > 99 ? "99+" : badge}
                                                    </span>
                                                )}
                                            </span>
                                            <span
                                                className={cn(
                                                    "absolute inset-x-1.5 bottom-0 h-[2px] rounded-t-full bg-primary-600 transition-opacity",
                                                    active ? "opacity-100" : "opacity-0",
                                                )}
                                                aria-hidden
                                            />
                                        </Link>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </nav>

                    {activeId !== "inbox" && (
                        <Link
                            href={composeHref}
                            className={cn(
                                "hidden h-8 shrink-0 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-[13px] font-semibold text-primary-fg shadow-primary transition-colors hover:bg-primary-hover sm:inline-flex",
                                FOCUS_RING,
                            )}
                        >
                            <PenSquare className="size-3.5" aria-hidden />
                            Écrire
                        </Link>
                    )}
                </div>
            </div>

            <div className={cn("min-h-0 flex-1 bg-canvas", activeId === "inbox" ? "flex flex-col overflow-hidden" : "overflow-y-auto")}>
                {children}
            </div>
        </div>
    );
}

export default EmailHubLayout;
