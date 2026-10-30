"use client";

/**
 * Shared vocabulary of the Captain Agent screens, on the shadcn/ui layer
 * (docs/ui/SHADCN.md): status and severity badges, the live dot, phase and
 * step icons, a ticking clock, a count-up figure, a media query, the empty
 * and error blocks, and the label/hint/error frame of a form field.
 */

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
    BrainCircuit,
    CalendarClock,
    CheckCircle2,
    Circle,
    CircleDashed,
    Clock,
    FileText,
    Hand,
    Loader2,
    MinusCircle,
    PenLine,
    Radar,
    RotateCcw,
    Search,
    ShieldCheck,
    TriangleAlert,
    Wrench,
    XCircle,
    Zap,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Label } from "@/components/ui/shadcn/label";
import { TONE_FILL, TONE_TEXT, type Tone } from "@/components/ui/recipes";
import type { AgentJobKind, AgentRunCard, AgentRunStatus, AgentSeverity, AgentStepStatus } from "@/lib/assistant/api-contract";
import { countUpAt, KIND_LABEL, RUN_STATUS_LABEL, SEVERITY_LABEL, STEP_STATUS_LABEL, TRIGGER_LABEL } from "@/lib/agent/client/format";

// ── Tones ───────────────────────────────────────────────────────────────

export const SEVERITY_TONE: Record<AgentSeverity, Tone> = { CRITICAL: "danger", WARN: "warning", INFO: "info" };

export const RUN_STATUS_TONE: Record<AgentRunStatus, Tone> = {
    QUEUED: "neutral",
    RUNNING: "accent",
    WAITING_APPROVAL: "warning",
    DONE: "success",
    FAILED: "danger",
    CANCELLED: "neutral",
    DEFERRED: "neutral",
};

type BadgeVariant = "secondary" | "outline" | "success" | "warning" | "danger" | "info" | "ai";

/** Design-system tone → shadcn Badge variant. */
export const TONE_BADGE: Record<Tone, BadgeVariant> = {
    neutral: "secondary",
    primary: "outline",
    accent: "ai",
    success: "success",
    warning: "warning",
    danger: "danger",
    info: "info",
};

export const KIND_ICON: Record<AgentJobKind, LucideIcon> = { WATCH: Radar, REPORT: FileText, MISSION: BrainCircuit, DIGEST: CalendarClock };

const TRIGGER_ICON: Record<AgentRunCard["trigger"], LucideIcon> = { SCHEDULE: Clock, MANUAL: Hand, EVENT: Zap };

// ── Dots and badges ─────────────────────────────────────────────────────

/** A status dot; `live` adds the soft ping ring. */
export function LiveDot({ tone, live, className }: { tone: Tone; live?: boolean; className?: string }) {
    return (
        <span className={cn("relative inline-flex size-1.5 shrink-0", className)} aria-hidden>
            {live && <span className={cn("absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping", TONE_FILL[tone])} />}
            <span className={cn("relative size-full rounded-full", TONE_FILL[tone])} />
        </span>
    );
}

export function RunStatusBadge({ status, className }: { status: AgentRunStatus; className?: string }) {
    const tone = RUN_STATUS_TONE[status];
    return (
        <Badge variant={TONE_BADGE[tone]} className={cn("gap-1.5", className)}>
            <LiveDot tone={tone} live={status === "RUNNING" || status === "QUEUED"} />
            {RUN_STATUS_LABEL[status]}
        </Badge>
    );
}

export function SeverityBadge({ severity, className }: { severity: AgentSeverity; className?: string }) {
    return (
        <Badge variant={TONE_BADGE[SEVERITY_TONE[severity]]} className={className}>
            {SEVERITY_LABEL[severity]}
        </Badge>
    );
}

export function KindTag({ kind, className }: { kind: AgentJobKind; className?: string }) {
    const Icon = KIND_ICON[kind];
    return (
        <span className={cn("inline-flex items-center gap-1 text-2xs font-semibold text-ink-3", className)}>
            <Icon className="size-3.5" aria-hidden />
            {KIND_LABEL[kind]}
        </span>
    );
}

