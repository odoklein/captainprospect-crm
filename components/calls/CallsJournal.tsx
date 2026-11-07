"use client";

// ============================================
// CALLS JOURNAL — every call of the team (manager) or of one SDR (« Mes appels»), with the status the SDR logged,
// its duration, recording, AI summary and transcript.
//
// Filters live in the URL (bookmarkable, shareable). Facets come from the
// API with the other filters applied, so counts always add up. Two views:
// the journal, and integrated-phone calls nobody qualified (the process gap).
// ============================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Headphones, Mic, PhoneCall, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { Kbd } from "@/components/ui";
import { cn } from "@/lib/utils";
import { activeFilterCount, journalQuery, parseJournalFilters, todayParis, type JournalFilters } from "@/lib/calls-journal/filters";
import type { JournalResponse, JournalRow } from "@/lib/calls-journal/types";
import { TELEPHONY_STATUS_LABELS, isFinalStatus } from "@/lib/telephony/status";
import { formatDuration, formatPhone } from "@/components/incoming-calls/useIncomingCalls";
import { StatusLabel } from "@/components/calls/StatusLabel";
import { StatusDistribution } from "@/components/calls/StatusDistribution";
import { CallDetailDrawer } from "@/components/calls/CallDetailDrawer";
import { useCountUp } from "@/components/calls/useCountUp";

// ── period presets (Paris days) ─────────────────────────────────────────────

function shiftDay(day: string, delta: number): string {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
}

function presets(today: string) {
    return [
        { id: "today", label: "Aujourd'hui", start: today, end: today },
        { id: "yesterday", label: "Hier", start: shiftDay(today, -1), end: shiftDay(today, -1) },
        { id: "7d", label: "7 jours", start: shiftDay(today, -6), end: today },
        { id: "30d", label: "30 jours", start: shiftDay(today, -29), end: today },
    ];
}

