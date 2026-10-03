"use client";

import { cn } from "@/lib/utils";
import { ReactNode, useRef, type KeyboardEvent } from "react";
import { FOCUS_RING } from "./recipes";

interface Tab {
    id: string;
    label: string;
    icon?: ReactNode;
    badge?: string | number;
}

interface TabsProps {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
    className?: string;
    /** underline — page-level sections; pills — compact switcher inside a card */
    variant?: "underline" | "pills";
}

function TabBadge({ badge, active }: { badge?: string | number; active: boolean }) {
    if (badge === undefined || badge === null) return null;
    return (
        <span
            className={cn(
                "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-3xs font-bold tabular-nums",
                active ? "bg-accent text-accent-fg" : "bg-surface-3 text-ink-3"
            )}
        >
            {badge}
        </span>
    );
}

export function Tabs({
    tabs,
    activeTab,
    onTabChange,
    className,
    variant = "underline",
}: TabsProps) {
    const refs = useRef<(HTMLButtonElement | null)[]>([]);

    // Arrow keys move between tabs (WAI-ARIA tabs pattern, automatic activation).
    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        e.preventDefault();
        const at = tabs.findIndex((t) => t.id === activeTab);
        const next =
            e.key === "Home" ? 0
            : e.key === "End" ? tabs.length - 1
            : (at + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        onTabChange(tabs[next].id);
        refs.current[next]?.focus();
    };

    if (variant === "pills") {
        return (
            <div
                role="tablist"
                onKeyDown={onKeyDown}
                className={cn("inline-flex gap-0.5 rounded-control border border-line bg-surface-3 p-1", className)}
            >
                {tabs.map((tab, i) => {
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            ref={(el) => {
                                refs.current[i] = el;
                            }}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            tabIndex={active ? 0 : -1}
                            onClick={() => onTabChange(tab.id)}
                            className={cn(
                                "flex h-8 items-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold whitespace-nowrap transition-[background-color,color,box-shadow] duration-150",
                                FOCUS_RING,
                                "focus-visible:ring-offset-surface-3",
                                active
                                    ? "bg-surface text-ink shadow-sm ring-1 ring-line/70"
                                    : "text-ink-3 hover:text-ink"
                            )}
                        >
                            {tab.icon}
                            {tab.label}
                            <TabBadge badge={tab.badge} active={active} />
                        </button>
                    );
                })}
            </div>
        );
    }

    return (
        <div role="tablist" onKeyDown={onKeyDown} className={cn("flex gap-1 overflow-x-auto border-b border-line", className)}>
            {tabs.map((tab, i) => {
                const active = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        ref={(el) => {
                            refs.current[i] = el;
                        }}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        tabIndex={active ? 0 : -1}
                        onClick={() => onTabChange(tab.id)}
                        className={cn(
                            "relative -mb-px flex h-10 items-center gap-2 whitespace-nowrap rounded-t-lg px-3 text-sm font-medium transition-colors",
                            FOCUS_RING,
                            "focus-visible:ring-offset-0",
                            "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
                            active
                                ? "text-ink after:bg-accent"
                                : "text-ink-3 after:bg-transparent hover:text-ink-2 hover:after:bg-line-strong"
                        )}
                    >
                        {tab.icon}
                        {tab.label}
                        <TabBadge badge={tab.badge} active={active} />
                    </button>
                );
            })}
        </div>
    );
}

export default Tabs;