export function TriggerTag({ trigger }: { trigger: AgentRunCard["trigger"] }) {
    const Icon = TRIGGER_ICON[trigger];
    return (
        <span className="inline-flex items-center gap-1 text-2xs font-medium text-ink-3">
            <Icon className="size-3" aria-hidden />
            {TRIGGER_LABEL[trigger]}
        </span>
    );
}

/** Small count chip next to a tab or a heading. */
export function CountChip({ count, tone = "neutral", className }: { count: number; tone?: Tone; className?: string }) {
    return (
        <span
            className={cn(
                "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-chip px-1.5 text-3xs font-bold tabular-nums",
                tone === "neutral" ? "bg-surface-3 text-ink-2" : tone === "accent" ? "bg-accent-soft text-accent-soft-ink" : tone === "danger" ? "bg-danger-soft text-danger-ink" : "bg-primary-50 text-primary-700",
                className,
            )}
        >
            {count}
        </span>
    );
}

// ── Steps ───────────────────────────────────────────────────────────────

const PHASE_ICON: Array<[RegExp, LucideIcon]> = [
    [/plan/i, PenLine],
    [/detect|watch|scan|veille/i, Radar],
    [/gather|collect|search|fetch|read|explore/i, Search],
    [/analy|synth|think|reason/i, BrainCircuit],
    [/act|propos|write|exec|tool/i, Wrench],
    [/report|draft|publish/i, FileText],
    [/verif|check|review/i, ShieldCheck],
];

export function phaseIcon(phase: string): LucideIcon {
    return PHASE_ICON.find(([re]) => re.test(phase))?.[1] ?? Circle;
}

const STEP_ICON: Record<AgentStepStatus, { icon: LucideIcon; cls: string }> = {
    PENDING: { icon: CircleDashed, cls: "text-ink-4" },
    RUNNING: { icon: Loader2, cls: "text-accent motion-safe:animate-spin" },
    DONE: { icon: CheckCircle2, cls: TONE_TEXT.success },
    FAILED: { icon: XCircle, cls: TONE_TEXT.danger },
    SKIPPED: { icon: MinusCircle, cls: "text-ink-4" },
};

export function StepStatusIcon({ status, className }: { status: AgentStepStatus; className?: string }) {
    const { icon: Icon, cls } = STEP_ICON[status];
    return <Icon className={cn("size-4 shrink-0", cls, className)} aria-label={STEP_STATUS_LABEL[status]} role="img" />;
}

// ── Time and motion ─────────────────────────────────────────────────────

/** Current time, re-rendering every `intervalMs` while `active`. */
export function useNow(intervalMs = 1000, active = true): Date {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        if (!active) return;
        const id = setInterval(() => setNow(new Date()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs, active]);
    return now;
}

/** Stagger for list entrances: ≤ 8 × 30 ms. */
export function stagger(index: number): { animationDelay: string } {
    return { animationDelay: `${Math.min(index, 8) * 30}ms` };
}

/** Live media query; `serverValue` (default false) during SSR and hydration — pass null to tell « not known yet ». */
export function useMediaQuery(query: string): boolean;
export function useMediaQuery(query: string, serverValue: null): boolean | null;
export function useMediaQuery(query: string, serverValue: boolean | null = false): boolean | null {
    return useSyncExternalStore<boolean | null>(
        (onChange) => {
            const mql = window.matchMedia(query);
            mql.addEventListener("change", onChange);
            return () => mql.removeEventListener("change", onChange);
        },
        () => window.matchMedia(query).matches,
        () => serverValue,
    );
}

/** A figure that counts up to `value` (from 0 on mount, then from the previous value). Static under reduced motion. */
export function CountUp({
    value,
    format = (n) => n.toLocaleString("fr-FR"),
    decimals = 0,
    duration = 650,
    className,
}: {
    value: number;
    format?: (n: number) => string;
    decimals?: number;
    duration?: number;
    className?: string;
}) {
    const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
    const [shown, setShown] = useState(0);
    const from = useRef(0);
    useEffect(() => {
        if (reduced) return;
        const start = from.current;
        const t0 = performance.now();
        let raf = requestAnimationFrame(function tick(t) {
            const p = (t - t0) / duration;
            const next = countUpAt(start, value, p, decimals);
            from.current = next;
            setShown(next);
            if (p < 1) raf = requestAnimationFrame(tick);
        });
        return () => cancelAnimationFrame(raf);
    }, [value, duration, decimals, reduced]);
    return <span className={cn("tabular-nums", className)}>{format(reduced ? value : shown)}</span>;
}

