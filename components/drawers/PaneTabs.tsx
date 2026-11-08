"use client";

// ============================================
// Tabs of the docked prospect pane. One underline that slides to the active
// tab (no jump, no layout shift), an icon per tab so they read at a glance,
// a live dot on « Appel » while this prospect is on the line, ← / → between
// tabs once one has focus (WAI-ARIA tabs pattern).
// ============================================

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PaneTab<T extends string> {
    id: T;
    label: string;
    icon: LucideIcon;
    /** Green pulsing dot (e.g. call in progress). */
    live?: boolean;
    /** Small count after the label (unread SMS…); 0 / undefined = none. */
    count?: number;
}

export function PaneTabs<T extends string>({
    tabs,
    value,
    onChange,
    label,
    idPrefix = "pane",
}: {
    tabs: PaneTab<T>[];
    value: T;
    onChange: (id: T) => void;
    label: string;
    idPrefix?: string;
}) {
    const listRef = useRef<HTMLDivElement>(null);
    const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

    // Measure the active tab; re-measure when the pane resizes (fonts, width).
    useLayoutEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const measure = () => {
            const el = list.querySelector<HTMLElement>(`[data-tab="${value}"]`);
            if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(list);
        return () => ro.disconnect();
    }, [value, tabs.length]);

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
        e.preventDefault();
        const i = tabs.findIndex((t) => t.id === value);
        const next =
            e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        onChange(tabs[next].id);
        listRef.current?.querySelector<HTMLElement>(`[data-tab="${tabs[next].id}"]`)?.focus();
    };

    return (
        <div
            ref={listRef}
            role="tablist"
            aria-label={label}
            onKeyDown={onKeyDown}
            className="relative flex items-stretch gap-1 border-b border-line-subtle bg-surface px-3"
        >
            {tabs.map((t) => {
                const active = t.id === value;
                const Icon = t.icon;
                return (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        id={`${idPrefix}-tab-${t.id}`}
                        data-tab={t.id}
                        aria-selected={active}
                        tabIndex={active ? 0 : -1}
                        onClick={() => onChange(t.id)}
                        className={cn(
                            "group relative flex h-11 items-center gap-1.5 rounded-t-md px-2.5 text-[13px] transition-colors duration-150",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
                            active ? "font-semibold text-ink" : "font-medium text-ink-3 hover:text-ink",
                        )}
                    >
                        <Icon className={cn("size-[15px] shrink-0", active ? "text-primary" : "text-ink-4 group-hover:text-ink-3")} aria-hidden />
                        {t.label}
                        {t.live && (
                            <span className="relative flex size-1.5" aria-label="en appel">
                                <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />
                                <span className="relative size-1.5 rounded-full bg-success" />
                            </span>
                        )}
                        {!!t.count && (
                            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-accent-fg tabular-nums">
                                {t.count > 9 ? "9+" : t.count}
                            </span>
                        )}
                    </button>
                );
            })}
            {bar && (
                <span
                    aria-hidden
                    className="pointer-events-none absolute bottom-[-1px] h-0.5 rounded-full bg-primary transition-[left,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    style={{ left: bar.left, width: bar.width }}
                />
            )}
        </div>
    );
}