function hms(sec: number): string {
    if (sec < 60) return `${sec} s`;
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

// ════════════════════════════════════════════════════════════════════════════

export interface CallsJournalProps {
    /** team = every SDR (manager); mine = the signed-in SDR only. */
    scope: "team" | "mine";
    /** List endpoint; the detail endpoint is `${apiBase}/[id]`. */
    apiBase: string;
    title: string;
    subtitle: string;
    headerActions?: React.ReactNode;
    /** Shown on rows without a status (scope mine): qualify that exact call. */
    onQualify?: (row: JournalRow) => void;
    /** Bump to reload the list (after a call was qualified). */
    refreshKey?: number;
}

export function CallsJournal(props: CallsJournalProps) {
    return (
        <Suspense fallback={null}>
            <Journal {...props} />
        </Suspense>
    );
}

function Journal({ scope, apiBase, title, subtitle, headerActions, onQualify, refreshKey = 0 }: CallsJournalProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const filters = useMemo<JournalFilters>(() => {
        const parsed = parseJournalFilters(new URLSearchParams(searchParams.toString()));
        return parsed.ok ? parsed.filters : (parseJournalFilters(new URLSearchParams()) as { ok: true; filters: JournalFilters }).filters;
    }, [searchParams]);

    const setFilters = useCallback(
        (patch: Partial<JournalFilters>, opts: { keepPage?: boolean } = {}) => {
            const next = { ...filters, ...patch, page: opts.keepPage ? patch.page ?? filters.page : patch.page ?? 1 };
            router.replace(`${pathname}?${journalQuery(next)}`, { scroll: false });
        },
        [filters, pathname, router],
    );

    // ── data ───────────────────────────────────────────────────────────────
    const [data, setData] = useState<JournalResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    // The query the data on screen answers; while it differs, the next one is loading
    // and the previous results stay visible (dimmed) instead of flashing empty.
    const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
    const query = journalQuery(filters);
    const requestKey = `${query}#${refreshKey}`;
    const loading = loadedQuery !== requestKey;

    useEffect(() => {
        const ctrl = new AbortController();
        fetch(`${apiBase}?${query}`, { signal: ctrl.signal })
            .then((r) => r.json())
            .then((json) => {
                if (json?.success) {
                    setData(json.data);
                    setError(null);
                } else setError(json?.error ?? "Chargement impossible");
                setLoadedQuery(requestKey);
            })
            .catch((e) => {
                if ((e as Error).name !== "AbortError") {
                    setError("Chargement impossible");
                    setLoadedQuery(requestKey);
                }
            });
        return () => ctrl.abort();
    }, [query, apiBase, requestKey]);

    // ── search (debounced into the URL) ────────────────────────────────────
    const [q, setQ] = useState(filters.q);
    const [urlQ, setUrlQ] = useState(filters.q);
    const searchRef = useRef<HTMLInputElement>(null);
    // The URL changed the search (back button, reset): follow it.
    if (filters.q !== urlQ) {
        setUrlQ(filters.q);
        setQ(filters.q);
    }
    useEffect(() => {
        if (q === filters.q) return;
        const t = setTimeout(() => setFilters({ q: q.trim() }), 300);
        return () => clearTimeout(t);
    }, [q, filters.q, setFilters]);

    // ── selection & detail ─────────────────────────────────────────────────
    const [cursor, setCursor] = useState(0);
    const [cursorQuery, setCursorQuery] = useState(query);
    const [open, setOpen] = useState<{ id: string; kind: "action" | "call" } | null>(null);
    const rows = useMemo(() => data?.rows ?? [], [data]);
    // A new filter set starts the keyboard cursor back on the first row.
    if (cursorQuery !== query) {
        setCursorQuery(query);
        setCursor(0);
    }

    const statusMeta = useMemo(() => {
        const m = new Map<string, { label: string; color: string | null }>();
        for (const s of data?.facets.statuses ?? []) m.set(s.id, { label: s.label, color: s.color ?? null });
        return m;
    }, [data]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const el = e.target as HTMLElement | null;
            if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) {
                if (e.key === "Escape") el.blur();
                return;
            }
            if (open || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === "/") {
                e.preventDefault();
                searchRef.current?.focus();
            } else if ((e.key === "j" || e.key === "ArrowDown") && rows.length) {
                e.preventDefault();
                setCursor((c) => Math.min(rows.length - 1, c + 1));
            } else if ((e.key === "k" || e.key === "ArrowUp") && rows.length) {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
            } else if (e.key === "Enter" && rows[cursor]) {
                setOpen({ id: rows[cursor].id, kind: rows[cursor].kind });
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [rows, cursor, open]);

    useEffect(() => {
        document.querySelector(`[data-row="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
    }, [cursor]);

    // ── derived ────────────────────────────────────────────────────────────
    const today = todayParis();
    const periodPresets = presets(today);
    const activePreset = periodPresets.find((p) => p.start === filters.start && p.end === filters.end)?.id ?? "custom";
    const multiDay = filters.start !== filters.end;
    const unqualified = filters.view === "unqualified";
    const k = data?.kpis;
    const filtered = activeFilterCount(filters) > 0;
    const firstRow = data ? (data.page - 1) * data.limit + 1 : 0;
    const lastRow = data ? Math.min(data.total, data.page * data.limit) : 0;

    return (
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 pb-8">
            {/* ── Header ── */}
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
                    <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {headerActions}
                    <div className="flex rounded-control border border-line bg-surface p-0.5" role="radiogroup" aria-label="Période">
                        {periodPresets.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                role="radio"
                                aria-checked={activePreset === p.id}
                                onClick={() => setFilters({ start: p.start, end: p.end })}
                                className={cn(
                                    "cp-press h-7 rounded-[6px] px-2.5 text-[12px] font-medium transition-colors duration-200",
                                    activePreset === p.id ? "bg-ink text-surface" : "text-ink-2 hover:text-ink",
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <div className={cn("flex h-8 items-center gap-1 rounded-control border bg-surface px-2 text-[12px]", activePreset === "custom" ? "border-ink" : "border-line")}>
                        <input
                            type="date"
                            aria-label="Du"
                            value={filters.start}
                            max={filters.end}
                            onChange={(e) => e.target.value && setFilters({ start: e.target.value })}
                            className="bg-transparent text-ink-2 outline-none"
                        />
                        <span className="text-ink-4">→</span>
                        <input
                            type="date"
                            aria-label="Au"
                            value={filters.end}
                            min={filters.start}
                            max={today}
                            onChange={(e) => e.target.value && setFilters({ end: e.target.value })}
                            className="bg-transparent text-ink-2 outline-none"
                        />
                    </div>
                </div>
            </header>

            {/* ── View tabs ── */}
            <nav className="flex items-center gap-5 border-b border-line" aria-label="Vue">
                {(
                    [
                        ["journal", "Journal", data && !unqualified ? data.total : null],
                        ["unqualified", "Sans statut", data?.unqualified ?? null],
                    ] as const
                ).map(([id, label, count]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setFilters({ view: id, results: [] })}
                        aria-current={filters.view === id ? "page" : undefined}
                        className={cn(
                            "-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-[13px] font-medium transition-colors",
                            filters.view === id ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink",
                        )}
                    >
                        {label}
                        {count !== null && count > 0 && (
                            <span
                                className={cn(
                                    "rounded-full px-1.5 text-[11px] tabular-nums",
                                    id === "unqualified" ? "bg-warning-soft text-warning-ink" : "bg-surface-3 text-ink-2",
                                )}
                            >
                                {count}
                            </span>
                        )}
                    </button>
                ))}
            </nav>

            {/* ── Toolbar ── */}
            <div className="flex flex-wrap items-center gap-2">
                <label className="relative flex h-9 min-w-[260px] flex-1 items-center sm:max-w-[420px]">
                    <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-ink-3" aria-hidden />
                    <input
                        ref={searchRef}
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={unqualified ? "Numéro, ou un mot dit pendant l'appel…" : "Prospect, société, ou un mot dit pendant l'appel…"}
                        className="h-full w-full rounded-control border border-line bg-surface pl-8 pr-9 text-[13px] text-ink placeholder:text-ink-4 focus:border-ink focus:outline-none focus:ring-2 focus:ring-focus"
                        aria-label="Rechercher"
                    />
                    {q ? (
                        <button type="button" onClick={() => setQ("")} className="absolute right-2 text-ink-3 hover:text-ink" aria-label="Effacer la recherche">
                            <X className="h-4 w-4" />
                        </button>
                    ) : (
                        <Kbd className="absolute right-2">/</Kbd>
                    )}
                </label>

                {scope === "team" && (
                    <FacetSelect
                        label="SDR"
                        value={filters.sdrIds[0] ?? ""}
                        options={data?.facets.sdrs ?? []}
                        onChange={(v) => setFilters({ sdrIds: v ? [v] : [] })}
                    />
                )}
                {!unqualified && (
                    <FacetSelect
                        label="Mission"
                        value={filters.missionId ?? ""}
                        options={data?.facets.missions ?? []}
                        onChange={(v) => setFilters({ missionId: v || null })}
                    />
                )}
                <button
                    type="button"
                    onClick={() => setFilters({ withRecording: !filters.withRecording })}
                    aria-pressed={filters.withRecording}
                    className={cn(
                        "flex h-9 items-center gap-1.5 rounded-control border px-3 text-[13px] transition-colors",
                        filters.withRecording ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-2 hover:text-ink",
                    )}
                >
                    <Headphones className="h-3.5 w-3.5" /> Avec enregistrement
                </button>
                {filtered && (
                    <button
                        type="button"
                        onClick={() => {
                            setQ("");
                            setFilters({ sdrIds: [], missionId: null, results: [], withRecording: false, q: "" });
                        }}
                        className="flex h-9 items-center gap-1.5 rounded-control px-2.5 text-[13px] text-ink-3 hover:bg-surface-2 hover:text-ink"
                    >
                        <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
                    </button>
                )}
            </div>

            {/* ── Summary ── */}
            {data && (
                <section className={cn("rounded-panel border border-line bg-surface shadow-card transition-opacity", loading && "opacity-60")}>
                    <dl className="grid grid-cols-2 divide-line-subtle sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
                        <Metric label={unqualified ? "Appels sans statut" : "Appels"} value={<AnimatedNumber value={k!.calls} format={int} />} />
                        {!unqualified && (
                            <Metric
                                label="RDV"
                                value={<AnimatedNumber value={k!.meetings} format={int} />}
                                hint={k!.calls ? `${((k!.meetings / k!.calls) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % des appels` : undefined}
                            />
                        )}
                        <Metric
                            label="Temps de parole"
                            value={k!.measuredCalls ? <AnimatedNumber value={k!.talkSeconds} format={(v) => hms(Math.round(v))} /> : "—"}
                            hint={k!.measuredCalls ? `${k!.measuredCalls} appel${k!.measuredCalls > 1 ? "s" : ""} mesuré${k!.measuredCalls > 1 ? "s" : ""}` : "aucune durée connue"}
                        />
                        <Metric
                            label="Durée moyenne"
                            value={k!.measuredCalls ? <AnimatedNumber value={k!.talkSeconds / k!.measuredCalls} format={(v) => formatDuration(Math.round(v))} /> : "—"}
                        />
                        <Metric
                            label="Enregistrés"
                            value={<AnimatedNumber value={k!.withRecording} format={int} />}
                            hint={k!.calls ? `${Math.round((k!.withRecording / k!.calls) * 100)} %` : undefined}
                        />
                    </dl>
                    {!unqualified && data.facets.statuses.length > 0 && (
                        <div className="border-t border-line-subtle px-5 py-4">
                            <StatusDistribution
                                items={data.facets.statuses}
                                selected={filters.results}
                                onToggle={(id) =>
                                    setFilters({ results: filters.results.includes(id) ? filters.results.filter((r) => r !== id) : [...filters.results, id] })
                                }
                            />
                        </div>
                    )}
                    {unqualified && (
                        <p className="border-t border-line-subtle px-5 py-3 text-[12px] text-ink-3">
                            Appels passés avec le téléphone intégré depuis plus de 10 minutes, sans statut enregistré par le SDR.
                        </p>
                    )}
                </section>
            )}

            {/* ── Table ── */}
            <section className="overflow-hidden rounded-panel border border-line bg-surface shadow-card">
                {error && <p className="px-5 py-4 text-[13px] text-danger-ink">{error}</p>}
                {!data && !error && <TableSkeleton />}
                {data && rows.length === 0 && (
                    <EmptyState
                        unqualified={unqualified}
                        filtered={filtered}
                        telephonyEnabled={data.telephonyEnabled}
                        onReset={() => {
                            setQ("");
                            setFilters({ sdrIds: [], missionId: null, results: [], withRecording: false, q: "" });
                        }}
                    />
                )}
                {data && rows.length > 0 && (
                    <div className={cn("overflow-x-auto transition-opacity", loading && "opacity-60")}>
                        <table className="w-full min-w-[880px] border-collapse text-[13px]">
                            <thead>
                                <tr className="border-b border-line bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                                    <th className="w-[92px] px-4 py-2.5 font-semibold">{multiDay ? "Date" : "Heure"}</th>
                                    <th className="px-3 py-2.5 font-semibold">Prospect</th>
                                    <th className="px-3 py-2.5 font-semibold">{unqualified ? "Issue" : "Statut"}</th>
                                    <th className="w-[84px] px-3 py-2.5 text-right font-semibold">Durée</th>
                                    {scope === "team" && <th className="px-3 py-2.5 font-semibold">SDR</th>}
                                    {!unqualified && <th className="px-3 py-2.5 font-semibold">Mission</th>}
                                    <th className={cn("px-4 py-2.5 text-right font-semibold", onQualify && unqualified ? "w-[150px]" : "w-[72px]")} aria-label="Contenu" />
                                </tr>
                            </thead>
                            <tbody key={loadedQuery ?? ""}>
                                {rows.map((r, i) => (
                                    <Row
                                        key={r.id}
                                        row={r}
                                        index={i}
                                        active={i === cursor}
                                        multiDay={multiDay}
                                        unqualified={unqualified}
                                        showSdr={scope === "team"}
                                        onQualify={unqualified && onQualify ? () => onQualify(r) : undefined}
                                        onOpen={() => {
                                            setCursor(i);
                                            setOpen({ id: r.id, kind: r.kind });
                                        }}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {data && data.total > data.limit && (
                    <footer className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12px] text-ink-3">
                        <span className="tabular-nums">
                            {firstRow}–{lastRow} sur {data.total.toLocaleString("fr-FR")}
                        </span>
                        <div className="flex gap-1">
                            <PagerButton disabled={data.page <= 1} onClick={() => setFilters({ page: data.page - 1 }, { keepPage: true })}>
                                Précédent
                            </PagerButton>
                            <PagerButton disabled={lastRow >= data.total} onClick={() => setFilters({ page: data.page + 1 }, { keepPage: true })}>
                                Suivant
                            </PagerButton>
                        </div>
                    </footer>
                )}
            </section>

            {data && rows.length > 0 && (
                <p className="text-center text-[11px] text-ink-4">
                    <Kbd>j</Kbd> <Kbd>k</Kbd> pour se déplacer · <Kbd>Entrée</Kbd> pour ouvrir · <Kbd>/</Kbd> pour rechercher
                </p>
            )}

            <CallDetailDrawer
                apiBase={apiBase}
                target={open}
                onClose={() => setOpen(null)}
                onOpenCall={(id) => setOpen({ id, kind: "action" })}
                highlight={filters.q}
                resolveStatus={(code) => statusMeta.get(code) ?? null}
            />
        </div>
    );
}

// ── pieces ──────────────────────────────────────────────────────────────────

/** A number that eases to its new value when the filters change. */
function AnimatedNumber({ value, format }: { value: number; format: (v: number) => string }) {
    return <>{format(useCountUp(value))}</>;
}

const int = (v: number) => Math.round(v).toLocaleString("fr-FR");

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
    return (
        <div className="px-5 py-4">
            <dt className="text-[12px] text-ink-3">{label}</dt>
            <dd className="mt-1 flex items-baseline gap-2">
                <span className="text-[20px] font-semibold tabular-nums tracking-tight text-ink">{value}</span>
                {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
            </dd>
        </div>
    );
}

function FacetSelect({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: { id: string; label: string; count: number }[];
    onChange: (v: string) => void;
}) {
    return (
        <label className={cn("relative flex h-9 items-center rounded-control border bg-surface text-[13px]", value ? "border-ink" : "border-line")}>
            <span className="pointer-events-none pl-3 text-ink-3">{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-full max-w-[220px] cursor-pointer appearance-none bg-transparent pl-1.5 pr-7 font-medium text-ink outline-none"
                aria-label={label}
            >
                <option value="">Tous</option>
                {options.map((o) => (
                    <option key={o.id} value={o.id}>
                        {o.label} ({o.count})
                    </option>
                ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 text-[10px] text-ink-3" aria-hidden>
                ▾
            </span>
        </label>
    );
}

function Row({
    row: r,
    index,
    active,
    multiDay,
    unqualified,
    showSdr,
    onQualify,
    onOpen,
}: {
    row: JournalRow;
    index: number;
    active: boolean;
    multiDay: boolean;
    unqualified: boolean;
    showSdr: boolean;
    onQualify?: () => void;
    onOpen: () => void;
}) {
    const at = new Date(r.at);
    const who = r.contact?.name ?? r.company?.name ?? (r.phone ? formatPhone(r.phone) : "—");
    return (
        <tr
            data-row={index}
            onClick={onOpen}
            style={{ ["--i" as string]: index }}
            className={cn(
                "cp-rise group cursor-pointer border-b border-line-subtle transition-colors duration-150 last:border-b-0",
                active ? "bg-primary-soft/60" : "hover:bg-surface-2",
            )}
        >
            <td className={cn("whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-2", active && "shadow-[inset_2px_0_0_var(--ds-primary)]")}>
                {multiDay && <span className="mr-1.5 text-ink-3">{at.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>}
                {at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </td>
            <td className="max-w-[320px] px-3 py-2.5">
                <p className="truncate font-medium text-ink">{who}</p>
                <p className="truncate text-[12px] text-ink-3">
                    {r.contact ? r.company?.name : r.company && r.phone ? formatPhone(r.phone) : ""}
                    {r.note && !unqualified ? <span className="text-ink-4"> · {r.note}</span> : null}
                </p>
            </td>
            <td className="max-w-[220px] px-3 py-2.5">
                {r.status ? (
                    <StatusLabel label={r.status.label} color={r.status.color} />
                ) : r.telephonyStatus ? (
                    // Past the grace period, a non-final status means Twilio's last callback never arrived.
                    <span className={isFinalStatus(r.telephonyStatus) ? "text-ink-2" : "text-ink-3"}>
                        {isFinalStatus(r.telephonyStatus) ? TELEPHONY_STATUS_LABELS[r.telephonyStatus] : "Issue inconnue"}
                    </span>
                ) : (
                    <span className="text-ink-4">—</span>
                )}
            </td>
            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-2">
                {r.durationSec === null ? (
                    <span className="text-ink-4">—</span>
                ) : (
                    <span className={r.durationSec === 0 ? "text-ink-4" : undefined}>{formatDuration(r.durationSec)}</span>
                )}
            </td>
            {showSdr && (
            <td className="whitespace-nowrap px-3 py-2.5">
                <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-[10px] font-semibold text-ink-2">
                        {r.sdr.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                    <span className="text-ink-2">{r.sdr.name}</span>
                </span>
            </td>
            )}
            {!unqualified && <td className="max-w-[200px] truncate px-3 py-2.5 text-ink-3">{r.mission?.name ?? "—"}</td>}
            <td className="px-4 py-2.5">
                <span className="flex items-center justify-end gap-1.5 text-ink-3">
                    {onQualify && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onQualify();
                            }}
                            disabled={!r.company}
                            title={r.company ? "Enregistrer le résultat de cet appel" : "Numéro hors CRM : rien à qualifier"}
                            className="cp-press mr-1 h-7 rounded-control bg-primary px-2.5 text-[12px] font-semibold text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Qualifier
                        </button>
                    )}
                    {r.source === "crm" && <PhoneCall className="h-3.5 w-3.5" aria-label="Téléphone intégré" />}
                    {r.hasSummary && <Sparkles className="h-3.5 w-3.5" aria-label="Résumé disponible" />}
                    {r.hasRecording && <Mic className="h-3.5 w-3.5 text-ink-2" aria-label="Enregistrement" />}
                </span>
            </td>
        </tr>
    );
}

function PagerButton({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="h-7 rounded-control border border-line px-2.5 text-[12px] font-medium text-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
            {children}
        </button>
    );
}

function TableSkeleton() {
    return (
        <div className="divide-y divide-line-subtle" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="flex items-center gap-6 px-4 py-3.5">
                    <div className="cp-shimmer h-3 w-12 rounded" />
                    <div className="cp-shimmer h-3 w-48 rounded" />
                    <div className="cp-shimmer h-3 w-28 rounded" />
                    <div className="cp-shimmer ml-auto h-3 w-16 rounded" />
                </div>
            ))}
        </div>
    );
}

function EmptyState({
    unqualified,
    filtered,
    telephonyEnabled,
    onReset,
}: {
    unqualified: boolean;
    filtered: boolean;
    telephonyEnabled: boolean;
    onReset: () => void;
}) {
    let title: string;
    let body: string;
    if (filtered) {
        title = "Aucun appel ne correspond";
        body = "Élargissez la période ou retirez un filtre.";
    } else if (unqualified) {
        title = telephonyEnabled ? "Tous les appels ont un statut" : "Téléphone intégré non configuré";
        body = telephonyEnabled
            ? "Chaque appel passé avec le téléphone intégré sur la période a été qualifié par son SDR."
            : "Cette vue liste les appels passés depuis le CRM sans statut. Configurez Twilio dans Paramètres → Intégrations.";
    } else {
        title = "Aucun appel sur la période";
        body = "Les appels apparaissent ici dès qu'un SDR enregistre un résultat d'appel.";
    }
    return (
        <div className="px-6 py-16 text-center">
            <p className="text-[14px] font-semibold text-ink">{title}</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-3">{body}</p>
            {filtered && (
                <button type="button" onClick={onReset} className="mt-4 h-8 rounded-control border border-line px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2">
                    Réinitialiser les filtres
                </button>
            )}
        </div>
    );
}
