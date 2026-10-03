"use client";

// ============================================
// ACCUEIL UI — the visual vocabulary of the SDR "Accueil" page (app/sdr/page.tsx),
// shared so every role's home reads the same way (manager dashboard, client portal).
//
// Built on the design-system tokens (app/globals.css, brand/brand.config.ts),
// so the whole vocabulary follows the agency brand.
//
// Colour is semantic, never decorative:
//   emerald = done / RDV / on track     amber  = to handle / callbacks
//   rose    = overdue / late            indigo = qualified & hot leads, info (→ brand primary)
//   teal    = rates / rhythm            violet = analysis / AI / help (→ brand accent)
//   brand primary (bg-primary) = the page's one primary action and the hero card (bg-inverse).
//
// Geometry: radii are concentric — a child inset by p from a parent of radius R
// gets R − p (min 6px). Card 24px → inner blocks 16px → their chips 8–12px;
// a p-1 track of 12px → 8px segments. Borders are 1px hairlines (border-line on
// cards, border-line-subtle for dividers); depth comes from soft shadows, never 2px strokes.
// ============================================

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronDown, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING, FOCUS_RING_INVERSE } from "@/components/ui/recipes";

export type AccueilTone = "emerald" | "amber" | "rose" | "indigo" | "teal" | "violet" | "slate";

/** Keyboard focus, identical on every control. */
export const FOCUS = FOCUS_RING;
const FOCUS_DARK = FOCUS_RING_INVERSE;

// Literal class strings so Tailwind's scanner sees every one of them.
const TILE: Record<AccueilTone, string> = {
    emerald: "bg-emerald-500 text-white",
    amber: "bg-amber-500 text-white",
    rose: "bg-rose-600 text-white",
    indigo: "bg-primary-600 text-white",
    teal: "bg-teal-500 text-white",
    violet: "bg-accent-600 text-white",
    slate: "bg-zinc-900 text-white",
};

const TILE_GLOW: Record<AccueilTone, string> = {
    emerald: "shadow-[0_1px_2px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.16)]",
    amber: "shadow-[0_1px_2px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.16)]",
    rose: "shadow-[0_1px_2px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.16)]",
    indigo: "shadow-[0_1px_2px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.16)]",
    teal: "shadow-[0_1px_2px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.16)]",
    violet: "shadow-[0_1px_2px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.16)]",
    slate: "shadow-[0_1px_2px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.12)]",
};

/** Small filled badge next to a number ("Validés", "3 urgent(s)"). */
export const BADGE: Record<AccueilTone, string> = {
    emerald: "text-emerald-800 bg-emerald-100",
    amber: "text-amber-900 bg-amber-100",
    rose: "text-rose-800 bg-rose-100",
    indigo: "text-primary-800 bg-primary-100",
    teal: "text-teal-800 bg-teal-100",
    violet: "text-accent-800 bg-accent-100",
    slate: "text-ink-2 bg-surface-3",
};

/** Outlined pill (header statuses, row tags). */
export const PILL: Record<AccueilTone, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    amber: "bg-amber-50 text-amber-800 border-amber-200/80",
    rose: "bg-rose-50 text-rose-700 border-rose-200/80",
    indigo: "bg-primary-50 text-primary-700 border-primary-200/80",
    teal: "bg-teal-50 text-teal-700 border-teal-200/80",
    violet: "bg-accent-50 text-accent-700 border-accent-200/80",
    slate: "bg-surface-2 text-ink-2 border-line",
};

export const TEXT: Record<AccueilTone, string> = {
    emerald: "text-emerald-600",
    amber: "text-amber-700",
    rose: "text-rose-600",
    indigo: "text-primary-600",
    teal: "text-teal-600",
    violet: "text-accent-600",
    slate: "text-ink-3",
};

export const BAR: Record<AccueilTone, string> = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    indigo: "bg-primary-500",
    teal: "bg-teal-500",
    violet: "bg-accent-500",
    slate: "bg-slate-300",
};

/** Tinted row surface (alert rows): soft fill + matching hairline. */
export const ROW: Record<AccueilTone, string> = {
    emerald: "bg-emerald-50/60 border-emerald-200/80 hover:border-emerald-300",
    amber: "bg-amber-50/70 border-amber-200/80 hover:border-amber-300",
    rose: "bg-danger-soft border-rose-200 hover:border-rose-300",
    indigo: "bg-primary-50/60 border-primary-200/80 hover:border-primary-300",
    teal: "bg-teal-50/60 border-teal-200/80 hover:border-teal-300",
    violet: "bg-accent-50/60 border-accent-200/80 hover:border-accent-300",
    slate: "bg-surface border-line hover:border-line-strong",
};

