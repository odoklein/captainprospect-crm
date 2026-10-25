"use client";

import { useState } from "react";
import { ChevronRight, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TraceEntry } from "./types";

interface ToolTraceProps {
    trace: TraceEntry[];
    className?: string;
}

/** The sources behind an answer: one quiet line, expandable into the list of lookups. */
export function ToolTrace({ trace, className }: ToolTraceProps) {
    const [open, setOpen] = useState(false);
    if (!trace || trace.length === 0) return null;

    const totalMs = trace.reduce((acc, t) => acc + (t.durationMs || 0), 0);
    const durationLabel = totalMs < 1000 ? `${totalMs} ms` : `${(totalMs / 1000).toFixed(1)} s`;

    return (
        <div className={cn("mt-3 text-xs", className)}>
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                aria-expanded={open}
            >
                <ChevronRight
                    className={cn("h-3.5 w-3.5 text-slate-400 transition-transform duration-150", open && "rotate-90")}
                />
                <span>
                    {trace.length} source{trace.length > 1 ? "s" : ""} consultée{trace.length > 1 ? "s" : ""}
                </span>
                <span className="text-slate-400">· {durationLabel}</span>
            </button>

            {open && (
                <ul className="mt-1 divide-y divide-slate-100 border-t border-slate-100">
                    {trace.map((item, idx) => (
                        <li
                            key={`${item.tool}-${idx}`}
                            className="flex items-center justify-between gap-3 py-1.5 text-[12px]"
                        >
                            <span className="flex min-w-0 items-center gap-2">
                                {item.ok ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="Réussi" />
                                ) : (
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Refusé" />
                                )}
                                <span className="truncate text-slate-700">{item.label || item.tool}</span>
                            </span>
                            <span className="shrink-0 tabular-nums text-[11px] text-slate-400">
                                {item.ok ? `${item.durationMs} ms` : (item.errorCode ?? "refusé")}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
