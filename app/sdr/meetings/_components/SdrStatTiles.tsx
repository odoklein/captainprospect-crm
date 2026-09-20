import { CalendarClock, CheckCircle2, Clock, History, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/ui";
import type { StatusFilter } from "../_types";

interface SdrStatTilesProps {
    stats: {
        upcoming: number;
        past: number;
        confirmed: number;
        absent: number;
        cancelled: number;
    };
    statusFilter: StatusFilter;
    onSelect: (filter: StatusFilter) => void;
}

const TILES = [
    { key: "upcoming" as const, label: "À venir", icon: Clock, iconBg: "bg-emerald-100", iconColor: "text-emerald-600", activeBg: "bg-emerald-50/70", activeBorder: "border-emerald-200" },
    { key: "past" as const, label: "Passés", icon: History, iconBg: "bg-slate-100", iconColor: "text-slate-500", activeBg: "bg-slate-100/80", activeBorder: "border-slate-200" },
    { key: "confirmed" as const, label: "Confirmés", icon: CheckCircle2, iconBg: "bg-blue-100", iconColor: "text-blue-600", activeBg: "bg-blue-50/70", activeBorder: "border-blue-200" },
    { key: "absent" as const, label: "Absents", icon: XCircle, iconBg: "bg-red-100", iconColor: "text-red-600", activeBg: "bg-red-50/80", activeBorder: "border-red-200" },
    { key: "cancelled" as const, label: "Annulés", icon: XCircle, iconBg: "bg-red-100", iconColor: "text-red-500", activeBg: "bg-red-50/80", activeBorder: "border-red-200" },
];

export function SdrStatTiles({ stats, statusFilter, onSelect }: SdrStatTilesProps) {
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {TILES.map((t) => {
                const isActive = statusFilter === t.key;
                return (
                    <button key={t.key} type="button" onClick={() => onSelect(t.key)} className="w-full text-left">
                        <StatCard
                            label={t.label}
                            value={stats[t.key]}
                            icon={t.icon}
                            iconBg={t.iconBg}
                            iconColor={t.iconColor}
                            className={cn(
                                "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md",
                                isActive ? `${t.activeBg} ${t.activeBorder}` : "border-slate-200"
                            )}
                        />
                    </button>
                );
            })}
        </div>
    );
}
