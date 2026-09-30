"use client";

import { PACE_STATUS_COPY, formatHours, paceHeadline, type PaceStatus } from "@/lib/sdr-pace/pace";
import { useSdrPace } from "./SdrPaceProvider";

// ============================================
// SDR PACE CARD
// Always-on status: where the SDR is against the call rhythm of the day.
// ============================================

const TONE: Record<PaceStatus, { pill: string; bar: string; accent: string; delta: string }> = {
    ON_TRACK: {
        pill: "bg-[#E7EFE9] text-[#2B5F3E]",
        bar: "bg-[#10B981]",
        accent: "border-l-[#10B981]",
        delta: "text-[#2B5F3E]",
    },
    BEHIND: {
        pill: "bg-[#FFF7ED] text-[#C2410C]",
        bar: "bg-[#F59E0B]",
        accent: "border-l-[#F59E0B]",
        delta: "text-[#C2410C]",
    },
    LATE: {
        pill: "bg-[#FEF2F2] text-[#B91C1C]",
        bar: "bg-[#EF4444]",
        accent: "border-l-[#EF4444]",
        delta: "text-[#B91C1C]",
    },
};

const rateFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function SdrPaceCard() {
    const { pace, loading } = useSdrPace();

    if (!pace) {
        return loading ? <div className="h-[148px] mb-5 rounded-2xl bg-white border border-[#E8E6DF] animate-pulse" /> : null;
    }

    const tone = TONE[pace.status];
    const copy = PACE_STATUS_COPY[pace.status];
    const headline = paceHeadline(pace);

    const fillPct = Math.min((pace.callsDone / pace.dayQuota) * 100, 100);
    const expectedPct = Math.min((pace.expected / pace.dayQuota) * 100, 100);

    const gap =
        pace.delta > 0
            ? { value: `−${pace.delta}`, label: pace.delta > 1 ? "appels de retard" : "appel de retard" }
            : pace.delta < 0
            ? { value: `+${pace.aheadBy}`, label: pace.aheadBy > 1 ? "appels d'avance" : "appel d'avance" }
            : { value: "0", label: "pile au rythme" };

    const timeNote =
        pace.progress <= 0
            ? "La session d'appel n'a pas encore commencé : l'objectif attendu démarre avec ton créneau."
            : pace.progress < 1 && !pace.isCallingTime
            ? "Hors créneau d'appel (pause déjeuner ou fin de planning) : l'objectif attendu est en pause."
            : null;

    return (
        <section
            className={`mb-5 rounded-2xl border border-[#E8E6DF] border-l-4 ${tone.accent} bg-white p-5 shadow-sm`}
            aria-label="Rythme d'appels du jour"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${tone.pill}`}>
                    <span aria-hidden>{copy.badge}</span>
                    {copy.label}
                </span>
                <span className="text-[11px] text-[#8A8A83]">
                    Rythme cible : {rateFormatter.format(pace.callsPerHour)} appels/h
                </span>
            </div>

            <p className="mt-3 text-[14px] font-medium leading-snug text-[#0E0F0C]">
                <span aria-hidden className="mr-1.5">{headline.emoji}</span>
                {headline.text}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-3">
                <div>
                    <div className="text-[11px] font-medium text-[#8A8A83]">Appels réalisés</div>
                    <div className="mt-0.5 text-[22px] font-bold leading-none text-[#0E0F0C]">
                        {pace.callsDone}
                        <span className="text-[14px] font-medium text-[#8A8A83]"> / {pace.dayQuota}</span>
                    </div>
                </div>
                <div>
                    <div className="text-[11px] font-medium text-[#8A8A83]">Objectif à ce stade</div>
                    <div className="mt-0.5 text-[22px] font-bold leading-none text-[#0E0F0C]">{pace.expected}</div>
                </div>
                <div>
                    <div className="text-[11px] font-medium text-[#8A8A83]">Écart</div>
                    <div className={`mt-0.5 text-[22px] font-bold leading-none ${pace.delta > 0 ? tone.delta : "text-[#0E0F0C]"}`}>
                        {gap.value}
                        <span className="ml-1 text-[11px] font-medium text-[#8A8A83]">{gap.label}</span>
                    </div>
                </div>
            </div>

            <div className="relative mt-4 h-2.5 rounded-full bg-[#F1EFE9]">
                <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${tone.bar}`}
                    style={{ width: `${fillPct}%` }}
                />
                {pace.expected > 0 && (
                    <div
                        className="absolute -top-1 h-[18px] w-0.5 rounded bg-[#0E0F0C]"
                        style={{ left: `calc(${expectedPct}% - 1px)` }}
                        title={`Objectif à ce stade : ${pace.expected}`}
                    />
                )}
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-[#8A8A83]">
                {formatHours(pace.effectiveHoursElapsed)} d&apos;appel effectif écoulées sur {formatHours(pace.effectiveHoursTarget)}
                {pace.forgivenPauseMinutes > 0 && ` · ${pace.forgivenPauseMinutes} min de pause non comptées`}
                {timeNote && <> — {timeNote}</>}
            </p>
        </section>
    );
}
