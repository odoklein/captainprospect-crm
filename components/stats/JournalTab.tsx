"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyBlock, FOCUS } from "@/components/accueil/AccueilUI";
import { OUTCOME_META, OUTCOME_ORDER, outcomeOf, prettyResult, type OutcomeKey } from "@/lib/manager-home/outcomes";
import { formatDuration, formatInt } from "@/lib/stats/format";
import { periodParams, type StatsState } from "@/lib/stats/period";
import type { StatsOverview } from "@/lib/stats/types";
import { Panel } from "./shared";

const PAGE_SIZE = 25;

interface JournalItem {
    id: string;
    createdAt: string;
    sdrId: string;
    sdrName: string;
    contactName: string | null;
    contactTitle: string | null;
    companyName: string | null;
    missionName: string | null;
    result: string;
    duration: number | null;
    callbackDate: string | null;
    note: string | null;
}

interface JournalResponse {
    data: JournalItem[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
}

function useDebounced<T>(value: T, ms: number): T {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return v;
}

const dateTime = (iso: string) => {
    const d = new Date(iso);
    return {
        day: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" }),
        time: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }),
    };
};

export function JournalTab({
    overview,
    state,
    range,
    statusLabels,
    families,
    onFamiliesChange,
}: {
    overview: StatsOverview;
    state: StatsState;
    range: { start: string; end: string };
    statusLabels: Record<string, string>;
    families: OutcomeKey[];
    onFamiliesChange: (next: OutcomeKey[]) => void;
}) {
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState<string | null>(null);
    const q = useDebounced(search.trim(), 300);

    // Back to the first page whenever the question changes.
    useEffect(() => setPage(1), [q, families, state.sdrIds, state.missionIds, state.clientIds, state.listIds, range.start, range.end]);

    const counts = useMemo(() => {
        const out = Object.fromEntries(OUTCOME_ORDER.map((k) => [k, 0])) as Record<OutcomeKey, number>;
        for (const [code, n] of Object.entries(overview.current.byResult)) out[outcomeOf(code)] += n;
        return out;
    }, [overview.current.byResult]);

    const params = useMemo(() => {
        const p = periodParams(range, state);
        families.forEach((f) => p.append("families[]", f));
        if (q) p.set("q", q);
        p.set("page", String(page));
        p.set("limit", String(PAGE_SIZE));
        return p.toString();
    }, [range, state, families, q, page]);

    const query = useQuery({
        queryKey: ["stats", "journal", params],
        queryFn: async () => {
            const res = await fetch(`/api/analytics/actions?${params}`);
            const json = await res.json();
            if (!json.success) throw new Error(json.error ?? "Erreur");
            return json as JournalResponse;
        },
        placeholderData: keepPreviousData,
        staleTime: 30_000,
    });

    const rows = query.data?.data ?? [];
    const total = query.data?.pagination.total ?? 0;
    const pages = query.data?.pagination.totalPages ?? 1;
    const toggle = (f: OutcomeKey) => onFamiliesChange(families.includes(f) ? families.filter((x) => x !== f) : [...families, f]);

    return (
        <Panel title="Journal des appels" subtitle="Chaque appel de la période, avec son résultat et sa note" bodyClassName="px-0 sm:px-0 pb-0 sm:pb-0">
            <div className="space-y-3 px-5 pb-4 sm:px-6">
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer par résultat">
                    <button
                        type="button"
                        onClick={() => onFamiliesChange([])}
                        aria-pressed={families.length === 0}
                        className={cn(
                            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors", FOCUS,
                            families.length === 0 ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-surface-2",
                        )}
                    >
                        Tous <span className="tabular-nums opacity-70">{formatInt(overview.current.calls)}</span>
                    </button>
                    {OUTCOME_ORDER.filter((k) => counts[k] > 0).map((k) => {
                        const active = families.includes(k);
                        return (
                            <button
                                key={k}
                                type="button"
                                onClick={() => toggle(k)}
                                aria-pressed={active}
                                className={cn(
                                    "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-bold transition-colors", FOCUS,
                                    active ? "border-primary-300 bg-primary-50 text-primary-700" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-surface-2",
                                )}
                            >
                                <span className="size-2 rounded-sm" style={{ background: OUTCOME_META[k].color }} aria-hidden />
                                {OUTCOME_META[k].label}
                                <span className="tabular-nums text-ink-4">{formatInt(counts[k])}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="relative max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" aria-hidden />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Rechercher un contact, une société, une note…"
                        aria-label="Rechercher dans le journal"
                        className="h-9 w-full rounded-control border border-line bg-surface pl-9 pr-8 text-[13px] text-ink shadow-2xs placeholder:text-ink-4 hover:border-line-strong focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/15"
                    />
                    {search && (
                        <button type="button" onClick={() => setSearch("")} aria-label="Effacer la recherche" className={cn("absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-4 hover:text-ink", FOCUS)}>
                            <X className="size-3.5" aria-hidden />
                        </button>
                    )}
                </div>
            </div>

            {query.isError ? (
                <p className="px-6 py-10 text-center text-[13px] font-medium text-danger-ink">Impossible de charger le journal.</p>
            ) : !query.data ? (
                <div className="space-y-px" aria-busy>{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 animate-pulse bg-surface-2/70" />)}</div>
            ) : rows.length === 0 ? (
                <div className="px-6 pb-6"><EmptyBlock tone="slate" compact title="Aucun appel ne correspond" hint="Changez le filtre de résultat ou la recherche." /></div>
            ) : (
                <div className={cn("overflow-x-auto transition-opacity", query.isFetching && "opacity-60")}>
                    <table className="w-full min-w-[820px] border-collapse text-[13px]">
                        <thead>
                            <tr className="border-y border-line-subtle bg-surface-2/60 text-left text-[11px] font-bold uppercase tracking-wider text-ink-4">
                                <th scope="col" className="w-[104px] px-5 py-2.5 sm:pl-6">Date</th>
                                <th scope="col" className="px-3 py-2.5">SDR</th>
                                <th scope="col" className="px-3 py-2.5">Contact</th>
                                <th scope="col" className="px-3 py-2.5">Mission</th>
                                <th scope="col" className="px-3 py-2.5">Résultat</th>
                                <th scope="col" className="px-3 py-2.5 text-right">Durée</th>
                                <th scope="col" className="w-9 px-3 py-2.5"><span className="sr-only">Détails</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line-subtle">
                            {rows.map((r) => {
                                const dt = dateTime(r.createdAt);
                                const isOpen = open === r.id;
                                const family = outcomeOf(r.result);
                                return (
                                    <FragmentRow key={r.id}>
                                        <tr className={cn("transition-colors hover:bg-surface-2/60", isOpen && "bg-surface-2/60")}>
                                            <td className="px-5 py-3 align-top sm:pl-6">
                                                <span className="block font-bold tabular-nums text-ink">{dt.time}</span>
                                                <span className="block text-[11px] font-medium text-ink-4">{dt.day}</span>
                                            </td>
                                            <td className="px-3 py-3 align-top font-semibold text-ink-2">{r.sdrName}</td>
                                            <td className="max-w-[260px] px-3 py-3 align-top">
                                                <span className="block truncate font-bold text-ink">{r.contactName || r.companyName || "Contact inconnu"}</span>
                                                <span className="block truncate text-[11px] font-medium text-ink-3">
                                                    {[r.contactName ? r.companyName : null, r.contactTitle].filter(Boolean).join(" · ") || " "}
                                                </span>
                                            </td>
                                            <td className="max-w-[180px] truncate px-3 py-3 align-top text-ink-2">{r.missionName ?? "—"}</td>
                                            <td className="px-3 py-3 align-top">
                                                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-bold text-ink-2 shadow-2xs">
                                                    <span className="size-2 rounded-sm" style={{ background: OUTCOME_META[family].color }} aria-hidden />
                                                    {prettyResult(r.result, statusLabels)}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-right align-top font-semibold tabular-nums text-ink-2">{r.duration ? formatDuration(r.duration) : <span className="text-ink-4">—</span>}</td>
                                            <td className="px-3 py-3 align-top">
                                                {r.note ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpen(isOpen ? null : r.id)}
                                                        aria-expanded={isOpen}
                                                        aria-label={isOpen ? "Masquer la note" : "Voir la note"}
                                                        className={cn("rounded p-1 text-ink-4 transition-colors hover:text-ink", FOCUS)}
                                                    >
                                                        <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} aria-hidden />
                                                    </button>
                                                ) : null}
                                            </td>
                                        </tr>
                                        {isOpen && r.note && (
                                            <tr className="bg-surface-2/60">
                                                <td />
                                                <td colSpan={6} className="px-3 pb-4 pt-0">
                                                    <p className="max-w-3xl whitespace-pre-wrap rounded-panel border border-line bg-surface px-4 py-3 text-[13px] leading-relaxed text-ink-2">{r.note}</p>
                                                </td>
                                            </tr>
                                        )}
                                    </FragmentRow>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {query.data && total > 0 && (
                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle px-5 py-3 sm:px-6">
                    <p className="text-xs font-semibold tabular-nums text-ink-3">
                        {formatInt((page - 1) * PAGE_SIZE + 1)}–{formatInt(Math.min(page * PAGE_SIZE, total))} sur {formatInt(total)}
                    </p>
                    <div className="flex items-center gap-1.5">
                        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Page précédente" className={cn("inline-flex size-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 shadow-2xs transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40", FOCUS)}>
                            <ChevronLeft className="size-4" aria-hidden />
                        </button>
                        <span className="min-w-[64px] text-center text-xs font-bold tabular-nums text-ink-2">{page} / {formatInt(pages)}</span>
                        <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Page suivante" className={cn("inline-flex size-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 shadow-2xs transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40", FOCUS)}>
                            <ChevronRight className="size-4" aria-hidden />
                        </button>
                    </div>
                </footer>
            )}
        </Panel>
    );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
