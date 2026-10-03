"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Loader2, MessageSquare, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import {
    BlockerChip,
    ChipList,
    reportComment,
    type DailyReportLike,
} from "@/components/sdr/DailyReportView";
import {
    MAIN_BLOCKER_LABELS,
    MAIN_BLOCKER_VALUES,
    PITCH_FEELING_LABELS,
    PROSPECT_RETURN_LABELS,
    REACHABILITY_LABELS,
    labelOf,
} from "@/lib/sdr-daily-report/options";
import { difficultReachabilityShare, topBlocker } from "@/lib/sdr-daily-report/stats";

type FeedbackItem = DailyReportLike & {
    id: string;
    pagePath: string | null;
    submittedAt: string;
    sdr: {
        id: string;
        name: string;
        email: string;
    };
    mission: {
        id: string;
        name: string;
    } | null;
    missions: Array<{
        mission: {
            id: string;
            name: string;
        };
    }>;
};

function toInputDate(value: Date): string {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const dd = String(value.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

export default function ManagerSdrFeedbackPage() {
    const [items, setItems] = useState<FeedbackItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [from, setFrom] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return toInputDate(d);
    });
    const [to, setTo] = useState(() => toInputDate(new Date()));
    const [selectedSdrId, setSelectedSdrId] = useState("all");
    const [selectedBlocker, setSelectedBlocker] = useState("all");
    const [commentFilter, setCommentFilter] = useState("all");
    const [sortBy, setSortBy] = useState<"submittedAt" | "sdr">("submittedAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setDebouncedSearch(search.trim());
            setPage(1);
        }, 280);
        return () => window.clearTimeout(timeout);
    }, [search]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ from, to, limit: "500", sortBy, sortOrder });
            if (debouncedSearch) params.set("search", debouncedSearch);
            if (selectedSdrId !== "all") params.set("sdrId", selectedSdrId);
            if (selectedBlocker !== "all") params.set("blocker", selectedBlocker);
            if (commentFilter !== "all") params.set("withComment", commentFilter);
            const res = await fetch(`/api/manager/sdr-feedback?${params.toString()}`);
            const json = await res.json();
            if (!json.success) {
                setError(json.error ?? "Impossible de charger les avis SDR");
                setItems([]);
                return;
            }
            setItems(json.data as FeedbackItem[]);
        } catch {
            setError("Erreur réseau");
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [from, to, debouncedSearch, selectedSdrId, selectedBlocker, commentFilter, sortBy, sortOrder]);

    useEffect(() => {
        void load();
    }, [load]);

    const sdrOptions = useMemo(
        () =>
            Array.from(new Map(items.map((item) => [item.sdr.id, item.sdr])).values()).sort((a, b) =>
                a.name.localeCompare(b.name, "fr"),
            ),
        [items],
    );

    const stats = useMemo(
        () => ({
            total: items.length,
            topBlocker: topBlocker(items),
            reachabilityShare: difficultReachabilityShare(items),
            comments: items.filter((item) => !!reportComment(item)).length,
        }),
        [items],
    );

    const totalPages = useMemo(() => Math.max(1, Math.ceil(items.length / pageSize)), [items.length, pageSize]);
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * pageSize;
        return items.slice(start, start + pageSize);
    }, [items, page, pageSize]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const setLastDays = (days: number) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        setFrom(toInputDate(start));
        setTo(toInputDate(end));
        setPage(1);
    };

    return (
        <div className="min-h-full bg-surface-3 p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-[22px] font-bold text-ink tracking-tight">
                        Avis SDR
                    </h1>
                    <p className="text-[13px] text-ink-3 mt-0.5">
                        Retour de fin de journée de chaque SDR : joignabilité, retours prospects, discours et principal frein.
                    </p>
                </div>
                <div className="flex items-end gap-2">
                    <div>
                        <label className="block text-[11px] text-ink-3 mb-1">Du</label>
                        <input
                            type="date"
                            value={from}
                            onChange={(e) => setFrom(e.target.value)}
                            className="h-9 px-2.5 rounded-lg border border-line text-[12px] bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] text-ink-3 mb-1">Au</label>
                        <input
                            type="date"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            className="h-9 px-2.5 rounded-lg border border-line text-[12px] bg-white"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="h-9 px-3 rounded-lg bg-primary text-white text-[12px] font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Actualiser
                    </button>
                </div>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
                {[1, 7, 14, 30].map((days) => (
                    <button
                        key={days}
                        type="button"
                        onClick={() => setLastDays(days)}
                        className="h-8 px-3 rounded-lg border border-line bg-white text-[12px] text-ink-2 hover:bg-surface-2"
                    >
                        {days === 1 ? "Aujourd'hui" : `${days} derniers jours`}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
                <div className="rounded-xl border border-line bg-white p-4">
                    <p className="text-[11px] text-ink-3">Total retours</p>
                    <p className="text-[24px] font-bold text-ink">{stats.total}</p>
                </div>
                <div className="rounded-xl border border-line bg-white p-4">
                    <p className="text-[11px] text-ink-3">Frein principal n°1</p>
                    {stats.topBlocker ? (
                        <p className="text-[18px] font-bold text-ink leading-tight mt-1">
                            {labelOf(MAIN_BLOCKER_LABELS, stats.topBlocker.code)}
                            <span className="ml-1.5 text-[12px] font-medium text-ink-3">
                                {stats.topBlocker.count}/{stats.total}
                            </span>
                        </p>
                    ) : (
                        <p className="text-[24px] font-bold text-ink-4">—</p>
                    )}
                </div>
                <div className="rounded-xl border border-line bg-white p-4">
                    <p className="text-[11px] text-ink-3">Joignabilité difficile</p>
                    <p className="text-[24px] font-bold text-ink">
                        {stats.reachabilityShare === null ? "—" : `${stats.reachabilityShare} %`}
                    </p>
                </div>
                <div className="rounded-xl border border-line bg-white p-4">
                    <p className="text-[11px] text-ink-3">Avec commentaire terrain</p>
                    <p className="text-[24px] font-bold text-ink">{stats.comments}</p>
                </div>
            </div>

            <div className="rounded-xl border border-line bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-line flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary-600" />
                    <h2 className="text-[14px] font-semibold text-ink">Derniers retours</h2>
                </div>
                <div className="px-4 py-3 border-b border-line bg-surface-2 space-y-3">
                    <div className="flex flex-wrap gap-2">
                        <div className="relative min-w-[220px] flex-1">
                            <Search className="w-3.5 h-3.5 text-ink-3 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Rechercher (commentaire, mission, SDR)..."
                                className="w-full h-9 pl-8 pr-3 rounded-lg border border-line text-[12px] bg-white"
                            />
                        </div>
                        <select
                            value={selectedSdrId}
                            onChange={(e) => setSelectedSdrId(e.target.value)}
                            className="h-9 min-w-[170px] px-2.5 rounded-lg border border-line text-[12px] bg-white"
                        >
                            <option value="all">Tous les SDR</option>
                            {sdrOptions.map((sdr) => (
                                <option key={sdr.id} value={sdr.id}>
                                    {sdr.name}
                                </option>
                            ))}
                        </select>
                        <select
                            value={selectedBlocker}
                            onChange={(e) => setSelectedBlocker(e.target.value)}
                            className="h-9 min-w-[190px] px-2.5 rounded-lg border border-line text-[12px] bg-white"
                        >
                            <option value="all">Tous les freins</option>
                            {MAIN_BLOCKER_VALUES.map((code) => (
                                <option key={code} value={code}>
                                    {MAIN_BLOCKER_LABELS[code]}
                                </option>
                            ))}
                        </select>
                        <select
                            value={commentFilter}
                            onChange={(e) => setCommentFilter(e.target.value)}
                            className="h-9 min-w-[185px] px-2.5 rounded-lg border border-line text-[12px] bg-white"
                        >
                            <option value="all">Commentaire: tous</option>
                            <option value="true">Avec commentaire</option>
                            <option value="false">Sans commentaire</option>
                        </select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            Tri
                        </span>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as "submittedAt" | "sdr")}
                            className="h-8 px-2.5 rounded-lg border border-line text-[12px] bg-white"
                        >
                            <option value="submittedAt">Date</option>
                            <option value="sdr">SDR</option>
                        </select>
                        <button
                            type="button"
                            onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
                            className="h-8 px-2.5 rounded-lg border border-line text-[12px] bg-white inline-flex items-center gap-1 hover:bg-surface-2"
                        >
                            <ArrowUpDown className="w-3.5 h-3.5" />
                            {sortOrder === "asc" ? "Croissant" : "Décroissant"}
                        </button>
                        <span className="ml-auto text-[11px] text-ink-3">
                            {items.length} ligne(s) chargée(s)
                        </span>
                    </div>
                </div>

                {loading ? (
                    <div className="py-16 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                    </div>
                ) : error ? (
                    <div className="px-4 py-8 text-[13px] text-red-600">{error}</div>
                ) : items.length === 0 ? (
                    <div className="px-4 py-10 text-[13px] text-ink-3">
                        Aucun retour sur cette période.
                    </div>
                ) : (
                    <div className="overflow-auto">
                        <table className="w-full min-w-[1180px] text-left">
                            <thead className="bg-surface-2 border-b border-line-subtle sticky top-0 z-10">
                                <tr className="text-[11px] uppercase tracking-wide text-ink-3">
                                    <th className="px-4 py-2.5 font-semibold">Date</th>
                                    <th className="px-4 py-2.5 font-semibold">SDR</th>
                                    <th className="px-4 py-2.5 font-semibold">Missions</th>
                                    <th className="px-4 py-2.5 font-semibold">Joignabilité</th>
                                    <th className="px-4 py-2.5 font-semibold">Retours prospects</th>
                                    <th className="px-4 py-2.5 font-semibold">Discours</th>
                                    <th className="px-4 py-2.5 font-semibold">Principal frein</th>
                                    <th className="px-4 py-2.5 font-semibold">Commentaire</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedItems.map((item) => (
                                    <tr key={item.id} className="border-b border-line-subtle align-top">
                                        <td className="px-4 py-3 text-[12px] text-ink-2 whitespace-nowrap">
                                            {new Date(item.submittedAt).toLocaleString("fr-FR")}
                                        </td>
                                        <td className="px-4 py-3 text-[12px]">
                                            <p className="font-semibold text-ink">{item.sdr.name}</p>
                                            <p className="text-ink-3">{item.sdr.email}</p>
                                        </td>
                                        <td className="px-4 py-3 text-[12px] text-ink-2">
                                            {item.missions?.length
                                                ? item.missions.map((m) => m.mission.name).join(", ")
                                                : item.mission?.name ?? "Aucune"}
                                        </td>
                                        <td className="px-4 py-3 text-[12px] max-w-[220px]">
                                            <ChipList codes={item.reachability} labels={REACHABILITY_LABELS} />
                                        </td>
                                        <td className="px-4 py-3 text-[12px] max-w-[220px]">
                                            <ChipList codes={item.prospectReturns} labels={PROSPECT_RETURN_LABELS} />
                                        </td>
                                        <td className="px-4 py-3 text-[12px] max-w-[220px]">
                                            <ChipList codes={item.pitchFeeling} labels={PITCH_FEELING_LABELS} />
                                        </td>
                                        <td className="px-4 py-3 text-[12px]">
                                            <BlockerChip code={item.mainBlocker} />
                                        </td>
                                        <td className="px-4 py-3 text-[12px] text-ink-2 whitespace-pre-wrap max-w-[280px]">
                                            {item.fieldComment ? (
                                                item.fieldComment
                                            ) : item.review ? (
                                                // report sent before the structured form
                                                <>
                                                    {item.score != null ? (
                                                        <span className="mr-1.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                                            Ancien format · {item.score}/5
                                                        </span>
                                                    ) : null}
                                                    <span className="text-ink">{item.review}</span>
                                                    {item.objections ? (
                                                        <span className="block mt-1">Objections : {item.objections}</span>
                                                    ) : null}
                                                    {item.missionComment ? (
                                                        <span className="block mt-1">Mission : {item.missionComment}</span>
                                                    ) : null}
                                                </>
                                            ) : (
                                                "—"
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {!loading && !error && items.length > 0 ? (
                    <div className="px-4 py-3 border-t border-line bg-white flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                            <label className="text-[12px] text-ink-3">Lignes / page</label>
                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setPage(1);
                                }}
                                className="h-8 px-2 rounded-lg border border-line text-[12px] bg-white"
                            >
                                {[25, 50, 100].map((size) => (
                                    <option key={size} value={size}>
                                        {size}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="h-8 px-3 rounded-lg border border-line text-[12px] disabled:opacity-40"
                            >
                                Precedent
                            </button>
                            <span className="text-[12px] text-ink-2">
                                Page {page} / {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="h-8 px-3 rounded-lg border border-line text-[12px] disabled:opacity-40"
                            >
                                Suivant
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
