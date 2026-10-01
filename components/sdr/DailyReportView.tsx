import { cn } from "@/lib/utils";
import {
    MAIN_BLOCKER_LABELS,
    PITCH_FEELING_LABELS,
    POSITIVE_CODES,
    PROSPECT_RETURN_LABELS,
    REACHABILITY_LABELS,
    labelOf,
} from "@/lib/sdr-daily-report/options";

/**
 * A stored "Retour journée" as the manager views receive it. Reports sent before
 * the structured form carry a score and free text instead, and keep rendering.
 */
export interface DailyReportLike {
    reachability?: string[] | null;
    prospectReturns?: string[] | null;
    pitchFeeling?: string[] | null;
    mainBlocker?: string | null;
    fieldComment?: string | null;
    // legacy free-text report
    score?: number | null;
    review?: string | null;
    objections?: string | null;
    missionComment?: string | null;
}

export function isStructuredReport(item: DailyReportLike): boolean {
    return !!item.mainBlocker || !!item.reachability?.length;
}

/** Comment of either generation of the form, for counts and filters. */
export function reportComment(item: DailyReportLike): string | null {
    return item.fieldComment?.trim() || item.missionComment?.trim() || null;
}

export function ChipList({
    codes,
    labels,
    className,
}: {
    codes?: string[] | null;
    labels: Record<string, string>;
    className?: string;
}) {
    if (!codes?.length) return <span className="text-slate-400">—</span>;
    return (
        <div className={cn("flex flex-wrap gap-1", className)}>
            {codes.map((code) => (
                <span
                    key={code}
                    className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium leading-snug",
                        POSITIVE_CODES.has(code)
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-700",
                    )}
                >
                    {labelOf(labels, code)}
                </span>
            ))}
        </div>
    );
}

export function BlockerChip({ code }: { code?: string | null }) {
    if (!code) return <span className="text-slate-400">—</span>;
    return (
        <span
            className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold leading-snug",
                POSITIVE_CODES.has(code) ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800",
            )}
        >
            {labelOf(MAIN_BLOCKER_LABELS, code)}
        </span>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
            <p className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:w-28 sm:pt-1">
                {label}
            </p>
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}

/** Full body of one report, for the card layouts (mission and client views). */
export function DailyReportBody({ item }: { item: DailyReportLike }) {
    if (!isStructuredReport(item)) {
        return (
            <div className="space-y-1.5">
                {item.review && (
                    <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{item.review}</p>
                )}
                {item.objections && (
                    <p className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">Objections :</span> {item.objections}
                    </p>
                )}
                {item.missionComment && (
                    <p className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">Commentaire mission :</span>{" "}
                        {item.missionComment}
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <Row label="Joignabilité">
                <ChipList codes={item.reachability} labels={REACHABILITY_LABELS} />
            </Row>
            <Row label="Retours prospects">
                <ChipList codes={item.prospectReturns} labels={PROSPECT_RETURN_LABELS} />
            </Row>
            <Row label="Discours">
                <ChipList codes={item.pitchFeeling} labels={PITCH_FEELING_LABELS} />
            </Row>
            <Row label="Principal frein">
                <BlockerChip code={item.mainBlocker} />
            </Row>
            {item.fieldComment && (
                <p className="mt-1 border-l-2 border-slate-200 pl-3 text-xs italic text-slate-600 whitespace-pre-wrap">
                    {item.fieldComment}
                </p>
            )}
        </div>
    );
}
