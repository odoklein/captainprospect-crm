"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions/PermissionProvider";
import type { NavItem, NavSection } from "@/lib/navigation/config";
import { findActiveNav, writeLastTab } from "@/lib/navigation/active";

interface SectionTabsProps {
    navigation: NavSection[];
    /** Shown when the page is not in the navigation (e.g. a mission detail page). */
    fallback: { root: string; current: string };
}

/**
 * Lives in the top bar, where the breadcrumb was: the current hub and its
 * pages as tabs. It takes no height from the page — full-screen boards like
 * the planning keep every pixel.
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

    if (!active) {
        return (
            <nav className="cp-breadcrumb" aria-label="Breadcrumb">
                <span className="cp-breadcrumb-root">{fallback.root}</span>
                <span className="cp-breadcrumb-sep">/</span>
                <span className="cp-breadcrumb-current">{fallback.current}</span>
            </nav>
        );
    }

    const { item, child } = active;
    const tabs = (item.children ?? []).filter((c: NavItem) => !c.permission || hasPermission(c.permission));
    const Icon = item.icon;

    return (
        <div className="flex min-w-0 items-center gap-3">
            <div className="flex shrink-0 items-center gap-2.5" title={item.description}>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-600 text-white">
                    <Icon className="h-[15px] w-[15px]" strokeWidth={2} />
                </span>
                <span className="text-[14px] font-semibold tracking-tight text-slate-900">{item.label}</span>
            </div>

            {tabs.length > 1 && (
                <>
                    <span className="h-5 w-px shrink-0 bg-slate-200" aria-hidden />
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
                                    href={tab.href}
                                    title={tab.description}
                                    aria-current={current ? "page" : undefined}
                                    className={cn(
                                        "group relative flex h-14 shrink-0 items-center gap-1.5 px-2.5 text-[13px] font-medium transition-colors",
                                        current ? "text-primary-700" : "text-slate-500 hover:text-slate-900",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors",
                                            !current && "group-hover:bg-slate-100",
                                        )}
                                    >
                                        <TabIcon
                                            className={cn("h-3.5 w-3.5", current ? "text-primary-600" : "text-slate-400 group-hover:text-slate-500")}
                                            strokeWidth={current ? 2.2 : 1.8}
                                        />
                                        {tab.label}
                                        {tab.badge != null && tab.badge !== "" && (
                                            <span className="rounded-full bg-primary-600 px-1.5 text-[10px] font-semibold leading-4 text-white">
                                                {tab.badge}
                                            </span>
                                        )}
                                    </span>
                                    <span
                                        className={cn(
                                            "absolute inset-x-2.5 bottom-0 h-[2px] rounded-t-full transition-opacity",
                                            current ? "bg-primary-600 opacity-100" : "opacity-0",
                                        )}
                                        aria-hidden
                                    />
                                </Link>
                            );
                        })}
                    </nav>
                </>
            )}
        </div>
    );
}
