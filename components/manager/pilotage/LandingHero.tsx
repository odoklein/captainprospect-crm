"use client";

import { cn } from "@/lib/utils";
import { formatDays, VERDICT_LABEL, type Lever } from "@/lib/manager-pilotage/forecast";
import type { PilotagePayload } from "@/lib/manager-pilotage/types";
import { num, rate, shortDay } from "./format";

// ============================================
// « Atterrissage du mois » — the navy band. One number (where the month
// lands), the verdict, the curve, and the levers that would close the gap.
// Pink (accent) only on the actual and projected curve: the thing to read.
// ============================================

type Forecast = PilotagePayload["forecast"];

const VERDICT_TONE: Record<Forecast["verdict"], string> = {
    behind: "bg-warning-soft text-warning-ink",
    on_track: "bg-inverse-raised text-inverse-ink",
    ahead: "bg-success-soft text-success-ink",
    reached: "bg-success-soft text-success-ink",
    no_target: "bg-inverse-raised text-inverse-ink-2",
};

function verdictSentence(f: Forecast): string {
    if (f.verdict === "no_target") return "Aucune mission active n’a d’objectif chiffré ce mois : rien à projeter.";
    if (f.verdict === "reached") return `Objectif atteint : ${f.done} RDV pris pour ${f.target} visés. Chaque RDV de plus est du bonus.`;
    if (f.gap >= 0) return `${f.projected} RDV attendus pour ${f.target} visés au rythme actuel${f.gap ? `, ${f.gap} de marge` : ""}.`;
    return `Il manque ${-f.gap} RDV au rythme actuel. Un levier ci-contre suffit, s’il est réaliste.`;
}

export function LandingHero({ data }: { data: PilotagePayload }) {
    const f = data.forecast;
    const month = data.today.monthLabel;
    const untargetedMeetings = data.untargeted.reduce((s, m) => s + m.meetings, 0);

    return (
        <section aria-label={`Atterrissage de ${month}`} className="rounded-panel bg-inverse px-5 py-5 text-inverse-ink sm:px-6">
            <div className="flex flex-wrap gap-x-8 gap-y-6">
                <div className="flex min-w-[230px] flex-[1_1_240px] flex-col gap-2">
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-inverse-ink-3">Atterrissage {month} · RDV pris</p>
                    <div className="flex items-baseline gap-2.5">
                        <span className="font-display text-[76px] font-semibold leading-[0.9] tracking-[-0.05em] tabular-nums">{f.target ? f.projected : f.done}</span>
                        {f.target > 0 && <span className="text-[18px] text-inverse-ink-2">/ {f.target}</span>}
                    </div>
                    <span className={cn("inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold", VERDICT_TONE[f.verdict])}>
                        {VERDICT_LABEL[f.verdict]}
                    </span>
                    <p className="max-w-[34ch] text-[14px] text-inverse-ink-2">{verdictSentence(f)}</p>
                    <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                        <Stat label="Pris à ce jour" value={num(f.done)} />
                        <Stat label="Attendus à ce jour" value={f.target ? num(f.expectedByNow) : "—"} />
                        <Stat label="Jours ouvrés restants" value={formatDays(f.workingDays.left)} />
                    </dl>
                </div>

                <div className="min-w-0 flex-[3_1_480px]">
                    <LandingChart f={f} />
                    <p className="mt-2 text-[12px] text-inverse-ink-3">
                        {formatDays(f.planned.remaining)} jours-SDR planifiés restants{f.planned.unplaced > 0 ? ` (dont ${formatDays(f.planned.unplaced)} alloués, pas encore placés)` : ""} ×{" "}
                        {data.config.quota} appels × tenue {f.rates.completion === null ? "100 % (rien de planifié jusqu’ici)" : rate(f.rates.completion)} × joignabilité{" "}
                        {rate(f.rates.reach)} × taux de RDV {rate(f.rates.rate)} (RDV ÷ joints, 20 derniers jours ouvrés).
                    </p>
                </div>

                <div className="flex min-w-[260px] flex-[1_1_280px] flex-col gap-2">
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-inverse-ink-3">{f.levers.length ? "Ce qui comble l’écart, levier par levier" : "Leviers"}</p>
                    {f.levers.length ? (
                        <ul className="flex flex-col gap-1.5">
                            {f.levers.map((l) => (
                                <LeverRow key={l.key} lever={l} />
                            ))}
                        </ul>
                    ) : (
                        <p className="text-[13px] text-inverse-ink-2">
                            {f.verdict === "no_target" ? "Fixez un objectif aux missions pour obtenir une projection." : "L’objectif est tenu : aucun levier à tirer."}
                        </p>
                    )}
                </div>
            </div>

            {(f.missions.length > 0 || data.untargeted.length > 0) && (
                <details className="group mt-5 border-t border-inverse-line pt-3 text-[12.5px] text-inverse-ink-2">
                    <summary className="cursor-pointer list-none select-none text-inverse-ink-2 hover:text-inverse-ink">
                        <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>›</span>
                        {f.missions.length} mission{f.missions.length > 1 ? "s" : ""} dans l’objectif
                        {data.untargeted.length > 0 &&
                            ` · ${data.untargeted.length} sans objectif hors atterrissage (${untargetedMeetings} RDV ce mois)`}
                    </summary>
                    <ul className="mt-2 grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                        {f.missions.map((m) => (
                            <li key={m.id} className="flex min-w-0 justify-between gap-3">
                                <span className="truncate">
                                    {m.name}
                                    {m.client ? <span className="text-inverse-ink-3"> · {m.client}</span> : null}
                                </span>
                                <span className="shrink-0 font-mono tabular-nums text-inverse-ink">
                                    {m.meetings} / {num(m.target, m.target < 10 ? 1 : 0)}
                                </span>
                            </li>
                        ))}
                        {data.untargeted.map((m) => (
                            <li key={m.id} className="flex min-w-0 justify-between gap-3 text-inverse-ink-3">
                                <span className="truncate">{m.name} · sans objectif</span>
                                <span className="shrink-0 font-mono tabular-nums">{m.meetings}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-[11.5px] text-inverse-ink-3">Objectif du mois = la part de l’objectif de chaque mission qui tombe en {month}, au prorata de sa période.</p>
                </details>
            )}
        </section>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-[12px] text-inverse-ink-3">{label}</dt>
            <dd className="font-mono text-[20px] tabular-nums">{value}</dd>
        </div>
    );
}

