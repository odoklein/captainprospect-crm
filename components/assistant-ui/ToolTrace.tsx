"use client";

/**
 * The lookups behind an answer, live and saved alike: one quiet trigger line
 * (« 3 sources consultées · 1,2 s ») and the list it folds. The same element
 * serves the turn being written (rows still running) and the saved answer, so
 * the live steps collapse in place into the saved trace.
 */

import { useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/shadcn/collapsible";
import { formatSeconds } from "./LiveTurn";
import type { TraceEntry } from "./types";

export interface TraceRow {
    label: string;
    state: "running" | "ok" | "error";
    /** « 120 ms », « déjà lu », an error code. */
    meta?: string;
}

/** Saved trace entries as rows. */
export function traceRows(entries: TraceEntry[]): TraceRow[] {
    return entries.map((e) => ({
        label: e.label || e.tool,
        state: e.ok ? "ok" : "error",
        meta: e.ok ? formatSeconds(e.durationMs || 0) : (e.errorCode ?? "refusé"),
    }));
}

export function sourcesLabel(count: number): string {
    return `${count} source${count > 1 ? "s" : ""} consultée${count > 1 ? "s" : ""}`;
}

export function totalDuration(entries: TraceEntry[]): string {
    return formatSeconds(entries.reduce((acc, t) => acc + (t.durationMs || 0), 0));
}

/** Root: wrap the trigger line and the list (they may sit in different rows of a header). */
export function ToolTraceRoot({ open, onOpenChange, children, className }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode; className?: string }) {
    return (
        <Collapsible open={open} onOpenChange={onOpenChange} className={className}>
            {children}
        </Collapsible>
    );
}

export function ToolTraceTrigger({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
    return (
        <CollapsibleTrigger asChild>
            <button
                type="button"
                className={cn(
                    "-ml-1 inline-flex h-6 min-w-0 items-center gap-1 rounded-md px-1 text-ink-3 transition-colors duration-150 ease-snappy hover:text-ink",
                    FOCUS_RING,
                    className,
                )}
            >
                <ChevronRight className={cn("size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-snappy", open && "rotate-90")} aria-hidden />
                <span className="truncate">{children}</span>
            </button>
        </CollapsibleTrigger>
    );
}

export function ToolTraceList({ rows, footer }: { rows: TraceRow[]; footer?: ReactNode }) {
    return (
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            <ol className="ml-2 space-y-1 border-l border-line py-1 pl-3 text-[12.5px]">
                {rows.map((row, i) => (
                    // Index keys: the live steps and the saved entries are the same rows.
                    <li key={i} className="flex min-w-0 items-center gap-2">
                        {row.state === "running" ? (
                            <Loader2 className="size-3.5 shrink-0 animate-spin text-ink-4" aria-label="En cours" />
                        ) : row.state === "ok" ? (
                            <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-label="Terminé" />
                        ) : (
                            <AlertCircle className="size-3.5 shrink-0 text-warning" aria-label="Échec" />
                        )}
                        <span className={cn("min-w-0 truncate", row.state === "running" ? "text-ink" : "text-ink-2")}>{row.label}</span>
                        {row.meta && <span className="shrink-0 text-[11px] tabular-nums text-ink-4">{row.meta}</span>}
                    </li>
                ))}
                {footer}
            </ol>
        </CollapsibleContent>
    );
}

/** Standalone saved trace (one line, expandable), for callers outside the thread. */
export function ToolTrace({ trace, className }: { trace: TraceEntry[]; className?: string }) {
    const [open, setOpen] = useState(false);
    if (!trace || trace.length === 0) return null;
    return (
        <ToolTraceRoot open={open} onOpenChange={setOpen} className={cn("text-[12.5px]", className)}>
            <ToolTraceTrigger open={open}>
                {sourcesLabel(trace.length)} <span className="text-ink-4">· {totalDuration(trace)}</span>
            </ToolTraceTrigger>
            <ToolTraceList rows={traceRows(trace)} />
        </ToolTraceRoot>
    );
}
