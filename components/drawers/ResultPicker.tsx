"use client";

// ============================================
// RESULT PICKER — the outcome of a call, picked in one key.
//
// The 6 results SDRs log most (no answer, callback, gatekeeper, interested,
// refusal, meeting) come first in a compact 2-column list with their key
// (1–6) and colour; everything else waits behind « Autres résultats ».
// Same labels are shown once. Keys work while focus is not in a text field.
// ============================================

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ResultOption {
    value: string;
    label: string;
    title?: string;
}

/** What gets logged most, first. A mission's own codes slot in by meaning. */
const PRIORITY: string[][] = [
    ["NO_RESPONSE"],
    ["CALLBACK_REQUESTED", "RAPPEL", "RELANCE"],
    ["BARRAGE_STANDARD", "BARRAGE_SECRETAIRE"],
    ["INTERESTED", "PROJET_A_SUIVRE"],
    ["REFUS", "NOT_INTERESTED", "REFUS_CATEGORIQUE", "REFUS_ARGU"],
];
const MEETING = "MEETING_BOOKED";

/** « Rappel (interlocuteur indisponible) » → « Rappel »: the detail stays in the tooltip. */
export function shortLabel(label: string): string {
    const short = label.replace(/\s*\(.*\)\s*$/, "").trim();
    return short || label;
}

export function splitResults(options: ResultOption[]): { main: ResultOption[]; others: ResultOption[] } {
    // One entry per label (configs sometimes carry two codes named alike).
    const seen = new Set<string>();
    const unique = options.filter((o) => {
        const k = o.label.trim().toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
    const byCode = new Map(unique.map((o) => [o.value, o]));
    const main: ResultOption[] = [];
    for (const group of PRIORITY) {
        const hit = group.map((c) => byCode.get(c)).find(Boolean);
        if (hit) main.push(hit);
    }
    const meeting = byCode.get(MEETING);
    if (meeting) main.push(meeting);
    // Fill up to 6 with the mission's first remaining statuses.
    for (const o of unique) {
        if (main.length >= 6) break;
        if (!main.includes(o)) main.push(o);
    }
    return { main: main.slice(0, 6), others: unique.filter((o) => !main.slice(0, 6).includes(o)) };
}

export function ResultPicker({
    options,
    value,
    onChange,
    colorFor,
    keys = true,
}: {
    options: ResultOption[];
    value: string;
    onChange: (code: string) => void;
    /** The status colour (mission config), null = neutral. */
    colorFor: (code: string) => string | null;
    /** Number keys select (off when another surface owns the keyboard). */
    keys?: boolean;
}) {
    const { main, others } = useMemo(() => splitResults(options), [options]);
    const [open, setOpen] = useState(false);
    const showOthers = open || others.some((o) => o.value === value);

    useEffect(() => {
        if (!keys) return;
        const onKey = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null;
            if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
            if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[aria-modal="true"]')) return;
            const i = Number(e.key);
            if (Number.isInteger(i) && i >= 1 && i <= main.length) {
                e.preventDefault();
                onChange(main[i - 1].value);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [keys, main, onChange]);

    const renderRow = (o: ResultOption, k?: number) => {
        const selected = value === o.value;
        return (
            <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                title={o.title ? `${o.label}\n${o.title}` : o.label}
                onClick={() => onChange(o.value)}
                className={cn(
                    "group flex h-10 min-w-0 items-center gap-2.5 rounded-xl px-3 text-left text-[13px] transition-all duration-150",
                    selected
                        ? "cp-flash bg-primary-soft font-semibold text-primary-soft-ink ring-1 ring-inset ring-primary/35"
                        : "bg-surface text-ink-2 ring-1 ring-inset ring-line hover:bg-surface-2 hover:text-ink hover:ring-line-strong",
                )}
            >
                <span
                    className={cn("h-2 w-2 shrink-0 rounded-full transition-transform", selected && "scale-125")}
                    style={{ background: colorFor(o.value) ?? "var(--ds-line-strong)" }}
                    aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{shortLabel(o.label)}</span>
                {k !== undefined && (
                    <kbd
                        className={cn(
                            "flex h-5 min-w-5 items-center justify-center rounded-md px-1 font-mono text-[10.5px] font-semibold",
                            selected ? "bg-primary text-primary-fg" : "bg-surface-3 text-ink-3 group-hover:text-ink-2",
                        )}
                    >
                        {k}
                    </kbd>
                )}
            </button>
        );
    };

    return (
        <div role="radiogroup" aria-label="Résultat de l'appel" aria-required="true">
            <div className="grid grid-cols-2 gap-1.5">
                {main.map((o, i) => renderRow(o, keys ? i + 1 : undefined))}
            </div>
            {others.length > 0 && (
                <>
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={showOthers}
                        className="mt-2 flex items-center gap-1 rounded-md px-1 py-0.5 text-[12px] font-medium text-ink-3 hover:text-ink"
                    >
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showOthers && "rotate-180")} />
                        {showOthers ? "Moins de résultats" : `Autres résultats (${others.length})`}
                    </button>
                    {showOthers && (
                        <div className="cp-rise mt-1.5 flex flex-wrap gap-1.5">
                            {others.map((o) => {
                                const selected = value === o.value;
                                return (
                                    <button
                                        key={o.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        title={o.title}
                                        onClick={() => onChange(o.value)}
                                        className={cn(
                                            "flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors",
                                            selected
                                                ? "bg-primary-soft font-semibold text-primary-soft-ink ring-1 ring-inset ring-primary/35"
                                                : "text-ink-2 ring-1 ring-inset ring-line hover:bg-surface-2 hover:text-ink",
                                        )}
                                    >
                                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorFor(o.value) ?? "var(--ds-line-strong)" }} aria-hidden />
                                        {o.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
