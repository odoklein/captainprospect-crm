"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Delta, EmptyBlock, FOCUS, Initials } from "@/components/accueil/AccueilUI";
import {
    MIN_CALLS_FOR_RATE, callsPerMeeting, conversionRate, emptyTally, heatValue, hasVolume, reachRate, relativeChange, type HeatMetric,
} from "@/lib/stats/metrics";
import { formatDuration, formatInt, formatRate } from "@/lib/stats/format";
import type { AlloSdrMetrics, HeatCell, SdrRow, StatsOverview, Tally, TelephonyResponse } from "@/lib/stats/types";
import { Panel, Rate } from "./shared";

// ── SDR table ───────────────────────────────────────────────────────

type SortKey = "name" | "calls" | "reach" | "meetings" | "conversion" | "hot" | "talk" | "logged";

interface Row {
    sdr: SdrRow;
    t: Tally;
    reach: number | null;
    conversion: number | null;
    every: number | null;
    talk: number | null;
    logged: number | null;
    allo: AlloSdrMetrics | undefined;
}

const SORT_VALUE: Record<SortKey, (r: Row) => number | string> = {
    name: (r) => r.sdr.name.toLocaleLowerCase("fr"),
    calls: (r) => r.t.calls,
    reach: (r) => r.reach ?? -1,
    meetings: (r) => r.t.meetings,
    conversion: (r) => r.conversion ?? -1,
    hot: (r) => r.t.hot,
    talk: (r) => r.talk ?? -1,
    logged: (r) => r.logged ?? -1,
};

function Th({ label, hint, k, sort, onSort, align = "right" }: {
    label: string; hint?: string; k: SortKey; sort: { key: SortKey; dir: "asc" | "desc" }; onSort: (k: SortKey) => void; align?: "left" | "right";
}) {
    const active = sort.key === k;
    const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
        <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("px-3 py-2.5 font-bold", align === "right" ? "text-right" : "text-left")}>
            <button
                type="button"
                onClick={() => onSort(k)}
                title={hint}
                className={cn("inline-flex items-center gap-1 rounded text-[11px] font-bold uppercase tracking-wider transition-colors", FOCUS, "focus-visible:ring-offset-0", active ? "text-ink" : "text-ink-4 hover:text-ink-2")}
            >
                {label}
                <Icon className={cn("size-3", !active && "opacity-50")} aria-hidden />
            </button>
        </th>
    );
}

