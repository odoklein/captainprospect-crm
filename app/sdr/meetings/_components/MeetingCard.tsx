import {
    CalendarClock,
    Check,
    Circle,
    Eye,
    Linkedin,
    Mail,
    MapPin,
    MessageSquareQuote,
    PauseCircle,
    Phone,
    Video,
    XCircle,
} from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getAvatarColor, getDisplayNote, getInitials, getMeetingDisplayDate, getRdvStatus, formatCardMonth, formatCardTime, isOpenNoShow } from "../_lib/formatters";
import { StatusBadge } from "./StatusBadge";
import type { Meeting } from "../_types";

interface MeetingCardProps {
    meeting: Meeting;
    /** Handlers are optional: without them the card is read-only (manager view). */
    onOpen?: (meeting: Meeting) => void;
    onReschedule?: (meeting: Meeting) => void;
    onCancel?: (meeting: Meeting) => void;
    onContextMenu?: (event: React.MouseEvent, meeting: Meeting) => void;
}

export function MeetingCard({ meeting, onOpen, onReschedule, onCancel, onContextMenu }: MeetingCardProps) {
    const d = getMeetingDisplayDate(meeting);
    const status = getRdvStatus(meeting);
    const feedback = meeting.meetingFeedback;
    const openNoShow = isOpenNoShow(meeting);
    const displayNote = getDisplayNote(meeting);

    return (
        <div
            className={cn(
                "group overflow-hidden rounded-[22px] border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer",
                openNoShow
                    ? "border-red-300 bg-red-50/30 ring-1 ring-red-100 hover:border-red-400"
                    : "border-slate-200 bg-white hover:border-slate-300"
            )}
            onClick={onOpen ? () => onOpen(meeting) : undefined}
            onContextMenu={onContextMenu ? (e) => onContextMenu(e, meeting) : undefined}
        >
            <div className="flex flex-col sm:flex-row">
                <div className="flex shrink-0 flex-row items-center justify-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4 sm:w-[110px] sm:flex-col sm:border-b-0 sm:border-r">
                    {d ? (
                        <>
                            <div className="text-center">
                                <div className="text-[28px] font-extrabold leading-none tracking-tight text-slate-900">{d.getDate()}</div>
                                <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{formatCardMonth(d)}</div>
                            </div>
                            <div className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                                {formatCardTime(d)}
                            </div>
                        </>
                    ) : (
                        <div className="text-center">
                            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Date à</div>
                            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">confirmer</div>
                        </div>
                    )}
                </div>

                <div className="flex-1 p-4 sm:p-5 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={status} />
                        {meeting.confirmationStatus === "CONFIRMED" && meeting.result !== "MEETING_CANCELLED" && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border bg-blue-50 text-blue-700 border-blue-200">
                                <Check className="w-2.5 h-2.5" />
                                Confirmé
                            </span>
                        )}
                        {meeting.confirmationStatus === "PENDING" && meeting.result !== "MEETING_CANCELLED" && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                                <Circle className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                                En attente
                            </span>
                        )}
                        {feedback?.outcome === "NO_SHOW" && (
                            <span className={cn(
                                "inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border",
                                openNoShow
                                    ? "bg-red-50 text-red-700 border-red-200 animate-pulse"
                                    : "bg-slate-50 text-slate-600 border-slate-200",
                            )}>
                                {openNoShow ? <XCircle className="w-2.5 h-2.5" /> : <PauseCircle className="w-2.5 h-2.5" />}
                                Absent
                                {!openNoShow && feedback.standByAt && " — en stand by"}
                                {openNoShow && feedback.recontactRequested === "YES" && " — A recontacter"}
                            </span>
                        )}
                        {feedback && feedback.outcome !== "NO_SHOW" && (
                            <span className={cn(
                                "inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border",
                                feedback.outcome === "POSITIVE" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                feedback.outcome === "NEUTRAL" ? "bg-slate-50 text-slate-700 border-slate-200" :
                                "bg-orange-50 text-orange-700 border-orange-200"
                            )}>
                                {feedback.outcome === "POSITIVE" ? "Positif" : feedback.outcome === "NEUTRAL" ? "Neutre" : "Négatif"}
                            </span>
                        )}
                        {meeting.meetingType && (
                            <span className="text-xs font-semibold text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-200 flex items-center gap-1">
                                {meeting.meetingType === "VISIO" && "📹 Visio"}
                                {meeting.meetingType === "PHYSIQUE" && "📍 Physique"}
                                {meeting.meetingType === "TELEPHONIQUE" && "📞 Téléphonique"}
                            </span>
                        )}
                        {meeting.mission && (
                            <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded">
                                {meeting.mission.name}
                            </span>
                        )}
                        {meeting.list && (
                            <span className="text-xs text-slate-500">{meeting.list.name}</span>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                                style={{ backgroundColor: getAvatarColor(meeting) }}
                            >
                                {getInitials(meeting)}
                            </div>
                            <div>
                                <div className="font-bold text-slate-900">{meeting.contact.firstName} {meeting.contact.lastName}</div>
                                <div className="text-xs text-slate-500">{meeting.contact.title ?? ""}</div>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                    {meeting.contact.email && (
                                        <a href={`mailto:${meeting.contact.email}`} className="text-xs text-indigo-600 hover:underline bg-indigo-50 px-2 py-0.5 rounded inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                            <Mail className="w-3 h-3" />{meeting.contact.email}
                                        </a>
                                    )}
                                    {meeting.contact.phone && (
                                        <a href={`tel:${meeting.contact.phone}`} className="text-xs text-indigo-600 hover:underline bg-indigo-50 px-2 py-0.5 rounded inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                            <Phone className="w-3 h-3" />{meeting.contact.phone}
                                        </a>
                                    )}
                                    {meeting.contact.linkedin && (
                                        <a href={meeting.contact.linkedin} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline bg-indigo-50 px-2 py-0.5 rounded inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                            <Linkedin className="w-3 h-3" />LinkedIn
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="sm:border-l sm:border-slate-200 sm:pl-6 flex flex-col gap-0.5">
                            <div className="font-semibold text-slate-900">{meeting.contact.company.name}</div>
                            <div className="text-xs text-slate-500 flex flex-wrap gap-x-2 gap-y-0">
                                {meeting.contact.company.industry && <span>{meeting.contact.company.industry}</span>}
                                {meeting.contact.company.country && <span className="inline-flex items-center gap-1"><Circle className="w-1 h-1 fill-current shrink-0" />{meeting.contact.company.country}</span>}
                                {meeting.contact.company.size && <span className="inline-flex items-center gap-1"><Circle className="w-1 h-1 fill-current shrink-0" />{meeting.contact.company.size}</span>}
                                {meeting.contact.company.website && (
                                    <a href={meeting.contact.company.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                                        {meeting.contact.company.website.replace(/^https?:\/\//, "")}
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {meeting.meetingType === "VISIO" && meeting.meetingJoinUrl && (
                            <a href={meeting.meetingJoinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-100" onClick={(e) => e.stopPropagation()}>
                                <Video className="w-3.5 h-3.5" /> Rejoindre
                            </a>
                        )}
                        {meeting.meetingType === "PHYSIQUE" && meeting.meetingAddress && (
                            <a href={`https://maps.google.com/?q=${encodeURIComponent(meeting.meetingAddress)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-100" onClick={(e) => e.stopPropagation()}>
                                <MapPin className="w-3.5 h-3.5" /> Itinéraire
                            </a>
                        )}
                        {meeting.meetingType === "TELEPHONIQUE" && (meeting.meetingPhone || meeting.contact.phone) && (
                            <a href={`tel:${meeting.meetingPhone || meeting.contact.phone}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-100" onClick={(e) => e.stopPropagation()}>
                                <Phone className="w-3.5 h-3.5" /> Appeler
                            </a>
                        )}
                    </div>

                    {/* Why the RDV got that verdict. "Négatif" on its own leaves the
                        team guessing, so the client's comment is carried on the card
                        itself rather than being buried one click away. */}
                    {feedback?.clientNote && (
                        <div className={cn(
                            "rounded-r border-l-2 py-2 pl-3 text-sm",
                            feedback.outcome === "POSITIVE" ? "border-emerald-300 bg-emerald-50/60" :
                            feedback.outcome === "NEGATIVE" ? "border-orange-300 bg-orange-50/60" :
                            feedback.outcome === "NO_SHOW" ? "border-red-300 bg-red-50/60" :
                            "border-slate-300 bg-slate-50",
                        )}>
                            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                <MessageSquareQuote className="h-3 w-3" />
                                <span>Retour du client</span>
                                {feedback.recontactRequested === "YES" && <span>· à recontacter</span>}
                                {feedback.recontactRequested === "NO" && <span>· ne pas recontacter</span>}
                            </div>
                            <p className="whitespace-pre-wrap break-words italic leading-relaxed text-slate-700">
                                &ldquo;{feedback.clientNote}&rdquo;
                            </p>
                        </div>
                    )}

                    {displayNote && (
                        <div className="text-sm text-slate-600 bg-slate-50 border-l-2 border-slate-300 pl-3 py-2 rounded-r italic">
                            &ldquo;{displayNote}&rdquo;
                        </div>
                    )}
                </div>

                {(onOpen || onReschedule || onCancel) && (
                <div className="sm:w-40 shrink-0 p-4 border-t sm:border-t-0 sm:border-l border-slate-100 flex flex-col justify-center gap-2 bg-slate-50/55">
                    {onOpen && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-center gap-1.5 text-xs rounded-xl border-slate-200 bg-white"
                        onClick={(e) => { e.stopPropagation(); onOpen(meeting); }}
                    >
                        <Eye className="w-3.5 h-3.5" />
                        Voir le détail
                    </Button>
                    )}
                    {meeting.result === "MEETING_BOOKED" && onReschedule && onCancel && (
                        <>
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full justify-center gap-1.5 text-xs rounded-xl border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
                                onClick={(e) => { e.stopPropagation(); onReschedule(meeting); }}
                            >
                                <CalendarClock className="w-3.5 h-3.5" />
                                Reprogrammer
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-center gap-1.5 text-xs rounded-xl text-amber-700 hover:bg-amber-50"
                                onClick={(e) => { e.stopPropagation(); onCancel(meeting); }}
                            >
                                <XCircle className="w-3.5 h-3.5" />
                                Annuler
                            </Button>
                        </>
                    )}
                </div>
                )}
            </div>
        </div>
    );
}
