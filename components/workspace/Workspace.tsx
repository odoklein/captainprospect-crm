"use client";

// ============================================
// WORKSPACE — the one page frame of the manager's working views (Appels,
// Journal d'appels, Listes). Edge to edge, the height of the window; four
// fixed bands and one region that scrolls:
//
//   header    56px   title 18/600, one primary action, the view tabs under it
//   toolbar   44px   search, filters, result count
//   scroll           numbers (they scroll with the list), then the collection;
//                    a container (@container): columns drop by priority with
//                    the width the region really gets, never sideways scroll
//   footer    40px   paging and keyboard hints, right-aligned (the dock floats
//                    bottom left)
//
// One gutter (24px, 16px on phones) for every band and the first cell of every
// table: that single left edge is the grid. Workspace density: 32px controls,
// 40px rows. Forms (Paramètres) keep 40px controls.
// ============================================

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from "react";
import { CalendarRange, RotateCcw, Search, X } from "lucide-react";
import { Kbd } from "@/components/ui";
import { cn } from "@/lib/utils";

export const GUTTER_X = "px-4 sm:px-6";
/** Table header cell. First cell adds the gutter: `cn(TH, FIRST_CELL)`. */
export const TH = "h-9 px-3 py-0 text-left text-xs font-medium text-ink-3 whitespace-nowrap";
export const TD = "px-3 py-2 align-middle";
export const FIRST_CELL = "pl-4 sm:pl-6";
export const LAST_CELL = "pr-4 sm:pr-6";
export const CONTROL =
    "flex h-8 items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-[12.5px] text-ink-2 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
export const PRIMARY_CONTROL =
    "cp-press flex h-8 items-center gap-1.5 rounded-control bg-primary px-3 text-[12.5px] font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
export const ICON_CONTROL =
    "flex h-8 w-8 items-center justify-center rounded-control border border-line text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

/** Wide enough for a pane beside the collection; null until known (SSR). */
export function useWide(min = 1024): boolean | null {
    return useSyncExternalStore<boolean | null>(
        (onChange) => {
            const mql = window.matchMedia(`(min-width: ${min}px)`);
            mql.addEventListener("change", onChange);
            return () => mql.removeEventListener("change", onChange);
        },
        () => window.matchMedia(`(min-width: ${min}px)`).matches,
        () => null,
    );
}

export function WorkspaceFrame({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn("cp-calling-workspace flex h-full min-h-0 w-full bg-canvas", className)}>{children}</div>;
}

export function WorkspaceMain({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn("flex min-w-0 flex-1 flex-col", className)}>{children}</div>;
}

export function WorkspaceHeader({
    title,
    subtitle,
    actions,
    tabs,
    leading,
    badge,
}: {
    title: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
    tabs?: ReactNode;
    /** Before the title (a back button on phones). */
    leading?: ReactNode;
    /** After the title, on its line (a verdict). */
    badge?: ReactNode;
}) {
    return (
        <header className={cn("shrink-0 border-b border-line bg-surface", GUTTER_X, !tabs && "pb-3")}>
            <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-3">
                <div className="flex min-w-0 items-center gap-3">
                    {leading}
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                            <h1 className="truncate text-[18px] font-semibold leading-tight tracking-[-0.015em] text-ink">{title}</h1>
                            {badge}
                        </div>
                        {subtitle && <p className="mt-0.5 truncate text-[12px] text-ink-3">{subtitle}</p>}
                    </div>
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
            {tabs && <div className="mt-2">{tabs}</div>}
        </header>
    );
}

export interface ViewTab<T extends string> {
    id: T;
    label: string;
    count?: number | null;
    /** danger: something to act on (À surveiller); primary: the process gap (Sans statut). */
    tone?: "default" | "primary" | "danger";
    /** The shortcut shown in its title (1, 2, 3). */
    hotkey?: string;
}