export const RING_HEX: Record<AccueilTone, string> = {
    emerald: "#10B981",
    amber: "#F59E0B",
    rose: "#F43F5E",
    indigo: "var(--brand-primary-600)",
    teal: "#14B8A6",
    violet: "var(--brand-accent-500)",
    slate: "var(--brand-neutral-400)",
};

// ── Surfaces ────────────────────────────────────────────────────────────────

export const CARD = "bg-surface rounded-3xl border border-line shadow-card";
/** Hover for a whole card that is a link: edge darkens, shadow lifts, nothing moves. */
export const CARD_HOVER = "transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-raised";

export function AccueilCard({ className, children }: { className?: string; children: ReactNode }) {
    return <section className={cn(CARD, "p-6", className)}>{children}</section>;
}

/** The brand hero card of the SDR page (active mission card), on bg-inverse. */
export function HeroCard({ className, children }: { className?: string; children: ReactNode }) {
    return (
        <section
            className={cn(
                "relative isolate overflow-hidden rounded-3xl bg-inverse text-inverse-ink p-6 sm:p-7 border border-inverse-line",
                "shadow-[0_4px_16px_color-mix(in_oklab,var(--brand-primary)_28%,transparent),inset_0_1px_0_rgba(255,255,255,0.06)]",
                className,
            )}
        >
            {/* One soft light source, top-right: depth without decoration. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_100%_0%,color-mix(in_oklab,var(--brand-accent)_9%,transparent),transparent_55%)]" />
            {children}
        </section>
    );
}

/** Inner tile of the hero card. 16px radius inside the 24px hero. */
export function HeroTile({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
    return (
        <div className={cn("p-3 sm:p-3.5 rounded-2xl bg-inverse-raised border border-inverse-line min-w-0", className)}>
            <span className="text-[11px] text-inverse-ink-3 font-bold block truncate">{label}</span>
            <div className="text-base sm:text-lg font-black text-white mt-0.5 leading-tight truncate">{children}</div>
        </div>
    );
}

export function HeroPill({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-bold bg-white/10 text-inverse-ink-2 border border-inverse-line whitespace-nowrap">
            {Icon && <Icon className="w-3.5 h-3.5 text-accent-300" aria-hidden />}
            {children}
        </span>
    );
}

// ── Headers ─────────────────────────────────────────────────────────────────

export function IconTile({ icon: Icon, tone, size = "sm" }: { icon: LucideIcon; tone: AccueilTone; size?: "sm" | "lg" }) {
    return size === "lg" ? (
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0", TILE[tone], TILE_GLOW[tone])}>
            <Icon className="w-6 h-6 stroke-[2.2]" aria-hidden />
        </div>
    ) : (
        <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs", TILE[tone])}>
            <Icon className="w-4 h-4" aria-hidden />
        </div>
    );
}

export function CountChip({ children }: { children: ReactNode }) {
    return <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-surface-3 text-ink tabular-nums">{children}</span>;
}

/**
 * Card header: tone tile + title (+ count chip) + one line of context, with an
 * optional control on the right. "sm" is the side-column variant of the SDR page.
 */
export function SectionHeader({
    icon,
    tone,
    title,
    count,
    subtitle,
    right,
    size = "md",
}: {
    icon: LucideIcon;
    tone: AccueilTone;
    title: string;
    count?: ReactNode;
    subtitle?: ReactNode;
    right?: ReactNode;
    size?: "md" | "sm";
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-3 border-b border-line-subtle">
            <div className="flex items-center gap-2.5 min-w-0">
                <IconTile icon={icon} tone={tone} />
                <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <h2 className={cn("text-ink tracking-tight truncate", size === "md" ? "text-base font-extrabold" : "text-sm font-black")}>
                            {title}
                        </h2>
                        {count !== undefined && <CountChip>{count}</CountChip>}
                    </div>
                    {subtitle && <p className="text-[11px] text-ink-3 font-semibold mt-0.5 truncate">{subtitle}</p>}
                </div>
            </div>
            {right}
        </div>
    );
}

// ── Controls ────────────────────────────────────────────────────────────────

export interface SegmentOption<T extends string> {
    value: T;
    label: ReactNode;
    /** Rose active state, for an "En retard" kind of filter. */
    alert?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
}

/** Track 12px / p-1 → segments 8px (concentric). */
export function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
    ariaLabel,
    className,
}: {
    options: SegmentOption<T>[];
    value: T;
    onChange: (v: T) => void;
    ariaLabel: string;
    className?: string;
}) {
    return (
        <div
            role="radiogroup"
            aria-label={ariaLabel}
            className={cn("inline-flex items-center gap-1 p-1 bg-surface-3 rounded-xl border border-line text-xs font-bold flex-shrink-0", className)}
        >
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={o.ariaLabel}
                        disabled={o.disabled}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            "h-7 px-3 rounded-lg transition-[background-color,color,box-shadow] duration-150 whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none",
                            FOCUS,
                            "focus-visible:ring-offset-slate-100",
                            o.alert
                                ? active ? "bg-rose-600 text-white shadow-sm" : "text-rose-600 hover:text-rose-700"
                                : active ? "bg-surface text-ink shadow-[0_1px_2px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.04)]" : "text-ink-2 hover:text-ink",
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

/** Same control on the forest hero. */
export function HeroSegmented<T extends string>({
    options,
    value,
    onChange,
    ariaLabel,
}: {
    options: SegmentOption<T>[];
    value: T;
    onChange: (v: T) => void;
    ariaLabel: string;
}) {
    return (
        <div role="radiogroup" aria-label={ariaLabel} className="inline-flex items-center gap-1 p-1 rounded-xl bg-inverse-raised border border-inverse-line text-xs font-bold">
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={o.ariaLabel}
                        disabled={o.disabled}
                        onClick={() => onChange(o.value)}
                        className={cn(
                            "h-7 min-w-7 px-2.5 rounded-lg inline-flex items-center justify-center transition-colors duration-150 whitespace-nowrap disabled:opacity-35 disabled:pointer-events-none",
                            FOCUS_DARK,
                            active ? "bg-surface text-primary shadow-sm" : "text-inverse-ink-2 hover:text-inverse-ink hover:bg-white/10",
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

const BUTTON_BASE = "inline-flex items-center justify-center gap-2 font-bold whitespace-nowrap select-none transition-[background-color,border-color,box-shadow,color,transform] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";

/** The page's one primary action — brand primary, like "Démarrer les appels". 44px tall, 16px radius. */
export const PRIMARY_BUTTON = cn(
    BUTTON_BASE,
    FOCUS,
    "h-11 px-5 rounded-2xl bg-primary hover:bg-primary-hover active:bg-primary-active text-primary-fg text-xs font-black tracking-tight shadow-primary",
);

/** Quiet white control (filters). 36px tall, 12px radius. */
export const SECONDARY_BUTTON = cn(
    BUTTON_BASE,
    FOCUS,
    "h-9 px-3.5 rounded-xl bg-surface border border-line text-xs text-ink-2 shadow-2xs hover:border-line-strong hover:bg-surface-2 hover:text-ink",
);

export const ICON_BUTTON = cn(
    BUTTON_BASE,
    FOCUS,
    "h-9 w-9 rounded-xl bg-surface border border-line text-ink-3 shadow-2xs hover:text-ink hover:border-line-strong hover:bg-surface-2",
);

/** Inline text link in a card header ("Voir tout"). */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
    return (
        <Link
            href={href}
            className={cn(
                "group inline-flex items-center gap-1 h-7 px-2 -mr-2 rounded-lg text-xs font-bold text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors",
                FOCUS,
            )}
        >
            {children}
            <ArrowUpRight className="w-3.5 h-3.5 text-ink-4 group-hover:text-ink-2 transition-colors" aria-hidden />
        </Link>
    );
}

export function SelectField({
    value,
    onChange,
    ariaLabel,
    children,
    className,
}: {
    value: string;
    onChange: (v: string) => void;
    ariaLabel: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("relative", className)}>
            <select
                aria-label={ariaLabel}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={cn(
                    "h-9 w-full appearance-none pl-3.5 pr-8 rounded-xl bg-surface border border-line text-xs font-bold text-ink-2 shadow-2xs cursor-pointer",
                    "hover:border-line-strong transition-colors truncate",
                    FOCUS,
                )}
            >
                {children}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-ink-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
        </div>
    );
}

// ── Status & figures ────────────────────────────────────────────────────────

export function StatusPill({ tone, icon: Icon, pulse, children, title }: {
    tone: AccueilTone;
    icon?: LucideIcon;
    pulse?: boolean;
    children: ReactNode;
    title?: string;
}) {
    return (
        <span title={title} className={cn("inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-semibold border shadow-2xs whitespace-nowrap", PILL[tone])}>
            {pulse && (
                <span className="relative flex w-2 h-2" aria-hidden>
                    <span className={cn("absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping", BAR[tone])} />
                    <span className={cn("relative w-2 h-2 rounded-full", BAR[tone])} />
                </span>
            )}
            {Icon && <Icon className="w-3.5 h-3.5" aria-hidden />}
            {children}
        </span>
    );
}

export function CircularProgress({ percent, tone = "emerald", size = 52, strokeWidth = 4.5, track = "var(--ds-line)", labelClassName }: {
    percent: number;
    tone?: AccueilTone;
    size?: number;
    strokeWidth?: number;
    track?: string;
    labelClassName?: string;
}) {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const clamped = Math.min(100, Math.max(0, percent));
    const offset = circumference - (clamped / 100) * circumference;
    return (
        <div
            className="relative inline-flex items-center justify-center flex-shrink-0"
            style={{ width: size, height: size }}
            role="img"
            aria-label={`${Math.round(percent)} %`}
        >
            <svg width={size} height={size} className="-rotate-90" aria-hidden>
                <circle cx={size / 2} cy={size / 2} r={radius} stroke={track} strokeWidth={strokeWidth} fill="transparent" />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={RING_HEX[tone]}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-1000 ease-out"
                />
            </svg>
            <span className={cn("absolute text-[11px] font-black text-ink", labelClassName)}>{Math.round(percent)}%</span>
        </div>
    );
}

/**
 * Signed change vs a named period. Colour = direction (up is good for every
 * figure on these pages). null → an explicit "—" instead of a fake 0 %.
 */
export function Delta({ value, unit = "%", suffix, onDark }: { value: number | null; unit?: "%" | "pt"; suffix?: string; onDark?: boolean }) {
    if (value === null) {
        return (
            <span className={cn("inline-flex items-center gap-1 text-[11px] font-bold", onDark ? "text-inverse-ink-3" : "text-ink-4")}>
                <Minus className="w-3 h-3" aria-hidden />
                {suffix ? `Pas de base ${suffix}` : "—"}
            </span>
        );
    }
    const up = value > 0;
    const flat = value === 0;
    const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
    const n = Math.abs(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
    const tone = flat
        ? onDark ? "text-inverse-ink-2" : "text-ink-3"
        : up
            ? onDark ? "text-emerald-300" : "text-emerald-600"
            : onDark ? "text-rose-300" : "text-rose-600";
    return (
        <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums", tone)}>
            <Icon className="w-3.5 h-3.5" aria-hidden />
            {flat ? "0" : `${up ? "+" : "−"}${n}`}{unit === "pt" ? " pt" : " %"}
            {suffix && <span className={cn("font-semibold ml-1", onDark ? "text-inverse-ink-3" : "text-ink-4")}>{suffix}</span>}
        </span>
    );
}

/**
 * KPI card of the top row: uppercase label, big number (+ optional "/ target"),
 * an optional badge, one line of context, and a visual on the right.
 */
export function KpiCard({
    label,
    value,
    target,
    badge,
    sub,
    visual,
    href,
    className,
}: {
    label: string;
    value: ReactNode;
    target?: ReactNode;
    badge?: { text: string; tone: AccueilTone };
    sub?: ReactNode;
    visual: ReactNode;
    href?: string;
    className?: string;
}) {
    const body = (
        <>
            <div className="space-y-1 min-w-0">
                <span className="text-xs font-bold text-ink-4 uppercase tracking-wider block truncate">{label}</span>
                <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-3xl font-black text-ink tracking-tight leading-none">{value}</span>
                    {target !== undefined && <span className="text-xs font-bold text-ink-4">/ {target}</span>}
                    {badge && (
                        <span className={cn("text-[10px] font-extrabold px-2 py-0.5 rounded-full whitespace-nowrap self-center", BADGE[badge.tone])}>
                            {badge.text}
                        </span>
                    )}
                </div>
                {sub && <div className="text-[11px] font-semibold text-ink-3 truncate pt-0.5">{sub}</div>}
            </div>
            {visual}
        </>
    );
    const cls = cn(CARD, "p-5 flex items-center justify-between gap-4 min-w-0", className);
    return href ? (
        <Link href={href} className={cn(cls, CARD_HOVER, FOCUS)}>{body}</Link>
    ) : (
        <div className={cn(cls, "transition-[border-color] duration-200 hover:border-line-strong")}>{body}</div>
    );
}

/** Inner stat tile (slate-50, 16px radius inside a 24px card). */
export function StatTile({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
    return (
        <div className={cn("p-3 rounded-2xl bg-surface-2 border border-line min-w-0", className)}>
            <span className="text-[10px] text-ink-4 font-bold flex items-center gap-1 uppercase tracking-wider truncate">{label}</span>
            <div className="text-lg font-black text-ink mt-0.5 leading-tight">{children}</div>
        </div>
    );
}

export function ProgressBar({ percent, tone = "emerald", className, label, fillClassName }: {
    percent: number;
    tone?: AccueilTone;
    className?: string;
    label?: string;
    fillClassName?: string;
}) {
    const clamped = Math.min(100, Math.max(0, percent));
    return (
        <div
            className={cn("h-2 w-full bg-surface-3 rounded-full overflow-hidden", className)}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(clamped)}
            aria-label={label}
        >
            <div
                className={cn("h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700 ease-out", fillClassName ?? BAR[tone])}
                style={{ width: `${clamped}%` }}
            />
        </div>
    );
}

export function EmptyBlock({ title, hint, icon: Icon = CheckCircle2, tone = "emerald", compact }: {
    title: string;
    hint?: string;
    icon?: LucideIcon;
    tone?: AccueilTone;
    compact?: boolean;
}) {
    return (
        <div className={cn("px-6 text-center space-y-2 bg-surface-2/60 rounded-2xl border border-dashed border-line", compact ? "py-7" : "py-10")}>
            <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center mx-auto shadow-2xs", BADGE[tone])}>
                <Icon className="w-6 h-6" aria-hidden />
            </div>
            <p className="text-sm font-bold text-ink">{title}</p>
            {hint && <p className="text-xs text-ink-3 max-w-xs mx-auto leading-relaxed">{hint}</p>}
        </div>
    );
}

export function Initials({ name, strong, size = "md" }: { name: string; strong?: boolean; size?: "md" | "sm" }) {
    const initials = name.split(/\s+/).filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
    return (
        <div
            aria-hidden
            className={cn(
                "flex items-center justify-center font-black flex-shrink-0",
                size === "md" ? "w-9 h-9 rounded-xl text-[11px]" : "w-7 h-7 rounded-lg text-[10px]",
                strong
                    ? "bg-primary text-primary-fg shadow-[0_2px_6px_color-mix(in_oklab,var(--brand-primary)_25%,transparent),inset_0_1px_0_rgba(255,255,255,0.10)]"
                    : "bg-surface border border-line text-ink-2 shadow-2xs",
            )}
        >
            {initials}
        </div>
    );
}

/** Placeholder block for loading states — give it the radius of what it stands for. */
export function Shimmer({ className, style }: { className?: string; style?: CSSProperties }) {
    return <div aria-hidden style={style} className={cn("motion-safe:animate-pulse bg-slate-200/60 rounded-2xl", className)} />;
}

/** Tooltip body for Recharts, in the card language. */
export function ChartTooltip({ active, payload, label, unit }: {
    active?: boolean;
    payload?: readonly { name?: string | number; value?: unknown; color?: string }[];
    label?: string | number;
    unit?: string;
}) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-xl bg-surface border border-line shadow-[0_8px_24px_rgba(15,23,42,0.10)] px-3 py-2 text-xs min-w-[136px]">
            {label !== undefined && label !== "" && (
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-4 mb-1 capitalize">{label}</p>
            )}
            {payload.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="flex items-center gap-1.5 text-ink-2 font-semibold">
                        <span className="w-2 h-2 rounded-full" style={{ background: p.color }} aria-hidden />
                        {p.name}
                    </span>
                    <span className="font-black text-ink tabular-nums">
                        {typeof p.value === "number" ? p.value.toLocaleString("fr-FR") : String(p.value ?? "")}
                        {unit ? ` ${unit}` : ""}
                    </span>
                </div>
            ))}
        </div>
    );
}

/** "à l'instant", "il y a 12 min", "il y a 3 h", "hier", "il y a 4 j", then a date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
    const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
    const min = Math.floor(diff / 60_000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `il y a ${h} h`;
    const d = Math.floor(h / 24);
    if (d === 1) return "hier";
    if (d < 7) return `il y a ${d} j`;
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function formatInt(n: number): string {
    return n.toLocaleString("fr-FR");
}
