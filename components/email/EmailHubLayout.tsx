"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Users,
    Zap,
    Inbox,
    BarChart3,
    Send,
    Plus,
    Mail,
    Megaphone,
} from "lucide-react";

// ============================================
// EMAIL HUB LAYOUT — Unified Tab Navigation
// Wraps all /manager/emails/* and /sdr/emails/* pages
// ============================================

interface EmailHubTab {
    id: string;
    label: string;
    href: string;
    icon: React.ReactNode;
    badge?: number;
}

interface EmailHubLayoutProps {
    children: React.ReactNode;
    variant?: "manager" | "sdr";
}

const MANAGER_TABS: EmailHubTab[] = [
    {
        id: "dashboard",
        label: "Dashboard",
        href: "/manager/emails",
        icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
        id: "sent",
        label: "Emails envoyés",
        href: "/manager/emails/sent",
        icon: <Send className="w-4 h-4" />,
    },
    {
        id: "campaigns",
        label: "ReachInbox",
        href: "/manager/emails/campaigns",
        icon: <Megaphone className="w-4 h-4" />,
    },
    {
        id: "contacts",
        label: "Contacts",
        href: "/manager/emails/contacts",
        icon: <Users className="w-4 h-4" />,
    },
    {
        id: "sequences",
        label: "Séquences",
        href: "/manager/emails/sequences",
        icon: <Zap className="w-4 h-4" />,
    },
    {
        id: "mailboxes",
        label: "Boîtes mail",
        href: "/manager/emails/mailboxes",
        icon: <Inbox className="w-4 h-4" />,
    },
    {
        id: "analytics",
        label: "Analytics",
        href: "/manager/emails/analytics",
        icon: <BarChart3 className="w-4 h-4" />,
    },
];

const SDR_TABS: EmailHubTab[] = [
    {
        id: "sends",
        label: "Mes envois",
        href: "/sdr/emails",
        icon: <Send className="w-4 h-4" />,
    },
    {
        id: "sequences",
        label: "Séquences",
        href: "/sdr/emails/sequences",
        icon: <Zap className="w-4 h-4" />,
    },
    {
        id: "templates",
        label: "Templates",
        href: "/sdr/emails/templates",
        icon: <Mail className="w-4 h-4" />,
    },
];

function getActiveTab(pathname: string, tabs: EmailHubTab[]): string {
    // Exact match first
    const exact = tabs.find((t) => t.href === pathname);
    if (exact) return exact.id;

    // Prefix match (longest first)
    const sorted = [...tabs].sort((a, b) => b.href.length - a.href.length);
    const prefix = sorted.find((t) => pathname.startsWith(t.href + "/"));
    if (prefix) return prefix.id;

    return tabs[0]?.id || "";
}

export function EmailHubLayout({ children, variant = "manager" }: EmailHubLayoutProps) {
    const pathname = usePathname();
    const router = useRouter();
    const tabs = variant === "manager" ? MANAGER_TABS : SDR_TABS;
    const activeTab = getActiveTab(pathname, tabs);

    return (
        <div className="flex flex-col h-full" style={{ fontFamily: "var(--cp-font, 'DM Sans', 'Inter', system-ui, sans-serif)" }}>
            {/* ── Header ── */}
            <div className="flex-shrink-0" style={{ borderBottom: "1px solid var(--cp-border)", background: "var(--cp-raised)" }}>
                <div className="px-6 pt-5 pb-0">
                    {/* Title row */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                                style={{ background: "var(--cp-green)", color: "var(--cp-on-inverse)" }}>
                                <Mail className="w-5 h-5" />
                            </div>
                            <div>
                                <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--cp-ink)" }}>
                                    Email Hub
                                </h1>
                                <p className="text-xs" style={{ color: "var(--cp-ink-3)" }}>
                                    {variant === "manager"
                                        ? "Suivez les emails, les statistiques ReachInbox et les boites mail"
                                        : "Vos emails et séquences"}
                                </p>
                            </div>
                        </div>

                        {/* Quick compose button */}
                        <button
                            onClick={() => {
                                // Navigate to compose or open modal
                                if (variant === "manager") {
                                    router.push("/manager/emails/contacts");
                                }
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-[10px] transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
                            style={{ background: "var(--cp-green)", color: "var(--cp-on-inverse)" }}
                        >
                            <Plus className="w-4 h-4" />
                            Voir contacts
                        </button>
                    </div>

                    {/* Tab navigation */}
                    <div className="flex gap-1 overflow-x-auto">
                        {tabs.map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => router.push(tab.href)}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-all duration-200 whitespace-nowrap"
                                    )}
                                    style={isActive
                                        ? { color: "var(--cp-green)", borderColor: "var(--cp-green)", background: "var(--cp-green-soft)" }
                                        : { color: "var(--cp-ink-3)", borderColor: "transparent" }}
                                    onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.color = "var(--cp-ink-2)"; e.currentTarget.style.background = "var(--cp-sunken)"; } }}
                                    onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.color = "var(--cp-ink-3)"; e.currentTarget.style.background = ""; } }}
                                >
                                    {tab.icon}
                                    {tab.label}
                                    {tab.badge !== undefined && tab.badge > 0 && (
                                        <span
                                            className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full min-w-[18px] text-center"
                                            style={isActive
                                                ? { background: "var(--cp-green)", color: "var(--cp-on-inverse)" }
                                                : { background: "var(--cp-neutral-soft)", color: "var(--cp-ink-2)" }}
                                        >
                                            {tab.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── Page content ── */}
            <div className="flex-1 overflow-y-auto" style={{ background: "var(--cp-canvas)" }}>
                {children}
            </div>
        </div>
    );
}

export default EmailHubLayout;
