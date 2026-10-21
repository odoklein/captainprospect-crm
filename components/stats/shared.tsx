"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD, FOCUS, Shimmer } from "@/components/accueil/AccueilUI";

// Building blocks shared by every tab of the Statistiques page.

/** Card with a title row: the single container pattern of the page. */
export function Panel({
    title,
    subtitle,
    right,
    children,
    className,
    bodyClassName,
}: {
    title?: ReactNode;
    subtitle?: ReactNode;
    right?: ReactNode;
    children: ReactNode;
    className?: string;
    bodyClassName?: string;
}) {
    return (
        <section className={cn(CARD, "flex min-w-0 flex-col", className)}>
            {(title || right) && (
                <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5 sm:px-6 sm:pt-6">
                    <div className="min-w-0">
                        {title && <h2 className="text-base font-extrabold tracking-tight text-ink">{title}</h2>}
                        {subtitle && <p className="mt-0.5 text-xs font-medium text-ink-3">{subtitle}</p>}
                    </div>
                    {right}
                </header>
            )}
            <div className={cn("min-w-0 flex-1 p-5 sm:p-6", (title || right) && "pt-4 sm:pt-4", bodyClassName)}>{children}</div>
        </section>
    );
}

/** A rate printed with a muted style when the volume is too low to trust it. */
export function Rate({ value, thin, className }: { value: string; thin?: boolean; className?: string }) {
    return (
        <span
            className={cn("tabular-nums", thin && "text-ink-4", className)}
            title={thin ? "Volume trop faible pour que ce taux soit significatif" : undefined}
        >
            {value}
        </span>
    );
}

export interface FilterOption {
    value: string;
    label: string;
    hint?: string;
    muted?: boolean;
}

/**
 * Multi-select filter chip: label + count on the trigger, searchable checklist in
 * the popover. Replaces the four single-value native <select>s of the old page,
 * which could not hold more than one mission/SDR.
 */
export function FilterPopover({
    label,
    icon,
    options,
    value,
    onChange,
    searchPlaceholder,
    emptyLabel = "Aucun résultat",
}: {
    label: string;
    icon?: ReactNode;
    options: FilterOption[];
    value: string[];
    onChange: (next: string[]) => void;
    searchPlaceholder?: string;
    emptyLabel?: string;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : options;
    }, [options, query]);

    const selected = options.filter((o) => value.includes(o.value));
    const active = value.length > 0;
    const summary = selected.length === 1 ? selected[0].label : selected.length > 1 ? `${selected.length} sélectionnés` : null;

    const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    "inline-flex h-9 max-w-[220px] items-center gap-2 rounded-control border px-3 text-[13px] font-semibold shadow-2xs transition-colors",
                    FOCUS,
                    active
                        ? "border-primary-300 bg-primary-50 text-primary-700 hover:border-primary-400"
                        : "border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-surface-2",
                )}
            >
                {icon && <span className={cn("shrink-0 [&_svg]:size-3.5", active ? "text-primary-600" : "text-ink-4")}>{icon}</span>}
                <span className="truncate">{summary ? <><span className="font-medium opacity-70">{label} · </span>{summary}</> : label}</span>
                <ChevronDown className={cn("size-3.5 shrink-0 text-ink-4 transition-transform", open && "rotate-180")} aria-hidden />
            </button>

            {open && (
                <div className="absolute left-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-panel border border-line bg-surface shadow-overlay">
                    <div className="border-b border-line-subtle p-2">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" aria-hidden />
                            <input
                                autoFocus
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={searchPlaceholder ?? `Rechercher…`}
                                className="h-8 w-full rounded-lg border border-line bg-surface-2 pl-8 pr-2 text-[13px] text-ink placeholder:text-ink-4 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/15"
                            />
                        </div>
                    </div>
                    <ul role="listbox" aria-multiselectable className="max-h-64 overflow-y-auto p-1">
                        {filtered.length === 0 && <li className="px-3 py-6 text-center text-xs text-ink-3">{emptyLabel}</li>}
                        {filtered.map((o) => {
                            const checked = value.includes(o.value);
                            return (
                                <li key={o.value} role="option" aria-selected={checked}>
                                    <button
                                        type="button"
                                        onClick={() => toggle(o.value)}
                                        className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2", FOCUS, "focus-visible:ring-offset-0")}
                                    >
                                        <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", checked ? "border-primary bg-primary text-primary-fg" : "border-line-strong bg-surface")}>
                                            {checked && <Check className="size-3" strokeWidth={3} aria-hidden />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className={cn("block truncate text-[13px] font-semibold", o.muted ? "text-ink-3" : "text-ink")}>{o.label}</span>
                                            {o.hint && <span className="block truncate text-[11px] text-ink-4">{o.hint}</span>}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    {active && (
                        <div className="border-t border-line-subtle p-1.5">
                            <button
                                type="button"
                                onClick={() => onChange([])}
                                className={cn("flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink", FOCUS, "focus-visible:ring-offset-0")}
                            >
                                <X className="size-3" aria-hidden /> Effacer la sélection
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/** Skeleton shaped like the Vue d'ensemble, so the layout does not jump on load. */
export function OverviewSkeleton() {
    return (
        <div className="space-y-4" aria-busy aria-label="Chargement des statistiques">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.35fr_repeat(4,1fr)]">
                {Array.from({ length: 5 }).map((_, i) => <Shimmer key={i} className="h-[132px] rounded-3xl" />)}
            </div>
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <Shimmer className="h-[360px] rounded-3xl" />
                <Shimmer className="h-[360px] rounded-3xl" />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <Shimmer className="h-[300px] rounded-3xl" />
                <Shimmer className="h-[300px] rounded-3xl" />
            </div>
        </div>
    );
}
