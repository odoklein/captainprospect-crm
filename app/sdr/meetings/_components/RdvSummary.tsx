import { Briefcase, CalendarClock, MapPin, Phone, Video } from "lucide-react";
import { formatScheduledDate, getDisplayNote } from "../_lib/formatters";
import { MeetingFeedbackPanel } from "./MeetingFeedbackPanel";
import type { Meeting, RdvHistoryEntry } from "../_types";

/**
 * The RDV this drawer was opened from, read before the history and the action
 * form of the UnifiedActionDrawer: when it was, how, for whom, and above all
 * what came back from it (the absence and its comment).
 */

const TYPE_LABEL: Record<NonNullable<Meeting["meetingType"]>, { label: string; Icon: typeof Video }> = {
    VISIO: { label: "Visio", Icon: Video },
    PHYSIQUE: { label: "Physique", Icon: MapPin },
    TELEPHONIQUE: { label: "Téléphonique", Icon: Phone },
};

const CATEGORY_LABEL: Record<NonNullable<Meeting["meetingCategory"]>, string> = {
    EXPLORATOIRE: "Exploratoire",
    BESOIN: "Besoin",
};

const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function HistoryItem({ entry }: { entry: RdvHistoryEntry }) {
    return (
        <li className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
            <p className="text-xs font-bold text-slate-800">
                Absent{entry.rdvDate ? ` au RDV du ${fmt(entry.rdvDate)}` : ""}
            </p>
            <p className="text-[11px] leading-relaxed text-slate-500">
                {entry.reportedAt && <>Signalé le {fmt(entry.reportedAt)}<br /></>}
                {entry.replacedAt && <>Replacé le {fmt(entry.replacedAt)}{entry.newDate ? ` → ${fmt(entry.newDate)}` : ""}</>}
            </p>
            {entry.bookingNote && (
                <p className="whitespace-pre-wrap break-words text-xs text-slate-600">
                    <span className="font-semibold text-slate-500">Note de prise de RDV :</span> {entry.bookingNote}
                </p>
            )}
            {entry.clientNote && (
                <p className="whitespace-pre-wrap break-words border-l-2 border-red-300 pl-2 text-xs italic text-slate-700">
                    « {entry.clientNote} »
                </p>
            )}
        </li>
    );
}

export function RdvSummary({ meeting }: { meeting: Meeting }) {
    const type = meeting.meetingType ? TYPE_LABEL[meeting.meetingType] : null;
    const note = getDisplayNote(meeting);
    const missionLine = meeting.mission
        ? [meeting.mission.client.name, meeting.mission.name].filter(Boolean).join(" · ")
        : null;

    return (
        <section aria-label="Résumé du RDV" className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 bg-slate-50">
                <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shadow-sm" aria-hidden="true">
                    <CalendarClock className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900">Résumé du RDV</h2>
                    <p className="text-[11px] text-slate-500 capitalize">{formatScheduledDate(meeting)}</p>
                </div>
            </div>

            <div className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    {type && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                            <type.Icon className="h-3 w-3" /> {type.label}
                        </span>
                    )}
                    {meeting.meetingCategory && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                            {CATEGORY_LABEL[meeting.meetingCategory]}
                        </span>
                    )}
                    {missionLine && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <Briefcase className="h-3 w-3" /> {missionLine}
                        </span>
                    )}
                </div>

                {meeting.meetingType === "PHYSIQUE" && meeting.meetingAddress && (
                    <p className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-500">Adresse :</span> {meeting.meetingAddress}
                    </p>
                )}

                {note && (
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Note de prise de RDV</p>
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{note}</p>
                    </div>
                )}

                {meeting.meetingFeedback && <MeetingFeedbackPanel feedback={meeting.meetingFeedback} />}

                {(meeting.history?.length ?? 0) > 0 && (
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Historique des notes</p>
                        <ul className="space-y-2">
                            {meeting.history!.map((h) => <HistoryItem key={h.id} entry={h} />)}
                        </ul>
                    </div>
                )}
            </div>
        </section>
    );
}