export function ViewTabs<T extends string>({
    tabs,
    value,
    onChange,
    label,
}: {
    tabs: ViewTab<T>[];
    value: T;
    onChange: (id: T) => void;
    label: string;
}) {
    return (
        <nav className="flex items-center gap-5 overflow-x-auto" aria-label={label}>
            {tabs.map((t) => (
                <button
                    key={t.id}
                    type="button"
                    onClick={() => onChange(t.id)}
                    aria-current={value === t.id ? "page" : undefined}
                    title={t.hotkey ? `${t.label} (${t.hotkey})` : undefined}
                    className={cn(
                        "-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-2.5 text-[13px] font-medium transition-colors",
                        value === t.id ? "border-primary text-ink" : "border-transparent text-ink-3 hover:text-ink",
                    )}
                >
                    {t.label}
                    {t.count != null && t.count > 0 && (
                        <span
                            className={cn(
                                "rounded-full px-1.5 text-[11px] tabular-nums",
                                t.tone === "danger"
                                    ? "bg-danger text-white"
                                    : t.tone === "primary"
                                      ? "bg-primary text-primary-fg"
                                      : "bg-surface-3 text-ink-3",
                            )}
                        >
                            {t.count.toLocaleString("fr-FR")}
                        </span>
                    )}
                </button>
            ))}
        </nav>
    );
}

export function WorkspaceToolbar({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn("flex min-h-[44px] shrink-0 flex-wrap items-center gap-2 border-b border-line-subtle bg-surface py-1.5", GUTTER_X, className)}>
            {children}
        </div>
    );
}

