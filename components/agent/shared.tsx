"use client";

/**
 * Small shared vocabulary of the Captain Agent screens: status and severity
 * pills, phase icons, compact buttons and a ticking clock. Colours come from
 * the design-system tone recipes (components/ui/recipes), never raw shades.
 */

import { useEffect, useState, type ReactNode } from "react";
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
    Search,
    ShieldCheck,
    Wrench,
    XCircle,
    Zap,
    type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING, TONE_FILL, TONE_SOFT, TONE_TEXT, type Tone } from "@/components/ui/recipes";
import type { AgentJobKind, AgentRunCard, AgentRunStatus, AgentSeverity, AgentStepStatus } from "@/lib/assistant/api-contract";
import { KIND_LABEL, RUN_STATUS_LABEL, SEVERITY_LABEL, TRIGGER_LABEL } from "@/lib/agent/client/format";

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

export const KIND_ICON: Record<AgentJobKind, LucideIcon> = { WATCH: Radar, REPORT: FileText, MISSION: BrainCircuit, DIGEST: CalendarClock };

const TRIGGER_ICON: Record<AgentRunCard["trigger"], LucideIcon> = { SCHEDULE: Clock, MANUAL: Hand, EVENT: Zap };

// ── Pills ───────────────────────────────────────────────────────────────

export function Pill({ tone, pulse, icon: Icon, children, className, title }: {
    tone: Tone;
    pulse?: boolean;
    icon?: LucideIcon;
    children: ReactNode;
    className?: string;
    title?: string;
}) {
    return (
        <span
            title={title}
            className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold whitespace-nowrap", TONE_SOFT[tone], className)}
        >
            {pulse && (
                <span className="relative flex size-1.5" aria-hidden>
                    <span className={cn("absolute inset-0 rounded-full opacity-70 motion-safe:animate-ping", TONE_FILL[tone])} />
                    <span className={cn("relative size-1.5 rounded-full", TONE_FILL[tone])} />
                </span>
            )}
            {Icon && <Icon className="size-3.5" aria-hidden />}
            {children}
        </span>
    );
}

export function RunStatusPill({ status, className }: { status: AgentRunStatus; className?: string }) {
    return (
        <Pill tone={RUN_STATUS_TONE[status]} pulse={status === "RUNNING" || status === "QUEUED"} className={className}>
            {RUN_STATUS_LABEL[status]}
        </Pill>
    );
}

export function SeverityPill({ severity, className }: { severity: AgentSeverity; className?: string }) {
    return (
        <Pill tone={SEVERITY_TONE[severity]} className={className}>
            {SEVERITY_LABEL[severity]}
        </Pill>
    );
}

/** The thin vertical bar at the left edge of a finding row. */
export function SeverityBar({ severity }: { severity: AgentSeverity }) {
    return <span aria-hidden className={cn("absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full", TONE_FILL[SEVERITY_TONE[severity]])} />;
}

export function KindTag({ kind }: { kind: AgentJobKind }) {
    const Icon = KIND_ICON[kind];
    return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-3">
            <Icon className="size-3.5" aria-hidden />
            {KIND_LABEL[kind]}
        </span>
    );
}

export function TriggerTag({ trigger }: { trigger: AgentRunCard["trigger"] }) {
    const Icon = TRIGGER_ICON[trigger];
    return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-3">
            <Icon className="size-3" aria-hidden />
            {TRIGGER_LABEL[trigger]}
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

export function StepStatusIcon({ status, className }: { status: AgentStepStatus; className?: string }) {
    const map: Record<AgentStepStatus, { icon: LucideIcon; cls: string; label: string }> = {
        PENDING: { icon: CircleDashed, cls: "text-ink-4", label: "À venir" },
        RUNNING: { icon: Loader2, cls: "text-accent-600 motion-safe:animate-spin", label: "En cours" },
        DONE: { icon: CheckCircle2, cls: TONE_TEXT.success, label: "Fait" },
        FAILED: { icon: XCircle, cls: TONE_TEXT.danger, label: "Échec" },
        SKIPPED: { icon: MinusCircle, cls: "text-ink-4", label: "Ignorée" },
    };
    const { icon: Icon, cls, label } = map[status];
    return <Icon className={cn("size-4 shrink-0", cls, className)} aria-label={label} role="img" />;
}

// ── Buttons ─────────────────────────────────────────────────────────────

const MINI_BASE = cn(
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-control px-2.5 text-xs font-semibold whitespace-nowrap select-none",
    "transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-snappy active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    FOCUS_RING,
);

export const MINI_BUTTON = cn(MINI_BASE, "border border-line bg-surface text-ink-2 shadow-2xs hover:border-line-strong hover:bg-surface-2 hover:text-ink");
export const MINI_PRIMARY = cn(MINI_BASE, "bg-primary text-primary-fg shadow-xs hover:bg-primary-hover");
export const MINI_DANGER = cn(MINI_BASE, "bg-danger text-white shadow-xs hover:opacity-90");
export const MINI_GHOST = cn(MINI_BASE, "text-ink-3 hover:bg-surface-3 hover:text-ink");

// ── Time ────────────────────────────────────────────────────────────────

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

/** True when the key event comes from a field the user is typing in. */
export function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Label/value row used by the run and proposal details. */
export function MetaItem({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-4">{label}</dt>
            <dd className="mt-0.5 truncate text-xs font-semibold text-ink-2">{children}</dd>
        </div>
    );
}

/** Inline error block with a retry. */
export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
    return (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-danger-line bg-danger-soft px-4 py-3 text-xs text-danger-ink">
            <span className="font-semibold">{message}</span>
            {onRetry && (
                <button type="button" onClick={onRetry} className={MINI_BUTTON}>
                    Réessayer
                </button>
            )}
        </div>
    );
}
