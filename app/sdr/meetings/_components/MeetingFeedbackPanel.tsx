import { MessageSquareQuote, PauseCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MeetingFeedbackData } from "../_types";

/**
 * What the client or the commercial said about the RDV, shown to the team.
 *
 * The verdict alone ("Négatif", "Absent") tells an SDR nothing actionable —
 * the reason is the whole point, and it used to live only in the manager's
 * back-office. This block carries both, and never truncates the comment.
 */

const OUTCOME_TONE: Record<MeetingFeedbackData["outcome"], { label: string; wrap: string; chip: string; quote: string }> = {
    POSITIVE: {
        label: "Retour positif",
        wrap: "border-emerald-200 bg-emerald-50/60",
        chip: "bg-emerald-100 text-emerald-800 border-emerald-200",
        quote: "border-emerald-300",
    },
    NEUTRAL: {
        label: "Retour neutre",
        wrap: "border-slate-200 bg-slate-50",
        chip: "bg-slate-100 text-slate-700 border-slate-200",
        quote: "border-slate-300",
    },
    NEGATIVE: {
        label: "Retour négatif",
        wrap: "border-orange-200 bg-orange-50/60",
        chip: "bg-orange-100 text-orange-800 border-orange-200",
        quote: "border-orange-300",
    },
    NO_SHOW: {
        label: "Contact absent",
        wrap: "border-red-200 bg-red-50/60",
        chip: "bg-red-100 text-red-800 border-red-200",
        quote: "border-red-300",
    },
};

const RECONTACT_LABEL: Record<MeetingFeedbackData["recontactRequested"], string | null> = {
    YES: "À recontacter",
    MAYBE: "Peut-être à recontacter",
    NO: "Ne pas recontacter",
};

interface MeetingFeedbackPanelProps {
    feedback: MeetingFeedbackData;
    className?: string;
}

export function MeetingFeedbackPanel({ feedback, className }: MeetingFeedbackPanelProps) {
    const tone = OUTCOME_TONE[feedback.outcome];
    const recontact = RECONTACT_LABEL[feedback.recontactRequested];
    const reportedAt = feedback.createdAt
        ? new Date(feedback.createdAt).toLocaleDateString("fr-FR", {
            day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        })
        : null;

    return (
        <div className={cn("rounded-xl border p-4", tone.wrap, className)}>
            <div className="flex flex-wrap items-center gap-2">
                <MessageSquareQuote className="h-4 w-4 shrink-0 text-slate-500" />
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900">
                    Retour sur le RDV
                </h3>
                <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-bold", tone.chip)}>
                    {tone.label}
                </span>
                {recontact && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        <RotateCcw className="h-3 w-3" /> {recontact}
                    </span>
                )}
                {feedback.standByAt && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        <PauseCircle className="h-3 w-3" /> En stand by
                    </span>
                )}
            </div>

            {feedback.clientNote ? (
                <p className={cn("mt-3 whitespace-pre-wrap break-words border-l-2 pl-3 text-sm italic leading-relaxed text-slate-700", tone.quote)}>
                    &ldquo;{feedback.clientNote}&rdquo;
                </p>
            ) : (
                <p className="mt-3 text-sm text-slate-500">
                    Aucun commentaire n&apos;a été laissé avec ce retour.
                </p>
            )}

            {feedback.standByReason && (
                <p className="mt-2 text-xs text-slate-500">
                    Stand by : {feedback.standByReason}
                </p>
            )}
            {reportedAt && (
                <p className="mt-2 text-xs text-slate-400">Retour enregistré le {reportedAt}</p>
            )}
        </div>
    );
}
