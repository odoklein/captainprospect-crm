"use client";

import { useMemo, useState } from "react";
import {
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    BadgeCheck,
    CalendarCheck2,
    CalendarClock,
    CheckCircle2,
    Info,
    Lightbulb,
    Minus,
    MessagesSquare,
    PhoneCall,
    Target,
    UserCheck,
    Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { AiMark } from "@/components/ui/AiMark";
import type { DailyInsight, DailyReport, DailyTotals, HighlightTone } from "@/lib/client/daily-report-types";

// Brand navy for the point being read, a muted navy (>= 3:1 on white) for context.
const INK = "#1A1D2E";
const NAVY = "#27355F";
const NAVY_MUTED = "#7F89B0";

type TabId = "overview" | "meetings" | "team";

const dayUtc = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
};
const weekdayShort = (day: string) =>
    dayUtc(day).toLocaleDateString("fr-FR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
const weekdayLong = (day: string) => dayUtc(day).toLocaleDateString("fr-FR", { weekday: "long", timeZone: "UTC" });
const fmtTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDay = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "À confirmer";
const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);

function useReducedMotion() {
    return useMemo(
        () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
        []
    );
}

/** Staggered entrance for a block. */
const enter = (i: number) => ({ animation: `cpDrIn .38s ${0.04 + i * 0.05}s cubic-bezier(.16,1,.3,1) both` });

// ─── Small pieces ─────────────────────────────────────────────────────────────

function Delta({ now, before, prevDay }: { now: number; before: number | undefined; prevDay: string | null }) {
    if (before === undefined || prevDay === null) return null;
    const diff = now - before;
    const label = `vs ${weekdayLong(prevDay)}`;
    if (diff === 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-ink-3" title={label}>
                <Minus className="h-3 w-3" aria-hidden="true" /> stable
            </span>
        );
    }
    const up = diff > 0;
    return (
        <span
            className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold", up ? "text-emerald-700" : "text-warning-ink")}
            title={label}
        >
            {up ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> : <ArrowDownRight className="h-3 w-3" aria-hidden="true" />}
            {up ? "+" : "−"}
            {Math.abs(diff)}
            <span className="sr-only"> {label}</span>
        </span>
    );
}

function SectionTitle({ icon: Icon, children, aside }: { icon: typeof Users; children: React.ReactNode; aside?: React.ReactNode }) {
    return (
        <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-2">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {children}
            </h3>
            {aside}
        </div>
    );
}

function InsightCard({ insight, loading }: { insight: DailyInsight | null; loading: boolean }) {
    const words = insight?.summary.split(/\s+/) ?? [];
    const SourceIcon = insight?.source === "rules" ? Info : AiMark;
    return (
        <div className="relative overflow-hidden rounded-xl border border-accent/25">
            <div className="rounded-[11px] bg-white px-3.5 py-3">
                <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                        <SourceIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        {insight?.source === "rules" ? "Analyse automatique" : "Résumé IA"}
                    </span>
                </div>
                {loading && !insight ? (
                    <div className="mt-2 space-y-1.5" aria-label="Analyse en cours">
                        <div className="h-4 w-2/3 rounded cp-dr-shimmer" />
                        <div className="h-3 w-full rounded cp-dr-shimmer" />
                        <div className="h-3 w-5/6 rounded cp-dr-shimmer" />
                    </div>
                ) : insight ? (
                    <>
                        <p className="mt-1.5 text-[14px] font-semibold text-ink">{insight.headline}</p>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2" aria-label={insight.summary}>
                            {words.map((w, i) => (
                                <span
                                    key={i}
                                    aria-hidden="true"
                                    className="cp-dr-anim inline-block"
                                    style={{ animation: `cpDrWord .35s ${Math.min(i, 60) * 0.025}s ease-out both` }}
                                >
                                    {w}&nbsp;
                                </span>
                            ))}
                        </p>
                        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-accent-50 px-2.5 py-2 text-[12px] text-accent-700">
                            <Lightbulb className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {insight.recommendation}
                        </p>
                    </>
                ) : null}
            </div>
        </div>
    );
}