// ── Keyboard ────────────────────────────────────────────────────────────

/** True when the key event comes from a field the user is typing in. */
export function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** An overlay (dialog, sheet, menu, popover, select) has the keyboard: page shortcuts stand down. */
export function overlayOpen(): boolean {
    return Boolean(
        document.querySelector(
            '[aria-modal="true"], [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"], [data-slot="popover-content"][data-state="open"]',
        ),
    );
}

// ── Blocks ──────────────────────────────────────────────────────────────

/** Uppercase section heading with an optional right side. */
export function SectionTitle({ children, aside, icon: Icon, className }: { children: ReactNode; aside?: ReactNode; icon?: LucideIcon; className?: string }) {
    return (
        <div className={cn("flex items-center justify-between gap-2 px-0.5", className)}>
            <h3 className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.08em] text-ink-3">
                {Icon && <Icon className="size-3.5" aria-hidden />}
                {children}
            </h3>
            {aside}
        </div>
    );
}

/** Label/value pair used by the run summary. */
export function MetaItem({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-3xs font-semibold uppercase tracking-[0.08em] text-ink-4">{label}</dt>
            <dd className="mt-0.5 truncate text-xs font-semibold text-ink-2">{children}</dd>
        </div>
    );
}

/** Inline error block with a retry. */
export function ErrorBlock({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
    return (
        <div
            role="alert"
            className={cn("flex flex-wrap items-center justify-between gap-3 rounded-panel border border-danger-line bg-danger-soft px-4 py-3 text-xs text-danger-ink", className)}
        >
            <span className="flex items-center gap-2 font-semibold">
                <TriangleAlert className="size-4 shrink-0" aria-hidden />
                {message}
            </span>
            {onRetry && (
                <Button type="button" variant="outline" size="xs" onClick={onRetry}>
                    <RotateCcw aria-hidden />
                    Réessayer
                </Button>
            )}
        </div>
    );
}

/** Calm empty state: icon tile, title, hint, optional extra. */
export function EmptyState({
    icon: Icon,
    title,
    hint,
    tone = "neutral",
    compact,
    children,
    className,
}: {
    icon: LucideIcon;
    title: string;
    hint?: ReactNode;
    tone?: Tone;
    compact?: boolean;
    children?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-panel border border-dashed border-line bg-surface-2/50 px-6 text-center motion-safe:animate-ds-pop",
                compact ? "py-7" : "py-12",
                className,
            )}
        >
            <span
                className={cn(
                    "mx-auto flex size-10 items-center justify-center rounded-[12px] border shadow-2xs",
                    tone === "success" ? "border-success-line bg-success-soft text-success" : tone === "accent" ? "border-accent-200 bg-accent-soft text-accent-soft-ink" : "border-line bg-surface text-ink-3",
                )}
            >
                <Icon className="size-5" aria-hidden />
            </span>
            <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
            {hint && <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-ink-3">{hint}</p>}
            {children}
        </div>
    );
}

/** Label, control, hint or error. */
export function FormField({
    label,
    htmlFor,
    hint,
    error,
    required,
    children,
    className,
}: {
    label: ReactNode;
    htmlFor?: string;
    hint?: ReactNode;
    error?: string;
    required?: boolean;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("grid gap-1.5", className)}>
            <Label htmlFor={htmlFor} className="text-xs font-semibold text-ink-2">
                {label}
                {required && (
                    <span className="text-danger" aria-hidden>
                        *
                    </span>
                )}
            </Label>
            {children}
            {error ? (
                <p className="text-2xs font-medium text-danger-ink" role="alert">
                    {error}
                </p>
            ) : hint ? (
                <p className="text-2xs leading-relaxed text-ink-3">{hint}</p>
            ) : null}
        </div>
    );
}

/** Read-only value shown in place of a control (locked scope). */
export function StaticField({ children }: { children: ReactNode }) {
    return <p className="flex h-9 items-center rounded-control border border-line bg-surface-2 px-3 text-sm font-semibold text-ink-2">{children}</p>;
}