function leverValues(l: Lever): { now: string; needed: string } {
    if (l.key === "days") return { now: formatDays(l.current), needed: l.needed === null ? "—" : formatDays(l.needed) };
    return { now: rate(l.current), needed: l.needed === null ? "—" : rate(l.needed) };
}

const LEVER_DETAIL: Record<Lever["key"], string> = {
    days: "jours-SDR d’ici la fin du mois",
    completion: "du quota planifié réellement appelé",
    reach: "joints ÷ appels",
    rate: "RDV ÷ joints",
};

function LeverRow({ lever }: { lever: Lever }) {
    const v = leverValues(lever);
    return (
        <li
            className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 rounded-[12px] border px-3 py-2",
                lever.unrealistic ? "border-inverse-line bg-transparent" : "border-inverse-line bg-inverse-raised",
            )}
            title={lever.reason ?? undefined}
        >
            <div className="min-w-0">
                <p className={cn("text-[13.5px] font-semibold", lever.unrealistic && "text-inverse-ink-2")}>{lever.label}</p>
                <p className="text-[12px] text-inverse-ink-3">{lever.unrealistic ? lever.reason : LEVER_DETAIL[lever.key]}</p>
            </div>
            <div className="text-right">
                <p className="whitespace-nowrap font-mono text-[13px] tabular-nums">
                    <span className="text-inverse-ink-3">{v.now} → </span>
                    <span className={lever.unrealistic ? "text-inverse-ink-3 line-through" : "text-inverse-ink"}>{v.needed}</span>
                </p>
                {lever.unrealistic && <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-inverse-ink-3">Irréaliste</p>}
            </div>
        </li>
    );
}

// ── Chart ─────────────────────────────────────────────────────────────────

const W = 640;
const H = 240;
const PAD = { left: 34, right: 16, top: 18, bottom: 26 };

