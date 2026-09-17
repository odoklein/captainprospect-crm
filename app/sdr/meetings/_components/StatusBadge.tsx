import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RdvStatus } from "../_types";

const STATUS_CONFIG: Record<RdvStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    upcoming: { label: "À venir", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <Circle className="w-2.5 h-2.5 fill-emerald-600 text-emerald-600 shrink-0" /> },
    past: { label: "Passé", cls: "bg-slate-100 text-slate-600 border-slate-200", icon: <Circle className="w-2.5 h-2.5 fill-slate-400 text-slate-400 shrink-0" /> },
    rescheduled: { label: "Reporté", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: <Circle className="w-2.5 h-2.5 fill-amber-500 text-amber-500 shrink-0" /> },
    cancelled: { label: "Annulé", cls: "bg-red-50 text-red-700 border-red-200", icon: <Circle className="w-2.5 h-2.5 fill-red-500 text-red-500 shrink-0" /> },
};

export function StatusBadge({ status }: { status: RdvStatus }) {
    const c = STATUS_CONFIG[status] ?? STATUS_CONFIG.past;
    return (
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border", c.cls)}>
            {c.icon}
            {c.label}
        </span>
    );
}
