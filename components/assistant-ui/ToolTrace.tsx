"use client";

import { useState } from "react";
import { ChevronRight, Database, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TraceEntry } from "./types";

interface ToolTraceProps {
    trace: TraceEntry[];
    className?: string;
}

export function ToolTrace({ trace, className }: ToolTraceProps) {
    const [open, setOpen] = useState(false);
    if (!trace || trace.length === 0) return null;

    const totalMs = trace.reduce((acc, t) => acc + (t.durationMs || 0), 0);
    const durationLabel = totalMs < 1000 ? `${totalMs} ms` : `${(totalMs / 1000).toFixed(1)} s`;

    return (
        <div className={cn("my-1.5 text-xs", className)}>
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200/90 bg-slate-50/80 px-2.5 py-1 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                aria-expanded={open}
            >
                <Database className="h-3.5 w-3.5 text-slate-400" />
                <span className="font-medium">
                    {trace.length} source{trace.length > 1 ? "s" : ""} consultée{trace.length > 1 ? "s" : ""}
                </span>
                <span className="text-[11px] text-slate-400">({durationLabel})</span>
                <ChevronRight
                    className={cn(
                        "h-3 w-3 text-slate-400 transition-transform duration-200",
                        open && "rotate-90"
                    )}
                />
            </button>

            {open && (
                <div className="mt-2 ml-1 space-y-1.5 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm animate-in fade-in-50 duration-150">
                    {trace.map((item, idx) => (
                        <div
                            key={`${item.tool}-${idx}`}
                            className="flex items-center justify-between gap-3 text-[11.5px]"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                {item.ok ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                ) : (
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                )}
                                <span className="truncate font-medium text-slate-700">
                                    {item.label || item.tool}
                                </span>
                            </div>
                            <span className="shrink-0 font-mono text-[10.5px] text-slate-400">
                                {item.ok ? `${item.durationMs} ms` : (item.errorCode ?? "refusé")}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
