"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions/PermissionProvider";
import type { NavItem, NavSection } from "@/lib/navigation/config";
import { findActiveNav, writeLastTab } from "@/lib/navigation/active";

import { ChevronRight } from "lucide-react";

interface SectionTabsProps {
    navigation: NavSection[];
    /** Shown when the page is not in the navigation (e.g. a mission detail page). */
    fallback: { root: string; current: string };
}

/**
 * Lives in the top bar: when inside a multi-page hub, it displays the hub title
 * and sleek tabs for each page. When on a standalone page, it shows a clean,
 * unobtrusive breadcrumb (avoiding loud redundant headers).
 */
export function SectionTabs({ navigation, fallback }: SectionTabsProps) {
    const pathname = usePathname();
    const { hasPermission } = usePermissions();
    const active = useMemo(
        () => findActiveNav(navigation, pathname, (leaf) => !leaf.permission || hasPermission(leaf.permission)),
        [navigation, pathname, hasPermission],
    );

    // The hub reopens on this tab next time it is clicked in the sidebar.
    useEffect(() => {
        if (active?.child) writeLastTab(active.item, active.child.href);
    }, [active]);

    // On a narrow bar the tabs scroll sideways: keep the current one in view.
    const currentTabRef = useRef<HTMLAnchorElement>(null);
    const currentHref = active?.child?.href;
    useEffect(() => {
        currentTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [currentHref]);

    if (!active) {
        return (
            <nav className="flex items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
                <span className="text-slate-400 font-medium">{fallback.root}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" aria-hidden />
                <span className="text-slate-800 font-semibold truncate">{fallback.current}</span>
            </nav>
        );
    }

    const { item, child } = active;
    const tabs = (item.children ?? []).filter((c: NavItem) => !c.permission || hasPermission(c.permission));
    const Icon = item.icon;

    // Single standalone page: clean breadcrumb hierarchy
    if (tabs.length <= 1) {
        return (
            <nav className="flex items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
                <span className="text-slate-400 font-medium">{fallback.root}</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" aria-hidden />
                <span className="text-slate-800 font-semibold truncate">{item.label}</span>
            </nav>
        );
    }

    // Multi-page hub: the hub's name, then one underline tab per page. The
    // current tab reads in ink with a rule as wide as its label; colour stays
    // off the chrome.
    return (
        <div className="flex min-w-0 items-center gap-3">
            <div className="flex shrink-0 items-center gap-2" title={item.description}>
                <Icon className="size-4 text-ink-3" strokeWidth={1.8} aria-hidden />
                <span className="text-[13px] font-semibold tracking-tight text-ink">{item.label}</span>
            </div>

            <span className="h-4 w-px shrink-0 bg-line" aria-hidden />

            <nav
                className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                aria-label={`${item.label} : pages`}
            >
                {tabs.map((tab) => {
                    const current = tab === child;
                    const TabIcon = tab.icon;
                    return (
                        <Link
                            key={tab.href}
                            ref={current ? currentTabRef : undefined}
                            href={tab.href}
                            title={tab.description}
                            aria-current={current ? "page" : undefined}
                            className="group flex h-12 shrink-0 items-center px-1 outline-none"
                        >
                            <span
                                className={cn(
                                    "relative flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] transition-colors duration-150",
                                    "group-focus-visible:ring-2 group-focus-visible:ring-focus",
                                    current ? "font-semibold text-ink" : "font-medium text-ink-3 group-hover:bg-surface-3 group-hover:text-ink",
                                )}
                            >
                                <TabIcon
                                    className={cn("size-3.5 shrink-0", current ? "text-ink-2" : "text-ink-4 group-hover:text-ink-3")}
                                    strokeWidth={current ? 2.1 : 1.8}
                                    aria-hidden
                                />
                                <span className="truncate">{tab.label}</span>
                                {tab.badge != null && tab.badge !== "" && (
                                    <span className="rounded-full bg-surface-3 px-1.5 text-[11px] font-semibold leading-4 tabular-nums text-ink-2">
                                        {tab.badge}
                                    </span>
                                )}
                                <span
                                    className={cn(
                                        // Sits on the top bar's bottom edge (48px bar, 32px pill → 8px below).
                                        "absolute inset-x-2 -bottom-2 h-0.5 rounded-full transition-colors duration-150",
                                        current ? "bg-primary" : "bg-transparent",
                                    )}
                                    aria-hidden
                                />
                            </span>
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
