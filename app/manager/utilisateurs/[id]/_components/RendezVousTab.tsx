"use client";

import { useMemo, useState } from "react";
import {
    Ban,
    CalendarCheck2,
    CheckCircle2,
    Clock,
    Download,
    Hourglass,
    Search,
    ThumbsDown,
    UserX,
    Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { currentMonthPeriod, useSdrMeetingsQuery } from "@/app/sdr/meetings/_hooks/useSdrMeetingsQuery";
import { SdrMonthPicker } from "@/app/sdr/meetings/_components/SdrMonthPicker";
import { getRdvStatus } from "@/app/sdr/meetings/_lib/formatters";
import type { Meeting } from "@/app/sdr/meetings/_types";

/**
 * Manager view of one SDR's RDVs, built for the monthly bonus count:
 * a RDV pays when it took place and the client came back neutral or positive;
 * an absence pays nothing. Month = the month the SDR booked the RDV.
 */

type BonusStatus = "upcoming" | "awaiting" | "valid" | "absent" | "negative" | "cancelled";

const STATUS_META: Record<BonusStatus, { label: string; badge: string; dot: string }> = {
    valid: { label: "Valide", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
    awaiting: { label: "En attente de retour", badge: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" },
    upcoming: { label: "À venir", badge: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
    absent: { label: "Absent", badge: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500" },
    negative: { label: "Négatif", badge: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-500" },
    cancelled: { label: "Annulé", badge: "bg-slate-50 text-slate-500 ring-slate-200", dot: "bg-slate-300" },
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

export function RendezVousTab({ userId, userName }: { userId: string; userName: string }) {
    const [period, setPeriod] = useState(currentMonthPeriod);
    const [filter, setFilter] = useState<BonusStatus | "all">("all");
    const [query, setQuery] = useState("");
    const { data, isLoading } = useSdrMeetingsQuery(period, userId);

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

    const tiles: Array<{ key: BonusStatus | "all"; label: string; value: number; icon: typeof Clock; tone: string; hint?: string }> = [
        { key: "all", label: "RDV pris", value: booked, icon: CalendarCheck2, tone: "text-indigo-600 bg-indigo-50", hint: counts.cancelled ? `+ ${counts.cancelled} annulé${counts.cancelled > 1 ? "s" : ""}` : undefined },
        { key: "valid", label: "Valides", value: counts.valid, icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50", hint: validRate !== null ? `${validRate} % des RDV avec retour` : "Primables" },
        { key: "awaiting", label: "En attente de retour", value: counts.awaiting, icon: Hourglass, tone: "text-amber-600 bg-amber-50", hint: "Passés, sans retour client" },
        { key: "upcoming", label: "À venir", value: counts.upcoming, icon: Clock, tone: "text-sky-600 bg-sky-50" },
        { key: "absent", label: "Absents", value: counts.absent, icon: UserX, tone: "text-red-600 bg-red-50", hint: "Non primés" },
        { key: "negative", label: "Négatifs", value: counts.negative, icon: ThumbsDown, tone: "text-slate-600 bg-slate-100" },
    ];

    return (
        <div className="space-y-5">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold text-slate-900">Rendez-vous de {userName}</h2>
                    <p className="text-xs text-slate-500">Comptés sur le mois de prise du RDV — base du calcul des primes.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <SdrMonthPicker value={period} onChange={(p) => { setPeriod(p); setFilter("all"); }} />
                    <button
                        type="button"
                        onClick={() => exportCsv(visible, userName, period)}
                        disabled={visible.length === 0}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Exporter la liste affichée (Excel)"
                    >
                        <Download className="w-4 h-4" />
                        Exporter
                    </button>
                </div>
            </div>

            {/* KPI tiles — click to filter the table */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {tiles.map((t) => {
                    const active = filter === t.key;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setFilter(active && t.key !== "all" ? "all" : t.key)}
                            aria-pressed={active}
                            className={cn(
                                "text-left rounded-2xl border bg-white p-3.5 transition shadow-sm hover:shadow",
                                active ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-200 hover:border-slate-300"
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-500">{t.label}</span>
                                <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", t.tone)}>
                                    <t.icon className="w-3.5 h-3.5" />
                                </span>
                            </div>
                            <div className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">
                                {isLoading ? <span className="inline-block h-7 w-8 animate-pulse rounded bg-slate-100" /> : t.value}
                            </div>
                            {t.hint && <div className="mt-0.5 text-[11px] text-slate-400 truncate">{t.hint}</div>}
                        </button>
                    );
                })}
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
                {/* Bonus estimate */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                            <Wallet className="w-4 h-4" />
                        </span>
                        <div>
                            <h3 className="text-sm font-semibold text-slate-900">Estimation de la prime</h3>
                            <p className="text-[11px] text-slate-500">RDV valides × tarif de ce SDR</p>
                        </div>
                    </div>
                    <label className="mt-4 block text-xs font-medium text-slate-600" htmlFor={`rate-${userId}`}>
                        Tarif par RDV valide
                    </label>
                    <div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-white focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
                        <input
                            id={`rate-${userId}`}
                            inputMode="decimal"
                            value={rate}
                            onChange={(e) => updateRate(e.target.value.replace(/[^0-9.,]/g, ""))}
                            placeholder="ex. 150"
                            className="w-full bg-transparent px-3 py-2 text-sm text-slate-900 focus:outline-none"
                        />
                        <span className="pr-3 text-sm text-slate-400">€</span>
                    </div>
                    <div className="mt-4 rounded-xl bg-slate-50 px-3 py-3">
                        <div className="text-xs text-slate-500">
                            {counts.valid} RDV valide{counts.valid > 1 ? "s" : ""}
                            {estimate !== null && <> × {euros(rateNumber)}</>}
                        </div>
                        <div className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
                            {estimate !== null ? euros(estimate) : "—"}
                        </div>
                        {counts.awaiting > 0 && (
                            <div className="mt-1 text-[11px] text-amber-700">
                                {counts.awaiting} RDV encore sans retour client — à relancer avant de clôturer le mois.
                            </div>
                        )}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">Estimation mémorisée sur ce navigateur uniquement, non enregistrée.</p>
                </div>

                {/* Per-mission breakdown */}
                <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-900">Par mission</h3>
                    </div>
                    {byMission.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-slate-500">{isLoading ? "Chargement…" : "Aucun RDV sur cette période."}</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                                        <th className="px-4 py-2 font-medium">Mission</th>
                                        <th className="px-3 py-2 font-medium text-right">Pris</th>
                                        <th className="px-3 py-2 font-medium text-right">Valides</th>
                                        <th className="px-3 py-2 font-medium text-right">En attente</th>
                                        <th className="px-3 py-2 font-medium text-right">Absents</th>
                                        <th className="px-3 py-2 font-medium text-right">Négatifs</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {byMission.map((row) => (
                                        <tr key={`${row.name}-${row.client}`} className="hover:bg-slate-50/60">
                                            <td className="px-4 py-2.5">
                                                <div className="font-medium text-slate-900">{row.name}</div>
                                                {row.client && <div className="text-[11px] text-slate-500">{row.client}</div>}
                                            </td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{row.total - row.c.cancelled}</td>
                                            <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{row.c.valid}</td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">{row.c.awaiting}</td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{row.c.absent}</td>
                                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{row.c.negative}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* RDV table */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">Détail des rendez-vous</h3>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 tabular-nums">{visible.length}</span>
                        {filter !== "all" && (
                            <button
                                type="button"
                                onClick={() => setFilter("all")}
                                className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", STATUS_META[filter].badge)}
                            >
                                {STATUS_META[filter].label}
                                <span aria-hidden="true">×</span>
                                <span className="sr-only">Retirer le filtre</span>
                            </button>
                        )}
                    </div>
                    <div className="relative w-full sm:w-64">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Contact, société, mission…"
                            aria-label="Rechercher un rendez-vous"
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                        />
                    </div>
                </div>

                {isLoading ? (
                    <div className="divide-y divide-slate-100">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-4 px-4 py-3">
                                <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
                                <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
                                <div className="h-5 w-24 animate-pulse rounded-full bg-slate-100" />
                            </div>
                        ))}
                    </div>
                ) : visible.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                        <Ban className="h-6 w-6 text-slate-300" />
                        <p className="text-sm font-medium text-slate-600">Aucun rendez-vous</p>
                        <p className="text-xs text-slate-400">
                            {query || filter !== "all" ? "Modifiez la recherche ou le filtre." : "Aucun RDV pris sur cette période."}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50/60">
                                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                                    <th className="px-4 py-2 font-medium whitespace-nowrap">Pris le</th>
                                    <th className="px-3 py-2 font-medium whitespace-nowrap">Date du RDV</th>
                                    <th className="px-3 py-2 font-medium">Prospect</th>
                                    <th className="px-3 py-2 font-medium">Mission</th>
                                    <th className="px-3 py-2 font-medium">Statut</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visible.map(({ m, s }) => (
                                    <tr key={m.id} className="hover:bg-slate-50/60">
                                        <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-slate-600">{fmtDate(m.createdAt)}</td>
                                        <td className="px-3 py-2.5 whitespace-nowrap tabular-nums text-slate-900">{fmtDateTime(m.callbackDate)}</td>
                                        <td className="px-3 py-2.5 min-w-[180px]">
                                            <div className="font-medium text-slate-900">{m.contact.company.name}</div>
                                            <div className="text-[12px] text-slate-500">
                                                {contactName(m)}
                                                {m.contact.title ? ` · ${m.contact.title}` : ""}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5 min-w-[160px]">
                                            <div className="text-slate-800">{m.mission?.name ?? "—"}</div>
                                            {(m.list?.name || m.mission?.client.name) && (
                                                <div className="text-[12px] text-slate-500">
                                                    {[m.mission?.client.name, m.list?.name].filter(Boolean).join(" · ")}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap">
                                            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1", STATUS_META[s].badge)}>
                                                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[s].dot)} />
                                                {STATUS_META[s].label}
                                                {s === "absent" && m.meetingFeedback?.standByAt ? " (stand-by)" : ""}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
