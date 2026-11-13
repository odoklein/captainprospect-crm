"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, CircleDot, Minus, Target } from "lucide-react";
import {
    dayMonth, formatPercent, formatRate, funnelSteps, nextAction, pace, paceLabel, weakestStep,
    type FunnelBenchmark, type FunnelCounts, type NextActionKind, type PaceVerdict,
} from "@/lib/missions/pulse";

// ============================================================================
// « Pouls de la mission » — what a running mission needs from its manager,
// in reading order: the verdict, the one thing to do, where prospects drop
// out, the daily rhythm, and who carries it.
// ============================================================================

export interface PulseData {
    funnel: FunnelCounts;
    benchmark: FunnelBenchmark;
}

interface DayPoint { date: string; actions: number; reached?: number; meetings: number }

interface Props {
    status: string;
    startDate?: string;
    endDate?: string;
    targetMeetings: number | null;
    pulse: PulseData;
    series: DayPoint[];
    team: { id: string; name: string }[];
    teamStats: { sdrId: string; name?: string; actions: number; meetings: number; recentActions: number }[];
    activeLists: number;
    readyLists: number;
    onAction: (kind: NextActionKind) => void;
}

const VERDICT_TONE: Record<PaceVerdict, "success" | "warning" | "danger" | "neutral"> = {
    no_target: "neutral", not_started: "neutral", early: "neutral", ahead: "success",
    on_track: "success", behind: "warning", reached: "success", ended: "neutral",
};

const shortDay = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const tickDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

/** Lowercase a stage name inside a sentence, keeping acronyms (RDV). */
function lower(label: string) {
    return label === label.toUpperCase() ? label : label.toLowerCase();
}

function initials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

