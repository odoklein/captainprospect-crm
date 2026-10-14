"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarX, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Red banner at the top of the action drawer when the client reported this
 * prospect absent: the SDR reads it before calling, whatever page they came
 * from. It disappears on its own once the RDV is booked again (the absence is
 * archived and the RDV is back under "À venir").
 */

export const ABSENT_RDV_ALERT_QUERY_KEY = ["absent-rdv-target"] as const;

interface AbsentTarget {
    actionId: string;
    rdvDate: string | null;
    reportedAt: string;
    recontactRequested: "YES" | "NO" | "MAYBE";
    clientNote: string | null;
    source: "PORTAL_CLIENT" | "PORTAL_COMMERCIAL" | "MANAGER" | "MANAGER_MANUAL" | null;
    missionName: string | null;
    bookedBy: string | null;
}

const RECONTACT: Record<AbsentTarget["recontactRequested"], { label: string; className: string }> = {
    YES: { label: "À recontacter", className: "bg-red-600 text-white" },
    MAYBE: { label: "Peut-être", className: "bg-white text-red-700 ring-1 ring-inset ring-red-200" },
    NO: { label: "Ne pas recontacter", className: "bg-slate-800 text-white" },
};

const SOURCE: Record<NonNullable<AbsentTarget["source"]>, string> = {
    PORTAL_CLIENT: "le client",
    PORTAL_COMMERCIAL: "le commercial",
    MANAGER: "un manager",
    MANAGER_MANUAL: "un manager",
};

const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function AbsentRdvAlert({ contactId, companyId }: { contactId?: string | null; companyId?: string | null }) {
    const { data } = useQuery({
        queryKey: [...ABSENT_RDV_ALERT_QUERY_KEY, contactId ?? null, contactId ? null : companyId ?? null],
        enabled: Boolean(contactId || companyId),
        staleTime: 30_000,
        queryFn: async (): Promise<AbsentTarget | null> => {
            const qs = contactId ? `contactId=${encodeURIComponent(contactId)}` : `companyId=${encodeURIComponent(companyId!)}`;
            const res = await fetch(`/api/sdr/absent-rdvs/target?${qs}`);
            const json = await res.json().catch(() => null);
            return json?.success ? (json.data as AbsentTarget | null) : null;
        },
    });

    if (!data) return null;
    const recontact = RECONTACT[data.recontactRequested];
    const reporter = data.source ? SOURCE[data.source] : null;

    return (
        <section
            role="alert"
            aria-label="RDV absent"
            className="overflow-hidden rounded-2xl border border-red-200 bg-red-50 shadow-[inset_4px_0_0_var(--color-red-600)]"
        >
            <div className="flex items-start gap-3 px-4 py-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white">
                    <CalendarX className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-red-900">RDV absent</h3>
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", recontact.className)}>
                            {data.recontactRequested === "YES" && <RotateCcw className="h-3 w-3" />}
                            {recontact.label}
                        </span>
                    </div>
                    <p className="text-xs leading-relaxed text-red-800/90">
                        {data.rdvDate ? <>Absent au RDV du <span className="font-semibold">{fmt(data.rdvDate)}</span></> : "Absent au RDV"}
                        {reporter && <> · signalé par {reporter} le {fmt(data.reportedAt)}</>}
                    </p>
                    {(data.missionName || data.bookedBy) && (
                        <p className="text-[11px] text-red-700/70">
                            {[data.missionName, data.bookedBy && `RDV pris par ${data.bookedBy}`].filter(Boolean).join(" · ")}
                        </p>
                    )}
                </div>
            </div>

            {data.clientNote && (
                <p className="mx-4 mb-3 whitespace-pre-wrap break-words rounded-xl border border-red-100 bg-white px-3 py-2 text-xs italic leading-relaxed text-slate-700">
                    « {data.clientNote} »
                </p>
            )}

            {data.recontactRequested !== "NO" && (
                <p className="border-t border-red-100 bg-white/60 px-4 py-2 text-[11px] text-red-800/80">
                    Reprenez un RDV via « RDV planifié » : le même RDV est replanifié et repasse « À venir », sans passer par le SAS.
                </p>
            )}
        </section>
    );
}
