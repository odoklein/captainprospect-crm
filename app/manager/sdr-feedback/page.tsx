"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { FOCUS_RING } from "@/components/ui/recipes";
import {
    FilterSelect,
    HubHeader,
    Metric,
    MetricPlaceholder,
    MetricStrip,
    Panel,
    PanelMessage,
    PanelToolbar,
    RefreshBar,
    SearchField,
    SkeletonRows,
    TextButton,
    ToolbarScroller,
    useSlashFocus,
} from "@/components/hr/HubUI";
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

type SortBy = "submittedAt" | "sdr";

const PRESETS = [
    { days: 0, label: "Aujourd’hui" },
    { days: 7, label: "7 j" },
    { days: 14, label: "14 j" },
    { days: 30, label: "30 j" },
];

function toInputDate(value: Date): string {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const dd = String(value.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function daysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return toInputDate(d);
}

function formatShortDate(key: string): string {
    return new Date(`${key}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Heading of a day group: "Aujourd’hui", "Hier", then the weekday and date. */
function dayHeading(key: string): string {
    if (key === toInputDate(new Date())) return "Aujourd’hui";
    if (key === daysAgo(1)) return "Hier";
    const label = new Date(`${key}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function missionNames(item: FeedbackItem): string {
    return item.missions?.length ? item.missions.map((m) => m.mission.name).join(", ") : item.mission?.name ?? "Aucune mission";
}

export default function ManagerSdrFeedbackPage() {
    const [items, setItems] = useState<FeedbackItem[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [from, setFrom] = useState(() => daysAgo(7));
    const [to, setTo] = useState(() => toInputDate(new Date()));
    const [selectedSdrId, setSelectedSdrId] = useState("all");
    const [selectedBlocker, setSelectedBlocker] = useState("all");
    const [commentFilter, setCommentFilter] = useState("all");
    const [sortBy, setSortBy] = useState<SortBy>("submittedAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const searchRef = useRef<HTMLInputElement>(null);

    useSlashFocus(searchRef);

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
            setLoaded(true);
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

    // The SDR list must not shrink to the one chosen: keep every name seen.
    const [knownSdrs, setKnownSdrs] = useState<Map<string, FeedbackItem["sdr"]>>(new Map());
    useEffect(() => {
        if (!items.length) return;
        setKnownSdrs((prev) => {
            const next = new Map(prev);
            items.forEach((item) => next.set(item.sdr.id, item.sdr));
            return next.size === prev.size ? prev : next;
        });
    }, [items]);
    const sdrOptions = useMemo(
        () => Array.from(knownSdrs.values()).sort((a, b) => a.name.localeCompare(b.name, "fr")),
        [knownSdrs],
    );

    const stats = useMemo(
        () => ({
            total: items.length,
            sdrs: new Set(items.map((item) => item.sdr.id)).size,
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

    // Daily reports read best by day; sorted by SDR they group by person.
    const groups = useMemo(() => {
        const out: { key: string; label: string; items: FeedbackItem[] }[] = [];
        for (const item of paginatedItems) {
            const key = sortBy === "sdr" ? item.sdr.id : toInputDate(new Date(item.submittedAt));
            const last = out[out.length - 1];
            if (last && last.key === key) last.items.push(item);
            else out.push({ key, label: sortBy === "sdr" ? item.sdr.name : dayHeading(key), items: [item] });
        }
        return out;
    }, [paginatedItems, sortBy]);

    const today = toInputDate(new Date());
    const activePreset = to === today ? PRESETS.find((p) => from === (p.days === 0 ? today : daysAgo(p.days))) : undefined;
    const setLastDays = (days: number) => {
        setFrom(days === 0 ? today : daysAgo(days));
        setTo(today);
        setPage(1);
    };

    const filtersActive = search !== "" || selectedSdrId !== "all" || selectedBlocker !== "all" || commentFilter !== "all";
    const resetFilters = () => {
        setSearch("");
        setSelectedSdrId("all");
        setSelectedBlocker("all");
        setCommentFilter("all");
    };

    const period = from === to ? `Le ${formatShortDate(from)}` : `Du ${formatShortDate(from)} au ${formatShortDate(to)}`;
    const finding = !loaded
        ? error
            ? "Les retours n’ont pas pu être chargés."
            : "Chargement des retours…"
        : stats.total === 0
        ? `${period} · aucun retour`
        : `${period} · ${stats.total} retour${stats.total > 1 ? "s" : ""} de ${stats.sdrs} SDR`;

    const firstRow = (page - 1) * pageSize + 1;
    const lastRow = Math.min(items.length, page * pageSize);

    return (
        <div className="space-y-4 pb-2">
            <HubHeader
                title="Avis SDR"
                finding={finding}
                actions={
                    <>
                        <SegmentedControl<string>
                            size="sm"
                            ariaLabel="Période"
                            value={activePreset ? String(activePreset.days) : ""}
                            onChange={(v) => setLastDays(Number(v))}
                            options={PRESETS.map((p) => ({ value: String(p.days), label: p.label, ariaLabel: p.days ? `${p.days} derniers jours` : "Aujourd’hui" }))}
                        />
                        <div className="flex h-9 items-center rounded-[10px] border border-line bg-surface text-[13px] text-ink-2 focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-500/12">
                            <label className="sr-only" htmlFor="avis-from">Du</label>
                            <input
                                id="avis-from"
                                type="date"
                                value={from}
                                max={to}
                                onChange={(e) => {
                                    setFrom(e.target.value);
                                    setPage(1);
                                }}
                                className="h-full rounded-l-[10px] bg-transparent pl-3 pr-1 tabular-nums focus:outline-none"
                            />
                            <span className="px-1 text-ink-4" aria-hidden>→</span>
                            <label className="sr-only" htmlFor="avis-to">Au</label>
                            <input
                                id="avis-to"
                                type="date"
                                value={to}
                                min={from}
                                onChange={(e) => {
                                    setTo(e.target.value);
                                    setPage(1);
                                }}
                                className="h-full rounded-r-[10px] bg-transparent pl-1 pr-3 tabular-nums focus:outline-none"
                            />
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void load()}
                            aria-label="Actualiser"
                            title="Actualiser"
                            className="w-9 px-0"
                        >
                            <RefreshCw className={cn("size-4", loading && loaded && "animate-spin")} />
                        </Button>
                    </>
                }
            />

            <MetricStrip>
                <Metric lead label="Retours" value={loaded ? stats.total : error ? <span className="text-ink-4">—</span> : <MetricPlaceholder />} hint={loaded ? `${stats.sdrs} SDR sur la période` : undefined} />
                <Metric
                    label="Frein principal n°1"
                    value={
                        stats.topBlocker ? (
                            <span className="block max-w-full truncate text-[19px] leading-7">{labelOf(MAIN_BLOCKER_LABELS, stats.topBlocker.code)}</span>
                        ) : loaded || error ? (
                            <span className="text-ink-4">—</span>
                        ) : (
                            <MetricPlaceholder wide />
                        )
                    }
                    unit={stats.topBlocker ? `${stats.topBlocker.count}/${stats.total}` : undefined}
                    onClick={stats.topBlocker ? () => setSelectedBlocker(selectedBlocker === stats.topBlocker!.code ? "all" : stats.topBlocker!.code) : undefined}
                    pressed={!!stats.topBlocker && selectedBlocker === stats.topBlocker.code}
                    hint={stats.topBlocker ? (selectedBlocker === stats.topBlocker.code ? "Filtre actif : cliquez pour tout afficher" : "Cliquez pour ne voir que ces retours") : undefined}
                />
                <Metric
                    label="Joignabilité difficile"
                    value={stats.reachabilityShare !== null ? stats.reachabilityShare : loaded || error ? <span className="text-ink-4">—</span> : <MetricPlaceholder />}
                    unit={stats.reachabilityShare === null ? undefined : "%"}
                    tone={stats.reachabilityShare !== null && stats.reachabilityShare >= 50 ? "warning" : "neutral"}
                    hint={loaded ? "des retours signalent au moins une difficulté" : undefined}
                />
                <Metric
                    label="Avec commentaire terrain"
                    value={loaded ? stats.comments : error ? <span className="text-ink-4">—</span> : <MetricPlaceholder />}
                    onClick={() => setCommentFilter(commentFilter === "true" ? "all" : "true")}
                    pressed={commentFilter === "true"}
                    hint={!loaded ? undefined : commentFilter === "true" ? "Filtre actif : cliquez pour tout afficher" : "Cliquez pour ne lire que ceux-là"}
                />
            </MetricStrip>

            <Panel>
                <RefreshBar active={loading && loaded} />
                <PanelToolbar>
                    <SearchField ref={searchRef} value={search} onChange={setSearch} placeholder="Commentaire, mission, SDR…" />
                    <ToolbarScroller>
                        <FilterSelect label="SDR" value={selectedSdrId} onChange={setSelectedSdrId} active={selectedSdrId !== "all"}>
                            <option value="all">Tous les SDR</option>
                            {sdrOptions.map((sdr) => (
                                <option key={sdr.id} value={sdr.id}>
                                    {sdr.name}
                                </option>
                            ))}
                        </FilterSelect>
                        <FilterSelect label="Principal frein" value={selectedBlocker} onChange={setSelectedBlocker} active={selectedBlocker !== "all"}>
                            <option value="all">Tous les freins</option>
                            {MAIN_BLOCKER_VALUES.map((code) => (
                                <option key={code} value={code}>
                                    {MAIN_BLOCKER_LABELS[code]}
                                </option>
                            ))}
                        </FilterSelect>
                        <FilterSelect label="Commentaire" value={commentFilter} onChange={setCommentFilter} active={commentFilter !== "all"}>
                            <option value="all">Avec ou sans commentaire</option>
                            <option value="true">Avec commentaire</option>
                            <option value="false">Sans commentaire</option>
                        </FilterSelect>
                        {filtersActive && <TextButton onClick={resetFilters}>Réinitialiser</TextButton>}
                        <div className="flex items-center gap-2 sm:ml-auto">
                            <FilterSelect label="Trier par" value={sortBy} onChange={(v) => setSortBy(v as SortBy)}>
                                <option value="submittedAt">Par jour</option>
                                <option value="sdr">Par SDR</option>
                            </FilterSelect>
                            <button
                                type="button"
                                onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
                                className={cn(
                                    "inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink",
                                    FOCUS_RING,
                                )}
                            >
                                {sortOrder === "desc" ? <ArrowDownWideNarrow className="size-4" /> : <ArrowUpNarrowWide className="size-4" />}
                                {sortBy === "sdr" ? (sortOrder === "asc" ? "A → Z" : "Z → A") : sortOrder === "desc" ? "Récents d’abord" : "Anciens d’abord"}
                            </button>
                        </div>
                    </ToolbarScroller>
                </PanelToolbar>

                {!loaded && loading ? (
                    <SkeletonRows rows={5} columns={[16, 30, 26]} pitch="py-6" />
                ) : error ? (
                    <PanelMessage tone="error" action={<TextButton onClick={() => void load()}>Réessayer</TextButton>}>
                        {error}
                    </PanelMessage>
                ) : items.length === 0 ? (
                    <PanelMessage
                        action={
                            filtersActive ? (
                                <TextButton onClick={resetFilters}>Réinitialiser les filtres</TextButton>
                            ) : activePreset?.days !== 30 ? (
                                <TextButton onClick={() => setLastDays(30)}>Voir les 30 derniers jours</TextButton>
                            ) : undefined
                        }
                    >
                        {filtersActive ? "Aucun retour ne correspond à ces filtres." : "Aucun retour sur cette période."}
                    </PanelMessage>
                ) : (
                    <div className={cn("transition-opacity duration-150", loading && "opacity-60")}>
                        {/* Column legend, desktop only */}
                        <div className="hidden grid-cols-[220px_minmax(0,1fr)_minmax(0,0.9fr)] gap-x-8 border-b border-line-subtle px-5 py-2.5 text-xs font-medium text-ink-3 lg:grid">
                            <span>SDR</span>
                            <span>Réponses du jour</span>
                            <span>Commentaire terrain</span>
                        </div>
                        {groups.map((group) => (
                            <section key={group.key} aria-label={group.label}>
                                <h2 className="flex items-baseline gap-2 border-b border-line-subtle bg-surface-2 px-5 py-2 text-[13px] font-semibold text-ink">
                                    {group.label}
                                    <span className="text-xs font-normal tabular-nums text-ink-3">
                                        {group.items.length} retour{group.items.length > 1 ? "s" : ""}
                                    </span>
                                </h2>
                                <ul>
                                    {group.items.map((item) => (
                                        <ReportRow key={item.id} item={item} showDate={sortBy === "sdr"} />
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}

                {!error && items.length > 25 ? (
                    <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 text-[13px]">
                        <span className="tabular-nums text-ink-3">
                            {firstRow}–{lastRow} sur {items.length}
                        </span>
                        <FilterSelect
                            label="Lignes par page"
                            value={String(pageSize)}
                            onChange={(v) => {
                                setPageSize(Number(v));
                                setPage(1);
                            }}
                        >
                            {[25, 50, 100].map((size) => (
                                <option key={size} value={size}>
                                    {size} par page
                                </option>
                            ))}
                        </FilterSelect>
                        <div className="ml-auto flex items-center gap-2">
                            <Button variant="secondary" size="xs" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                                Précédent
                            </Button>
                            <span className="tabular-nums text-ink-2">
                                Page {page} / {totalPages}
                            </span>
                            <Button variant="secondary" size="xs" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                                Suivant
                            </Button>
                        </div>
                    </div>
                ) : null}
            </Panel>
        </div>
    );
}

function Answer({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-3">
            <dt className="pt-0.5 text-xs text-ink-3">{label}</dt>
            <dd className="min-w-0">{children}</dd>
        </div>
    );
}

function ReportRow({ item, showDate }: { item: FeedbackItem; showDate: boolean }) {
    const submitted = new Date(item.submittedAt);
    const time = submitted.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const when = showDate ? `${submitted.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · ${time}` : time;
    return (
        <li className="grid grid-cols-1 gap-x-8 gap-y-4 border-b border-line-subtle px-5 py-4 last:border-b-0 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,0.9fr)]">
            <div className="flex min-w-0 items-start gap-3">
                <Avatar name={item.sdr.name} size="sm" shape="circle" />
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink" title={item.sdr.email}>
                        {item.sdr.name}
                    </p>
                    <p className="text-xs tabular-nums text-ink-3" title={submitted.toLocaleString("fr-FR")}>
                        {when}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-ink-2">{missionNames(item)}</p>
                </div>
            </div>

            <dl className="space-y-2 text-[12px]">
                <Answer label="Principal frein">
                    <BlockerChip code={item.mainBlocker} />
                </Answer>
                <Answer label="Joignabilité">
                    <ChipList codes={item.reachability} labels={REACHABILITY_LABELS} />
                </Answer>
                <Answer label="Retours prospects">
                    <ChipList codes={item.prospectReturns} labels={PROSPECT_RETURN_LABELS} />
                </Answer>
                <Answer label="Discours">
                    <ChipList codes={item.pitchFeeling} labels={PITCH_FEELING_LABELS} />
                </Answer>
            </dl>

            <div className="min-w-0 text-[13px] leading-relaxed">
                {item.fieldComment ? (
                    <p className="whitespace-pre-wrap text-ink-2">{item.fieldComment}</p>
                ) : item.review ? (
                    // report sent before the structured form
                    <div className="space-y-1.5 text-ink-2">
                        {item.score != null ? (
                            <span className="inline-flex h-[22px] items-center rounded-full border border-line bg-surface-2 px-2 text-xs font-medium text-ink-2">
                                Ancien format · {item.score}/5
                            </span>
                        ) : null}
                        <p className="whitespace-pre-wrap text-ink">{item.review}</p>
                        {item.objections ? <p>Objections : {item.objections}</p> : null}
                        {item.missionComment ? <p>Mission : {item.missionComment}</p> : null}
                    </div>
                ) : (
                    <p className="text-ink-4">Pas de commentaire</p>
                )}
            </div>
        </li>
    );
}
