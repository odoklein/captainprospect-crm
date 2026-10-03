import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { EYEBROW, FOCUS_RING, SURFACE, TONE_SOFT, TONE_TEXT, type Tone } from "./recipes";

interface KpiCardProps {
    label: string;
    value: ReactNode;
    /** "/ 40" after the value. */
    target?: ReactNode;
    /** Signed change; null shows "—" instead of a fake 0. */
    delta?: number | null;
    deltaUnit?: "%" | "pt";
    /** "vs mois dernier". */
    deltaLabel?: string;
    /** Set when going down is the good direction (no-shows, churn). */
    invertDelta?: boolean;
    hint?: ReactNode;
    icon?: LucideIcon;
    tone?: Tone;
    /** Right-hand visual: ring, sparkline… */
    visual?: ReactNode;
    href?: string;
    loading?: boolean;
    className?: string;
}

export function Delta({ value, unit = "%", label, invert, onInverse }: { value: number | null; unit?: "%" | "pt"; label?: string; invert?: boolean; onInverse?: boolean }) {
    if (value === null || Number.isNaN(value)) {
        return (
            <span className={cn("inline-flex items-center gap-1 text-xs font-medium", onInverse ? "text-inverse-ink-3" : "text-ink-4")}>
                <Minus className="size-3" aria-hidden />—
            </span>
        );
    }
    const flat = value === 0;
    const good = invert ? value < 0 : value > 0;
    const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
    const n = Math.abs(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
    const color = flat
        ? onInverse ? "text-inverse-ink-2" : "text-ink-3"
        : good
            ? onInverse ? "text-success-line" : "text-success"
            : onInverse ? "text-danger-line" : "text-danger";
    return (
        <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums", color)}>
            <Icon className="size-3.5" aria-hidden />
            {flat ? "0" : `${value > 0 ? "+" : "−"}${n}`}
            {unit === "pt" ? " pt" : " %"}
            {label && <span className={cn("ml-1 font-medium", onInverse ? "text-inverse-ink-3" : "text-ink-4")}>{label}</span>}
        </span>
    );
}

/** Headline figure of a dashboard row. */
export function KpiCard({
    label,
    value,
    target,
    delta,
    deltaUnit,
    deltaLabel,
    invertDelta,
    hint,
    icon: Icon,
    tone = "primary",
    visual,
    href,
    loading,
    className,
}: KpiCardProps) {
    const body = (
        <>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    {Icon && (
                        <span className={cn("inline-flex size-6 items-center justify-center rounded-lg border", TONE_SOFT[tone])}>
                            <Icon className={cn("size-3.5", TONE_TEXT[tone])} aria-hidden />
                        </span>
                    )}
                    <span className={cn(EYEBROW, "truncate")}>{label}</span>
                </div>
                {loading ? (
                    <div className="mt-3 h-8 w-24 rounded-lg bg-surface-3 motion-safe:animate-pulse" />
                ) : (
                    <div className="mt-2.5 flex flex-wrap items-baseline gap-x-1.5">
                        <span className="font-display text-[32px] font-bold leading-none tracking-tight text-ink tabular-nums">{value}</span>
                        {target !== undefined && <span className="text-sm font-medium text-ink-4">/ {target}</span>}
                    </div>
                )}
                {(delta !== undefined || hint) && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                        {delta !== undefined && <Delta value={delta} unit={deltaUnit} label={deltaLabel} invert={invertDelta} />}
                        {hint && <span className="truncate">{hint}</span>}
                    </div>
                )}
            </div>
            {visual && <div className="shrink-0">{visual}</div>}
        </>
    );

    const cls = cn(SURFACE.card, "flex min-w-0 items-center gap-4 p-5", className);
    return href ? (
        <Link href={href} className={cn(cls, SURFACE.cardInteractive, FOCUS_RING)}>
            {body}
        </Link>
    ) : (
        <div className={cls}>{body}</div>
    );
}

export default KpiCard;
