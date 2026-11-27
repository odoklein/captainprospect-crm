"use client";

// The day at a glance, on top of the Focus mode: every call placed at its time
// (taller for a better outcome), the planned blocks, now, the pace against the
// quota, and the last calls as a journal strip.

import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/workspace/StatusPill";
import { statusFamily, type StatusFamily } from "@/lib/workspace/status-family";
import type { DayRail as DayRailModel, LivePace, RailTone } from "@/lib/focus/console";
import type { TodayCall } from "./useFocusConsole";

const TONE_BG: Record<RailTone, string> = {
    meeting: "var(--ds-accent)",
    positive: "var(--ds-success)",
    pending: "var(--ds-warning)",
    negative: "var(--brand-neutral-400)",
    noreach: "var(--brand-neutral-300)",
};

const LEGEND: [RailTone, string][] = [
    ["meeting", "RDV"],
    ["positive", "Intéressé"],
    ["pending", "Rappel, mail"],
    ["negative", "Refus"],
    ["noreach", "Pas joint"],
];

const PACE_PILL = {
    ON_TRACK: "bg-success-soft text-success-ink",
    BEHIND: "bg-warning-soft text-warning-ink",
    LATE: "bg-danger-soft text-danger-ink",
} as const;

function paceLabel(p: LivePace): string {
    if (p.lead > 0) return `+${p.lead} d’avance`;
    if (p.lead === 0) return "Dans le rythme";
    return `${-p.lead} de retard`;
}

export interface StatusMeta {
    label: string;
    color: string | null;
    family: StatusFamily;
}

export function DayRail({
    rail,
    pace,
    dayQuota,
    joints,
    meetings,
    recent,
    statusMeta,
}: {
    rail: DayRailModel;
    pace: LivePace | null;
    dayQuota: number | null;
    joints: number;
    meetings: number;
    recent: TodayCall[];
    statusMeta: (code: string) => StatusMeta;
}) {
    const calls = pace?.calls ?? rail.ticks.length;
    const reach = calls > 0 ? Math.round((joints / calls) * 100) : null;

    return (
        <section aria-label="Ta journée" className="shrink-0 border-b border-line bg-surface px-4 pb-3 pt-3.5 lg:px-6">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">Ta journée</p>
                    <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <span className="font-display text-[32px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-ink">{calls}</span>
                        <span className="text-[13px] text-ink-3">
                            appels{dayQuota ? ` sur ${dayQuota}` : ""}
                            {pace ? ` · ${pace.expected} attendus à cette heure` : ""}
                        </span>
                        {pace && (
                            <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-semibold", PACE_PILL[pace.status])}>{paceLabel(pace)}</span>
                        )}
                    </div>
                </div>
                <dl className="ml-auto flex gap-6 text-[12px]">
                    <div>
                        <dt className="text-ink-3">Joints</dt>
                        <dd className="text-[18px] font-semibold tabular-nums text-ink">{joints}</dd>
                    </div>
                    <div>
                        <dt className="text-ink-3">Joignabilité</dt>
                        <dd className="text-[18px] font-semibold tabular-nums text-ink">{reach === null ? "—" : `${reach} %`}</dd>
                    </div>
                    <div>
                        <dt className="text-ink-3">RDV</dt>
                        <dd className={cn("text-[18px] font-semibold tabular-nums", meetings > 0 ? "text-accent-700" : "text-ink")}>{meetings}</dd>
                    </div>
                </dl>
            </div>

            <div className="mt-5">
                <div
                    role="img"
                    aria-label={`${rail.ticks.length} appels aujourd’hui, placés à leur heure. La hauteur indique le résultat.`}
                    className="relative h-14 border-b border-line-strong"
                >
                    {rail.blocks.map((b, i) => (
                        <div key={i} className="absolute inset-y-0 rounded-t-sm bg-surface-2" style={{ left: `${b.left}%`, width: `${b.width}%` }} aria-hidden />
                    ))}
                    {rail.now !== null && (
                        <div
                            className="absolute inset-y-0 right-0 bg-[repeating-linear-gradient(135deg,var(--ds-line-subtle)_0_5px,transparent_5px_10px)] opacity-70"
                            style={{ left: `${rail.now}%` }}
                            aria-hidden
                        />
                    )}
                    {rail.ticks.map((t, i) => (
                        <span
                            key={i}
                            className="absolute bottom-0 w-[3px] -translate-x-1/2 rounded-t-[2px]"
                            style={{ left: `${t.left}%`, height: `${t.height * 100}%`, background: TONE_BG[t.tone] }}
                            aria-hidden
                        />
                    ))}
                    {rail.now !== null && (
                        <>
                            <span className="absolute -bottom-1 -top-1 w-0.5 -translate-x-1/2 rounded-full bg-accent" style={{ left: `${rail.now}%` }} aria-hidden />
                            <span className="absolute -top-5 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-semibold text-accent-700" style={{ left: `${rail.now}%` }}>
                                maintenant
                            </span>
                        </>
                    )}
                </div>
                <div className="relative mt-1 h-4 font-mono text-[10.5px] text-ink-3" aria-hidden>
                    {rail.hours.map((h, i) => (
                        <span
                            key={h.label}
                            className={cn("absolute", i === 0 ? "" : i === rail.hours.length - 1 ? "-translate-x-full" : "-translate-x-1/2")}
                            style={{ left: `${h.left}%` }}
                        >
                            {h.label}
                        </span>
                    ))}
                </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-3" aria-label="Légende">
                    {LEGEND.map(([tone, label]) => (
                        <li key={tone} className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-[2px]" style={{ background: TONE_BG[tone] }} aria-hidden />
                            {label}
                        </li>
                    ))}
                </ul>
                {recent.length > 0 && (
                    <ol className="ml-auto flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Derniers appels">
                        {recent.map((c) => {
                            const meta = statusMeta(c.result);
                            const who = c.contactName || c.companyName || "Prospect";
                            return (
                                <li key={c.id} className="inline-flex min-w-0 items-center gap-1.5 rounded-control border border-line-subtle bg-surface-2/60 py-0.5 pl-2 pr-0.5 text-[12px]">
                                    <span className="font-mono text-[11px] tabular-nums text-ink-3">
                                        {new Date(c.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}
                                    </span>
                                    <span className="max-w-[140px] truncate text-ink-2">{who}</span>
                                    <StatusPill label={meta.label} color={meta.color} family={meta.family} />
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>
        </section>
    );
}

/** Fallback when the mission's status list doesn't hold a code. */
export function fallbackMeta(code: string, label?: string): StatusMeta {
    return { label: label ?? code, color: null, family: statusFamily(code) };
}
