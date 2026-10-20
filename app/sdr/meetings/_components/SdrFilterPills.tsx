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
    { key: "past" as const, label: "Passés" },
    { key: "valid" as const, label: "Valides" },
    { key: "absent" as const, label: "Absents" },
    { key: "negative" as const, label: "Négatifs" },
    { key: "cancelled" as const, label: "Annulés" },
    { key: "setAside" as const, label: "Mis de côté" },
];

export function SdrFilterPills({ statusFilter, onSelect, counts }: SdrFilterPillsProps) {
    return (
        <div className="inline-flex flex-wrap gap-1 rounded-xl bg-black/[0.04] p-1">
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
                            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition",
                            statusFilter === f.key
                                ? "bg-white text-slate-900 shadow-2xs font-semibold"
                                : "text-slate-500 hover:bg-white/70 hover:text-slate-700",
                            f.key === "absent" && count > 0 && statusFilter !== f.key && "text-red-600"
                        )}
                    >
                        {f.label}
                        <span className={cn(
                            "rounded-full px-1.5 py-0.2 text-[10px] font-bold tabular-nums",
                            statusFilter === f.key ? "bg-primary-50 text-primary-700" : f.key === "absent" && count > 0 ? "bg-red-100 text-red-700" : "bg-slate-200 text-slate-600"
                        )}>
                            {count}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
