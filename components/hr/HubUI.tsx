"use client";

// ============================================
// RH HUB — the shared vocabulary of the four RH screens (Planning,
// Utilisateurs & accès, Paie, Avis SDR), so they read as one tool:
// a noun title with one line of finding, figures set as type in one divided
// strip, flat bordered panels, sentence-case table heads, honest empty /
// loading / error states inside the block that owns them.
// ============================================

import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";

/** Title row: the screen's noun, the finding under it, actions on the right. */
export function HubHeader({
    title,
    finding,
    beside,
    actions,
    className,
}: {
    title: string;
    /** One sentence about the data (period, scope, what needs attention). */
    finding?: ReactNode;
    /** Scope controls that belong to the title (month stepper). */
    beside?: ReactNode;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <h1 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-2xl">
                        {title}
                    </h1>
                    {beside}
                </div>
                {finding && <p className="mt-1 text-[13px] leading-5 text-ink-3">{finding}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
    );
}

/**
 * Headline figures in one container split by hairlines (the gap-px grid
 * draws the rules whatever the column count, phone 2-up included).
 */
export function MetricStrip({ children, className, ...rest }: { children: ReactNode; className?: string } & Record<`data-${string}`, string>) {
    return (
        <div
            {...rest}
            className={cn(
                "grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line-subtle lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none",
                className,
            )}
        >
            {children}
        </div>
    );
}

type MetricTone = "neutral" | "warning" | "success" | "danger";

const VALUE_TONE: Record<MetricTone, string> = {
    neutral: "text-ink",
    warning: "text-warning-ink",
    success: "text-success-ink",
    danger: "text-danger-ink",
};

/** One cell of a MetricStrip. With onClick it becomes a filter toggle (aria-pressed). */
export function Metric({
    label,
    value,
    unit,
    hint,
    tone = "neutral",
    lead,
    onClick,
    pressed,
    className,
    ...rest
}: {
    label: ReactNode;
    value: ReactNode;
    /** Smaller grey suffix after the value ("appels", "/ 10"). */
    unit?: ReactNode;
    hint?: ReactNode;
    tone?: MetricTone;
    /** The screen's answer figure: set larger than its siblings. */
    lead?: boolean;
    onClick?: () => void;
    pressed?: boolean;
    className?: string;
} & Record<`data-${string}`, string>) {
    const body = (
        <>
            <span className="flex items-center gap-1 text-[12.5px] leading-4 text-ink-3">{label}</span>
            <span className="mt-2 flex items-baseline gap-1.5">
                <span
                    className={cn(
                        "font-display font-semibold tabular-nums tracking-[-0.01em]",
                        lead ? "text-[28px] leading-8" : "text-[22px] leading-7",
                        VALUE_TONE[tone],
                    )}
                >
                    {value}
                </span>
                {unit && <span className="text-[13px] font-medium text-ink-3">{unit}</span>}
            </span>
            {hint && <span className="mt-1 line-clamp-2 text-xs text-ink-3 sm:block sm:truncate">{hint}</span>}
        </>
    );
    const base = "relative flex min-w-0 flex-col bg-surface px-5 py-4 text-left";
    if (!onClick) {
        return (
            <div {...rest} className={cn(base, className)}>
                {body}
            </div>
        );
    }
    return (
        <button
            {...rest}
            type="button"
            onClick={onClick}
            aria-pressed={pressed}
            className={cn(
                base,
                "transition-colors duration-150 hover:bg-surface-2",
                FOCUS_RING,
                "focus-visible:ring-inset focus-visible:ring-offset-0",
                pressed && "bg-surface-2 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary",
                className,
            )}
        >
            {body}
        </button>
    );
}

/** Stand-in for a figure that is still loading: a flat bar at the figure's size. */
export function MetricPlaceholder({ wide }: { wide?: boolean }) {
    return <span className={cn("inline-block h-6 rounded-md bg-surface-3 align-middle", wide ? "w-36" : "w-14")} aria-hidden />;
}

/**
 * The filters after the search field. On a phone they share one row that
 * scrolls sideways, so the list starts on the first screen; from `sm` up they
 * flow in the toolbar as if this wrapper were not there.
 */
export function ToolbarScroller({ children }: { children: ReactNode }) {
    return (
        <div className="-mx-4 flex w-[calc(100%+2rem)] items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:contents [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
            {children}
        </div>
    );
}

/** Flat bordered block: the list, the table, the feed. */
export function Panel({ children, className, ...rest }: { children: ReactNode; className?: string } & Record<`data-${string}`, string>) {
    return (
        <section {...rest} className={cn("relative overflow-hidden rounded-2xl border border-line bg-surface", className)}>
            {children}
        </section>
    );
}

/** Title row of a Panel on the detail screens: what the block is, a count or an action on the right. */
export function PanelHeader({
    title,
    description,
    meta,
    actions,
    id,
    className,
}: {
    title: ReactNode;
    description?: ReactNode;
    /** Small grey note on the right ("12 missions"). */
    meta?: ReactNode;
    actions?: ReactNode;
    /** For aria-labelledby on the Panel. */
    id?: string;
    className?: string;
}) {
    return (
        <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line-subtle px-5 py-3.5", className)}>
            <div className="min-w-0">
                <h2 id={id} className="text-sm font-semibold leading-5 text-ink">
                    {title}
                </h2>
                {description && <p className="mt-0.5 text-xs leading-4 text-ink-3">{description}</p>}
            </div>
            {(meta || actions) && (
                <div className="flex shrink-0 items-center gap-3">
                    {meta && <span className="text-xs tabular-nums text-ink-3">{meta}</span>}
                    {actions}
                </div>
            )}
        </div>
    );
}

/** Heading of a group of rows inside a Panel (a day, a category), with its count. */
export function GroupHeading({ children, count, className }: { children: ReactNode; count?: ReactNode; className?: string }) {
    return (
        <h3 className={cn("flex items-baseline gap-2 border-b border-line-subtle bg-surface-2 px-5 py-2 text-[13px] font-semibold text-ink", className)}>
            {children}
            {count !== undefined && <span className="text-xs font-normal tabular-nums text-ink-3">{count}</span>}
        </h3>
    );
}

/** Way back from a detail screen to its list. */
export function HubBackLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <Link
            href={href}
            className={cn("inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium text-ink-3 transition-colors hover:text-ink", FOCUS_RING)}
        >
            <ArrowLeft className="size-4" aria-hidden />
            {children}
        </Link>
    );
}

