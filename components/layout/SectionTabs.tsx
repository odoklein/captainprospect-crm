"use client";

import { useEffect, useMemo } from "react";
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

    // Multi-page hub: compact hub header + seamless 48px tabs
    return (
        <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex shrink-0 items-center gap-2" title={item.description}>
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600 border border-slate-200/80">
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                </span>
                <span className="text-[13px] font-semibold tracking-tight text-slate-900">{item.label}</span>
            </div>

            <span className="h-4 w-px shrink-0 bg-slate-200" aria-hidden />

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
                                "group relative flex h-12 shrink-0 items-center gap-1.5 px-2 text-[12.5px] font-medium transition-colors",
                                current ? "text-primary-700 font-semibold" : "text-slate-500 hover:text-slate-900",
                            )}
                        >
                            <span
                                className={cn(
                                    "flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors",
                                    !current && "group-hover:bg-slate-100/70",
                                )}
                            >
                                <TabIcon
                                    className={cn(
                                        "h-3.5 w-3.5 shrink-0",
                                        current ? "text-primary-600" : "text-slate-400 group-hover:text-slate-600"
                                    )}
                                    strokeWidth={current ? 2.2 : 1.8}
                                />
                                <span className="truncate">{tab.label}</span>
                                {tab.badge != null && tab.badge !== "" && (
                                    <span className={cn(
                                        "rounded-full px-1.5 text-[10px] font-semibold leading-4",
                                        current
                                            ? "bg-primary-600 text-white"
                                            : "bg-slate-200 text-slate-700"
                                    )}>
                                        {tab.badge}
                                    </span>
                                )}
                            </span>
                            <span
                                className={cn(
                                    "absolute inset-x-2 bottom-0 h-[2px] rounded-t-full transition-opacity",
                                    current ? "bg-primary-600 opacity-100" : "opacity-0",
                                )}
                                aria-hidden
                            />
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