export function MissionPulse(props: Props) {
    const { status, startDate, endDate, targetMeetings, pulse, series, team, teamStats, onAction } = props;
    const steps = useMemo(() => funnelSteps(pulse.funnel, pulse.benchmark), [pulse]);
    const weakest = useMemo(() => weakestStep(steps), [steps]);
    const p = pace({ target: targetMeetings, meetings: pulse.funnel.meetings, startDate, endDate });
    const next = nextAction({ status, sdrCount: team.length, activeLists: props.activeLists, readyLists: props.readyLists, pace: p, endDate, weakest });
    const tone = VERDICT_TONE[p.verdict];

    return (
        <div className="cw-pulse">
            {/* 1. Verdict ------------------------------------------------------ */}
            <section className="cw-verdict" aria-labelledby="cw-verdict-title" data-tone={tone}>
                <div className="cw-verdict-main">
                    <p className="cw-kicker"><span className="cw-pill" data-tone={tone === "neutral" ? undefined : tone}><i />{paceLabel(p.verdict)}</span>
                        {p.totalDays > 0 && <span>Jour {p.dayIndex} sur {p.totalDays}</span>}
                    </p>
                    <h2 id="cw-verdict-title" className="cw-hero-figure">
                        <span className="cw-hero-number">{pulse.funnel.meetings}</span>
                        <span className="cw-hero-unit">{targetMeetings ? <>sur {targetMeetings} RDV visé{targetMeetings > 1 ? "s" : ""}</> : <>RDV obtenu{pulse.funnel.meetings > 1 ? "s" : ""}</>}</span>
                    </h2>
                    <p className="cw-verdict-line">{verdictSentence(p, endDate)}</p>
                </div>
                {p.totalDays > 0 && <div className="cw-pace" role="group" aria-label="Temps écoulé et objectif atteint, sur la même échelle">
                    <PaceBar label="Temps écoulé" value={p.elapsed} display={formatPercent(p.elapsed)} tone="time" />
                    {p.achieved !== null
                        ? <PaceBar label="Objectif atteint" value={Math.min(1, p.achieved)} display={formatPercent(p.achieved)} tone={p.verdict === "behind" ? "warning" : "accent"} marker={p.elapsed} />
                        : <button className="cw-pace-empty" onClick={() => onAction("target")}><Target aria-hidden />Définir le nombre de RDV visés</button>}
                </div>}
            </section>

            {/* 2. The one next action ------------------------------------------ */}
            <section className={next.kind === "none" ? "cw-next cw-next-quiet" : "cw-next"} data-tone={next.tone} aria-labelledby="cw-next-title">
                <span className="cw-next-icon" aria-hidden>{next.tone === "success" ? <CheckCircle2 /> : next.tone === "danger" ? <AlertTriangle /> : <CircleDot />}</span>
                <div>
                    <p className="cw-next-label">{next.kind === "none" ? "État" : "À faire maintenant"}</p>
                    <h2 id="cw-next-title">{next.title}</h2>
                    {next.detail && <p>{next.detail}</p>}
                </div>
                {next.action && <button className={next.tone === "danger" || next.tone === "warning" ? "cw-button cw-primary" : "cw-button"} onClick={() => onAction(next.kind)}>{next.action}<ArrowRight aria-hidden /></button>}
            </section>

            {/* 3. Where prospects drop out --------------------------------------- */}
            <section className="cw-section" id="cw-conversion" aria-labelledby="cw-conversion-title">
                <div className="cw-section-head">
                    <h2 id="cw-conversion-title">Où les prospects décrochent</h2>
                    <span className="cw-legend-inline"><span className="cw-legend-tick" aria-hidden />Moyenne de l’agence, 90 jours</span>
                </div>
                <p className="cw-section-sub">Chaque prospect compte une fois par étape, depuis le début de la mission.</p>
                <ol className="cw-flow">
                    {steps.slice(1).map((step, index) => {
                        const from = steps[index];
                        const isWeak = weakest?.key === step.key;
                        const gapPts = step.gap !== null ? Math.round(step.gap * 100) : null;
                        return (
                            <li key={step.key} className="cw-flow-row" data-weak={isWeak ? "" : undefined} id={isWeak ? "cw-weak-step" : undefined} tabIndex={isWeak ? -1 : undefined}>
                                <div className="cw-flow-name">
                                    <strong>{step.rateLabel}</strong>
                                    <small>{step.count.toLocaleString("fr-FR")} {lower(step.label)} sur {from.count.toLocaleString("fr-FR")} {from.label === "Dans les bases" ? "en base" : lower(from.label)}</small>
                                </div>
                                <div className="cw-flow-bar" aria-hidden>
                                    <span className="cw-flow-fill" style={{ width: `${Math.min(100, (step.rate ?? 0) * 100)}%` }} />
                                    {step.benchmark !== null && <span className="cw-flow-tick" style={{ left: `${Math.min(100, step.benchmark * 100)}%` }} />}
                                </div>
                                <div className="cw-flow-value">
                                    <strong>{formatPercent(step.rate)}</strong>
                                    {gapPts !== null ? (
                                        <small data-dir={gapPts < 0 ? "down" : gapPts > 0 ? "up" : "flat"}>
                                            {gapPts < 0 ? <ArrowDownRight aria-hidden /> : gapPts > 0 ? <ArrowUpRight aria-hidden /> : <Minus aria-hidden />}
                                            {gapPts > 0 ? "+" : gapPts < 0 ? "−" : ""}{Math.abs(gapPts)} pts <span className="sr-only">par rapport à la moyenne de l’agence ({formatPercent(step.benchmark)})</span>
                                        </small>
                                    ) : <small>{step.benchmark === null ? "Pas de référence" : "Échantillon trop petit"}</small>}
                                </div>
                                {isWeak && <span className="cw-flow-flag">Maillon faible</span>}
                            </li>
                        );
                    })}
                </ol>
            </section>

            {/* 4. Daily rhythm --------------------------------------------------- */}
            <RhythmChart series={series} />

            {/* 5. Who carries it ------------------------------------------------- */}
            <TeamContribution team={team} stats={teamStats} onAssign={() => onAction("assign")} />
        </div>
    );
}