/** Row of controls at the top of a Panel. */
export function PanelToolbar({ children, className, ...rest }: { children: ReactNode; className?: string } & Record<`data-${string}`, string>) {
    return (
        <div {...rest} className={cn("flex flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-3", className)}>
            {children}
        </div>
    );
}

/** A thin bar along a panel's top edge while data already on screen refreshes. */
export function RefreshBar({ active }: { active: boolean }) {
    if (!active) return null;
    return (
        <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary-100" aria-hidden>
            <div className="h-full w-1/3 animate-pulse bg-primary-500 motion-reduce:animate-none" />
        </div>
    );
}

/** Search field; "/" focuses it from anywhere on the screen. */
export const SearchField = forwardRef<HTMLInputElement, {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    label?: string;
    shortcut?: boolean;
    className?: string;
}>(function SearchField({ value, onChange, placeholder, label = "Rechercher", shortcut = true, className }, ref) {
    return (
        <label className={cn("relative block min-w-[200px] flex-1", className)}>
            <span className="sr-only">{label}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
            <input
                ref={ref}
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={cn(
                    "h-9 w-full rounded-[10px] border border-line bg-surface pl-9 pr-9 text-[13px] text-ink placeholder:text-ink-4 transition-[border-color,box-shadow] duration-150",
                    "hover:border-line-strong focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-500/12",
                    "[&::-webkit-search-cancel-button]:hidden",
                )}
            />
            {value ? (
                <button
                    type="button"
                    onClick={() => onChange("")}
                    aria-label="Effacer la recherche"
                    className={cn("absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-4 hover:bg-surface-3 hover:text-ink-2", FOCUS_RING)}
                >
                    <X className="size-3.5" />
                </button>
            ) : shortcut ? (
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-surface-2 px-1.5 font-sans text-[11px] leading-[18px] text-ink-3 sm:block">
                    /
                </kbd>
            ) : null}
        </label>
    );
});

/** Focuses `ref` when "/" is pressed outside a field or a dialog. */
export function useSlashFocus(ref: React.RefObject<HTMLInputElement | null>) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
            const t = e.target as HTMLElement;
            if (t.closest("input, textarea, select, [contenteditable='true']")) return;
            if (document.querySelector('[role="dialog"]')) return;
            e.preventDefault();
            ref.current?.focus();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [ref]);
}

