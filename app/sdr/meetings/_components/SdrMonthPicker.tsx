"use client";

import { CalendarDays } from "lucide-react";
import type { SdrMeetingsPeriod } from "../_hooks/useSdrMeetingsQuery";

interface SdrMonthPickerProps {
    value: SdrMeetingsPeriod;
    onChange: (period: SdrMeetingsPeriod) => void;
}

/** Current month + the 11 before it, then the full history. */
function monthOptions(now = new Date()): Array<{ value: string; label: string }> {
    const fmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
    return Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = fmt.format(d);
        return {
            value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
            label: `${label.charAt(0).toUpperCase()}${label.slice(1)}${i === 0 ? " (ce mois-ci)" : ""}`,
        };
    });
}

export function SdrMonthPicker({ value, onChange }: SdrMonthPickerProps) {
    return (
        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
            <CalendarDays className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <span className="text-slate-500">RDV pris en</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="bg-transparent font-medium text-slate-900 focus:outline-none"
                aria-label="Mois de prise de RDV"
            >
                {monthOptions().map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
                <option value="all">Tout l&apos;historique</option>
            </select>
        </label>
    );
}