function verdictSentence(p: ReturnType<typeof pace>, endDate?: string) {
    const end = endDate ? dayMonth(endDate) : null;
    switch (p.verdict) {
        case "behind": return `Il en faudrait ${Math.round(p.expected ?? 0)} à ce stade. ${p.neededPerWeek !== null ? `Pour finir à temps : ${formatRate(p.neededPerWeek)} RDV par semaine${end ? ` jusqu’au ${end}` : ""}.` : ""}`;
        case "ahead": return `En avance sur le rythme prévu${p.projected !== null ? ` : environ ${p.projected} RDV à ce rythme d’ici la fin` : ""}.`;
        case "on_track": return `Le rythme tient${p.projected !== null ? ` : environ ${p.projected} RDV attendus d’ici la fin` : ""}.`;
        case "early": return "Moins de 15 % de la période écoulée : le rythme se juge dans quelques jours.";
        case "reached": return "L’objectif est atteint. Chaque RDV de plus est du bonus.";
        case "ended": return "La période prévue est terminée.";
        case "not_started": return end ? `Démarrage prévu, fin le ${end}.` : "La mission n’a pas encore commencé.";
        default: return "Sans nombre de RDV visés, impossible de dire si la mission tient son rythme.";
    }
}

function PaceBar({ label, value, display, tone, marker }: { label: string; value: number; display: string; tone: "time" | "accent" | "warning"; marker?: number }) {
    return (
        <div className="cw-pace-row">
            <span className="cw-pace-label">{label}</span>
            <span className="cw-pace-value">{display}</span>
            <span className="cw-pace-track" data-tone={tone} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-valuetext={display}>
                <span style={{ width: `${Math.max(value * 100, value > 0 ? 1.5 : 0)}%` }} />
                {marker !== undefined && <i style={{ left: `${marker * 100}%` }} title="Rythme attendu aujourd’hui" />}
            </span>
        </div>
    );
}

// ── Rhythm: one measure at a time, daily bars, mean line ─────────────────────

const MEASURES = [
    { key: "actions", label: "Appels", unit: ["appel", "appels"] },
    { key: "reached", label: "Joints", unit: ["joint", "joints"] },
    { key: "meetings", label: "RDV", unit: ["RDV", "RDV"] },
] as const;

function RhythmChart({ series }: { series: DayPoint[] }) {
    const [measure, setMeasure] = useState<(typeof MEASURES)[number]["key"]>("actions");
    const [active, setActive] = useState<number | null>(null);
    const id = useId();
    const meta = MEASURES.find((item) => item.key === measure)!;
    const values = series.map((day) => Number(day[measure] ?? 0));
    const max = Math.max(1, ...values);
    const worked = values.filter((value, index) => value > 0 || new Date(series[index].date).getUTCDay() % 6 !== 0);
    const mean = worked.length ? worked.reduce((sum, value) => sum + value, 0) / worked.length : 0;
    const total = values.reduce((sum, value) => sum + value, 0);
    const focus = active ?? values.length - 1;
    const plural = (n: number) => `${n.toLocaleString("fr-FR")} ${n > 1 ? meta.unit[1] : meta.unit[0]}`;

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (!values.length) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            setActive(Math.min(values.length - 1, Math.max(0, focus + (event.key === "ArrowRight" ? 1 : -1))));
        } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            setActive(event.key === "Home" ? 0 : values.length - 1);
        }
    }

    return (
        <section className="cw-section" aria-labelledby={`${id}-title`}>
            <div className="cw-section-head">
                <h2 id={`${id}-title`}>Rythme <small>30 derniers jours</small></h2>
                <div className="cw-segmented" role="radiogroup" aria-label="Mesure affichée">
                    {MEASURES.map((item) => (
                        <button key={item.key} role="radio" aria-checked={measure === item.key} onClick={() => { setMeasure(item.key); setActive(null); }}>{item.label}</button>
                    ))}
                </div>
            </div>
            <p className="cw-section-sub">{plural(total)} sur la période · {formatRate(mean)} par jour ouvré en moyenne</p>
            <div
                className="cw-chart"
                tabIndex={0}
                role="group"
                aria-label={`${meta.label} par jour. Flèches gauche et droite pour parcourir les jours.`}
                onKeyDown={onKeyDown}
                onMouseLeave={() => setActive(null)}
                onBlur={() => setActive(null)}
            >
                <span className="cw-chart-max" aria-hidden>{max.toLocaleString("fr-FR")}</span>
                <div className="cw-chart-plot">
                    <span className="cw-chart-mean" style={{ bottom: `${(mean / max) * 100}%` }} aria-hidden><em>moy. {formatRate(mean)}</em></span>
                    {values.map((value, index) => (
                        <span
                            key={series[index].date}
                            className="cw-chart-col"
                            data-active={active === index ? "" : undefined}
                            data-weekend={new Date(series[index].date).getUTCDay() % 6 === 0 ? "" : undefined}
                            onMouseEnter={() => setActive(index)}
                        >
                            <span className="cw-chart-bar" style={{ height: value ? `max(3px, ${(value / max) * 100}%)` : 0 }} />
                        </span>
                    ))}
                    {active !== null && values[active] !== undefined && (
                        <span className="cw-tooltip" data-edge={active > values.length - 4 ? "end" : active < 3 ? "start" : undefined} style={{ left: `${((active + 0.5) / values.length) * 100}%` }} role="status">
                            <strong>{plural(values[active])}</strong>
                            <small>{shortDay.format(new Date(series[active].date))}</small>
                        </span>
                    )}
                </div>
                <div className="cw-chart-axis" aria-hidden>
                    {series.map((day, index) => <span key={day.date}>{(series.length - 1 - index) % 7 === 0 ? tickDay.format(new Date(day.date)) : ""}</span>)}
                </div>
            </div>
        </section>
    );
}