/** 7 working days, one series at a time (never two scales on one chart). */
function TrendChart({ report, metric, reduceMotion }: { report: DailyReport; metric: "calls" | "meetings"; reduceMotion: boolean }) {
    const [hover, setHover] = useState<number | null>(null);
    const values = report.trend.map((p) => p[metric]);
    const max = Math.max(1, ...values);
    const W = 300;
    const H = 96;
    const gap = 8;
    const barW = (W - gap * (values.length - 1)) / values.length;
    const unit = metric === "calls" ? "appel" : "RDV";

    return (
        <div className="relative">
            <svg
                viewBox={`0 0 ${W} ${H + 18}`}
                className="w-full overflow-visible"
                role="img"
                aria-label={`${metric === "calls" ? "Appels" : "RDV confirmés"} sur les 7 derniers jours ouvrés`}
                onMouseLeave={() => setHover(null)}
            >
                <line x1="0" x2={W} y1={H} y2={H} stroke="#E4E6EF" strokeWidth="1" />
                {values.map((v, i) => {
                    const h = v === 0 ? 2 : Math.max(4, (v / max) * (H - 14));
                    const x = i * (barW + gap);
                    const isDay = report.trend[i].day === report.day;
                    const active = hover === null ? isDay : hover === i;
                    return (
                        <g key={report.trend[i].day} onMouseEnter={() => setHover(i)}>
                            {/* Hit target taller than the mark */}
                            <rect x={x} y={0} width={barW} height={H + 18} fill="transparent" />
                            <path
                                d={`M${x},${H} V${H - h + 4} Q${x},${H - h} ${x + 4},${H - h} H${x + barW - 4} Q${x + barW},${H - h} ${x + barW},${H - h + 4} V${H} Z`}
                                fill={isDay ? NAVY : NAVY_MUTED}
                                opacity={active || isDay ? 1 : 0.85}
                                className="cp-dr-anim"
                                style={{
                                    transformOrigin: `${x + barW / 2}px ${H}px`,
                                    animation: reduceMotion ? undefined : `cpDrGrow .55s ${0.05 * i}s cubic-bezier(.16,1,.3,1) both`,
                                }}
                            />
                            {active && (
                                <text x={x + barW / 2} y={H - h - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill={INK}>
                                    {v}
                                </text>
                            )}
                            <text
                                x={x + barW / 2}
                                y={H + 13}
                                textAnchor="middle"
                                fontSize="10"
                                fill={isDay ? INK : "#8A90A8"}
                                fontWeight={isDay ? 600 : 400}
                            >
                                {weekdayShort(report.trend[i].day)}
                            </text>
                        </g>
                    );
                })}
            </svg>
            {hover !== null && (
                <div className="pointer-events-none absolute -top-1 right-0 rounded-md bg-inverse px-2 py-1 text-[11px] text-white shadow">
                    {weekdayLong(report.trend[hover].day)} · {values[hover]} {plural(values[hover], unit, unit === "RDV" ? "RDV" : "appels")}
                </div>
            )}
            {/* Table view for screen readers */}
            <table className="sr-only">
                <caption>{metric === "calls" ? "Appels" : "RDV confirmés"} par jour</caption>
                <tbody>
                    {report.trend.map((p) => (
                        <tr key={p.day}>
                            <th scope="row">{weekdayLong(p.day)}</th>
                            <td>{p[metric]}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

const TONE_ICON: Record<HighlightTone, { icon: typeof Info; cls: string }> = {
    positive: { icon: CheckCircle2, cls: "text-emerald-600" },
    neutral: { icon: Info, cls: "text-ink-3" },
    attention: { icon: AlertTriangle, cls: "text-amber-600" },
};

// ─── Panel ────────────────────────────────────────────────────────────────────

export function DailyReportPanel({
    report,
    insight,
    insightLoading,
    initialTab = "overview",
}: {
    report: DailyReport;
    insight: DailyInsight | null;
    insightLoading: boolean;
    initialTab?: TabId;
}) {
    const [tab, setTab] = useState<TabId>(initialTab);
    const [metric, setMetric] = useState<"calls" | "meetings">("calls");
    const reduceMotion = useReducedMotion();
    const duration = reduceMotion ? 0 : 700;

    const tabs: Array<{ id: TabId; label: string; count?: number }> = [
        { id: "overview", label: "Vue d'ensemble" },
        { id: "meetings", label: "Rendez-vous", count: report.meetingsBooked.length + report.todayMeetings.length },
        { id: "team", label: "Équipe" },
    ];
    const tabIndex = tabs.findIndex((t) => t.id === tab);

    const kpis: Array<{ key: keyof DailyTotals; label: string; icon: typeof Users; tone: string }> = [
        { key: "calls", label: "Appels passés", icon: PhoneCall, tone: "bg-primary-50 text-primary-600" },
        { key: "conversations", label: "Conversations", icon: MessagesSquare, tone: "bg-sky-50 text-sky-600" },
        { key: "qualified", label: "Prospects qualifiés", icon: BadgeCheck, tone: "bg-amber-50 text-amber-600" },
        { key: "meetings", label: "RDV confirmés", icon: CalendarCheck2, tone: "bg-emerald-50 text-emerald-600" },
    ];
    const outcomeTotal = report.outcomes.reduce((a, o) => a + o.count, 0);
    const monthPct = report.month.objective ? Math.min(100, Math.round((report.month.meetings / report.month.objective) * 100)) : null;
    const maxCommercial = Math.max(1, ...report.byCommercial.map((c) => c.booked + c.today));
    const maxMissionCalls = Math.max(1, ...report.byMission.map((m) => m.calls));

    return (
        <div>
            {/* Tabs with a sliding indicator */}
            <div role="tablist" aria-label="Sections du rapport" className="sticky top-0 z-10 border-b border-line-subtle bg-white px-5">
                <div className="relative grid grid-cols-3">
                    {tabs.map((t) => (
                        <button
                            key={t.id}
                            role="tab"
                            type="button"
                            aria-selected={tab === t.id}
                            onClick={() => setTab(t.id)}
                            className={cn(
                                "py-2.5 text-[12.5px] font-medium transition-colors",
                                tab === t.id ? "text-ink" : "text-ink-3 hover:text-ink-2"
                            )}
                        >
                            {t.label}
                            {t.count ? (
                                <span className="ml-1 rounded-full bg-primary/8 px-1.5 text-[10.5px] font-semibold text-primary">{t.count}</span>
                            ) : null}
                        </button>
                    ))}
                    <span
                        aria-hidden="true"
                        className="absolute bottom-0 left-0 h-[2px] w-1/3 rounded-full bg-accent transition-transform duration-300 ease-out"
                        style={{ transform: `translateX(${tabIndex * 100}%)` }}
                    />
                </div>
            </div>

            <div key={tab} className="space-y-5 px-5 py-4">
                {tab === "overview" && (
                    <>
                        <div className="cp-dr-anim" style={enter(0)}>
                            <InsightCard insight={insight} loading={insightLoading} />
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                            {kpis.map((k, i) => (
                                <div key={k.key} className="cp-dr-anim rounded-xl border border-line-subtle bg-surface-2 p-3" style={enter(i + 1)}>
                                    <div className="flex items-center justify-between">
                                        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", k.tone)}>
                                            <k.icon className="h-3.5 w-3.5" aria-hidden="true" />
                                        </span>
                                        <Delta now={report.totals[k.key]} before={report.previous?.[k.key]} prevDay={report.previousDay} />
                                    </div>
                                    <AnimatedNumber
                                        value={report.totals[k.key]}
                                        duration={duration}
                                        className="mt-2 block text-[22px] font-semibold tabular-nums text-ink"
                                    />
                                    <div className="text-[11.5px] text-ink-3">{k.label}</div>
                                </div>
                            ))}
                        </div>

                        <section className="cp-dr-anim" style={enter(5)}>
                            <SectionTitle
                                icon={CalendarClock}
                                aside={
                                    <div className="inline-flex rounded-lg bg-surface-3 p-0.5" role="group" aria-label="Indicateur du graphique">
                                        {(["calls", "meetings"] as const).map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                aria-pressed={metric === m}
                                                onClick={() => setMetric(m)}
                                                className={cn(
                                                    "rounded-md px-2 py-0.5 text-[11px] font-medium transition",
                                                    metric === m ? "bg-white text-ink shadow-sm" : "text-ink-3 hover:text-ink-2"
                                                )}
                                            >
                                                {m === "calls" ? "Appels" : "RDV"}
                                            </button>
                                        ))}
                                    </div>
                                }
                            >
                                7 derniers jours ouvrés
                            </SectionTitle>
                            <div className="rounded-xl border border-line-subtle px-3 pb-2 pt-4">
                                <TrendChart key={metric} report={report} metric={metric} reduceMotion={reduceMotion} />
                            </div>
                        </section>

                        <section className="cp-dr-anim" style={enter(6)}>
                            <SectionTitle icon={Target}>Mois de {report.month.label}</SectionTitle>
                            <div className="rounded-xl border border-line-subtle px-3 py-3">
                                <div className="flex items-baseline justify-between">
                                    <span className="text-[13px] text-ink-2">
                                        <b className="text-[18px] font-semibold tabular-nums text-ink">{report.month.meetings}</b>
                                        {report.month.objective ? <> / {report.month.objective}</> : null} RDV confirmés
                                    </span>
                                    {monthPct !== null && <span className="text-[12px] font-semibold tabular-nums text-primary">{monthPct} %</span>}
                                </div>
                                {monthPct !== null ? (
                                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
                                        <div
                                            className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                                            style={{ width: `${monthPct}%` }}
                                        />
                                    </div>
                                ) : (
                                    <p className="mt-1 text-[11.5px] text-ink-3">Depuis le 1er du mois, jusqu&apos;au jour du rapport.</p>
                                )}
                            </div>
                        </section>

                        {report.outcomes.length > 0 && (
                            <section className="cp-dr-anim" style={enter(7)}>
                                <SectionTitle icon={PhoneCall}>Issues des actions</SectionTitle>
                                <ul className="space-y-2 rounded-xl border border-line-subtle px-3 py-3">
                                    {report.outcomes.map((o) => {
                                        const share = Math.round((o.count / outcomeTotal) * 100);
                                        return (
                                            <li key={o.key}>
                                                <div className="flex items-center justify-between text-[12px]">
                                                    <span className="text-ink-2">{o.label}</span>
                                                    <span className="tabular-nums text-ink">
                                                        <b className="font-semibold">{o.count}</b>
                                                        <span className="ml-1 text-ink-3">{share} %</span>
                                                    </span>
                                                </div>
                                                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                                                    <div
                                                        className="h-full rounded-full transition-[width] duration-700 ease-out"
                                                        style={{ width: `${Math.max(2, share)}%`, background: o.key === "meeting" ? NAVY : NAVY_MUTED }}
                                                    />
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        )}

                        {report.highlights.length > 0 && (
                            <section className="cp-dr-anim" style={enter(8)}>
                                <SectionTitle icon={Lightbulb}>À retenir</SectionTitle>
                                <ul className="space-y-1.5">
                                    {report.highlights.map((h, i) => {
                                        const T = TONE_ICON[h.tone];
                                        return (
                                            <li key={i} className="flex items-start gap-2 text-[12.5px] text-ink-2">
                                                <T.icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", T.cls)} aria-hidden="true" />
                                                {h.text}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        )}
                    </>
                )}

                {tab === "meetings" && (
                    <>
                        <section className="cp-dr-anim" style={enter(0)}>
                            <SectionTitle icon={CalendarCheck2}>Nouveaux rendez-vous</SectionTitle>
                            {report.meetingsBooked.length === 0 ? (
                                <p className="rounded-xl bg-surface-2 px-3 py-4 text-center text-[12.5px] text-ink-3">
                                    Aucun nouveau rendez-vous confirmé ce jour-là.
                                </p>
                            ) : (
                                <ul className="space-y-2">
                                    {report.meetingsBooked.map((m, i) => (
                                        <li key={m.id} className="cp-dr-anim rounded-xl border border-line-subtle px-3 py-2.5 transition hover:border-line-strong hover:shadow-sm" style={enter(i + 1)}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="truncate text-[13px] font-semibold text-ink">{m.company}</div>
                                                    <div className="truncate text-[12px] text-ink-3">
                                                        {[m.contact, m.title].filter(Boolean).join(" · ") || "Contact à préciser"}
                                                    </div>
                                                </div>
                                                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                                    {fmtDay(m.date)}
                                                </span>
                                            </div>
                                            {(m.commercial || m.mission) && (
                                                <div className="mt-1.5 text-[11.5px] text-ink-2">
                                                    {m.commercial && <>Pour <b className="font-medium">{m.commercial.name}</b></>}
                                                    {m.commercial && m.mission ? " · " : ""}
                                                    {m.mission}
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className="cp-dr-anim" style={enter(2)}>
                            <SectionTitle icon={CalendarClock}>Aujourd&apos;hui à l&apos;agenda</SectionTitle>
                            {report.todayMeetings.length === 0 ? (
                                <p className="rounded-xl bg-surface-2 px-3 py-4 text-center text-[12.5px] text-ink-3">
                                    Aucun rendez-vous prévu aujourd&apos;hui.
                                </p>
                            ) : (
                                <ol className="relative space-y-3 border-l border-dashed border-line-strong pl-4">
                                    {report.todayMeetings.map((m, i) => (
                                        <li key={m.id} className="cp-dr-anim relative" style={enter(i + 3)}>
                                            <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-white" />
                                            <div className="text-[12px] font-semibold tabular-nums text-primary">{fmtTime(m.date)}</div>
                                            <div className="text-[13px] text-ink">{m.company}</div>
                                            <div className="text-[11.5px] text-ink-3">
                                                {[m.contact, m.commercial?.name].filter(Boolean).join(" · ")}
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </section>
                    </>
                )}

                {tab === "team" && (
                    <>
                        <section className="cp-dr-anim" style={enter(0)}>
                            <SectionTitle icon={UserCheck}>Vos commerciaux</SectionTitle>
                            {report.byCommercial.length === 0 ? (
                                <p className="rounded-xl bg-surface-2 px-3 py-4 text-center text-[12.5px] text-ink-3">
                                    Aucun rendez-vous attribué ce jour-là ni aujourd&apos;hui.
                                </p>
                            ) : (
                                <ul className="divide-y divide-line-subtle rounded-xl border border-line-subtle">
                                    {report.byCommercial.map((c) => (
                                        <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/8 text-[11.5px] font-semibold text-primary">
                                                {initials(c.name)}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-[13px] font-medium text-ink">{c.name}</div>
                                                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                                                    <div
                                                        className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                                                        style={{ width: `${((c.booked + c.today) / maxCommercial) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <span className="shrink-0 text-right text-[11.5px] leading-tight text-ink-3">
                                                <span className="block"><b className="text-ink">{c.booked}</b> {plural(c.booked, "reçu")}</span>
                                                <span className="block"><b className="text-ink">{c.today}</b> aujourd&apos;hui</span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        {report.byMission.length > 0 && (
                            <section className="cp-dr-anim" style={enter(1)}>
                                <SectionTitle icon={Target}>Par mission</SectionTitle>
                                <ul className="space-y-2.5 rounded-xl border border-line-subtle px-3 py-3">
                                    {report.byMission.map((m) => (
                                        <li key={m.id}>
                                            <div className="flex items-center justify-between gap-2 text-[12.5px]">
                                                <span className="truncate font-medium text-ink">{m.name}</span>
                                                <span className="shrink-0 tabular-nums text-ink-3">
                                                    {m.calls} {plural(m.calls, "appel")} · <b className="text-ink">{m.meetings}</b> RDV
                                                </span>
                                            </div>
                                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                                                <div
                                                    className="h-full rounded-full bg-ink-4 transition-[width] duration-700 ease-out"
                                                    style={{ width: `${(m.calls / maxMissionCalls) * 100}%` }}
                                                />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        <p className="cp-dr-anim text-[12px] text-ink-3" style={enter(2)}>
                            {report.sdrCount} {plural(report.sdrCount, "SDR mobilisé")} sur {report.activeMissions}{" "}
                            {plural(report.activeMissions, "mission active", "missions actives")}.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
