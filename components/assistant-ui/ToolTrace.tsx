"use client";

import { useState } from "react";
import { ChevronRight, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS } from "@/components/accueil/AccueilUI";
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
    const durationLabel = totalMs < 1000 ? `${totalMs} ms` : `${(totalMs / 1000).toFixed(1).replace(".", ",")} s`;

    return (
        <div className={cn("mt-3 text-xs", className)}>
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className={cn("-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-ink-3 transition-colors duration-150 hover:text-ink", FOCUS)}
                aria-expanded={open}
            >
                <ChevronRight
                    className={cn("size-3.5 text-ink-4 transition-transform duration-200 ease-[var(--ease-snappy)]", open && "rotate-90")}
                    aria-hidden
                />
                <span>
                    {trace.length} source{trace.length > 1 ? "s" : ""} consultée{trace.length > 1 ? "s" : ""}
                </span>
                <span className="text-ink-4">· {durationLabel}</span>
            </button>

            {open && (
                <ul className="mt-1 divide-y divide-line-subtle border-t border-line-subtle motion-safe:animate-ds-enter">
                    {trace.map((item, idx) => (
                        <li key={`${item.tool}-${idx}`} className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
                            <span className="flex min-w-0 items-center gap-2">
                                {item.ok ? (
                                    <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-label="Réussi" />
                                ) : (
                                    <AlertCircle className="size-3.5 shrink-0 text-warning" aria-label="Refusé" />
                                )}
                                <span className="truncate text-ink-2">{item.label || item.tool}</span>
                            </span>
                            <span className="shrink-0 tabular-nums text-[11px] text-ink-4">
                                {item.ok ? `${item.durationMs} ms` : (item.errorCode ?? "refusé")}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