/** Native select, styled as a 36px toolbar control. */
export function FilterSelect({
    label,
    value,
    onChange,
    children,
    active,
    className,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    children: ReactNode;
    /** A value other than the default is chosen: the control says so. */
    active?: boolean;
    className?: string;
}) {
    return (
        <label className={cn("relative inline-flex", className)}>
            <span className="sr-only">{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={cn(
                    "h-9 max-w-[220px] cursor-pointer appearance-none truncate rounded-[10px] border bg-surface pl-3 pr-8 text-[13px] transition-[border-color,box-shadow] duration-150",
                    "hover:border-line-strong focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-500/12",
                    active ? "border-primary-300 font-medium text-ink" : "border-line text-ink-2",
                )}
            >
                {children}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
        </label>
    );
}

export interface HubTab<T extends string> {
    value: T;
    label: string;
    count?: number;
    /** Second line under the label (an amount). */
    sub?: ReactNode;
    dot?: string;
}

/** Underline tabs on one rule, each with its count. Arrow keys move along. */
export function HubTabs<T extends string>({
    tabs,
    value,
    onChange,
    ariaLabel,
    className,
}: {
    tabs: HubTab<T>[];
    value: T;
    onChange: (value: T) => void;
    ariaLabel: string;
    className?: string;
}) {
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const at = tabs.findIndex((t) => t.value === value);
        const next = (at + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        onChange(tabs[next].value);
        refs.current[next]?.focus();
    };
    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            onKeyDown={onKeyDown}
            className={cn("flex min-w-0 items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
        >
            {tabs.map((tab, i) => {
                const selected = tab.value === value;
                return (
                    <button
                        key={tab.value}
                        ref={(el) => {
                            refs.current[i] = el;
                        }}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onChange(tab.value)}
                        className={cn(
                            "group relative shrink-0 rounded-t-lg px-3 pb-2.5 pt-2 text-left transition-colors duration-150",
                            FOCUS_RING,
                            "focus-visible:ring-offset-0",
                        )}
                    >
                        <span className={cn("flex items-center gap-1.5 whitespace-nowrap text-[13px]", selected ? "font-semibold text-ink" : "font-medium text-ink-3 group-hover:text-ink")}>
                            {tab.dot && <span className={cn("size-2 shrink-0 rounded-full", tab.dot)} aria-hidden />}
                            {tab.label}
                            {tab.count !== undefined && (
                                <span className={cn("tabular-nums", selected ? "text-ink-2" : "text-ink-4 group-hover:text-ink-3")}>{tab.count}</span>
                            )}
                        </span>
                        {tab.sub && <span className="mt-0.5 block whitespace-nowrap text-xs tabular-nums text-ink-3">{tab.sub}</span>}
                        <span
                            aria-hidden
                            className={cn("absolute inset-x-3 bottom-0 h-0.5 rounded-full transition-colors duration-150", selected ? "bg-primary" : "bg-transparent")}
                        />
                    </button>
                );
            })}
        </div>
    );
}

/** One sentence inside the block that has nothing to show, with its next step. */
export function PanelMessage({
    children,
    action,
    tone = "neutral",
    className,
}: {
    children: ReactNode;
    action?: ReactNode;
    tone?: "neutral" | "error";
    className?: string;
}) {
    return (
        <div
            role={tone === "error" ? "alert" : undefined}
            className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center text-[13px]", tone === "error" ? "text-ink-2" : "text-ink-3", className)}
        >
            <p className="flex max-w-md items-start gap-2">
                {tone === "error" && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
                <span>{children}</span>
            </p>
            {action}
        </div>
    );
}

/** Text action used inside messages and rows. */
export function TextButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            {...props}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[13px] font-semibold text-primary-700 transition-colors hover:bg-primary-50 disabled:pointer-events-none disabled:opacity-40",
                FOCUS_RING,
                className,
            )}
        >
            {children}
        </button>
    );
}

/** Loading rows at the real pitch: flat bars, no shimmer, no layout shift. */
export function SkeletonRows({ rows = 6, columns = [40, 18, 14, 12, 10], pitch = "py-4" }: { rows?: number; columns?: number[]; pitch?: string }) {
    return (
        <div aria-busy="true" aria-label="Chargement" className="divide-y divide-line-subtle">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className={cn("flex items-center gap-6 px-5", pitch)}>
                    <span className="size-8 shrink-0 rounded-full bg-surface-3" />
                    {columns.map((w, j) => (
                        <span key={j} className="h-3 rounded bg-surface-3" style={{ width: `${Math.max(6, w - (i % 3) * 2)}%` }} />
                    ))}
                </div>
            ))}
        </div>
    );
}