// ── Team contribution ─────────────────────────────────────────────────────────

function TeamContribution({ team, stats, onAssign }: { team: { id: string; name: string }[]; stats: Props["teamStats"]; onAssign: () => void }) {
    const assigned = new Set(team.map((sdr) => sdr.id));
    const rows = [
        ...team.map((sdr) => ({ id: sdr.id, name: sdr.name, assigned: true, ...(stats.find((row) => row.sdrId === sdr.id) ?? { actions: 0, meetings: 0, recentActions: 0 }) })),
        ...stats.filter((row) => !assigned.has(row.sdrId) && row.actions > 0).map((row) => ({ id: row.sdrId, name: row.name ?? "SDR", assigned: false, ...row })),
    ].sort((a, b) => b.recentActions - a.recentActions);
    const max = Math.max(1, ...rows.map((row) => row.recentActions));
    return (
        <section className="cw-section" aria-labelledby="cw-team-pulse-title">
            <div className="cw-section-head">
                <h2 id="cw-team-pulse-title">Qui appelle <small>{team.length} SDR affecté{team.length > 1 ? "s" : ""}</small></h2>
                <button className="cw-button" data-size="sm" onClick={onAssign}>{team.length ? "Gérer l’équipe" : "Affecter un SDR"}<ArrowRight aria-hidden /></button>
            </div>
            {rows.length ? <ul className="cw-team">
                {rows.map((row) => (
                    <li key={row.id} data-gone={row.assigned ? undefined : ""}>
                        <span className="cw-avatar" aria-hidden>{initials(row.name)}</span>
                        <span className="cw-team-name"><strong>{row.name}</strong><small>{row.assigned ? `${row.meetings} RDV depuis le début` : "N’est plus affecté à la mission"}</small></span>
                        <span className="cw-team-bar" aria-hidden><span style={{ width: `${(row.recentActions / max) * 100}%` }} /></span>
                        <span className="cw-team-value">{row.recentActions.toLocaleString("fr-FR")}<small> appels · 30 j</small></span>
                    </li>
                ))}
            </ul> : <p className="cw-empty-line"><span>Aucun SDR n’a appelé sur cette mission.</span></p>}
        </section>
    );
}
