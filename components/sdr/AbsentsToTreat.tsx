"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RotateCcw, UserX } from "lucide-react";
import { Modal } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface AbsentToTreat {
    actionId: string;
    contactId: string | null;
    companyId: string;
    contact: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        title: string | null;
        email: string | null;
        phone: string | null;
        linkedin: string | null;
        status: string;
    } | null;
    company: { id: string; name: string; industry: string | null; website: string | null; country: string | null; phone: string | null };
    campaignId: string;
    channel: string;
    missionId: string | null;
    missionName: string;
    priority: string;
    rdvDate: string | null;
    recontact: string;
    clientNote: string | null;
}

export const ABSENTS_TO_TREAT_QUERY_KEY = ["sdr-absent-rdvs"] as const;

function ageLabel(iso: string | null): string | null {
    if (!iso) return null;
    const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
    if (days === 0) return "aujourd'hui";
    if (days === 1) return "hier";
    return `il y a ${days} j`;
}

interface AbsentsToTreatButtonProps {
    /** Opens the prospect in the action drawer (the same one a queue row opens). */
    onOpen: (item: AbsentToTreat) => void;
    className?: string;
    /** Light variant for the dark card-view header. */
    tone?: "light" | "dark";
}

/**
 * "Les absents à traiter": one button, available whichever list or mission is
 * selected, that gathers the absent RDVs booked by this SDR. Missions that have
 * been stopped are left out by the API, same as in the call queue.
 */
export function AbsentsToTreatButton({ onOpen, className, tone = "light" }: AbsentsToTreatButtonProps) {
    const [open, setOpen] = useState(false);
    const { data: items = [], isLoading } = useQuery({
        queryKey: ABSENTS_TO_TREAT_QUERY_KEY,
        queryFn: async () => {
            const res = await fetch("/api/sdr/absent-rdvs", { cache: "no-store" });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || "Erreur");
            return (json.data?.items ?? []) as AbsentToTreat[];
        },
        staleTime: 30_000,
        refetchOnWindowFocus: true,
    });

    const count = items.length;
    const hot = count > 0;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                title="Les prospects absents à leur RDV que vous devez rappeler, toutes listes confondues"
                className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-[13px] font-semibold shadow-2xs transition-colors",
                    hot
                        ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        : tone === "dark"
                            ? "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                            : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
                    className,
                )}
            >
                <UserX className="size-3.5" aria-hidden />
                Les absents à traiter
                <span
                    className={cn(
                        "rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                        hot ? "bg-red-600 text-white" : "bg-slate-200 text-slate-600",
                    )}
                >
                    {isLoading ? "…" : count}
                </span>
            </button>

            <Modal
                isOpen={open}
                onClose={() => setOpen(false)}
                title="Les absents à traiter"
                description="Vos RDV dont le prospect ne s'est pas présenté, toutes listes confondues. Les missions arrêtées n'y figurent plus."
                size="lg"
            >
                {count === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500">Aucun absent à traiter pour le moment.</p>
                ) : (
                    <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
                        {items.map((item) => {
                            const name = [item.contact?.firstName, item.contact?.lastName].filter(Boolean).join(" ") || item.company.name;
                            const age = ageLabel(item.rdvDate);
                            return (
                                <button
                                    key={item.actionId}
                                    type="button"
                                    onClick={() => {
                                        setOpen(false);
                                        onOpen(item);
                                    }}
                                    className="flex w-full flex-col gap-1.5 rounded-xl border border-red-100 bg-red-50/40 px-3 py-2.5 text-left transition hover:bg-red-50"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-semibold text-slate-900">
                                                {name}
                                                <span className="ml-2 text-xs font-normal text-slate-500">{item.company.name}</span>
                                            </div>
                                            <div className="truncate text-[11px] text-slate-500">
                                                {item.missionName}
                                                {age && <> · manqué {age}</>}
                                            </div>
                                        </div>
                                        {item.recontact === "YES" ? (
                                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                                <RotateCcw className="h-3 w-3" /> À recontacter
                                            </span>
                                        ) : (
                                            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                                Peut-être
                                            </span>
                                        )}
                                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                    </div>
                                    {item.clientNote && (
                                        <p className="line-clamp-2 border-l-2 border-red-200 pl-2.5 text-xs italic text-slate-600">
                                            &ldquo;{item.clientNote}&rdquo;
                                        </p>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </Modal>
        </>
    );
}
