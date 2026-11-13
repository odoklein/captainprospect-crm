"use client";

// ============================================
// RESULT PICKER — the outcome of a call, picked in one key.
//
// The 6 results SDRs log most (no answer, callback, gatekeeper, interested,
// refusal, meeting) come first in a compact 2-column list with their key
// (1–6) and colour; every other configured result stays visible.
// Keys work while focus is not in a text field.
// ============================================

import { useEffect, useMemo } from "react";
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
    const shortcutCodes = new Set(main.map((option) => option.value));
    return { main, others: options.filter((option) => !shortcutCodes.has(option.value)) };
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
                    "group flex min-h-10 min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
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
                <span className="min-w-0 flex-1 break-words">{shortLabel(o.label)}</span>
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
                {others.map((o) => renderRow(o))}
            </div>
        </div>
    );
}
