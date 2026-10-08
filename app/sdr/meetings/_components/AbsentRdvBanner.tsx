import { useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, RotateCcw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { daysSinceMissed } from "../_lib/formatters";
import type { Meeting } from "../_types";

interface AbsentRdvBannerProps {
    /** Open absences, already ordered: client wants a call back first, then oldest. */
    absentMeetings: Meeting[];
    /** Absences a manager set aside: not the SDR's to call, only counted here. */
    setAsideCount?: number;
    onOpen: (meeting: Meeting) => void;
    onShowAll?: () => void;
    onShowSetAside?: () => void;
}

const COLLAPSED_COUNT = 3;

function ageLabel(days: number | null): string | null {
    if (days === null) return null;
    if (days === 0) return "aujourd'hui";
    if (days === 1) return "hier";
    return `il y a ${days} j`;
}

export function AbsentRdvBanner({ absentMeetings, setAsideCount = 0, onOpen, onShowAll, onShowSetAside }: AbsentRdvBannerProps) {
    const [expanded, setExpanded] = useState(false);
    if (absentMeetings.length === 0) return null;

    const total = absentMeetings.length;
    const visible = expanded ? absentMeetings : absentMeetings.slice(0, COLLAPSED_COUNT);
    const hidden = total - COLLAPSED_COUNT;

    return (
        <div className="rounded-2xl border border-red-200 bg-red-50/70 p-4 shadow-sm animate-fade-in sm:p-5">
            <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
                    <XCircle className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-red-800">
                        {total} prospect{total > 1 ? "s" : ""} absent{total > 1 ? "s" : ""} à rappeler
                    </h3>
                    <p className="text-xs text-red-700/80">Les plus urgents d&apos;abord : ceux que le client veut revoir, puis les plus anciens.</p>
                </div>
                {onShowAll && total > COLLAPSED_COUNT && (
                    <button
                        type="button"
                        onClick={onShowAll}
                        className="hidden shrink-0 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 sm:inline-flex"
                    >
                        Voir dans la liste
                    </button>
                )}
            </div>

            <div className={cn("mt-3 flex flex-col gap-2", expanded && total > 6 && "max-h-[420px] overflow-y-auto pr-1")}>
                {visible.map((m) => {
                    const contactName = [m.contact.firstName, m.contact.lastName].filter(Boolean).join(" ") || "Contact";
                    const wantsRecontact = m.meetingFeedback?.recontactRequested === "YES";
                    const maybeRecontact = m.meetingFeedback?.recontactRequested === "MAYBE";
                    const age = ageLabel(daysSinceMissed(m));
                    return (
                        <button
                            key={m.id}
                            type="button"
                            onClick={() => onOpen(m)}
                            className="flex w-full cursor-pointer flex-col gap-1.5 rounded-xl border border-red-100 bg-white/90 px-3 py-2.5 text-left transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">
                                    {m.contact.firstName?.[0] ?? "?"}{m.contact.lastName?.[0] ?? ""}
                                </div>
                                <div className="min-w-0 flex-1 truncate">
                                    <span className="text-sm font-semibold text-slate-900">{contactName}</span>
                                    <span className="ml-2 text-xs text-slate-500">{m.contact.company.name}</span>
                                </div>
                                {age && <span className="hidden shrink-0 text-[11px] text-slate-400 sm:inline">manqué {age}</span>}
                                {wantsRecontact && (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                        <RotateCcw className="h-3 w-3" /> À recontacter
                                    </span>
                                )}
                                {maybeRecontact && (
                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                        Peut-être
                                    </span>
                                )}
                                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                            </div>
                            {/* The comment is the reason the RDV is here: its own full-width line. */}
                            {m.meetingFeedback?.clientNote && (
                                <p className="ml-10 whitespace-pre-wrap break-words border-l-2 border-red-200 pl-2.5 text-xs italic leading-relaxed text-slate-600 line-clamp-3">
                                    &ldquo;{m.meetingFeedback.clientNote}&rdquo;
                                </p>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {hidden > 0 ? (
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline"
                    >
                        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {expanded ? "Réduire" : `Voir les ${hidden} autre${hidden > 1 ? "s" : ""}`}
                    </button>
                ) : <span />}
                {setAsideCount > 0 && onShowSetAside && (
                    <button type="button" onClick={onShowSetAside} className="text-xs text-slate-500 hover:text-slate-700 hover:underline">
                        {setAsideCount} absence{setAsideCount > 1 ? "s" : ""} mise{setAsideCount > 1 ? "s" : ""} de côté par un manager (hors de votre file)
                    </button>
                )}
            </div>
        </div>
    );
}
