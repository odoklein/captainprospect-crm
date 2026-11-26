"use client";

// ============================================
// CALLS JOURNAL — every call of the team (manager) or of one SDR (« Mes appels»), with the status the SDR logged,
// its duration, recording, AI summary and transcript.
//
// The shared workspace frame (components/workspace): header with the views,
// toolbar, numbers compared with the previous period, the table, the call
// beside it on wide screens. Filters live in the URL (bookmarkable,
// shareable). Facets come from the API with the other filters applied, so
// counts always add up. Two views: the journal, and integrated-phone calls
// nobody qualified (the process gap) — where an SDR lands when they have some.
//
// Everything a review needs is on the row: Espace plays the recording in
// place (←/→ 10 s), j/k walk the calls (and the pages), c calls back, q
// qualifies; « @camille #acme » in the search picks the SDR and the mission.
// ============================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Headphones, Pause, Phone, PhoneIncoming, Play, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { activeFilterCount, journalQuery, parseJournalFilters, recordingPath, resolveSearchTokens, todayParis, type JournalFilters } from "@/lib/calls-journal/filters";
import type { JournalResponse, JournalRow } from "@/lib/calls-journal/types";
import { TELEPHONY_STATUS_LABELS, isFinalStatus } from "@/lib/telephony/status";
import { statusFamily, type StatusFamily } from "@/lib/workspace/status-family";
import { formatDuration, formatPhone } from "@/components/incoming-calls/useIncomingCalls";
import { ProspectIdentity } from "@/components/sdr/workspace/ProspectIdentity";
import { StatusDistribution } from "@/components/calls/StatusDistribution";
import { CallDetailDrawer, CallDetailPane } from "@/components/calls/CallDetailDrawer";
import { useCountUp } from "@/components/calls/useCountUp";
import { useSoftphone } from "@/components/telephony/SoftphoneProvider";
import { StatusPill } from "@/components/workspace/StatusPill";
import { useWorkspaceKeys } from "@/components/workspace/useWorkspaceKeys";
import {
    CONTROL, DateRangeButton, Delta, EmptyBlock, FacetSelect, FIRST_CELL, ICON_CONTROL, KeyHints, LAST_CELL, LoadingBar, Metric, MetricStrip,
    PagerButton, ResetButton, SearchField, ShortcutsDialog, TableSkeleton, TD, TH, ToggleChip, ViewTabs, WorkspaceFooter,
    WorkspaceFrame, WorkspaceHeader, WorkspaceMain, WorkspaceToolbar, useWide, type ShortcutGroup,
} from "@/components/workspace/Workspace";

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

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
/** A search token being typed (« @cam »): wait for Entrée instead of searching it. */
const PENDING_TOKEN = /(^|\s)[@#][^\s]*$/;

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

interface Playback {
    id: string;
    time: number;
    duration: number;
    playing: boolean;
}

function Journal({ scope, apiBase, title, subtitle, headerActions, onQualify, refreshKey = 0 }: CallsJournalProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const softphone = useSoftphone();

    const filters = useMemo<JournalFilters>(() => {
        const parsed = parseJournalFilters(new URLSearchParams(searchParams.toString()));
        return parsed.ok ? parsed.filters : (parseJournalFilters(new URLSearchParams()) as { ok: true; filters: JournalFilters }).filters;
    }, [searchParams]);

    const setFilters = useCallback(
        (patch: Partial<JournalFilters>, opts: { keepPage?: boolean } = {}) => {
            const next = { ...filters, ...patch, page: opts.keepPage ? patch.page ?? filters.page : patch.page ?? 1 };
            // These filters only drive client data; avoid a server navigation per keystroke.
            window.history.replaceState(null, "", `${pathname}?${journalQuery(next)}`);
        },
        [filters, pathname],
    );

    // ── data ───────────────────────────────────────────────────────────────
    const [data, setData] = useState<JournalResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    // The query the data on screen answers; while it differs, the next one is loading
    // and the previous results stay visible (dimmed) instead of flashing empty.
    const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
    const query = journalQuery(filters);
    const [reload, setReload] = useState(0);
    const requestKey = `${apiBase}?${query}#${refreshKey}:${reload}`;
    const loading = loadedQuery !== requestKey;

    useEffect(() => {
        const ctrl = new AbortController();
        fetch(`${apiBase}?${query}`, { signal: ctrl.signal })
            .then((r) => r.json())
            .then((json) => {
                if (ctrl.signal.aborted) return;
                if (json?.success) {
                    setData(json.data);
                    setError(null);
                } else setError(json?.error ?? "Chargement impossible");
                setLoadedQuery(requestKey);
            })
            .catch((e) => {
                if (!ctrl.signal.aborted && (e as Error).name !== "AbortError") {
                    setError("Chargement impossible");
                    setLoadedQuery(requestKey);
                }
            });
        return () => ctrl.abort();
    }, [query, apiBase, requestKey]);

    // An SDR with calls left without a status lands on them: it is their work in arrears.
    const autoView = useRef(false);
    useEffect(() => {
        if (autoView.current || scope !== "mine" || !data) return;
        autoView.current = true;
        if (!searchParams.has("view") && data.view === "journal" && data.unqualified > 0) setFilters({ view: "unqualified", results: [] });
    }, [data, scope, searchParams, setFilters]);

    // ── search (debounced into the URL; @sdr / #mission tokens on Entrée) ──
    const [q, setQ] = useState(filters.q);
    const [urlQ, setUrlQ] = useState(filters.q);
    const searchRef = useRef<HTMLInputElement>(null);
    // The URL changed the search (back button, reset): follow it.
    if (filters.q !== urlQ) {
        setUrlQ(filters.q);
        setQ(filters.q);
    }
    useEffect(() => {
        if (q === filters.q || PENDING_TOKEN.test(q)) return;
        const t = setTimeout(() => setFilters({ q: q.trim() }), 300);
        return () => clearTimeout(t);
    }, [q, filters.q, setFilters]);

    const applyTokens = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter" || !data || !/[@#]/.test(q)) return;
        const r = resolveSearchTokens(q, scope === "team" ? data.facets.sdrs : [], data.facets.missions);
        if (!r.sdrId && !r.missionId) return;
        e.preventDefault();
        setQ(r.q);
        setUrlQ(r.q);
        setFilters({ q: r.q, ...(r.sdrId ? { sdrIds: [r.sdrId] } : {}), ...(r.missionId ? { missionId: r.missionId } : {}) });
    };

    // ── selection & detail ─────────────────────────────────────────────────
    const [cursor, setCursor] = useState(0);
    const [cursorQuery, setCursorQuery] = useState(query);
    // Walking back past the first row opens the previous page on its last row.
    const [startAtEnd, setStartAtEnd] = useState(false);
    const [open, setOpen] = useState<{ id: string; kind: "action" | "call" } | null>(null);
    const [help, setHelp] = useState(false);
    const rows = useMemo(() => data?.rows ?? [], [data]);
    // A new filter set (or page) starts the keyboard cursor on its first row.
    if (cursorQuery !== query) {
        setCursorQuery(query);
        setCursor(startAtEnd ? -1 : 0);
        if (startAtEnd) setStartAtEnd(false);
    }
    const cur = rows.length ? (cursor < 0 ? rows.length - 1 : Math.min(cursor, rows.length - 1)) : 0;

    const statusMeta = useMemo(() => {
        const m = new Map<string, { label: string; color: string | null }>();
        for (const s of data?.facets.statuses ?? []) m.set(s.id, { label: s.label, color: s.color ?? null });
        return m;
    }, [data]);

    // ── inline playback: one audio element, the row shows its progress ─────
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playback, setPlayback] = useState<Playback | null>(null);
    const [audioError, setAudioError] = useState<string | null>(null);
    const stopPlay = useCallback(() => {
        const a = audioRef.current;
        if (a && !a.paused) a.pause();
        setPlayback(null);
    }, []);
    const togglePlay = useCallback(
        (r: JournalRow) => {
            const a = audioRef.current;
            if (!a || !r.hasRecording) return;
            if (playback?.id === r.id) {
                if (a.paused) void a.play().catch(() => setAudioError(r.id));
                else a.pause();
                return;
            }
            setAudioError(null);
            a.src = recordingPath(r.kind, r.id);
            setPlayback({ id: r.id, time: 0, duration: r.durationSec ?? 0, playing: true });
            void a.play().catch(() => {
                setPlayback(null);
                setAudioError(r.id);
            });
        },
        [playback],
    );
    const seek = (delta: number) => {
        const a = audioRef.current;
        if (a && playback) a.currentTime = Math.max(0, Math.min(a.duration || Infinity, a.currentTime + delta));
    };

    const wide = useWide();
    const lastRow = data ? Math.min(data.total, data.page * data.limit) : 0;
    // Moves the cursor (and the pane with it); past either end, the next or previous page.
    const move = (delta: number) => {
        if (!rows.length || !data) return;
        if (playback) stopPlay();
        const next = cur + delta;
        if (next >= rows.length) {
            if (lastRow < data.total && !loading) setFilters({ page: data.page + 1 }, { keepPage: true });
            return;
        }
        if (next < 0) {
            if (data.page > 1 && !loading) {
                setStartAtEnd(true);
                setFilters({ page: data.page - 1 }, { keepPage: true });
            }
            return;
        }
        setCursor(next);
        if (open && wide) setOpen({ id: rows[next].id, kind: rows[next].kind });
        document.querySelector(`[data-row="${next}"]`)?.scrollIntoView({ block: "nearest" });
    };

    const canCall = scope === "mine";
    const callBack = (r: JournalRow) => {
        if (!r.phone) return;
        const who = r.contact?.name ?? r.company?.name ?? formatPhone(r.phone);
        if (!softphone.dial({ phone: r.phone, contactId: r.contact?.id ?? null, companyId: r.company?.id ?? null, label: who, sublabel: r.contact ? r.company?.name : null }))
            window.location.assign(`tel:${r.phone}`);
    };

    const unqualified = filters.view === "unqualified";
    const qualifyRow = !loading && unqualified && onQualify ? onQualify : undefined;
    useWorkspaceKeys(
        {
            j: () => move(1),
            ArrowDown: () => move(1),
            k: () => move(-1),
            ArrowUp: () => move(-1),
            Enter: () => rows[cur] && !loading && setOpen({ id: rows[cur].id, kind: rows[cur].kind }),
            Escape: () => (playback ? stopPlay() : setOpen(null)),
            "/": () => searchRef.current?.focus(),
            " ": () => rows[cur] && togglePlay(rows[cur]),
            ArrowRight: playback ? () => seek(10) : null,
            ArrowLeft: playback ? () => seek(-10) : null,
            q: qualifyRow ? () => rows[cur]?.company && qualifyRow(rows[cur]) : null,
            c: canCall ? () => rows[cur] && callBack(rows[cur]) : null,
            "1": () => setFilters({ view: "journal", results: [] }),
            "2": () => setFilters({ view: "unqualified", results: [] }),
            "?": () => setHelp(true),
        },
        // The drawer (narrow screens) owns the keyboard.
        !(open && wide === false),
    );

    // ── derived ────────────────────────────────────────────────────────────
    const today = todayParis();
    const periodPresets = presets(today);
    const activePreset = periodPresets.find((p) => p.start === filters.start && p.end === filters.end)?.id ?? "custom";
    const multiDay = filters.start !== filters.end;
    const k = data?.kpis;
    const prev = unqualified ? null : k?.previous ?? null;
    const filtered = activeFilterCount(filters) > 0;
    const firstRow = data ? (data.page - 1) * data.limit + 1 : 0;

    const showPane = Boolean(open) && wide === true;
    const resolveStatus = (code: string) => statusMeta.get(code) ?? null;
    const resetFilters = () => {
        setQ("");
        setFilters({ sdrIds: [], missionId: null, results: [], withRecording: false, q: "" });
    };

    const shortcuts: ShortcutGroup[] = [
        { title: "Se déplacer", keys: [[["j"], "Appel suivant (et page suivante)"], [["k"], "Appel précédent"], [["1", "2"], "Journal, Sans statut"], [["/"], "Rechercher (@sdr, #mission)"]] },
        {
            title: "Agir",
            keys: [
                [["Entrée"], "Ouvrir l'appel"],
                [["Espace"], "Écouter, mettre en pause"],
                [["←", "→"], "Reculer, avancer de 10 s"],
                ...(onQualify ? ([[["q"], "Qualifier l'appel"]] as [string[], string][]) : []),
                ...(canCall ? ([[["c"], "Rappeler le prospect"]] as [string[], string][]) : []),
                [["Échap"], "Fermer, arrêter la lecture"],
            ],
        },
    ];

    return (
        <WorkspaceFrame>
            <WorkspaceMain>
                <WorkspaceHeader
                    title={title}
                    subtitle={subtitle}
                    actions={
                        <>
                            <button type="button" onClick={() => setReload((n) => n + 1)} disabled={loading} aria-label="Actualiser les appels" title="Actualiser les appels" className={ICON_CONTROL}>
                                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin motion-reduce:animate-none")} />
                            </button>
                            {headerActions}
                            <div className="flex rounded-control bg-surface-3/70 p-0.5" role="radiogroup" aria-label="Période">
                                {periodPresets.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={activePreset === p.id}
                                        onClick={() => setFilters({ start: p.start, end: p.end })}
                                        className={cn(
                                            "cp-press h-7 rounded-[6px] px-2.5 text-[12px] font-medium transition-colors duration-200",
                                            activePreset === p.id ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
                                        )}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                            <DateRangeButton
                                start={filters.start}
                                end={filters.end}
                                max={today}
                                active={activePreset === "custom"}
                                onChange={(start, end) => start && end && setFilters({ start, end })}
                                note="Un an au plus. Les chiffres se comparent à la période de même durée juste avant."
                            />
                        </>
                    }
                    tabs={
                        <ViewTabs
                            label="Vue"
                            value={filters.view}
                            onChange={(id) => setFilters({ view: id, results: [] })}
                            tabs={[
                                { id: "journal", label: "Journal", count: data && !unqualified ? data.total : null, hotkey: "1" },
                                { id: "unqualified", label: "Sans statut", count: data?.unqualified ?? null, tone: "primary", hotkey: "2" },
                            ]}
                        />
                    }
                />

                <WorkspaceToolbar>
                    <SearchField
                        value={q}
                        onChange={setQ}
                        inputRef={searchRef}
                        onKeyDown={applyTokens}
                        placeholder={unqualified ? "Numéro, ou un mot dit pendant l'appel…" : scope === "team" ? "Prospect, mot dit pendant l'appel, @sdr, #mission…" : "Prospect, mot dit pendant l'appel, #mission…"}
                    />
                    {scope === "team" && (
                        <FacetSelect label="SDR" value={filters.sdrIds[0] ?? ""} options={data?.facets.sdrs ?? []} onChange={(v) => setFilters({ sdrIds: v ? [v] : [] })} />
                    )}
                    {!unqualified && (
                        <FacetSelect label="Mission" value={filters.missionId ?? ""} options={data?.facets.missions ?? []} onChange={(v) => setFilters({ missionId: v || null })} />
                    )}
                    <ToggleChip pressed={filters.withRecording} onClick={() => setFilters({ withRecording: !filters.withRecording })}>
                        <Headphones className="h-3.5 w-3.5" /> Avec enregistrement
                    </ToggleChip>
                    {filtered && <ResetButton onClick={resetFilters} />}
                </WorkspaceToolbar>

                {/* ── Numbers + list (one scroll; room at the end to clear the floating dock) ── */}
                <div className="@container relative min-h-0 flex-1 overflow-auto pb-12" aria-busy={loading}>
                    <LoadingBar loading={loading} />
                    <span className="sr-only" role="status">{loading ? "Chargement des appels…" : error ? "Erreur de chargement" : `${data?.total ?? 0} appels`}</span>
                    {data && k && (
                        <MetricStrip
                            loading={loading}
                            after={
                                !unqualified && data.facets.statuses.length > 0 ? (
                                    <div className="mt-4 hidden sm:block">
                                        <StatusDistribution
                                            items={data.facets.statuses}
                                            selected={filters.results}
                                            onToggle={(id) =>
                                                setFilters({ results: filters.results.includes(id) ? filters.results.filter((r) => r !== id) : [...filters.results, id] })
                                            }
                                        />
                                    </div>
                                ) : unqualified ? (
                                    <p className="mt-3 text-[12px] text-ink-3">
                                        Appels passés avec le téléphone intégré depuis plus de 10 minutes, sans statut enregistré par le SDR.
                                    </p>
                                ) : null
                            }
                        >
                            <Metric
                                label={unqualified ? "Sans statut" : "Appels"}
                                value={<AnimatedNumber value={k.calls} format={int} />}
                                delta={prev && <Delta now={k.calls} before={prev.calls} />}
                            />
                            {!unqualified && (
                                <Metric
                                    label="RDV"
                                    value={<AnimatedNumber value={k.meetings} format={int} />}
                                    hint={k.calls ? `${((k.meetings / k.calls) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : undefined}
                                    delta={prev && <Delta now={k.meetings} before={prev.meetings} />}
                                />
                            )}
                            <Metric
                                label="Temps de parole"
                                value={k.measuredCalls ? <AnimatedNumber value={k.talkSeconds} format={(v) => hms(Math.round(v))} /> : "—"}
                                hint={k.measuredCalls ? `${k.measuredCalls} mesuré${k.measuredCalls > 1 ? "s" : ""}` : undefined}
                                delta={prev && k.measuredCalls > 0 && <Delta now={k.talkSeconds} before={prev.talkSeconds} />}
                            />
                            <Metric
                                label="Durée moyenne"
                                value={k.measuredCalls ? <AnimatedNumber value={k.talkSeconds / k.measuredCalls} format={(v) => formatDuration(Math.round(v))} /> : "—"}
                            />
                            <Metric
                                label="Enregistrés"
                                value={<AnimatedNumber value={k.withRecording} format={int} />}
                                hint={k.calls ? `${Math.round((k.withRecording / k.calls) * 100)} %` : undefined}
                            />
                        </MetricStrip>
                    )}

                    {error && (
                        <div role="alert" className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-[13px] text-danger-ink">
                            <span>
                                {error}
                                {data ? " · Les derniers résultats restent affichés." : ""}
                            </span>
                            <button type="button" onClick={() => setReload((n) => n + 1)} className="rounded-lg border border-current px-3 py-1.5 font-semibold">
                                Réessayer
                            </button>
                        </div>
                    )}
                    {!data && !error && <TableSkeleton />}
                    {data && rows.length === 0 && <JournalEmpty unqualified={unqualified} filtered={filtered} telephonyEnabled={data.telephonyEnabled} onReset={resetFilters} />}
                    {data && rows.length > 0 && (
                        <table className={cn("w-full table-fixed border-collapse bg-surface text-[13px] transition-opacity", loading && "opacity-60")}>
                            <thead className="sticky top-0 z-[1]">
                                <tr className="bg-surface-2/95 shadow-[inset_0_-1px_0_var(--ds-line)] backdrop-blur">
                                    <th className={cn(TH, FIRST_CELL, multiDay ? "w-[104px]" : "w-[76px]")}>{multiDay ? "Date" : "Heure"}</th>
                                    <th className={TH}>Prospect</th>
                                    <th className={cn(TH, "w-[132px] @min-[720px]:w-[188px]")}>{unqualified ? "Issue" : "Statut"}</th>
                                    <th className={cn(TH, "hidden w-[108px] @min-[560px]:table-cell")}>Durée</th>
                                    {scope === "team" && <th className={cn(TH, "hidden @min-[720px]:table-cell", showPane ? "w-[52px]" : "w-[152px]")}>SDR</th>}
                                    {!unqualified && !showPane && <th className={cn(TH, "hidden w-[18%] @min-[1100px]:table-cell")}>Mission</th>}
                                    <th className={cn(TH, LAST_CELL, unqualified && onQualify ? (canCall ? "w-[144px]" : "w-[112px]") : canCall ? "w-[64px]" : "w-[48px]")} aria-label="Actions" />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r, i) => (
                                    <Row
                                        key={r.id}
                                        row={r}
                                        index={i}
                                        active={i === cur}
                                        opened={open?.id === r.id}
                                        multiDay={multiDay}
                                        unqualified={unqualified}
                                        showSdr={scope === "team"}
                                        showMission={!showPane}
                                        compact={showPane}
                                        playback={playback?.id === r.id ? playback : null}
                                        audioError={audioError === r.id}
                                        onPlay={() => togglePlay(r)}
                                        onCall={canCall && r.phone ? () => callBack(r) : undefined}
                                        onQualify={qualifyRow ? () => qualifyRow(r) : undefined}
                                        onOpen={() => {
                                            if (loading) return;
                                            setCursor(i);
                                            setOpen({ id: r.id, kind: r.kind });
                                        }}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )}
                    <audio
                        ref={audioRef}
                        preload="none"
                        className="hidden"
                        onTimeUpdate={(e) => {
                            const t = e.currentTarget.currentTime;
                            setPlayback((p) => (p ? { ...p, time: t } : p));
                        }}
                        onLoadedMetadata={(e) => {
                            const d = e.currentTarget.duration;
                            setPlayback((p) => (p && Number.isFinite(d) ? { ...p, duration: d } : p));
                        }}
                        onPlay={() => setPlayback((p) => (p ? { ...p, playing: true } : p))}
                        onPause={() => setPlayback((p) => (p ? { ...p, playing: false } : p))}
                        onEnded={() => setPlayback(null)}
                        onError={() => {
                            if (playback) setAudioError(playback.id);
                            setPlayback(null);
                        }}
                    />
                </div>

                {/* ── Footer: where you are, how to move. Right-aligned: the dock floats bottom left. ── */}
                {data && rows.length > 0 && (
                    <WorkspaceFooter>
                        <KeyHints
                            hints={[
                                [["j", "k"], "se déplacer"],
                                [["Entrée"], "ouvrir"],
                                [["Espace"], "écouter"],
                                ...(qualifyRow ? ([[["q"], "qualifier"]] as [string[], string][]) : []),
                            ]}
                            onHelp={() => setHelp(true)}
                        />
                        <span className="tabular-nums">
                            {firstRow}–{lastRow} sur {data.total.toLocaleString("fr-FR")}
                        </span>
                        {data.total > data.limit && (
                            <div className="flex gap-1">
                                <PagerButton disabled={loading || data.page <= 1} onClick={() => setFilters({ page: data.page - 1 }, { keepPage: true })}>
                                    Précédent
                                </PagerButton>
                                <PagerButton disabled={loading || lastRow >= data.total} onClick={() => setFilters({ page: data.page + 1 }, { keepPage: true })}>
                                    Suivant
                                </PagerButton>
                            </div>
                        )}
                    </WorkspaceFooter>
                )}
            </WorkspaceMain>

            {showPane && (
                <CallDetailPane
                    apiBase={apiBase}
                    target={open}
                    onClose={() => setOpen(null)}
                    onOpenCall={(id) => setOpen({ id, kind: "action" })}
                    onPrev={cur > 0 ? () => move(-1) : undefined}
                    onNext={cur < rows.length - 1 ? () => move(1) : undefined}
                    highlight={filters.q}
                    resolveStatus={resolveStatus}
                />
            )}
            {wide === false && (
                <CallDetailDrawer
                    apiBase={apiBase}
                    target={open}
                    onClose={() => setOpen(null)}
                    onOpenCall={(id) => setOpen({ id, kind: "action" })}
                    highlight={filters.q}
                    resolveStatus={resolveStatus}
                />
            )}
            <ShortcutsDialog open={help} onClose={() => setHelp(false)} groups={shortcuts} />
        </WorkspaceFrame>
    );
}

// ── pieces ──────────────────────────────────────────────────────────────────

/** A number that eases to its new value when the filters change. */
function AnimatedNumber({ value, format }: { value: number; format: (v: number) => string }) {
    return <>{format(useCountUp(value))}</>;
}

const int = (v: number) => Math.round(v).toLocaleString("fr-FR");

/** The status cell: the SDR's status, else what the phone saw. */
function rowStatus(r: JournalRow): { label: string; color: string | null; family: StatusFamily } | null {
    if (r.status) return { label: r.status.label, color: r.status.color, family: statusFamily(r.status.code, r.status.category) };
    if (!r.telephonyStatus) return null;
    // Past the grace period, a non-final status means Twilio's last callback never arrived.
    if (r.inbound && r.telephonyStatus !== "COMPLETED")
        return r.voicemail ? { label: "Message vocal", color: null, family: "pending" } : { label: "Manqué", color: null, family: "alert" };
    return isFinalStatus(r.telephonyStatus)
        ? { label: TELEPHONY_STATUS_LABELS[r.telephonyStatus], color: null, family: "noreach" }
        : { label: "Issue inconnue", color: null, family: "noreach" };
}

function Row({
    row: r,
    index,
    active,
    opened,
    multiDay,
    unqualified,
    showSdr,
    showMission,
    compact,
    playback,
    audioError,
    onPlay,
    onCall,
    onQualify,
    onOpen,
}: {
    row: JournalRow;
    index: number;
    active: boolean;
    /** Its detail is the one open in the pane. */
    opened: boolean;
    multiDay: boolean;
    unqualified: boolean;
    showSdr: boolean;
    showMission: boolean;
    /** The detail pane is open: the SDR shows as initials only. */
    compact: boolean;
    /** This row's recording is the one playing. */
    playback: Playback | null;
    audioError: boolean;
    onPlay: () => void;
    onCall?: () => void;
    onQualify?: () => void;
    onOpen: () => void;
}) {
    const at = new Date(r.at);
    const who = r.contact?.name ?? r.company?.name ?? (r.phone ? formatPhone(r.phone) : "—");
    const status = rowStatus(r);
    const progress = playback && playback.duration > 0 ? Math.min(100, (playback.time / playback.duration) * 100) : 0;
    return (
        <tr
            data-row={index}
            onClick={onOpen}
            className={cn(
                "cp-journal-row group cursor-pointer scroll-mt-9 border-b border-line-subtle transition-colors duration-150",
                opened ? "bg-primary-soft" : active ? "bg-primary-soft/50" : "hover:bg-surface-2",
            )}
        >
            <td className={cn(TD, FIRST_CELL, "whitespace-nowrap text-[12px] tabular-nums text-ink-2", (active || opened) && "shadow-[inset_2px_0_0_var(--ds-primary)]")}>
                {multiDay && <span className="mr-1.5 text-ink-3">{at.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span>}
                {at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </td>
            <td className={cn(TD, "min-w-0")}>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpen();
                    }}
                    className="block w-full min-w-0 text-left"
                    aria-label={`Ouvrir l’appel de ${who}`}
                >
                    <ProspectIdentity name={r.contact?.name} company={r.company?.name ?? who} role={r.contact?.title} website={r.company?.website} compact />
                </button>
                {r.inbound && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-success-ink sm:pl-[47px]">
                        <PhoneIncoming className="h-3 w-3" aria-hidden /> Appel entrant
                    </p>
                )}
                {r.note && !unqualified && <p className="mt-1 truncate text-[12px] text-ink-3 sm:pl-[47px]">{r.note}</p>}
            </td>
            <td className={cn(TD, "min-w-0")}>
                {status ? <StatusPill label={status.label} color={status.color} family={status.family} summary={r.hasSummary} /> : <span className="text-ink-4">—</span>}
            </td>
            <td className={cn(TD, "hidden whitespace-nowrap tabular-nums text-ink-2 @min-[560px]:table-cell")}>
                {r.hasRecording ? (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onPlay();
                        }}
                        aria-label={playback?.playing ? "Mettre en pause" : "Écouter l'enregistrement (Espace)"}
                        title={audioError ? "Enregistrement indisponible" : playback ? "←/→ : 10 s" : "Écouter (Espace)"}
                        className={cn(
                            "-ml-1.5 inline-flex h-7 items-center gap-1.5 rounded-control px-1.5 transition-colors hover:bg-surface-3",
                            playback && "bg-surface-3 text-ink",
                            audioError && "text-danger-ink",
                        )}
                    >
                        {playback?.playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        {playback ? (
                            <>
                                <span className="relative h-1 w-10 overflow-hidden rounded-full bg-line" aria-hidden>
                                    <span className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${progress}%` }} />
                                </span>
                                <span className="text-[12px]">{clock(playback.time)}</span>
                            </>
                        ) : (
                            <span>{audioError ? "Indisponible" : r.durationSec ? formatDuration(r.durationSec) : "Écouter"}</span>
                        )}
                    </button>
                ) : r.durationSec === null ? (
                    <span className="text-ink-4">—</span>
                ) : (
                    <span className={r.durationSec === 0 ? "text-ink-4" : undefined}>{formatDuration(r.durationSec)}</span>
                )}
            </td>
            {showSdr && (
                <td className={cn(TD, "hidden whitespace-nowrap @min-[720px]:table-cell")}>
                    <span className="flex min-w-0 items-center gap-2" title={r.sdr.name}>
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[9.5px] font-semibold text-ink-2">
                            {r.sdr.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                        </span>
                        {!compact && <span className="truncate text-ink-2">{r.sdr.name}</span>}
                    </span>
                </td>
            )}
            {!unqualified && showMission && <td className={cn(TD, "hidden truncate text-ink-3 @min-[1100px]:table-cell")}>{r.mission?.name ?? "—"}</td>}
            <td className={cn(TD, LAST_CELL, "relative")}>
                <span className="absolute inset-y-0 right-0 flex items-center gap-1 pr-4 sm:pr-6">
                    {onCall && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onCall();
                            }}
                            title="Rappeler (c)"
                            aria-label={`Rappeler ${who}`}
                            className={cn(
                                "flex h-7 w-7 items-center justify-center rounded-control border border-line bg-surface text-ink-2 transition hover:text-ink",
                                active ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
                            )}
                        >
                            <Phone className="h-3.5 w-3.5" />
                        </button>
                    )}
                    {onQualify && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onQualify();
                            }}
                            disabled={!r.company}
                            title={r.company ? "Enregistrer le résultat de cet appel (q)" : "Numéro hors CRM : rien à qualifier"}
                            className="cp-press h-7 rounded-control bg-primary px-2.5 text-[12px] font-semibold text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Qualifier
                        </button>
                    )}
                    {!onQualify && <ChevronRight className={cn("h-4 w-4 text-ink-4 transition-opacity", active ? "opacity-100" : "opacity-0 group-hover:opacity-100")} aria-hidden />}
                </span>
            </td>
        </tr>
    );
}

function JournalEmpty({
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
    if (filtered)
        return (
            <EmptyBlock
                title="Aucun appel ne correspond"
                body="Élargissez la période ou retirez un filtre."
                action={
                    <button type="button" onClick={onReset} className={CONTROL}>
                        Réinitialiser les filtres
                    </button>
                }
            />
        );
    if (unqualified)
        return telephonyEnabled ? (
            <EmptyBlock title="Tous les appels ont un statut" body="Chaque appel passé avec le téléphone intégré sur la période a été qualifié par son SDR." />
        ) : (
            <EmptyBlock
                title="Téléphone intégré non configuré"
                body="Cette vue liste les appels passés depuis le CRM sans statut. Configurez Twilio dans Paramètres → Téléphonie."
            />
        );
    return <EmptyBlock title="Aucun appel sur la période" body="Les appels apparaissent ici dès qu'un SDR enregistre un résultat d'appel." />;
}