function SdrTable({ o, telephony, scoped }: { o: StatsOverview; telephony: TelephonyResponse | undefined; scoped: boolean }) {
    const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "meetings", dir: "desc" });
    const alloOk = !!telephony?.available && !scoped;

    const rows: Row[] = useMemo(
        () =>
            o.sdrs.map((sdr) => {
                const allo = alloOk ? telephony!.bySdr[sdr.id] : undefined;
                const t = sdr.current;
                return {
                    sdr,
                    t,
                    reach: reachRate(t),
                    conversion: conversionRate(t),
                    every: callsPerMeeting(t),
                    allo,
                    talk: allo ? allo.talkTimeSeconds : t.seconds > 0 ? t.seconds : null,
                    logged: allo && allo.alloCalls > 0 ? Math.round((t.calls / allo.alloCalls) * 100) : null,
                };
            }),
        [o.sdrs, telephony, alloOk],
    );

    const sorted = useMemo(() => {
        const get = SORT_VALUE[sort.key];
        return [...rows].sort((a, b) => {
            const va = get(a), vb = get(b);
            const cmp = typeof va === "string" || typeof vb === "string" ? String(va).localeCompare(String(vb), "fr") : (va as number) - (vb as number);
            return sort.dir === "asc" ? cmp : -cmp;
        });
    }, [rows, sort]);

    const team: Tally = useMemo(() => {
        const t = emptyTally();
        for (const r of rows) {
            t.calls += r.t.calls; t.joined += r.t.joined; t.hot += r.t.hot; t.meetings += r.t.meetings; t.seconds += r.t.seconds;
        }
        return t;
    }, [rows]);
    const maxMeetings = Math.max(1, ...rows.map((r) => r.t.meetings));
    const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
    const teamTalk = alloOk ? telephony!.totals.talkTimeSeconds : team.seconds;

    if (rows.length === 0) {
        return <EmptyBlock icon={ArrowUpDown} tone="slate" title="Aucun SDR actif sur la période" hint="Aucun appel n'a été enregistré avec ces filtres." />;
    }

    return (
        <Panel
            title="Équipe"
            subtitle={`${rows.length} ${rows.length > 1 ? "SDR" : "SDR"} · taux grisés sous ${MIN_CALLS_FOR_RATE} appels (trop peu pour conclure)`}
            bodyClassName="px-0 sm:px-0 pb-2 sm:pb-2"
        >
            <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-[13px]">
                    <thead>
                        <tr className="border-y border-line-subtle bg-surface-2/60">
                            <Th label="SDR" k="name" sort={sort} onSort={onSort} align="left" />
                            <Th label="Appels" k="calls" sort={sort} onSort={onSort} />
                            <Th label="Joignabilité" hint="Appels joints / appels passés" k="reach" sort={sort} onSort={onSort} />
                            <Th label="RDV" k="meetings" sort={sort} onSort={onSort} />
                            <Th label="Transfo." hint="RDV / appels joints" k="conversion" sort={sort} onSort={onSort} />
                            <Th label="À suivre" hint="Intéressés + rappels à traiter" k="hot" sort={sort} onSort={onSort} />
                            <Th label="Temps de parole" hint={alloOk ? "Lignes Allo" : "Durées enregistrées dans le CRM"} k="talk" sort={sort} onSort={onSort} />
                            {alloOk && <Th label="Saisie CRM" hint="Actions saisies dans le CRM / appels passés sur la ligne Allo" k="logged" sort={sort} onSort={onSort} />}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line-subtle">
                        {sorted.map((r) => {
                            const thin = !hasVolume(r.t);
                            const idle = r.t.calls === 0;
                            return (
                                <tr key={r.sdr.id} className="transition-colors hover:bg-surface-2/60">
                                    <td className="px-3 py-3">
                                        <Link href={`/manager/utilisateurs/${r.sdr.id}`} className={cn("group flex items-center gap-3 rounded-lg", FOCUS, "focus-visible:ring-offset-0")}>
                                            <Initials name={r.sdr.name} size="sm" />
                                            <span className="min-w-0">
                                                <span className="block truncate font-bold text-ink group-hover:underline">{r.sdr.name}</span>
                                                {idle && <span className="block text-[11px] font-medium text-ink-4">Aucun appel sur la période</span>}
                                            </span>
                                            <ExternalLink className="size-3 shrink-0 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                                        </Link>
                                    </td>
                                    <td className="px-3 py-3 text-right font-bold tabular-nums text-ink">{formatInt(r.t.calls)}</td>
                                    <td className="px-3 py-3 text-right font-semibold"><Rate thin={thin} value={formatRate(r.reach, 0)} className={thin ? "" : "text-ink-2"} /></td>
                                    <td className="px-3 py-3">
                                        <div className="ml-auto flex w-[116px] flex-col items-end gap-1">
                                            <span className="flex items-baseline gap-2">
                                                {relativeChange(r.t.meetings, r.sdr.previous.meetings) !== null && <Delta value={relativeChange(r.t.meetings, r.sdr.previous.meetings)} />}
                                                <span className="text-sm font-black tabular-nums text-ink">{formatInt(r.t.meetings)}</span>
                                            </span>
                                            <span className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
                                                <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${(r.t.meetings / maxMeetings) * 100}%` }} />
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3 text-right font-semibold">
                                        <Rate thin={thin} value={formatRate(r.conversion)} className={thin ? "" : "text-ink-2"} />
                                        {r.every && !thin && <span className="block text-[11px] font-medium text-ink-4">1 / {formatInt(r.every)} appels</span>}
                                    </td>
                                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink-2">{formatInt(r.t.hot)}</td>
                                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink-2">{r.talk ? formatDuration(r.talk) : <span className="text-ink-4">—</span>}</td>
                                    {alloOk && (
                                        <td className="px-3 py-3 text-right font-semibold tabular-nums">
                                            {r.logged === null ? <span className="text-ink-4">—</span> : (
                                                <span className={cn(r.logged < 70 ? "text-warning-ink" : "text-ink-2")} title={`${formatInt(r.t.calls)} actions CRM pour ${formatInt(r.allo?.alloCalls ?? 0)} appels Allo`}>{r.logged} %</span>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="border-t border-line bg-surface-2/60 font-bold">
                            <td className="px-3 py-3 text-ink">Équipe</td>
                            <td className="px-3 py-3 text-right tabular-nums text-ink">{formatInt(team.calls)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-ink-2">{formatRate(reachRate(team), 0)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-ink">{formatInt(team.meetings)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-ink-2">{formatRate(conversionRate(team))}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-ink-2">{formatInt(team.hot)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-ink-2">{teamTalk > 0 ? formatDuration(teamTalk) : "—"}</td>
                            {alloOk && <td />}
                        </tr>
                    </tfoot>
                </table>
            </div>
            {scoped && (
                <p className="px-6 pb-3 pt-1 text-[11px] font-medium text-ink-4">
                    Le temps de parole et la saisie CRM viennent des lignes Allo, qui ne se découpent pas par mission, client ou liste : ils sont masqués quand l'un de ces filtres est actif.
                </p>
            )}
        </Panel>
    );
}

// ── Heatmap ─────────────────────────────────────────────────────────

const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const DAY_LONG = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const METRICS: { value: HeatMetric; label: string; unit: string }[] = [
    { value: "reach", label: "Joignabilité", unit: "% de joints" },
    { value: "calls", label: "Appels", unit: "appels" },
    { value: "meetings", label: "RDV", unit: "RDV" },
];

function Heatmap({ cells }: { cells: HeatCell[] }) {
    const [metric, setMetric] = useState<HeatMetric>("reach");

    const { byKey, days, hours } = useMemo(() => {
        const byKey = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c]));
        const used = cells.filter((c) => c.calls > 0);
        const minH = Math.min(8, ...used.map((c) => c.hour));
        const maxH = Math.max(18, ...used.map((c) => c.hour));
        const weekend = used.some((c) => c.dow >= 6);
        return {
            byKey,
            days: Array.from({ length: weekend ? 7 : 5 }, (_, i) => i + 1),
            hours: Array.from({ length: Math.max(1, maxH - minH + 1) }, (_, i) => minH + i),
        };
    }, [cells]);

    const values = useMemo(() => cells.map((c) => heatValue(c, metric)).filter((v): v is number => v !== null), [cells, metric]);
    const lo = metric === "reach" ? Math.min(...values) : 0;
    const hi = Math.max(1, ...values);

    // Best slots by joignabilité (only cells with enough calls to mean something).
    const best = useMemo(
        () => cells.filter((c) => c.calls >= 20).map((c) => ({ c, rate: c.joined / c.calls })).sort((a, b) => b.rate - a.rate).slice(0, 3),
        [cells],
    );
    const current = METRICS.find((m) => m.value === metric)!;

    if (cells.length === 0) return null;

    return (
        <Panel
            title="Créneaux"
            subtitle="Quand joint-on le mieux ? Heures de Paris, cumul sur la période"
            right={<SegmentedControl ariaLabel="Indicateur de la carte" size="sm" value={metric} onChange={setMetric} options={METRICS.map((m) => ({ value: m.value, label: m.label }))} />}
        >
            <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                    <div className="grid items-center gap-1" style={{ gridTemplateColumns: `44px repeat(${hours.length}, minmax(0, 1fr))` }}>
                        <span />
                        {hours.map((h) => (
                            <span key={h} className="pb-1 text-center text-[11px] font-semibold tabular-nums text-ink-4">{h} h</span>
                        ))}
                        {days.map((d) => (
                            <FragmentRow key={d} label={DAY_LABELS[d - 1]}>
                                {hours.map((h) => {
                                    const cell = byKey.get(`${d}-${h}`);
                                    const v = heatValue(cell, metric);
                                    const intensity = v === null ? 0 : hi === lo ? 1 : (v - lo) / (hi - lo);
                                    const strong = intensity > 0.6;
                                    return (
                                        <div
                                            key={h}
                                            title={cell && cell.calls > 0 ? `${DAY_LONG[d - 1]} ${h} h : ${formatInt(cell.calls)} appels, ${formatInt(cell.joined)} joints (${Math.round((cell.joined / cell.calls) * 100)} %), ${formatInt(cell.meetings)} RDV` : `${DAY_LONG[d - 1]} ${h} h : aucun appel`}
                                            className={cn(
                                                "flex h-9 items-center justify-center rounded-md text-[11px] font-bold tabular-nums",
                                                v === null ? "bg-surface-2 text-ink-4" : strong ? "text-white" : "text-ink-2",
                                            )}
                                            style={v === null ? undefined : { background: `color-mix(in oklab, var(--brand-primary-600) ${Math.round(10 + intensity * 88)}%, var(--ds-surface))` }}
                                        >
                                            {v === null ? (cell && cell.calls > 0 ? "·" : "") : metric === "reach" ? `${Math.round(v)}` : formatInt(v)}
                                        </div>
                                    );
                                })}
                            </FragmentRow>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line-subtle pt-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-ink-3">
                    <span>{metric === "reach" ? "Moins" : "0"}</span>
                    <span className="h-2 w-28 rounded-full" style={{ background: "linear-gradient(to right, color-mix(in oklab, var(--brand-primary-600) 10%, var(--ds-surface)), var(--brand-primary-600))" }} aria-hidden />
                    <span>{metric === "reach" ? "Plus" : formatInt(hi)}</span>
                    <span className="ml-2 text-ink-4">{current.unit}{metric === "reach" ? " · cellules de moins de 10 appels masquées" : ""}</span>
                </div>
                {best.length > 0 && (
                    <p className="text-xs text-ink-3">
                        <span className="font-bold text-ink-2">Meilleurs créneaux : </span>
                        {best.map(({ c, rate }, i) => (
                            <span key={`${c.dow}-${c.hour}`}>
                                {i > 0 && " · "}
                                {DAY_LONG[c.dow - 1]} {c.hour} h <span className="font-bold text-ink">({Math.round(rate * 100)} %)</span>
                            </span>
                        ))}
                    </p>
                )}
            </div>
        </Panel>
    );
}

/** A heatmap row: its day label, then its cells (they share the parent's grid). */
function FragmentRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <>
            <span className="pr-1 text-xs font-bold text-ink-3">{label}</span>
            {children}
        </>
    );
}

export function TeamTab({
    overview,
    telephony,
    scoped,
}: {
    overview: StatsOverview;
    telephony: TelephonyResponse | undefined;
    scoped: boolean;
}) {
    return (
        <div className="space-y-4">
            <SdrTable o={overview} telephony={telephony} scoped={scoped} />
            <Heatmap cells={overview.heatmap} />
        </div>
    );
}
