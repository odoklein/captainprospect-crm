"use client";

import { cn } from "@/lib/utils";

const DAYS = [
    { value: "MONDAY" as const, label: "Lun" },
    { value: "TUESDAY" as const, label: "Mar" },
    { value: "WEDNESDAY" as const, label: "Mer" },
    { value: "THURSDAY" as const, label: "Jeu" },
    { value: "FRIDAY" as const, label: "Ven" },
] as const;

export type DayOfWeek = (typeof DAYS)[number]["value"];

interface DayToggleChipsProps {
    value: DayOfWeek[];
    onChange: (value: DayOfWeek[]) => void;
    frequency: number;
    disabled?: boolean;
}

export function DayToggleChips({ value, onChange, frequency, disabled }: DayToggleChipsProps) {
    const toggle = (day: DayOfWeek) => {
        if (disabled) return;
        const isSelected = value.includes(day);
        if (isSelected) {
            const next = value.filter((d) => d !== day);
            onChange(next);
        } else {
            if (value.length >= frequency) {
                // Remove from right (last selected) and add new
                const next = [...value.slice(0, frequency - 1), day];
                onChange(next);
            } else {
                const next = [...value, day].sort(
                    (a, b) => DAYS.findIndex((d) => d.value === a) - DAYS.findIndex((d) => d.value === b)
                );
                onChange(next);
            }
        }
    };

    return (
        <div className="flex flex-wrap gap-2">
            {DAYS.map(({ value: dayValue, label }) => {
                const isSelected = value.includes(dayValue);
                return (
                    <button
                        key={dayValue}
                        type="button"
                        onClick={() => toggle(dayValue)}
                        disabled={disabled}
                        className={cn(
                            "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                            isSelected
                                ? "bg-indigo-500 text-white"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                            disabled && "opacity-50 cursor-not-allowed"
                        )}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

export { DAYS };
