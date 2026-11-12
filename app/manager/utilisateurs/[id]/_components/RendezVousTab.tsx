"use client";

import { useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { CONTROL_HEIGHT, FIELD_BASE } from "@/components/ui/recipes";
import {
    FilterSelect,
    Metric,
    MetricPlaceholder,
    MetricStrip,
    Panel,
    PanelHeader,
    PanelMessage,
    PanelToolbar,
    SearchField,
    SkeletonRows,
    TextButton,
    useSlashFocus,
} from "@/components/hr/HubUI";
import { currentMonthPeriod, useSdrMeetingsQuery } from "@/app/sdr/meetings/_hooks/useSdrMeetingsQuery";
import { getRdvStatus } from "@/app/sdr/meetings/_lib/formatters";
import type { Meeting } from "@/app/sdr/meetings/_types";

/**
 * Manager view of one SDR's RDVs, built for the monthly bonus count:
 * a RDV pays when it took place and the client came back neutral or positive;
 * an absence pays nothing. Month = the month the SDR booked the RDV.
 */

type BonusStatus = "upcoming" | "awaiting" | "valid" | "absent" | "negative" | "cancelled";

// One dot per RDV: its bonus status is the row's only colour.
const STATUS_META: Record<BonusStatus, { label: string; dot: string; ink: string }> = {
    valid: { label: "Valide", dot: "bg-success", ink: "text-success-ink" },
    awaiting: { label: "En attente de retour", dot: "bg-warning", ink: "text-warning-ink" },
    upcoming: { label: "À venir", dot: "bg-info", ink: "text-ink-2" },
    absent: { label: "Absent", dot: "bg-danger", ink: "text-danger-ink" },
    negative: { label: "Négatif", dot: "bg-ink-4", ink: "text-ink-2" },
    cancelled: { label: "Annulé", dot: "bg-line-strong", ink: "text-ink-3" },
};

function bonusStatus(m: Meeting): BonusStatus {
    const status = getRdvStatus(m);
    if (status === "cancelled") return "cancelled";
    if (status === "upcoming") return "upcoming";
    const outcome = m.meetingFeedback?.outcome;
    if (outcome === "POSITIVE" || outcome === "NEUTRAL") return "valid";
    if (outcome === "NO_SHOW") return "absent";
    if (outcome === "NEGATIVE") return "negative";
    return "awaiting";
}

const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (iso?: string | null) =>
    iso
        ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
        : "À confirmer";
const contactName = (m: Meeting) =>
    [m.contact.firstName, m.contact.lastName].filter(Boolean).join(" ") || "Contact sans nom";
const euros = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Current month + the 11 before it, then the full history (same choices as the SDR's own page). */
function monthOptions(now = new Date()): Array<{ value: string; label: string }> {
    const fmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
    return Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = fmt.format(d);
        return {
            value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
            label: `${label.charAt(0).toUpperCase()}${label.slice(1)}${i === 0 ? " (ce mois-ci)" : ""}`,
        };
    });
}

function periodLabel(period: string) {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (!m) return "tout-l-historique";
    return `${m[1]}-${m[2]}`;
}