function LandingChart({ f }: { f: Forecast }) {
    const pts = f.series;
    if (!pts.length) return null;
    const max = Math.max(1, f.target, f.projected, f.done, ...pts.map((p) => p.ideal)) * 1.1;
    const step = niceStep(max);
    const top = Math.ceil(max / step) * step;
    const x = (i: number) => PAD.left + (pts.length > 1 ? (i / (pts.length - 1)) * (W - PAD.left - PAD.right) : 0);
    const y = (v: number) => H - PAD.bottom - (v / top) * (H - PAD.top - PAD.bottom);
    const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);

    const actual = pts.map((p, i) => [p, i] as const).filter(([p]) => p.actual !== null);
    const actualPath = actual.map(([p, i], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(p.actual!).toFixed(1)}`).join(" ");
    const areaPath = actual.length ? `${actualPath} L${x(actual[actual.length - 1][1]).toFixed(1)},${y(0)} L${x(actual[0][1]).toFixed(1)},${y(0)} Z` : "";
    const proj = pts.map((p, i) => [p, i] as const).filter(([p]) => p.projection !== null);
    const projPath = proj.map(([p, i], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(p.projection!).toFixed(1)}`).join(" ");
    const idealPath = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.ideal).toFixed(1)}`).join(" ");
    const todayIdx = actual.length ? actual[actual.length - 1][1] : -1;
    const end = proj[proj.length - 1];

    const label = `RDV cumulés du mois : ${f.done} pris, projection ${f.projected}${f.target ? `, objectif ${f.target}` : ""}.`;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full">
            {ticks.map((t) => (
                <g key={t}>
                    <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--ds-inverse-line)" strokeWidth={1} />
                    <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-[var(--ds-inverse-ink-3)] font-mono text-[11px]">
                        {t}
                    </text>
                </g>
            ))}
            <text x={x(0)} y={H - 6} className="fill-[var(--ds-inverse-ink-3)] font-mono text-[11px]">
                {shortDay(pts[0].key)}
            </text>
            {todayIdx > 0 && todayIdx < pts.length - 1 && (
                <text x={x(todayIdx)} y={H - 6} textAnchor="middle" className="fill-[var(--ds-inverse-ink-3)] font-mono text-[11px]">
                    aujourd’hui
                </text>
            )}
            <text x={x(pts.length - 1)} y={H - 6} textAnchor="end" className="fill-[var(--ds-inverse-ink-3)] font-mono text-[11px]">
                {shortDay(pts[pts.length - 1].key)}
            </text>

            {f.target > 0 && (
                <>
                    <path d={idealPath} fill="none" stroke="var(--ds-inverse-ink-3)" strokeWidth={1} strokeDasharray="4 5" />
                    <line x1={PAD.left} x2={W - PAD.right} y1={y(f.target)} y2={y(f.target)} stroke="var(--ds-inverse-ink)" strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />
                    <text x={PAD.left + 6} y={y(f.target) - 6} className="fill-[var(--ds-inverse-ink-2)] text-[11.5px]">
                        Objectif {f.target}
                    </text>
                </>
            )}
            {areaPath && <path d={areaPath} fill="color-mix(in oklab, var(--ds-accent) 16%, transparent)" />}
            {projPath && <path d={projPath} fill="none" stroke="var(--ds-accent)" strokeWidth={2.5} strokeDasharray="7 5" strokeLinecap="round" opacity={0.85} />}
            {actualPath && <path d={actualPath} fill="none" stroke="var(--ds-accent)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
            {todayIdx >= 0 && <circle cx={x(todayIdx)} cy={y(f.done)} r={5} fill="var(--ds-accent)" stroke="var(--ds-inverse)" strokeWidth={2.5} />}
            {end && end[1] !== todayIdx && (
                <>
                    <circle cx={x(end[1])} cy={y(end[0].projection!)} r={5.5} fill="var(--ds-inverse)" stroke="var(--ds-accent)" strokeWidth={2.5} />
                    <text x={x(end[1]) - 10} y={y(end[0].projection!) - 10} textAnchor="end" className="fill-[var(--ds-inverse-ink)] font-mono text-[13px] font-semibold">
                        {f.projected}
                    </text>
                </>
            )}
            <g className="text-[11px]">
                <Legend x={W - PAD.right - 250} y={PAD.top - 4} />
            </g>
        </svg>
    );
}

function Legend({ x, y }: { x: number; y: number }) {
    return (
        <g transform={`translate(${x},${y})`}>
            <line x1={0} x2={16} y1={0} y2={0} stroke="var(--ds-accent)" strokeWidth={2.5} />
            <text x={20} y={4} className="fill-[var(--ds-inverse-ink-2)]">Réalisé</text>
            <line x1={72} x2={88} y1={0} y2={0} stroke="var(--ds-accent)" strokeWidth={2.5} strokeDasharray="5 3" />
            <text x={92} y={4} className="fill-[var(--ds-inverse-ink-2)]">Projection</text>
            <line x1={160} x2={176} y1={0} y2={0} stroke="var(--ds-inverse-ink-3)" strokeWidth={1} strokeDasharray="4 3" />
            <text x={180} y={4} className="fill-[var(--ds-inverse-ink-2)]">Rythme idéal</text>
        </g>
    );
}

function niceStep(max: number): number {
    const raw = max / 4;
    const pow = 10 ** Math.floor(Math.log10(raw));
    const n = raw / pow;
    return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow);
}
