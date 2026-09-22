"use client";

import { Ban, Clock } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface ExclusionBadgeInfo {
    label?: string | null;
    reason?: string | null;
    createdByName?: string | null;
    createdAt?: string | Date | null;
    expiresAt?: string | Date | null;
    target?: "COMPANY" | "CONTACT" | null;
}

/**
 * The "why is this row not callable?" marker.
 *
 * Excluded prospects stay visible everywhere except the queue — a row that
 * silently vanishes reads as a bug and generates a support ticket, which is
 * exactly what this feature exists to stop. The badge carries the reason, the
 * author and the date in its tooltip so an SDR never has to ask.
 */
export function ExclusionBadge({
    info,
    size = "md",
    className,
}: {
    info: ExclusionBadgeInfo;
    size?: "sm" | "md";
    className?: string;
}) {
    const until = info.expiresAt ? new Date(info.expiresAt) : null;
    const isTemporary = !!until;

    const tooltip = [
        info.target === "CONTACT" ? "Contact exclu" : "Société exclue",
        info.reason ? `Motif : ${info.reason}` : null,
        info.createdByName ? `Par ${info.createdByName}` : null,
        info.createdAt ? `Le ${format(new Date(info.createdAt), "d MMM yyyy", { locale: fr })}` : null,
        until ? `Jusqu'au ${format(until, "d MMM yyyy", { locale: fr })}` : "Exclusion définitive",
    ]
        .filter(Boolean)
        .join("\n");

    return (
        <span
            title={tooltip}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border font-medium",
                "bg-red-50 text-red-700 border-red-200",
                size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
                className
            )}
        >
            {isTemporary ? <Clock className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
            Ne plus contacter
        </span>
    );
}

/**
 * Full-width banner for a detail view, where there is room to say why without
 * making the reader hover.
 */
export function ExclusionBanner({ info, className }: { info: ExclusionBadgeInfo; className?: string }) {
    const until = info.expiresAt ? new Date(info.expiresAt) : null;

    return (
        <div
            className={cn(
                "flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/80 p-3",
                className
            )}
        >
            <Ban className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
                <p className="text-sm font-semibold text-red-800">
                    {info.target === "CONTACT" ? "Ce contact est exclu" : "Cette société est exclue"}
                    {until
                        ? ` jusqu'au ${format(until, "d MMMM yyyy", { locale: fr })}`
                        : " — exclusion définitive"}
                </p>
                {info.reason && <p className="text-sm text-red-700 mt-0.5 break-words">{info.reason}</p>}
                {(info.createdByName || info.createdAt) && (
                    <p className="text-xs text-red-600/80 mt-1">
                        {info.createdByName ? `Ajoutée par ${info.createdByName}` : "Ajoutée"}
                        {info.createdAt
                            ? ` le ${format(new Date(info.createdAt), "d MMMM yyyy", { locale: fr })}`
                            : ""}
                    </p>
                )}
            </div>
        </div>
    );
}