function exportCsv(rows: Array<{ m: Meeting; s: BonusStatus }>, userName: string, period: string) {
    const header = ["Pris le", "Date du RDV", "Contact", "Société", "Client", "Mission", "Liste", "Statut", "Primable"];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = rows.map(({ m, s }) =>
        [
            fmtDate(m.createdAt),
            m.callbackDate ? new Date(m.callbackDate).toLocaleString("fr-FR") : "",
            contactName(m),
            m.contact.company.name,
            m.mission?.client.name ?? "",
            m.mission?.name ?? "",
            m.list?.name ?? m.contact.company.list?.name ?? "",
            STATUS_META[s].label,
            s === "valid" ? "Oui" : "Non",
        ].map((v) => esc(String(v))).join(";")
    );
    // BOM + ";" so French Excel opens it with accents and columns intact.
    const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rdv-${userName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${periodLabel(period)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function StatusMark({ s, standBy }: { s: BonusStatus; standBy?: boolean }) {
    const meta = STATUS_META[s];
    return (
        <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium", meta.ink)}>
            <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} aria-hidden />
            {meta.label}
            {standBy ? " (stand-by)" : ""}
        </span>
    );
}

/** A count in the mission table: grey when zero, the status ink otherwise. */
function Cell({ n, ink, strong }: { n: number; ink?: string; strong?: boolean }) {
    return (
        <td className={cn("px-3 py-3 text-right tabular-nums", n === 0 ? "text-ink-4" : cn(ink ?? "text-ink-2", strong && "font-semibold"))}>
            {n}
        </td>
    );
}

export function RendezVousTab({ userId, userName }: { userId: string; userName: string }) {
    const [period, setPeriod] = useState(currentMonthPeriod);
    const [filter, setFilter] = useState<BonusStatus | "all">("all");
    const [query, setQuery] = useState("");
    const { data, isLoading, isError, refetch } = useSdrMeetingsQuery(period, userId);
    const searchRef = useRef<HTMLInputElement>(null);
    useSlashFocus(searchRef);

    // Rates differ per SDR (freelance vs. in-house vs. offshore): a local estimate
    // per SDR, remembered in this browser only — billing stays Morgane's call.
    const rateKey = `cp_rdv_prime_rate_${userId}`;
    const [rate, setRate] = useState(() => {
        if (typeof window === "undefined") return "";
        try { return localStorage.getItem(rateKey) ?? ""; } catch { return ""; }
    });
    const updateRate = (value: string) => {
        setRate(value);
        try { localStorage.setItem(rateKey, value); } catch { /* storage unavailable */ }
    };

    const rows = useMemo(
        () =>
            (data ?? [])
                .map((m) => ({ m, s: bonusStatus(m) }))
                .sort((a, b) => new Date(b.m.createdAt).getTime() - new Date(a.m.createdAt).getTime()),
        [data]
    );

    const counts = useMemo(() => {
        const c: Record<BonusStatus, number> = { upcoming: 0, awaiting: 0, valid: 0, absent: 0, negative: 0, cancelled: 0 };
        for (const r of rows) c[r.s]++;
        return c;
    }, [rows]);
    const booked = rows.length - counts.cancelled;
    const withVerdict = counts.valid + counts.absent + counts.negative;
    const validRate = withVerdict > 0 ? Math.round((counts.valid / withVerdict) * 100) : null;
    const rateNumber = Number(rate.replace(",", "."));
    const estimate = Number.isFinite(rateNumber) && rateNumber > 0 ? counts.valid * rateNumber : null;

    const byMission = useMemo(() => {
        const map = new Map<string, { name: string; client: string; c: Record<BonusStatus, number>; total: number }>();
        for (const { m, s } of rows) {
            const key = m.mission?.id ?? "none";
            const entry = map.get(key) ?? {
                name: m.mission?.name ?? "Sans mission",
                client: m.mission?.client.name ?? "",
                c: { upcoming: 0, awaiting: 0, valid: 0, absent: 0, negative: 0, cancelled: 0 },
                total: 0,
            };
            entry.c[s]++;
            entry.total++;
            map.set(key, entry);
        }
        return [...map.values()].sort((a, b) => b.total - a.total);
    }, [rows]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter(({ m, s }) => {
            if (filter !== "all" && s !== filter) return false;
            if (!q) return true;
            return [contactName(m), m.contact.company.name, m.mission?.name, m.mission?.client.name, m.list?.name]
                .filter(Boolean)
                .some((v) => v!.toLowerCase().includes(q));
        });
    }, [rows, filter, query]);

    const tiles: Array<{ key: BonusStatus | "all"; label: string; value: number; hint?: string }> = [
        { key: "all", label: "RDV pris", value: booked, hint: counts.cancelled ? `+ ${counts.cancelled} annulé${counts.cancelled > 1 ? "s" : ""}` : undefined },
        { key: "valid", label: "Valides", value: counts.valid, hint: validRate !== null ? `${validRate} % des RDV avec retour` : "Primables" },
        { key: "awaiting", label: "En attente de retour", value: counts.awaiting, hint: "Passés, sans retour client" },
        { key: "upcoming", label: "À venir", value: counts.upcoming },
        { key: "absent", label: "Absents", value: counts.absent, hint: "Non primés" },
        { key: "negative", label: "Négatifs", value: counts.negative },
    ];

    const searching = query.trim() !== "";
    const loadFailed = isError && !data;

    return (
        <div className="space-y-4">
            {/* Title + period */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold text-ink">Rendez-vous de {userName}</h2>
                    <p className="mt-0.5 text-[13px] text-ink-3">Comptés sur le mois de prise du RDV — base du calcul des primes.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] text-ink-3" aria-hidden>RDV pris en</span>
                    <FilterSelect
                        label="Mois de prise de RDV"
                        value={period}
                        onChange={(p) => { setPeriod(p); setFilter("all"); }}
                        active={period !== currentMonthPeriod()}
                    >
                        {monthOptions().map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                        <option value="all">Tout l&apos;historique</option>
                    </FilterSelect>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => exportCsv(visible, userName, period)}
                        disabled={visible.length === 0}
                        title="Exporter la liste affichée (Excel)"
                        leftIcon={<Download className="size-4" />}
                    >
                        Exporter
                    </Button>
                </div>
            </div>

            {/* Counts — each one filters the list below */}
            <MetricStrip>
                {tiles.map((t) => {
                    const active = filter === t.key;
                    return (
                        <Metric
                            key={t.key}
                            label={
                                <>
                                    {t.key !== "all" && <span className={cn("size-1.5 rounded-full", STATUS_META[t.key].dot)} aria-hidden />}
                                    {t.label}
                                </>
                            }
                            value={isLoading ? <MetricPlaceholder /> : loadFailed ? <span className="text-ink-4">—</span> : t.value}
                            hint={t.hint}
                            onClick={() => setFilter(active && t.key !== "all" ? "all" : t.key)}
                            pressed={active}
                        />
                    );
                })}
            </MetricStrip>

            <div className="grid items-start gap-4 lg:grid-cols-3">
                {/* Bonus estimate */}
                <Panel>
                    <PanelHeader title="Estimation de la prime" description="RDV valides × tarif de ce SDR" />
                    <div className="space-y-4 px-5 py-4">
                        <div>
                            <label className="mb-1.5 block text-[13px] font-medium text-ink-2" htmlFor={`rate-${userId}`}>
                                Tarif par RDV valide
                            </label>
                            <div className="relative">
                                <input
                                    id={`rate-${userId}`}
                                    inputMode="decimal"
                                    value={rate}
                                    onChange={(e) => updateRate(e.target.value.replace(/[^0-9.,]/g, ""))}
                                    placeholder="ex. 150"
                                    className={cn(FIELD_BASE, CONTROL_HEIGHT.md, "pl-3 pr-8 tabular-nums")}
                                />
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">€</span>
                            </div>
                        </div>
                        <div className="rounded-xl bg-surface-2 px-4 py-3">
                            <p className="text-xs tabular-nums text-ink-3">
                                {counts.valid} RDV valide{counts.valid > 1 ? "s" : ""}
                                {estimate !== null && <> × {euros(rateNumber)}</>}
                            </p>
                            <p className="mt-1 font-display text-[22px] font-semibold leading-7 tracking-[-0.01em] tabular-nums text-ink">
                                {estimate !== null ? euros(estimate) : "—"}
                            </p>
                            {counts.awaiting > 0 && (
                                <p className="mt-1 text-xs text-warning-ink">
                                    {counts.awaiting} RDV encore sans retour client — à relancer avant de clôturer le mois.
                                </p>
                            )}
                        </div>
                        <p className="text-xs text-ink-3">Estimation mémorisée sur ce navigateur uniquement, non enregistrée.</p>
                    </div>
                </Panel>

                {/* Per-mission breakdown */}
                <Panel className="lg:col-span-2">
                    <PanelHeader title="Par mission" meta={byMission.length ? `${byMission.length} mission${byMission.length > 1 ? "s" : ""}` : undefined} />
                    {isLoading ? (
                        <SkeletonRows rows={3} columns={[30, 6, 6, 6, 6, 6]} pitch="py-3" />
                    ) : loadFailed ? (
                        <PanelMessage className="py-10" tone="error" action={<TextButton onClick={() => refetch()}>Réessayer</TextButton>}>
                            Les rendez-vous n’ont pas pu être chargés.
                        </PanelMessage>
                    ) : byMission.length === 0 ? (
                        <PanelMessage className="py-10">Aucun RDV sur cette période.</PanelMessage>
                    ) : (
                        <>
                            {/* Phones: one line per mission */}
                            <ul className="divide-y divide-line-subtle md:hidden">
                                {byMission.map((row) => (
                                    <li key={`${row.name}-${row.client}`} className="px-4 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-[13px] font-medium text-ink">{row.name}</p>
                                                {row.client && <p className="truncate text-xs text-ink-3">{row.client}</p>}
                                            </div>
                                            <p className="shrink-0 text-[13px] tabular-nums text-ink-3">
                                                <span className="font-semibold text-ink">{row.total - row.c.cancelled}</span> pris
                                            </p>
                                        </div>
                                        <p className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums text-ink-3">
                                            <span className={row.c.valid ? "font-medium text-success-ink" : undefined}>{row.c.valid} valide{row.c.valid > 1 ? "s" : ""}</span>
                                            <span className={row.c.awaiting ? "text-warning-ink" : undefined}>{row.c.awaiting} en attente</span>
                                            <span className={row.c.absent ? "text-danger-ink" : undefined}>{row.c.absent} absent{row.c.absent > 1 ? "s" : ""}</span>
                                            <span>{row.c.negative} négatif{row.c.negative > 1 ? "s" : ""}</span>
                                        </p>
                                    </li>
                                ))}
                            </ul>
                            <div className="hidden overflow-x-auto md:block">
                                <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
                                    <thead className="border-b border-line text-xs text-ink-3">
                                        <tr>
                                            <th scope="col" className="py-2.5 pl-5 pr-3 font-medium">Mission</th>
                                            <th scope="col" className="px-3 py-2.5 text-right font-medium">Pris</th>
                                            <th scope="col" className="px-3 py-2.5 text-right font-medium">Valides</th>
                                            <th scope="col" className="px-3 py-2.5 text-right font-medium">En attente</th>
                                            <th scope="col" className="px-3 py-2.5 text-right font-medium">Absents</th>
                                            <th scope="col" className="py-2.5 pl-3 pr-5 text-right font-medium">Négatifs</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {byMission.map((row) => (
                                            <tr key={`${row.name}-${row.client}`} className="border-b border-line-subtle transition-colors duration-100 last:border-b-0 hover:bg-surface-2/70">
                                                <td className="py-3 pl-5 pr-3">
                                                    <div className="font-medium text-ink">{row.name}</div>
                                                    {row.client && <div className="text-xs text-ink-3">{row.client}</div>}
                                                </td>
                                                <td className="px-3 py-3 text-right font-medium tabular-nums text-ink">{row.total - row.c.cancelled}</td>
                                                <Cell n={row.c.valid} ink="text-success-ink" strong />
                                                <Cell n={row.c.awaiting} ink="text-warning-ink" />
                                                <Cell n={row.c.absent} ink="text-danger-ink" />
                                                <td className={cn("py-3 pl-3 pr-5 text-right tabular-nums", row.c.negative ? "text-ink-2" : "text-ink-4")}>{row.c.negative}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </Panel>
            </div>

            {/* RDV list */}
            <Panel>
                <PanelToolbar>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                        Détail des rendez-vous
                        <span className="text-xs font-normal tabular-nums text-ink-3">{visible.length}</span>
                    </h3>
                    {filter !== "all" && (
                        <button
                            type="button"
                            onClick={() => setFilter("all")}
                            className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 text-xs font-medium text-ink-2 hover:border-line-strong hover:text-ink"
                        >
                            <span className={cn("size-1.5 rounded-full", STATUS_META[filter].dot)} aria-hidden />
                            {STATUS_META[filter].label}
                            <span aria-hidden="true">×</span>
                            <span className="sr-only">Retirer le filtre</span>
                        </button>
                    )}
                    <SearchField
                        ref={searchRef}
                        value={query}
                        onChange={setQuery}
                        placeholder="Contact, société, mission…"
                        label="Rechercher un rendez-vous"
                        className="w-full sm:ml-auto sm:max-w-xs sm:flex-none"
                    />
                </PanelToolbar>

                {isLoading ? (
                    <SkeletonRows rows={5} columns={[10, 12, 28, 22, 12]} pitch="py-3.5" />
                ) : loadFailed ? (
                    <PanelMessage tone="error" action={<TextButton onClick={() => refetch()}>Réessayer</TextButton>}>
                        Les rendez-vous n’ont pas pu être chargés.
                    </PanelMessage>
                ) : visible.length === 0 ? (
                    <PanelMessage
                        action={
                            searching || filter !== "all" ? (
                                <TextButton onClick={() => { setQuery(""); setFilter("all"); }}>Réinitialiser les filtres</TextButton>
                            ) : undefined
                        }
                    >
                        {searching || filter !== "all" ? "Aucun rendez-vous ne correspond à la recherche ou au filtre." : "Aucun RDV pris sur cette période."}
                    </PanelMessage>
                ) : (
                    <>
                        {/* Phones: one card per RDV */}
                        <ul className="divide-y divide-line-subtle md:hidden">
                            {visible.map(({ m, s }) => (
                                <li key={m.id} className="space-y-1.5 px-4 py-3.5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-ink">{m.contact.company.name}</p>
                                            <p className="truncate text-xs text-ink-3">
                                                {contactName(m)}
                                                {m.contact.title ? ` · ${m.contact.title}` : ""}
                                            </p>
                                        </div>
                                        <StatusMark s={s} standBy={s === "absent" && Boolean(m.meetingFeedback?.standByAt)} />
                                    </div>
                                    <p className="text-xs tabular-nums text-ink-3">
                                        RDV {fmtDateTime(m.callbackDate)} · pris le {fmtDate(m.createdAt)}
                                    </p>
                                    {m.mission?.name && (
                                        <p className="truncate text-xs text-ink-3">
                                            {[m.mission.name, m.mission.client.name, m.list?.name].filter(Boolean).join(" · ")}
                                        </p>
                                    )}
                                </li>
                            ))}
                        </ul>

                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
                                <thead className="border-b border-line text-xs text-ink-3">
                                    <tr>
                                        <th scope="col" className="whitespace-nowrap py-2.5 pl-5 pr-3 font-medium">Pris le</th>
                                        <th scope="col" className="whitespace-nowrap px-3 py-2.5 font-medium">Date du RDV</th>
                                        <th scope="col" className="px-3 py-2.5 font-medium">Prospect</th>
                                        <th scope="col" className="px-3 py-2.5 font-medium">Mission</th>
                                        <th scope="col" className="py-2.5 pl-3 pr-5 font-medium">Statut</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map(({ m, s }) => (
                                        <tr key={m.id} className="border-b border-line-subtle align-top transition-colors duration-100 last:border-b-0 hover:bg-surface-2/70">
                                            <td className="whitespace-nowrap py-3 pl-5 pr-3 tabular-nums text-ink-3">{fmtDate(m.createdAt)}</td>
                                            <td className="whitespace-nowrap px-3 py-3 tabular-nums text-ink">{fmtDateTime(m.callbackDate)}</td>
                                            <td className="min-w-[180px] px-3 py-3">
                                                <div className="font-medium text-ink">{m.contact.company.name}</div>
                                                <div className="text-xs text-ink-3">
                                                    {contactName(m)}
                                                    {m.contact.title ? ` · ${m.contact.title}` : ""}
                                                </div>
                                            </td>
                                            <td className="min-w-[160px] px-3 py-3">
                                                <div className="text-ink-2">{m.mission?.name ?? "—"}</div>
                                                {(m.list?.name || m.mission?.client.name) && (
                                                    <div className="text-xs text-ink-3">
                                                        {[m.mission?.client.name, m.list?.name].filter(Boolean).join(" · ")}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="whitespace-nowrap py-3 pl-3 pr-5">
                                                <StatusMark s={s} standBy={s === "absent" && Boolean(m.meetingFeedback?.standByAt)} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </Panel>
        </div>
    );
}
