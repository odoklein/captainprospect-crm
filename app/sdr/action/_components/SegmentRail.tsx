"use client";

import { AlarmClock, AlertTriangle, CalendarClock, Flame, Layers, PenLine, UserPlus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SegmentId } from "../_lib/queue-selectors";
import { focusRing } from "./primitives";

interface SegmentDef {
    id: SegmentId;
    label: string;
    hint: string;
    icon: LucideIcon;
    /** Accent when the segment has rows that need attention. */
    accent: string;
    /** Hide the tile when empty (and not selected) — it only matters when it happens. */
    hideWhenEmpty?: boolean;
}

const SEGMENTS: SegmentDef[] = [
    { id: "all", label: "Toute la file", hint: "par priorité", icon: Layers, accent: "text-cp-ink" },
    { id: "absent", label: "RDV absents", hint: "à rappeler d'abord", icon: AlertTriangle, accent: "text-cp-danger", hideWhenEmpty: true },
    { id: "overdue", label: "Rappels en retard", hint: "échéance passée", icon: AlarmClock, accent: "text-cp-danger" },
    { id: "today", label: "Rappels du jour", hint: "plus tard aujourd'hui", icon: CalendarClock, accent: "text-cp-warn" },
    { id: "fresh", label: "Jamais contactés", hint: "premier appel", icon: UserPlus, accent: "text-cp-info" },
    { id: "hot", label: "Intéressés", hint: "à faire avancer", icon: Flame, accent: "text-cp-green" },
    { id: "enrich", label: "À enrichir", hint: "coordonnées manquantes", icon: PenLine, accent: "text-cp-ink-2" },
];

interface SegmentRailProps {
    counts: Record<SegmentId, number> | null;
    active: SegmentId;
    onChange: (segment: SegmentId) => void;
}

/** Cockpit tiles: each one is a live count and a one-click filter. */
export function SegmentRail({ counts, active, onChange }: SegmentRailProps) {
    const visible = SEGMENTS.filter((s) => !s.hideWhenEmpty || s.id === active || (counts?.[s.id] ?? 0) > 0);
    return (
        <div role="group" aria-label="Vues de la file" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:flex">
            {visible.map((s) => {
                const count = counts?.[s.id];
                const selected = s.id === active;
                const hasRows = (count ?? 0) > 0;
                const Icon = s.icon;
                return (
                    <button
                        key={s.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onChange(selected && s.id !== "all" ? "all" : s.id)}
                        className={cn(
                            "group relative flex min-w-0 flex-1 flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all",
                            selected
                                ? "border-cp-green bg-cp-raised shadow-sm ring-1 ring-cp-green"
                                : "border-cp-border bg-cp-raised hover:border-cp-border-strong hover:shadow-sm",
                            focusRing,
                        )}
                    >
                        <span className="flex w-full items-center gap-1.5 text-xs font-medium text-cp-ink-2">
                            <Icon className={cn("size-3.5 shrink-0", hasRows ? s.accent : "text-cp-ink-3")} aria-hidden />
                            <span className="truncate">{s.label}</span>
                        </span>
                        <span className="flex items-baseline gap-1.5">
                            <span className={cn("text-2xl font-semibold leading-none tabular-nums", hasRows && s.id !== "all" ? s.accent : "text-cp-ink")}>
                                {count ?? "–"}
                            </span>
                            <span className="truncate text-xs text-cp-ink-3">{s.hint}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
