"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { StatsFilterOptions } from "@/app/api/analytics/filters/route";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Delta, EmptyBlock, FOCUS } from "@/components/accueil/AccueilUI";
import { OUTCOME_META } from "@/lib/manager-home/outcomes";
import { MIN_CALLS_FOR_RATE, callsPerMeeting, conversionRate, hasVolume, reachRate, relativeChange } from "@/lib/stats/metrics";
import { formatInt, formatRate } from "@/lib/stats/format";
import { periodParams, type StatsState } from "@/lib/stats/period";
import type { StatsOverview } from "@/lib/stats/types";
import { Panel, Rate } from "./shared";

// ── Missions ────────────────────────────────────────────────────────

function MissionsTable({ o }: { o: StatsOverview }) {
    const maxMeetings = Math.max(1, ...o.missions.map((m) => m.current.meetings));
    if (o.missions.length === 0) {
        return <EmptyBlock tone="slate" title="Aucune mission active sur la période" hint="Aucun appel n'a été enregistré avec ces filtres." />;
    }
    return (
        <Panel title="Missions" subtitle={`${o.missions.length} ${o.missions.length > 1 ? "missions" : "mission"} · classées par RDV obtenus`} bodyClassName="px-0 sm:px-0 pb-2 sm:pb-2">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-[13px]">
                    <thead>
                        <tr className="border-y border-line-subtle bg-surface-2/60 text-[11px] font-bold uppercase tracking-wider text-ink-4">
                            <th scope="col" className="px-3 py-2.5 text-left">Mission</th>
                            <th scope="col" className="px-3 py-2.5 text-right">Appels</th>
                            <th scope="col" className="px-3 py-2.5 text-right" title="Appels joints / appels passés">Joignabilité</th>
                            <th scope="col" className="px-3 py-2.5 text-right">RDV</th>
                            <th scope="col" className="px-3 py-2.5 text-right" title="RDV / appels joints">Transfo.</th>
                            <th scope="col" className="px-3 py-2.5 text-right">Rendement</th>
                            <th scope="col" className="px-3 py-2.5 text-right">SDR</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line-subtle">
                        {o.missions.map((m) => {
                            const thin = !hasVolume(m.current);
                            const every = callsPerMeeting(m.current);
                            return (
                                <tr key={m.id} className="transition-colors hover:bg-surface-2/60">
                                    <td className="px-3 py-3">
                                        <span className="block truncate font-bold text-ink">{m.name}</span>
                                        <span className="mt-0.5 flex items-center gap-2 text-[11px] font-medium text-ink-3">
                                            {m.clientName}
                                            {!m.isActive && <span className="rounded-full border border-line bg-surface-3 px-1.5 py-px text-[10px] font-bold text-ink-3">En pause</span>}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3 text-right font-bold tabular-nums text-ink">{formatInt(m.current.calls)}</td>
                                    <td className="px-3 py-3 text-right font-semibold"><Rate thin={thin} value={formatRate(reachRate(m.current), 0)} className={thin ? "" : "text-ink-2"} /></td>
                                    <td className="px-3 py-3">
                                        <div className="ml-auto flex w-[116px] flex-col items-end gap-1">
                                            <span className="flex items-baseline gap-2">
                                                {relativeChange(m.current.meetings, m.previous.meetings) !== null && <Delta value={relativeChange(m.current.meetings, m.previous.meetings)} />}
                                                <span className="text-sm font-black tabular-nums text-ink">{formatInt(m.current.meetings)}</span>
                                            </span>
                                            <span className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
                                                <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(m.current.meetings / maxMeetings) * 100}%` }} />
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 text-right font-semibold"><Rate thin={thin} value={formatRate(conversionRate(m.current))} className={thin ? "" : "text-ink-2"} /></td>
                                    <td className="px-3 py-3 text-right text-xs font-semibold text-ink-3">{every ? `1 RDV / ${formatInt(every)} appels` : "—"}</td>
                                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink-2">{m.sdrCount}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Panel>
    );
}

// ── Personas ────────────────────────────────────────────────────────

type Dimension = "byFunction" | "byCompanySize" | "bySector" | "byGeography" | "byCampaign";
type PersonaMetric = "conversion" | "reach" | "meetings" | "calls";
type CompareMode = "none" | "missions" | "lists";

interface PersonaRow {
    value: string;
    calls: number;
    joined: number;
    meetings: number;
    callbacks: number;
    conversionRate: number;
    reachRate: number;
    joinedConversionRate: number;
}
type Breakdown = Record<Dimension, PersonaRow[]>;
type PersonaResponse =
    | ({ mode: "single" } & Breakdown)
    | { mode: "compare"; segmentA: Breakdown & { label: string }; segmentB: Breakdown & { label: string } };

const DIMENSIONS: { value: Dimension; label: string }[] = [
    { value: "byFunction", label: "Fonction" },
    { value: "bySector", label: "Secteur" },
    { value: "byCompanySize", label: "Taille" },
    { value: "byGeography", label: "Pays" },
    { value: "byCampaign", label: "Campagne" },
];

const METRICS: Record<PersonaMetric, { label: string; color: string; rate: boolean; value: (r: PersonaRow) => number; format: (n: number) => string }> = {
    conversion: { label: "Transformation", color: OUTCOME_META.meeting.color, rate: true, value: (r) => r.joinedConversionRate, format: (n) => formatRate(n) },
    reach: { label: "Joignabilité", color: "#0EA5E9", rate: true, value: (r) => r.reachRate, format: (n) => formatRate(n, 0) },
    meetings: { label: "RDV", color: OUTCOME_META.meeting.color, rate: false, value: (r) => r.meetings, format: formatInt },
    calls: { label: "Appels", color: "var(--brand-primary-600)", rate: false, value: (r) => r.calls, format: formatInt },
};

const SELECT = cn(
    "h-9 min-w-[150px] max-w-[220px] rounded-control border border-line bg-surface px-2.5 text-[13px] font-semibold text-ink shadow-2xs transition-colors hover:border-line-strong",
    "focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/15",
);

/** Ranked horizontal bars, with the average of the whole slice as a reference tick. */
function RankedBars({ rows, metric, hideThin, limit = 10 }: { rows: PersonaRow[]; metric: PersonaMetric; hideThin: boolean; limit?: number }) {
    const [all, setAll] = useState(false);
    const m = METRICS[metric];

    const { ranked, avg, max, hidden } = useMemo(() => {
        const totals = rows.reduce((a, r) => ({ calls: a.calls + r.calls, joined: a.joined + r.joined, meetings: a.meetings + r.meetings }), { calls: 0, joined: 0, meetings: 0 });
        const avg =
            metric === "conversion" ? (totals.joined ? (totals.meetings / totals.joined) * 100 : null)
            : metric === "reach" ? (totals.calls ? (totals.joined / totals.calls) * 100 : null)
            : null;
        const eligible = rows.filter((r) => !(hideThin && m.rate && r.calls < MIN_CALLS_FOR_RATE));
        const ranked = [...eligible].sort((a, b) => m.value(b) - m.value(a) || b.calls - a.calls);
        return { ranked, avg, max: Math.max(1, ...ranked.map(m.value), avg ?? 0), hidden: rows.length - eligible.length };
    }, [rows, metric, hideThin, m]);

    if (ranked.length === 0) {
        return <p className="py-8 text-center text-[13px] font-medium text-ink-3">{hidden > 0 ? `Tous les segments ont moins de ${MIN_CALLS_FOR_RATE} appels : décochez le filtre de volume pour les voir.` : "Aucune donnée pour cette période et ces filtres."}</p>;
    }
    const shown = all ? ranked : ranked.slice(0, limit);

    return (
        <div>
            {avg !== null && <p className="mb-3 text-[11px] font-semibold text-ink-3">Moyenne de l'ensemble : <span className="font-extrabold text-ink-2">{m.format(avg)}</span> <span className="text-ink-4">(repère vertical)</span></p>}
            <ul className="space-y-2.5">
                {shown.map((r) => {
                    const v = m.value(r);
                    const thin = r.calls < MIN_CALLS_FOR_RATE;
                    return (
                        <li key={r.value} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_1fr_auto]">
                            <span className={cn("truncate text-[13px] font-semibold", thin && m.rate ? "text-ink-3" : "text-ink")} title={r.value}>{r.value}</span>
                            <span className="relative h-2.5 overflow-hidden rounded-full bg-surface-3">
                                <span className={cn("block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500", thin && m.rate && "opacity-50")} style={{ width: `${Math.max(v > 0 ? 1.5 : 0, (v / max) * 100)}%`, background: m.color }} />
                                {avg !== null && <span className="absolute inset-y-0 w-px bg-ink/50" style={{ left: `${(avg / max) * 100}%` }} aria-hidden />}
                            </span>
                            <span className="flex w-[8.5rem] items-baseline justify-end gap-2 text-right">
                                <span className="text-[13px] font-black tabular-nums text-ink">{m.format(v)}</span>
                                <span className="text-[11px] font-medium tabular-nums text-ink-4">{formatInt(r.calls)} appels</span>
                            </span>
                        </li>
                    );
                })}
            </ul>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {ranked.length > limit ? (
                    <button type="button" onClick={() => setAll((v) => !v)} className={cn("rounded text-xs font-bold text-primary-700 hover:underline", FOCUS)}>
                        {all ? "Réduire" : `Voir les ${ranked.length - limit} autres`}
                    </button>
                ) : <span />}
                {hidden > 0 && <span className="text-[11px] font-medium text-ink-4">{hidden} segment{hidden > 1 ? "s" : ""} sous {MIN_CALLS_FOR_RATE} appels masqué{hidden > 1 ? "s" : ""}</span>}
            </div>
        </div>
    );
}

function Personas({ state, range, options }: { state: StatsState; range: { start: string; end: string }; options: StatsFilterOptions | undefined }) {
    const [dimension, setDimension] = useState<Dimension>("byFunction");
    const [metric, setMetric] = useState<PersonaMetric>("conversion");
    const [hideThin, setHideThin] = useState(true);
    const [mode, setMode] = useState<CompareMode>("none");
    const [missionA, setMissionA] = useState("");
    const [missionB, setMissionB] = useState("");
    const [listA, setListA] = useState("");
    const [listB, setListB] = useState("");

    const oneMission = state.missionIds.length === 1 ? state.missionIds[0] : null;
    const listChoices = (options?.lists ?? []).filter((l) => l.missionId === oneMission);

    const ready = mode === "none" || (mode === "missions" && !!missionA && !!missionB) || (mode === "lists" && !!oneMission && !!listA && !!listB);
    const params = useMemo(() => {
        const p = periodParams(range, mode === "missions" ? { ...state, missionIds: [], listIds: [] } : state);
        if (mode === "missions") { p.append("compareMissionA[]", missionA); p.append("compareMissionB[]", missionB); }
        if (mode === "lists") { p.set("compareListA", listA); p.set("compareListB", listB); }
        return p.toString();
    }, [state, range, mode, missionA, missionB, listA, listB]);

    const query = useQuery({
        queryKey: ["stats", "persona", params],
        queryFn: async () => {
            const res = await fetch(`/api/analytics/persona?${params}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Erreur");
            return json.data as PersonaResponse;
        },
        enabled: ready,
        staleTime: 60_000,
    });

    const data = query.data;
    const dimLabel = DIMENSIONS.find((d) => d.value === dimension)!.label.toLowerCase();

    return (
        <Panel
            title="Cibles"
            subtitle="Quels profils répondent et convertissent — par fonction, secteur, taille, pays ou campagne"
            right={query.isFetching && <Loader2 className="size-4 animate-spin text-ink-4" aria-label="Chargement" />}
        >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <SegmentedControl ariaLabel="Axe d'analyse" size="sm" value={dimension} onChange={setDimension} options={DIMENSIONS} />
                <SegmentedControl ariaLabel="Indicateur" size="sm" value={metric} onChange={setMetric} options={(Object.keys(METRICS) as PersonaMetric[]).map((k) => ({ value: k, label: METRICS[k].label }))} />
                <label className={cn("inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-3", !METRICS[metric].rate && "pointer-events-none opacity-40")}>
                    <input type="checkbox" checked={hideThin} onChange={(e) => setHideThin(e.target.checked)} className="size-3.5 rounded border-line-strong accent-[var(--brand-primary)]" />
                    Masquer sous {MIN_CALLS_FOR_RATE} appels
                </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-subtle pt-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-4">Comparer</span>
                <SegmentedControl
                    ariaLabel="Mode de comparaison"
                    size="sm"
                    value={mode}
                    onChange={setMode}
                    options={[{ value: "none", label: "Aucun" }, { value: "missions", label: "2 missions" }, { value: "lists", label: "2 listes" }]}
                />
                {mode === "missions" && (
                    <>
                        <select aria-label="Mission A" value={missionA} onChange={(e) => setMissionA(e.target.value)} className={SELECT}>
                            <option value="">Mission A</option>
                            {(options?.missions ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                        <span className="text-xs font-bold text-ink-4">vs</span>
                        <select aria-label="Mission B" value={missionB} onChange={(e) => setMissionB(e.target.value)} className={SELECT}>
                            <option value="">Mission B</option>
                            {(options?.missions ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </>
                )}
                {mode === "lists" && (oneMission ? (
                    <>
                        <select aria-label="Liste A" value={listA} onChange={(e) => setListA(e.target.value)} className={SELECT}>
                            <option value="">Liste A</option>
                            {listChoices.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        <span className="text-xs font-bold text-ink-4">vs</span>
                        <select aria-label="Liste B" value={listB} onChange={(e) => setListB(e.target.value)} className={SELECT}>
                            <option value="">Liste B</option>
                            {listChoices.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </>
                ) : <span className="text-xs font-medium text-ink-3">Choisissez d'abord une seule mission dans les filtres du haut.</span>)}
            </div>

            <div className="mt-5">
                {!ready ? (
                    <p className="py-8 text-center text-[13px] font-medium text-ink-3">Choisissez les deux éléments à comparer.</p>
                ) : query.isError ? (
                    <p className="py-8 text-center text-[13px] font-medium text-danger-ink">Impossible de charger l'analyse des cibles.</p>
                ) : !data ? (
                    <div className="space-y-3" aria-busy>{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-4 animate-pulse rounded-full bg-surface-3" style={{ width: `${90 - i * 11}%` }} />)}</div>
                ) : data.mode === "compare" ? (
                    <div className="grid gap-8 lg:grid-cols-2">
                        {([data.segmentA, data.segmentB] as const).map((seg, i) => (
                            <div key={i}>
                                <h3 className="mb-3 text-[13px] font-extrabold text-ink">{seg.label}</h3>
                                <RankedBars rows={seg[dimension]} metric={metric} hideThin={hideThin} limit={8} />
                            </div>
                        ))}
                    </div>
                ) : (
                    <RankedBars rows={data[dimension]} metric={metric} hideThin={hideThin} />
                )}
            </div>
            <p className="mt-4 text-[11px] font-medium text-ink-4">
                Profil lu sur la fiche du contact ou de la société ({dimLabel}) ; « Non renseigné » regroupe les fiches incomplètes.
            </p>
        </Panel>
    );
}

export function TargetsTab({
    overview,
    state,
    range,
    options,
}: {
    overview: StatsOverview;
    state: StatsState;
    range: { start: string; end: string };
    options: StatsFilterOptions | undefined;
}) {
    return (
        <div className="space-y-4">
            <MissionsTable o={overview} />
            <Personas state={state} range={range} options={options} />
        </div>
    );
}
