"use client";

/**
 * The lookups behind an answer, live and saved alike: one quiet trigger line
 * — the stacked tiles of the tool families used, then « 3 sources consultées ·
 * 1,2 s » — and the timeline it folds (one tile per step, joined by a line,
 * the family under the label). The same element serves the turn being written
 * (rows still running) and the saved answer, so the live steps collapse in
 * place into the saved trace.
 *
 * Visual language shared with components/ui/tool-calls-section.tsx.
 */

import { useState, type ReactNode } from "react";
import { AlertCircle, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/shadcn/collapsible";
import { ToolCategoryTile, toolCategoryLabel, toolCategoryOf, type ToolCategory } from "@/components/ui/tool-calls-section-utils/tool-icons";
import { formatSeconds } from "./LiveTurn";
import type { TraceEntry } from "./types";

export interface TraceRow {
    label: string;
    state: "running" | "ok" | "error";
    /** « 120 ms », « déjà lu », an error code. */
    meta?: string;
    /** The tool name: picks the row's family tile. */
    tool?: string;
}

/** Tiles shown on the trigger line before « +N ». */
const MAX_STACKED = 4;

/** Saved trace entries as rows. */
export function traceRows(entries: TraceEntry[]): TraceRow[] {
    return entries.map((e) => ({
        label: e.label || e.tool,
        state: e.ok ? "ok" : "error",
        meta: e.ok ? formatSeconds(e.durationMs || 0) : (e.errorCode ?? "refusé"),
        tool: e.tool,
    }));
}

export function sourcesLabel(count: number): string {
    return `${count} source${count > 1 ? "s" : ""} consultée${count > 1 ? "s" : ""}`;
}

export function totalDuration(entries: TraceEntry[]): string {
    return formatSeconds(entries.reduce((acc, t) => acc + (t.durationMs || 0), 0));
}

function rowCategory(row: TraceRow): ToolCategory {
    return row.tool ? toolCategoryOf(row.tool) : "general";
}

/** The families used, once each, in order of first use. */
function distinctCategories(rows: TraceRow[]): ToolCategory[] {
    return [...new Set(rows.map(rowCategory))];
}

/** Overlapping tiles, tilted alternately, one per family. */
export function StackedToolTiles({ rows, max = MAX_STACKED }: { rows: TraceRow[]; max?: number }) {
    const categories = distinctCategories(rows);
    if (categories.length === 0) return null;
    const shown = categories.slice(0, max);
    return (
        <span className="flex shrink-0 items-center -space-x-1 py-0.5" aria-hidden>
            {shown.map((category, i) => (
                <span
                    key={category}
                    className="relative flex"
                    style={{ transform: shown.length > 1 ? `rotate(${i % 2 === 0 ? 8 : -8}deg)` : undefined, zIndex: i }}
                >
                    <ToolCategoryTile category={category} size={13} className="rounded-md" />
                </span>
            ))}
            {categories.length > max && (
                <span className="relative flex size-5 items-center justify-center rounded-md bg-surface-3 text-[10px] font-medium text-ink-3 ring-2 ring-surface">
                    +{categories.length - max}
                </span>
            )}
        </span>
    );
}

/** Root: wrap the trigger line and the list (they may sit in different rows of a header). */
export function ToolTraceRoot({ open, onOpenChange, children, className }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode; className?: string }) {
    return (
        <Collapsible open={open} onOpenChange={onOpenChange} className={className}>
            {children}
        </Collapsible>
    );
}

export function ToolTraceTrigger({ open, rows, children, className }: { open: boolean; rows?: TraceRow[]; children: ReactNode; className?: string }) {
    return (
        <CollapsibleTrigger asChild>
            <button
                type="button"
                className={cn(
                    "-ml-1 inline-flex h-7 min-w-0 items-center gap-2 rounded-md px-1 text-ink-3 transition-colors duration-150 ease-snappy hover:text-ink",
                    FOCUS_RING,
                    className,
                )}
            >
                {rows && rows.length > 0 && <StackedToolTiles rows={rows} />}
                <span className="truncate font-medium">{children}</span>
                <ChevronDown className={cn("size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ease-snappy", open && "rotate-180")} aria-hidden />
            </button>
        </CollapsibleTrigger>
    );
}

function StepTile({ row }: { row: TraceRow }) {
    const category = rowCategory(row);
    return (
        <span className="relative flex">
            <ToolCategoryTile category={category} size={13} className={cn(row.state === "running" && "opacity-60")} />
            {row.state === "running" && (
                <Loader2 className="absolute -bottom-1 -right-1 size-3 animate-spin rounded-full bg-surface text-ink-3" aria-label="En cours" />
            )}
            {row.state === "error" && (
                <AlertCircle className="absolute -bottom-1 -right-1 size-3 rounded-full bg-surface text-warning" aria-label="Échec" />
            )}
        </span>
    );
}

export function ToolTraceList({ rows, footer }: { rows: TraceRow[]; footer?: ReactNode }) {
    return (
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            <ol className="pt-1 pb-1">
                {rows.map((row, i) => {
                    const last = i === rows.length - 1 && !footer;
                    return (
                        // Index keys: the live steps and the saved entries are the same rows.
                        <li key={i} className="flex min-w-0 items-stretch gap-2.5">
                            <div className="flex w-6 shrink-0 flex-col items-center">
                                <StepTile row={row} />
                                {!last && <span className="min-h-2 w-px flex-1 bg-line" aria-hidden />}
                            </div>
                            <div className={cn("min-w-0 flex-1", !last && "pb-2")}>
                                <div className="flex min-w-0 items-center gap-2 leading-5">
                                    <span className={cn("min-w-0 truncate font-medium", row.state === "running" ? "text-ink" : "text-ink-2")}>{row.label}</span>
                                    {row.meta && (
                                        <span className={cn("shrink-0 text-[11px] tabular-nums", row.state === "error" ? "text-warning-ink" : "text-ink-4")}>{row.meta}</span>
                                    )}
                                </div>
                                <p className="text-[11px] leading-4 text-ink-4">{toolCategoryLabel(rowCategory(row))}</p>
                            </div>
                        </li>
                    );
                })}
                {footer}
            </ol>
        </CollapsibleContent>
    );
}

/** Standalone saved trace (one line, expandable), for callers outside the thread. */
export function ToolTrace({ trace, className }: { trace: TraceEntry[]; className?: string }) {
    const [open, setOpen] = useState(false);
    if (!trace || trace.length === 0) return null;
    const rows = traceRows(trace);
    return (
        <ToolTraceRoot open={open} onOpenChange={setOpen} className={cn("text-[12.5px]", className)}>
            <ToolTraceTrigger open={open} rows={rows}>
                {sourcesLabel(trace.length)} <span className="font-normal text-ink-4">· {totalDuration(trace)}</span>
            </ToolTraceTrigger>
            <ToolTraceList rows={rows} />
        </ToolTraceRoot>
    );
}