export function SearchField({
    value,
    onChange,
    placeholder,
    inputRef,
    onKeyDown,
    label = "Rechercher",
    className,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    inputRef?: Ref<HTMLInputElement>;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    label?: string;
    className?: string;
}) {
    return (
        <label className={cn("relative flex h-8 min-w-[200px] flex-1 items-center sm:max-w-[380px]", className)}>
            <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-ink-3" aria-hidden />
            <input
                ref={inputRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                aria-label={label}
                className="h-full w-full rounded-control border border-line bg-surface-2/50 pl-8 pr-9 text-[13px] text-ink placeholder:text-ink-4 focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-focus"
            />
            {value ? (
                <button type="button" onClick={() => onChange("")} className="absolute right-2 text-ink-3 hover:text-ink" aria-label="Effacer la recherche">
                    <X className="h-4 w-4" />
                </button>
            ) : (
                <Kbd className="pointer-events-none absolute right-2">/</Kbd>
            )}
        </label>
    );
}

export interface FacetOption {
    id: string;
    label: string;
    count?: number;
}

export function FacetSelect({
    label,
    value,
    options,
    onChange,
    allLabel = "Tous",
    className,
}: {
    label: string;
    value: string;
    options: FacetOption[];
    onChange: (v: string) => void;
    allLabel?: string;
    className?: string;
}) {
    return (
        <label className={cn("relative flex h-8 items-center rounded-control border bg-surface text-[12.5px]", value ? "border-primary" : "border-line", className)}>
            <span className="pointer-events-none pl-3 text-ink-3">{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-full max-w-[220px] cursor-pointer appearance-none bg-transparent pl-1.5 pr-7 font-medium text-ink outline-none"
                aria-label={label}
            >
                <option value="">{allLabel}</option>
                {options.map((o) => (
                    <option key={o.id} value={o.id}>
                        {o.label}
                        {o.count != null ? ` (${o.count})` : ""}
                    </option>
                ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 text-[10px] text-ink-3" aria-hidden>
                ▾
            </span>
        </label>
    );
}

export function ToggleChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={pressed}
            className={cn(
                "cp-press flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-[12.5px] transition-colors",
                pressed ? "border-primary bg-primary-soft font-medium text-primary-soft-ink" : "border-line bg-surface text-ink-2 hover:text-ink",
            )}
        >
            {children}
        </button>
    );
}

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

/**
 * A date range behind one button (« Autre période »): the presets stay one
 * click away, the two dates one more. Values are yyyy-MM-dd or "".
 */
export function DateRangeButton({
    start,
    end,
    max,
    active,
    onChange,
    onClear,
    emptyLabel = "Autre période",
    note,
}: {
    start: string;
    end: string;
    max?: string;
    /** Show the range on the button (else `emptyLabel`). */
    active: boolean;
    onChange: (start: string, end: string) => void;
    onClear?: () => void;
    emptyLabel?: string;
    note?: string;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        };
        const esc = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", close);
        document.addEventListener("keydown", esc);
        return () => {
            document.removeEventListener("mousedown", close);
            document.removeEventListener("keydown", esc);
        };
    }, [open]);
    const label = !active
        ? emptyLabel
        : start && start === end
          ? dayLabel(start)
          : `${start ? dayLabel(start) : "…"} → ${end ? dayLabel(end) : "…"}`;
    const input = "mt-1 h-8 w-full rounded-control border border-line bg-surface px-2 text-[12.5px] text-ink";
    return (
        <div ref={ref} className="relative">
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn(CONTROL, active && "border-primary font-medium text-ink")}>
                <CalendarRange className="h-3.5 w-3.5" />
                {label}
            </button>
            {open && (
                <div className="absolute right-0 top-10 z-30 w-64 rounded-xl border border-line bg-surface p-3 shadow-lg">
                    <div className="grid grid-cols-2 gap-2">
                        <label className="text-[12px] text-ink-3">
                            Du
                            <input type="date" value={start} max={end || max} onChange={(e) => onChange(e.target.value, end)} className={input} />
                        </label>
                        <label className="text-[12px] text-ink-3">
                            Au
                            <input type="date" value={end} min={start || undefined} max={max} onChange={(e) => onChange(start, e.target.value)} className={input} />
                        </label>
                    </div>
                    {(note || (onClear && active)) && (
                        <div className="mt-2 flex items-start justify-between gap-2">
                            {note && <p className="text-[11.5px] text-ink-3">{note}</p>}
                            {onClear && active && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        onClear();
                                        setOpen(false);
                                    }}
                                    className="ml-auto shrink-0 text-[12px] font-medium text-ink-2 hover:text-ink"
                                >
                                    Effacer
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function ResetButton({ onClick, label = "Réinitialiser" }: { onClick: () => void; label?: string }) {
    return (
        <button type="button" onClick={onClick} className="flex h-8 items-center gap-1.5 rounded-control px-2 text-[12.5px] text-ink-3 hover:bg-surface-2 hover:text-ink">
            <RotateCcw className="h-3.5 w-3.5" /> {label}
        </button>
    );
}

/** The thin bar at the top of the scroll region while the next results load. */
export function LoadingBar({ loading }: { loading: boolean }) {
    return <div className={cn("sticky top-0 z-10 h-0.5 bg-primary transition-opacity motion-reduce:transition-none", loading ? "opacity-100" : "opacity-0")} />;
}

export function MetricStrip({ children, loading, after }: { children: ReactNode; loading?: boolean; after?: ReactNode }) {
    return (
        <section className={cn("border-b border-line-subtle py-4 transition-opacity", GUTTER_X, loading && "opacity-60")}>
            <dl className="flex flex-wrap gap-x-10 gap-y-3">{children}</dl>
            {after}
        </section>
    );
}

export function Metric({
    label,
    value,
    hint,
    delta,
    onClick,
    tone,
    title,
}: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    delta?: ReactNode;
    /** The number is also a filter (« À surveiller »). */
    onClick?: () => void;
    tone?: "danger" | "warning";
    title?: string;
}) {
    const body = (
        <>
            <dt className="text-[12px] font-medium text-ink-3">{label}</dt>
            <dd className="mt-0.5 flex items-baseline gap-1.5">
                <span
                    className={cn(
                        "text-[20px] font-semibold tabular-nums tracking-tight",
                        tone === "danger" ? "text-danger-ink" : tone === "warning" ? "text-warning-ink" : "text-ink",
                    )}
                >
                    {value}
                </span>
                {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
                {delta}
            </dd>
        </>
    );
    if (onClick) {
        return (
            <div title={title}>
                <button type="button" onClick={onClick} className="-m-1 rounded-control p-1 text-left hover:bg-surface-2">
                    {body}
                </button>
            </div>
        );
    }
    return <div title={title}>{body}</div>;
}

/** Change against the previous period of the same length. `better`: which way is good news. */
export function Delta({ now, before, better = "up" }: { now: number; before: number | null | undefined; better?: "up" | "down" | "neutral" }) {
    if (before == null || (before === 0 && now === 0)) return null;
    const label = before === 0 ? "nouveau" : (() => {
        const pct = Math.round(((now - before) / before) * 100);
        return pct === 0 ? "=" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)} %`;
    })();
    const up = now > before;
    const good = better === "neutral" || now === before ? null : (better === "up") === up;
    return (
        <span
            className={cn("text-[12px] tabular-nums", good === null ? "text-ink-3" : good ? "text-success-ink" : "text-danger-ink")}
            title={`Période précédente : ${before.toLocaleString("fr-FR")}`}
        >
            {label}
        </span>
    );
}

export function WorkspaceFooter({ children }: { children: ReactNode }) {
    return (
        <footer className={cn("flex h-10 shrink-0 items-center justify-end gap-4 border-t border-line bg-surface text-[12px] text-ink-3", GUTTER_X)}>
            {children}
        </footer>
    );
}

/** The few shortcuts useful now; « ? » lists them all. */
export function KeyHints({ hints, onHelp }: { hints: [string[], string][]; onHelp?: () => void }) {
    return (
        <span className="hidden items-center gap-3 text-[11px] text-ink-4 lg:flex">
            {hints.map(([keys, label]) => (
                <span key={label} className="flex items-center gap-1">
                    {keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                    ))}
                    <span className="ml-0.5">{label}</span>
                </span>
            ))}
            {onHelp && (
                <button type="button" onClick={onHelp} className="flex items-center gap-1 hover:text-ink">
                    <Kbd>?</Kbd> raccourcis
                </button>
            )}
        </span>
    );
}

export function PagerButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="h-7 rounded-control border border-line px-2.5 text-[12px] font-medium text-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
            {children}
        </button>
    );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
    return (
        <div className="divide-y divide-line-subtle" aria-busy="true">
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className={cn("flex items-center gap-6 py-3.5", GUTTER_X)}>
                    <div className="cp-shimmer h-3 w-12 rounded" />
                    <div className="cp-shimmer h-3 w-48 rounded" />
                    <div className="cp-shimmer h-3 w-28 rounded" />
                    <div className="cp-shimmer ml-auto h-3 w-16 rounded" />
                </div>
            ))}
        </div>
    );
}

export function EmptyBlock({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
    return (
        <div className="px-6 py-16 text-center">
            <p className="text-[14px] font-semibold text-ink">{title}</p>
            {body && <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-3">{body}</p>}
            {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
        </div>
    );
}

export interface ShortcutGroup {
    title: string;
    keys: [string[], string][];
}

/** « ? » — every shortcut of the page. */
export function ShortcutsDialog({ open, onClose, groups }: { open: boolean; onClose: () => void; groups: ShortcutGroup[] }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" || e.key === "?") {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Raccourcis clavier"
                className="max-h-[80vh] w-full max-w-[560px] overflow-auto rounded-2xl border border-line bg-surface p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold text-ink">Raccourcis clavier</h2>
                    <button type="button" onClick={onClose} className={ICON_CONTROL} aria-label="Fermer">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                    {groups.map((g) => (
                        <section key={g.title}>
                            <h3 className="text-[12px] font-medium text-ink-3">{g.title}</h3>
                            <ul className="mt-2 space-y-1.5">
                                {g.keys.map(([keys, label]) => (
                                    <li key={label} className="flex items-center justify-between gap-3 text-[13px] text-ink-2">
                                        <span>{label}</span>
                                        <span className="flex shrink-0 gap-1">
                                            {keys.map((k) => (
                                                <Kbd key={k}>{k}</Kbd>
                                            ))}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}
