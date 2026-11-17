"use client";

// Building blocks of the client onboarding portal. Colours come from the agency
// brand (bg-primary, bg-primary-50…), so every agency's portal wears its own.

import { forwardRef, useId, type ComponentType, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2";
export const CARD = "rounded-[20px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.08)]";

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/** Toggle chip: sectors, sizes, criteria, days… */
export function Chip({ selected, onClick, children, size = "md", disabled }: {
    selected: boolean;
    onClick: () => void;
    children: ReactNode;
    size?: "sm" | "md";
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border font-semibold transition-all duration-150",
                "motion-safe:active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none",
                size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
                selected
                    ? "border-primary bg-primary text-primary-fg shadow-[0_4px_12px_-4px_color-mix(in_oklab,var(--brand-primary)_45%,transparent)]"
                    : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink hover:bg-surface-2",
                FOCUS,
            )}
        >
            {children}
            {selected && <Check className="size-3.5 shrink-0" aria-hidden />}
        </button>
    );
}

/** Removable token (job titles, exclusions preview). */
export function Token({ children, onRemove, label }: { children: ReactNode; onRemove?: () => void; label?: string }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-lg bg-primary-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-primary-800">
            {children}
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={label ?? "Retirer"}
                    className={cn("rounded-md p-0.5 text-primary-700/70 hover:bg-primary-100 hover:text-primary-900", FOCUS)}
                >
                    <X className="size-3.5" aria-hidden />
                </button>
            )}
        </span>
    );
}

/** Large selectable card (channels). */
export function ChoiceCard({ selected, onClick, icon: IconC, title, hint }: {
    selected: boolean;
    onClick: () => void;
    icon: Icon;
    title: string;
    hint: string;
}) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onClick}
            className={cn(
                "group relative flex h-full flex-col items-start gap-4 rounded-[20px] border-2 p-6 text-left transition-all duration-200",
                "motion-safe:hover:-translate-y-0.5",
                selected
                    ? "border-primary bg-primary-50/50 shadow-[0_12px_32px_-16px_color-mix(in_oklab,var(--brand-primary)_55%,transparent)]"
                    : "border-line bg-surface hover:border-line-strong hover:shadow-[0_8px_24px_-14px_rgba(16,24,40,0.18)]",
                FOCUS,
            )}
        >
            <span
                className={cn(
                    "absolute right-5 top-5 flex size-7 items-center justify-center rounded-full border-2 transition-colors",
                    selected ? "border-primary bg-primary text-primary-fg" : "border-line-strong bg-surface",
                )}
                aria-hidden
            >
                {selected && <Check className="size-4" strokeWidth={3} />}
            </span>
            <span className={cn("flex size-14 items-center justify-center rounded-2xl transition-colors", selected ? "bg-primary-100 text-primary-700" : "bg-surface-2 text-ink-2")}>
                <IconC className="size-7" aria-hidden />
            </span>
            <span>
                <span className="block font-display text-xl font-bold text-ink">{title}</span>
                <span className="mt-1.5 block text-sm leading-relaxed text-ink-3">{hint}</span>
            </span>
        </button>
    );
}

export function FieldLabel({ htmlFor, children, optional }: { htmlFor: string; children: ReactNode; optional?: boolean }) {
    return (
        <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-semibold text-ink">
            <span>{children}</span>
            {optional && <span className="text-xs font-medium text-ink-4">Facultatif</span>}
        </label>
    );
}

const INPUT = cn(
    "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-ink-4",
    "transition-[border-color,box-shadow] hover:border-line-strong",
    "focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10",
);

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: Icon }>(
    function TextInput({ className, icon: IconC, ...props }, ref) {
        if (!IconC) return <input ref={ref} {...props} className={cn(INPUT, className)} />;
        return (
            <div className="relative">
                <IconC className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
                <input ref={ref} {...props} className={cn(INPUT, "pl-10", className)} />
            </div>
        );
    },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
    function TextArea({ className, ...props }, ref) {
        return <textarea ref={ref} {...props} className={cn(INPUT, "min-h-[96px] resize-y leading-relaxed", className)} />;
    },
);

/** Label + input in one, for the simple cases. */
export function Field({ label, optional, hint, children }: {
    label: string;
    optional?: boolean;
    hint?: string;
    children: (id: string) => ReactNode;
}) {
    const id = useId();
    return (
        <div>
            <FieldLabel htmlFor={id} optional={optional}>{label}</FieldLabel>
            {children(id)}
            {hint && <p className="mt-1.5 text-xs text-ink-3">{hint}</p>}
        </div>
    );
}

/** Section heading inside a card (icon + title). */
export function GroupTitle({ icon: IconC, children, right }: { icon: Icon; children: ReactNode; right?: ReactNode }) {
    return (
        <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2.5 text-[15px] font-bold text-ink">
                <IconC className="size-[18px] text-ink-3" aria-hidden />
                {children}
            </h3>
            {right}
        </div>
    );
}

export function Hint({ icon: IconC, children, tone = "primary" }: { icon: Icon; children: ReactNode; tone?: "primary" | "neutral" }) {
    return (
        <div className={cn(
            "flex items-start gap-3 rounded-2xl px-4 py-3 text-sm",
            tone === "primary" ? "bg-primary-50/70 text-primary-900" : "bg-surface-2 text-ink-2",
        )}>
            <IconC className={cn("mt-0.5 size-[18px] shrink-0", tone === "primary" ? "text-primary-600" : "text-ink-3")} aria-hidden />
            <div className="min-w-0">{children}</div>
        </div>
    );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
    const initials = name.split(/\s+/).filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?";
    return (
        <span
            aria-hidden
            style={{ width: size, height: size, fontSize: size * 0.36 }}
            className="relative inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-700 font-bold text-white ring-2 ring-surface"
        >
            {initials}
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-surface" />
        </span>
    );
}

/** The screen's question: big, calm, one per screen. */
export function Question({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: ReactNode }) {
    return (
        <header className="mb-8">
            {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-primary-600">{eyebrow}</p>}
            <h1 className="font-display text-[clamp(1.75rem,3.2vw,2.5rem)] font-extrabold leading-[1.1] tracking-tight text-ink">{title}</h1>
            {subtitle && <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-3">{subtitle}</p>}
        </header>
    );
}

export function formatDay(day: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }): string {
    if (!day) return "";
    const d = new Date(day.length === 10 ? `${day}T12:00:00Z` : day);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", opts);
}
