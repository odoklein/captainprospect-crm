import { getMeetingCancellationLabel } from "@/lib/constants/meetingCancellationReasons";
import type { Meeting } from "../../_types";

export function HistoryTab({ meeting }: { meeting: Meeting }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Historique</h3>
            <div className="text-sm text-slate-700 space-y-2">
                <p><span className="font-semibold">Créé le:</span> {new Date(meeting.createdAt).toLocaleString("fr-FR")}</p>
                <p><span className="font-semibold">Dernier statut:</span> {meeting.result === "MEETING_CANCELLED" ? "Annulé" : "Confirmé"}</p>
                {meeting.cancellationReason && (
                    <p><span className="font-semibold">Raison annulation:</span> {getMeetingCancellationLabel(meeting.cancellationReason)}</p>
                )}
                {meeting.note && (
                    <p className="italic text-slate-600">&quot;{meeting.note}&quot;</p>
                )}
            </div>
        </div>
    );
}
