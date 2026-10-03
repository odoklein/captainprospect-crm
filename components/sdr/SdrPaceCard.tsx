"use client";

import { PACE_STATUS_COPY, formatHours, paceHeadline, type PaceStatus } from "@/lib/sdr-pace/pace";
import { useSdrPace } from "./SdrPaceProvider";

// ============================================
// SDR PACE CARD
// Always-on status: where the SDR is against the call rhythm of the day.
// ============================================

const TONE: Record<PaceStatus, { pill: string; bar: string; accent: string; delta: string }> = {
    ON_TRACK: {
        pill: "bg-primary-50 text-primary-700",
        bar: "bg-success",
        accent: "border-l-success",
        delta: "text-primary-700",
    },
    BEHIND: {
        pill: "bg-warning-soft text-warning-ink",
        bar: "bg-warning",
        accent: "border-l-warning",
        delta: "text-warning-ink",
    },
    LATE: {
        pill: "bg-danger-soft text-danger-ink",
        bar: "bg-danger",
        accent: "border-l-danger",
        delta: "text-danger-ink",
    },
};

const rateFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export function SdrPaceCard() {
    const { pace, loading } = useSdrPace();

    if (!pace) {
        return loading ? <div className="h-[148px] mb-5 rounded-2xl bg-white border border-line animate-pulse" /> : null;
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
            className={`mb-5 rounded-2xl border border-line border-l-4 ${tone.accent} bg-white p-5 shadow-sm`}
            aria-label="Rythme d'appels du jour"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${tone.pill}`}>
                    <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.bar}`} />
                    {copy.label}
                </span>
                <span className="text-[11px] text-ink-3">
                    Rythme cible : {rateFormatter.format(pace.callsPerHour)} appels/h
                </span>
            </div>

            <p className="mt-3 text-[14px] font-medium leading-snug text-ink">
                {headline.text}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-3">
                <div>
                    <div className="text-[11px] font-medium text-ink-3">Appels réalisés</div>
                    <div className="mt-0.5 text-[22px] font-bold leading-none text-ink">
                        {pace.callsDone}
                        <span className="text-[14px] font-medium text-ink-3"> / {pace.dayQuota}</span>
                    </div>
                </div>
                <div>
                    <div className="text-[11px] font-medium text-ink-3">Objectif à ce stade</div>
                    <div className="mt-0.5 text-[22px] font-bold leading-none text-ink">{pace.expected}</div>
                </div>
                <div>
                    <div className="text-[11px] font-medium text-ink-3">Écart</div>
                    <div className={`mt-0.5 text-[22px] font-bold leading-none ${pace.delta > 0 ? tone.delta : "text-ink"}`}>
                        {gap.value}
                        <span className="ml-1 text-[11px] font-medium text-ink-3">{gap.label}</span>
                    </div>
                </div>
            </div>

            <div className="relative mt-4 h-2.5 rounded-full bg-surface-3">
                <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${tone.bar}`}
                    style={{ width: `${fillPct}%` }}
                />
                {pace.expected > 0 && (
                    <div
                        className="absolute -top-1 h-[18px] w-0.5 rounded bg-inverse"
                        style={{ left: `calc(${expectedPct}% - 1px)` }}
                        title={`Objectif à ce stade : ${pace.expected}`}
                    />
                )}
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
                {formatHours(pace.effectiveHoursElapsed)} d&apos;appel effectif écoulées sur {formatHours(pace.effectiveHoursTarget)}
                {pace.forgivenPauseMinutes > 0 && ` · ${pace.forgivenPauseMinutes} min de pause non comptées`}
                {timeNote && <> — {timeNote}</>}
            </p>
        </section>
    );
}
