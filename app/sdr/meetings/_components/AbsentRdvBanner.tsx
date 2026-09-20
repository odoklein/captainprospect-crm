import { ArrowRight, RotateCcw, XCircle } from "lucide-react";
import type { Meeting } from "../_types";

interface AbsentRdvBannerProps {
    absentMeetings: Meeting[];
    onOpen: (meeting: Meeting) => void;
}

export function AbsentRdvBanner({ absentMeetings, onOpen }: AbsentRdvBannerProps) {
    if (absentMeetings.length === 0) return null;

    return (
        <div className="rounded-2xl border-2 border-red-200 bg-gradient-to-r from-red-50 via-red-50/80 to-orange-50/60 p-5 shadow-sm animate-fade-in">
            <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
                    <XCircle className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-sm font-bold text-red-800">
                            {absentMeetings.length} RDV marqué{absentMeetings.length > 1 ? "s" : ""} absent{absentMeetings.length > 1 ? "s" : ""}
                        </h3>
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 border border-red-200">
                            Action requise
                        </span>
                    </div>
                    <div className="flex flex-col gap-2">
                        {absentMeetings.slice(0, 5).map((m) => {
                            const contactName = [m.contact.firstName, m.contact.lastName].filter(Boolean).join(" ") || "Contact";
                            const wantsRecontact = m.meetingFeedback?.recontactRequested === "YES";
                            const maybeRecontact = m.meetingFeedback?.recontactRequested === "MAYBE";
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => onOpen(m)}
                                    className="w-full text-left flex items-center gap-3 rounded-xl border border-red-100 bg-white/80 px-3 py-2.5 cursor-pointer hover:bg-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                                >
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-700">
                                        {m.contact.firstName?.[0] ?? "?"}{m.contact.lastName?.[0] ?? ""}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm font-semibold text-slate-900">{contactName}</span>
                                        <span className="text-xs text-slate-500 ml-2">{m.contact.company.name}</span>
                                    </div>
                                    {wantsRecontact && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200 shrink-0">
                                            <RotateCcw className="w-3 h-3" /> A recontacter
                                        </span>
                                    )}
                                    {maybeRecontact && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200 shrink-0">
                                            Peut-être
                                        </span>
                                    )}
                                    {m.meetingFeedback?.clientNote && (
                                        <span className="text-xs text-slate-500 truncate max-w-[200px]" title={m.meetingFeedback.clientNote}>
                                            &ldquo;{m.meetingFeedback.clientNote}&rdquo;
                                        </span>
                                    )}
                                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                </button>
                            );
                        })}
                        {absentMeetings.length > 5 && (
                            <p className="text-xs text-red-600 font-medium mt-1">
                                + {absentMeetings.length - 5} autre{absentMeetings.length - 5 > 1 ? "s" : ""} RDV absent{absentMeetings.length - 5 > 1 ? "s" : ""}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
