import { cn } from "@/lib/utils";
import type { StatusFilter } from "../_types";

interface SdrFilterPillsProps {
    statusFilter: StatusFilter;
    onSelect: (filter: StatusFilter) => void;
    counts: Record<StatusFilter, number>;
}

const FILTERS = [
    { key: "all" as const, label: "Tous" },
    { key: "upcoming" as const, label: "À venir" },
    { key: "confirmed" as const, label: "Confirmés" },
    { key: "absent" as const, label: "Absents" },
    { key: "negative" as const, label: "Négatifs" },
    { key: "past" as const, label: "Passés" },
    { key: "cancelled" as const, label: "Annulés" },
];

export function SdrFilterPills({ statusFilter, onSelect, counts }: SdrFilterPillsProps) {
    return (
        <div className="inline-flex flex-wrap gap-1 rounded-2xl bg-black/[0.04] p-1">
            {FILTERS.map((f) => {
                const count = counts[f.key];
                return (
                    <button
                        key={f.key}
                        type="button"
                        onClick={() => onSelect(f.key)}
                        aria-pressed={statusFilter === f.key}
                        aria-label={`Filtrer : ${f.label} (${count})`}
                        className={cn(
                            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition",
                            statusFilter === f.key
                                ? "bg-white text-slate-900 shadow-sm font-semibold"
                                : "text-slate-500 hover:bg-white/70 hover:text-slate-700",
                            f.key === "absent" && count > 0 && statusFilter !== f.key && "text-red-600"
                        )}
                    >
                        {f.label}
                        <span className={cn(
                            "rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                            statusFilter === f.key ? "bg-indigo-50 text-indigo-700" : f.key === "absent" && count > 0 ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-600"
                        )}>
                            {count}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
