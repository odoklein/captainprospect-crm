'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, CircleHelp, Loader2, Redo2, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DATE_KEY_RE, addDaysToKey, blockDayUnits, mondayOfKey, parisTodayKey, slotOf, type BoardOp } from '@/lib/planning/board-shared';
import {
    VIEW_LABELS,
    assignMissionColors,
    buildIndex,
    cellEntries,
    computeAlerts,
    computeRange,
    formatRangeLabel,
    normalizeAnchor,
    shiftAnchor,
    type Cell,
    type ViewMode,
} from './engine';
import { BoardGrid, type Brush, type CellFocus } from './BoardGrid';
import { BrushHint, ToolDock } from './ToolDock';
import { AlertsBar } from './AlertsBar';
import { CellPopover } from './CellPopover';
import { PlanWeekDialog } from './PlanWeekDialog';
import { httpTransport, usePlanningBoard, type BoardTransport } from './usePlanningBoard';

// ── Per-viewer preferences (convenience only — the board works without them) ──

const PREF = {
    view: 'planning.board.view',
    weekend: 'planning.board.weekend',
    welcome: 'planning.board.welcome.v1',
};

function readPref(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writePref(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value);
    } catch { /* storage unavailable */ }
}

/** The period lives in the URL too, so a refresh or a shared link opens the same week. */
const VIEW_PARAM: Record<ViewMode, string> = { week: 'semaine', twoWeeks: '2-semaines', month: 'mois' };

function readUrlState(): { view: ViewMode | null; from: string | null } {
    try {
        const params = new URLSearchParams(window.location.search);
        const vue = params.get('vue');
        const view = (Object.keys(VIEW_PARAM) as ViewMode[]).find((v) => VIEW_PARAM[v] === vue) ?? null;
        const du = params.get('du');
        return { view, from: du && DATE_KEY_RE.test(du) ? du : null };
    } catch {
        return { view: null, from: null };
    }
}

const HOW_TO: Array<{ title: string; text: string }> = [
    { title: 'Planifier', text: 'Choisissez une mission dans la barre du bas, puis glissez un rectangle sur les cases — plusieurs jours et plusieurs SDR d’un coup. Le résultat s’affiche avant de relâcher.' },
    { title: 'Toute une semaine', text: 'Avec le pinceau, cliquez le nom d’un SDR pour remplir toute sa ligne.' },
    { title: 'Demi-journée', text: 'Maintenez Maj en glissant, ou cliquez une mission posée pour choisir matin ou après-midi.' },
    { title: 'Modifier', text: 'Cliquez une case pour ajouter ou changer une mission. Glissez une mission pour la déplacer, avec Alt pour la copier.' },
    { title: 'Repérer', text: 'Survolez une mission en bas : ses jours ressortent sur le planning.' },
    { title: 'Se tromper', text: 'Ctrl+Z annule, Ctrl+Maj+Z rétablit.' },
];

const SHORTCUTS: Array<[string, string]> = [
    ['1 – 9', 'Choisir une mission'],
    ['E', 'Gomme'],
    ['Maj', 'Demi-journée en peignant'],
    ['Alt + glisser', 'Copier une mission'],
    ['Échap', 'Terminer / fermer'],
    ['Ctrl + Z', 'Annuler'],
    ['Ctrl + Maj + Z', 'Rétablir'],
    ['← →', 'Période précédente / suivante'],
    ['T', 'Revenir à aujourd’hui'],
];

const noopSubscribe = () => () => {};

export function PlanningBoard({ transport = httpTransport }: { transport?: BoardTransport }) {
    // Preferences live in localStorage and the URL, which the server render
    // can't read: mount the board only on the client so its first render uses them.
    const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
    if (!isClient) return <BoardSkeleton />;
    return <Board transport={transport} />;
}

function Board({ transport }: { transport: BoardTransport }) {
    const today = useMemo(() => parisTodayKey(), []);
    const initialUrl = useMemo(readUrlState, []);
    const [view, setViewState] = useState<ViewMode>(() => {
        if (initialUrl.view) return initialUrl.view;
        const stored = readPref(PREF.view);
        return stored === 'twoWeeks' || stored === 'month' ? stored : 'week';
    });
    const [anchor, setAnchor] = useState(() => normalizeAnchor(view, initialUrl.from ?? today));
    const [showWeekend, setShowWeekendState] = useState(() => readPref(PREF.weekend) === '1');
    const [showTests, setShowTests] = useState(false);

    const range = useMemo(() => computeRange(view, anchor, showWeekend), [view, anchor, showWeekend]);
    const neighbours = useMemo(
        () => [-1, 1].map((d) => {
            const r = computeRange(view, shiftAnchor(view, anchor, d as 1 | -1), showWeekend);
            return { from: r.from, to: r.to };
        }),
        [view, anchor, showWeekend],
    );
    const board = usePlanningBoard({ transport, from: range.from, to: range.to, neighbours });
    const { state } = board;

    useEffect(() => {
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('vue', VIEW_PARAM[view]);
            url.searchParams.set('du', range.from);
            window.history.replaceState(window.history.state, '', url);
        } catch { /* URL sync is a convenience */ }
    }, [view, range.from]);

    const index = useMemo(() => (state ? buildIndex(state) : null), [state]);
    const colors = useMemo(() => assignMissionColors(state?.missions ?? []), [state?.missions]);

    const [brush, setBrushState] = useState<Brush>(null);
    const [lastMissionId, setLastMissionId] = useState<string | null>(null);
    const setBrush = useCallback((next: Brush) => {
        setBrushState(next);
        if (next?.kind === 'mission') setLastMissionId(next.missionId);
    }, []);
    const [highlightId, setHighlightId] = useState<string | null>(null);

    const [unplannedFilter, setUnplannedFilter] = useState<string[] | null>(null);
    const [popover, setPopover] = useState<{ cell: Cell; anchor: DOMRect; focus: CellFocus } | null>(null);
    const [planWeekFor, setPlanWeekFor] = useState<string | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const [welcome, setWelcome] = useState(() => readPref(PREF.welcome) !== 'seen');

    const setView = (next: ViewMode) => {
        // Keep the period the planner is looking at: today if it's on screen, else the start.
        const focusDay = today >= range.from && today <= range.to ? today : range.from;
        setViewState(next);
        setAnchor(normalizeAnchor(next, focusDay));
        writePref(PREF.view, next);
    };
    const setShowWeekend = (value: boolean) => {
        setShowWeekendState(value);
        writePref(PREF.weekend, value ? '1' : '0');
    };
    const navigate = useCallback((direction: 1 | -1) => {
        setAnchor((current) => shiftAnchor(view, current, direction));
        setPopover(null);
        setUnplannedFilter(null);
    }, [view]);
    const goToday = useCallback(() => {
        setAnchor(normalizeAnchor(view, today));
        setUnplannedFilter(null);
    }, [view, today]);

    // ── Derived lists ─────────────────────────────────────────────────
    const teamSdrs = useMemo(() => (state?.sdrs ?? []).filter((s) => showTests || !s.isTest), [state?.sdrs, showTests]);
    const hiddenTests = (state?.sdrs ?? []).filter((s) => s.isTest).length;
    const alerts = useMemo(
        () => (state && index ? computeAlerts(state, index, teamSdrs.map((s) => s.id), showWeekend) : null),
        [state, index, teamSdrs, showWeekend],
    );
    const visibleSdrs = unplannedFilter ? teamSdrs.filter((s) => unplannedFilter.includes(s.id)) : teamSdrs;

    /** Days each mission has on the shown columns, for the team on the board. */
    const periodDays = useMemo(() => {
        const days = new Map<string, number>();
        if (!index) return days;
        const team = new Set(teamSdrs.map((s) => s.id));
        const shown = new Set(range.days);
        for (const [key, blocks] of index.blocksByCell) {
            const [sdrId, date] = key.split('|');
            if (!team.has(sdrId) || !shown.has(date)) continue;
            const entries = cellEntries(blocks);
            for (const entry of entries.slice(0, 2)) {
                const units = entries.length > 1 ? 0.5 : blockDayUnits(entry.block.startTime, entry.block.endTime);
                days.set(entry.missionId, (days.get(entry.missionId) ?? 0) + units);
            }
        }
        return days;
    }, [index, teamSdrs, range.days]);

    // Dock order: missions already used in the period (most used first) and those
    // ending in it, then the rest by end date. Taken from the period's opening
    // snapshot, so chips don't jump while the planner paints.
    const dockMissions = useMemo(() => {
        const used = new Map<string, number>();
        const shown = new Set(range.days);
        for (const block of board.baseline?.blocks ?? []) {
            if (shown.has(block.date)) used.set(block.missionId, (used.get(block.missionId) ?? 0) + 1);
        }
        const primary = (m: { id: string; endDate: string }) => (used.get(m.id) ?? 0) > 0 || (m.endDate >= today && m.endDate <= range.to);
        return (state?.missions ?? [])
            .filter((m) => m.paintable)
            .sort((a, b) => {
                const group = Number(!primary(a)) - Number(!primary(b));
                if (group !== 0) return group;
                const usage = (used.get(b.id) ?? 0) - (used.get(a.id) ?? 0);
                if (usage !== 0) return usage;
                return a.endDate.localeCompare(b.endDate) || a.name.localeCompare(b.name, 'fr');
            });
    }, [state?.missions, board.baseline, range.days, range.to, today]);

    // A mission that is no longer running in the shown period can't be painted.
    useEffect(() => {
        if (brush?.kind === 'mission' && state && !dockMissions.some((m) => m.id === brush.missionId)) setBrushState(null);
    }, [brush, dockMissions, state]);

    // ── Actions ───────────────────────────────────────────────────────
    const { dispatch, undo, redo } = board;
    const onStroke = useCallback((cells: Cell[], half: boolean) => {
        if (!brush || cells.length === 0) return;
        if (brush.kind === 'mission') dispatch({ kind: 'paint', cells, missionId: brush.missionId, mode: half ? 'half' : 'full' });
        else if (brush.kind === 'eraser') dispatch({ kind: 'erase', cells });
        else dispatch({ kind: 'absence', cells, absenceType: 'VACATION' });
    }, [brush, dispatch]);

    const onMove = useCallback((blockId: string, to: Cell, copy: boolean) => {
        if (!copy) {
            dispatch({ kind: 'move', blockId, to });
            return;
        }
        const block = state?.blocks.find((b) => b.id === blockId);
        if (block) dispatch({ kind: 'place', cell: to, missionId: block.missionId, slot: slotOf(block.startTime, block.endTime) });
    }, [dispatch, state]);

    const planWeekDefault = () => {
        if (view !== 'month') return range.from;
        return today >= range.from && today <= range.to ? mondayOfKey(today) : mondayOfKey(range.from);
    };

    const showWeek = (monday: string) => {
        if (monday < range.from || addDaysToKey(monday, 4) > range.to) {
            setViewState('week');
            writePref(PREF.view, 'week');
            setAnchor(monday);
        }
    };

    // ── Keyboard ──────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
            if (popover || planWeekFor) return;

            const mod = event.ctrlKey || event.metaKey;
            const key = event.key.toLowerCase();
            if (mod && ((key === 'z' && event.shiftKey) || key === 'y')) {
                event.preventDefault();
                redo();
                return;
            }
            if (mod && key === 'z') {
                event.preventDefault();
                undo();
                return;
            }
            if (mod || event.altKey) return;

            if (event.key === 'Escape') {
                setBrushState(null);
                setHelpOpen(false);
            } else if (/^[1-9]$/.test(event.key)) {
                const mission = dockMissions[Number(event.key) - 1];
                if (mission) setBrush({ kind: 'mission', missionId: mission.id });
            } else if (key === 'e') {
                setBrushState((current) => (current?.kind === 'eraser' ? null : { kind: 'eraser' }));
            } else if (event.key === 'ArrowLeft') {
                navigate(-1);
            } else if (event.key === 'ArrowRight') {
                navigate(1);
            } else if (key === 't') {
                goToday();
            } else if (event.key === '?') {
                setHelpOpen((open) => !open);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [popover, planWeekFor, undo, redo, dockMissions, setBrush, navigate, goToday]);

    // ── Confirmation ──────────────────────────────────────────────────
    const { feedback, dismissFeedback } = board;
    useEffect(() => {
        if (!feedback) return;
        const timer = setTimeout(dismissFeedback, feedback.tone === 'error' ? 8000 : 6000);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [feedback?.id]);

    const todayInRange = today >= range.from && today <= range.to;

    return (
        <div className="relative flex h-full min-h-0 flex-1 flex-col bg-surface-2">
            {/* ── Top bar ─────────────────────────────────────────────── */}
            <header className="flex flex-wrap items-center gap-2.5 px-6 pb-3 pt-4 xl:px-8">
                <h1 className="mr-2 text-[24px] font-semibold tracking-tight text-slate-900">Planning</h1>

                <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-white px-0.5">
                    <button type="button" onClick={() => navigate(-1)} aria-label="Période précédente" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="min-w-[140px] select-none px-2 text-center text-[15px] font-medium text-slate-800">
                        {formatRangeLabel(view, range)}
                    </span>
                    <button type="button" onClick={() => navigate(1)} aria-label="Période suivante" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-white p-0.5">
                    {(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => mode !== view && setView(mode)}
                            className={cn(
                                'h-full rounded-[10px] px-4 text-[13px] transition-colors',
                                mode === view ? 'border border-primary-100 bg-primary-50 font-medium text-primary-600' : 'text-slate-600 hover:text-slate-900',
                            )}
                        >
                            {VIEW_LABELS[mode]}
                        </button>
                    ))}
                </div>

                {!todayInRange && (
                    <button type="button" onClick={goToday} className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-primary-600 hover:bg-primary-50">
                        Aujourd&apos;hui
                    </button>
                )}
                {(board.loading || board.saving) && state && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Enregistrement" />}

                <div className="ml-auto flex items-center gap-2">
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setHelpOpen((open) => !open)}
                            aria-label="Aide"
                            className={cn('flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100', helpOpen && 'bg-slate-100 text-slate-700')}
                        >
                            <CircleHelp className="h-5 w-5" />
                        </button>
                        {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
                    </div>
                    <button
                        type="button"
                        onClick={() => setPlanWeekFor(planWeekDefault())}
                        className="flex h-10 items-center gap-2 rounded-xl bg-primary-600 px-4 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
                    >
                        <CalendarPlus className="h-[18px] w-[18px]" />
                        Planifier la semaine
                    </button>
                </div>
            </header>

            <div className="relative min-h-[50px] border-t border-slate-200/70 px-6 py-2 xl:px-8">
                {alerts && (
                    <AlertsBar
                        alerts={alerts}
                        view={view}
                        today={today}
                        colors={colors}
                        filterUnplanned={!!unplannedFilter}
                        onToggleUnplanned={() => setUnplannedFilter(unplannedFilter ? null : alerts.unplannedSdrIds)}
                        onPaintMission={(missionId) => setBrush({ kind: 'mission', missionId })}
                        onDedupe={() => dispatch({ kind: 'dedupe' })}
                        onShowWeekend={() => setShowWeekend(true)}
                        teamSize={teamSdrs.length}
                        onPlanWeek={() => setPlanWeekFor(planWeekDefault())}
                        onHighlight={setHighlightId}
                    />
                )}
                {brush && !feedback && (
                    <div className="pointer-events-none absolute right-6 top-1/2 max-w-[48%] -translate-y-1/2 xl:right-8">
                        <BrushHint
                            brush={brush}
                            mission={brush.kind === 'mission' ? dockMissions.find((m) => m.id === brush.missionId) ?? null : null}
                            colors={colors}
                            today={today}
                        />
                    </div>
                )}
                {feedback && (
                    <div
                        key={feedback.id}
                        className={cn(
                            'absolute right-6 top-1/2 z-40 flex max-w-[420px] -translate-y-1/2 items-start gap-3 rounded-2xl border bg-white px-4 py-2.5 shadow-[0_10px_32px_rgba(15,23,42,0.12)] animate-in fade-in slide-in-from-right-2 duration-150 xl:right-8',
                            feedback.tone === 'error' ? 'border-rose-200' : feedback.tone === 'warn' ? 'border-amber-200' : 'border-slate-200',
                        )}
                        role="status"
                    >
                        <div className="min-w-0 flex-1">
                            <p className={cn('text-[13px] font-semibold', feedback.tone === 'error' ? 'text-rose-700' : 'text-slate-800')}>{feedback.label}</p>
                            {feedback.detail && <p className="mt-0.5 text-[12px] text-slate-500">{feedback.detail}</p>}
                        </div>
                        {feedback.canUndo && board.canUndo && (
                            <button
                                type="button"
                                onClick={() => {
                                    undo();
                                    dismissFeedback();
                                }}
                                className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold text-primary-600 hover:bg-primary-50"
                            >
                                <RotateCcw className="h-3.5 w-3.5" /> Annuler
                            </button>
                        )}
                        {feedback.canRedo && board.canRedo && (
                            <button
                                type="button"
                                onClick={() => {
                                    redo();
                                    dismissFeedback();
                                }}
                                className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold text-primary-600 hover:bg-primary-50"
                            >
                                <Redo2 className="h-3.5 w-3.5" /> Rétablir
                            </button>
                        )}
                        <button type="button" onClick={dismissFeedback} aria-label="Fermer" className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
            </div>

            {/* ── Board ───────────────────────────────────────────────── */}
            <div className={cn('relative min-h-0 flex-1 border-t border-slate-200/70 px-4 pt-1 transition-opacity xl:px-6', board.loading && state && 'opacity-60')}>
                {!state || !index ? (
                    board.error ? (
                        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                            <p className="text-[14px] text-slate-600">Le planning n’a pas pu être chargé : {board.error}</p>
                            <button type="button" onClick={() => void board.reload()} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium hover:bg-slate-50">
                                Réessayer
                            </button>
                        </div>
                    ) : (
                        <GridSkeleton />
                    )
                ) : visibleSdrs.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-[14px] text-slate-500">Aucun SDR actif à planifier.</div>
                ) : (
                    <BoardGrid
                        state={state}
                        index={index}
                        colors={colors}
                        view={view}
                        days={range.days}
                        sdrs={visibleSdrs}
                        brush={brush}
                        highlightMissionId={highlightId}
                        activeCellKey={popover ? `${popover.cell.sdrId}|${popover.cell.date}` : null}
                        onStroke={onStroke}
                        onOpenCell={(cell, rect, focus) => setPopover({ cell, anchor: rect, focus })}
                        onMove={onMove}
                        footer={
                            hiddenTests > 0 || showTests ? (
                                <button type="button" onClick={() => setShowTests(!showTests)} className="pl-2 text-[12px] text-slate-400 hover:text-slate-600">
                                    {showTests ? 'Masquer les comptes de test' : `${hiddenTests} compte${hiddenTests > 1 ? 's' : ''} de test masqué${hiddenTests > 1 ? 's' : ''} · Afficher`}
                                </button>
                            ) : null
                        }
                    />
                )}

                {state && (
                    <ToolDock
                        missions={dockMissions}
                        colors={colors}
                        today={today}
                        brush={brush}
                        canEditAbsences={state.canEditAbsences}
                        onBrushChange={setBrush}
                        lastMissionId={lastMissionId}
                        periodDays={periodDays}
                        onHighlight={setHighlightId}
                    />
                )}

                {welcome && state && (
                    <WelcomeCard
                        onClose={() => {
                            setWelcome(false);
                            writePref(PREF.welcome, 'seen');
                        }}
                    />
                )}
            </div>

            {popover && state && index && (
                <CellPopover
                    key={`${popover.cell.sdrId}|${popover.cell.date}|${popover.focus.kind}`}
                    cell={popover.cell}
                    anchor={popover.anchor}
                    focus={popover.focus}
                    state={state}
                    index={index}
                    colors={colors}
                    sdr={state.sdrs.find((s) => s.id === popover.cell.sdrId)}
                    onIntent={dispatch}
                    onClose={() => setPopover(null)}
                />
            )}

            {planWeekFor && (
                <PlanWeekDialog
                    transport={transport}
                    initialMonday={planWeekFor}
                    sdrIds={teamSdrs.map((s) => s.id)}
                    onCopy={(ops: BoardOp[], label: string, monday: string) => {
                        dispatch({ kind: 'ops', ops, label, role: 'bulk' });
                        setPlanWeekFor(null);
                        showWeek(monday);
                    }}
                    onPlanByHand={(monday) => {
                        setPlanWeekFor(null);
                        showWeek(monday);
                        if (!brush && dockMissions[0]) setBrush({ kind: 'mission', missionId: lastMissionId ?? dockMissions[0].id });
                    }}
                    onClose={() => setPlanWeekFor(null)}
                />
            )}
        </div>
    );
}

function HelpPanel({ onClose }: { onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const onDown = (event: MouseEvent) => {
            if (ref.current && !ref.current.parentElement?.contains(event.target as Node)) onClose();
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [onClose]);
    return (
        <div ref={ref} className="absolute right-0 top-12 z-50 w-[400px] rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_16px_48px_rgba(15,23,42,0.16)] animate-in fade-in zoom-in-95 duration-100">
            <p className="text-[15px] font-semibold text-slate-900">Comment ça marche</p>
            <ul className="mt-3 space-y-2">
                {HOW_TO.map((item) => (
                    <li key={item.title} className="text-[13px] leading-relaxed text-slate-600">
                        <span className="font-semibold text-slate-800">{item.title} · </span>
                        {item.text}
                    </li>
                ))}
            </ul>
            <p className="mt-4 text-[12px] font-semibold text-slate-500">Raccourcis</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                {SHORTCUTS.map(([key, label]) => (
                    <div key={key} className="contents">
                        <dt>
                            <kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-600">{key}</kbd>
                        </dt>
                        <dd className="text-[12px] text-slate-600">{label}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

function WelcomeCard({ onClose }: { onClose: () => void }) {
    return (
        <div className="absolute right-6 top-4 z-30 w-[340px] rounded-2xl border border-primary-100 bg-white p-5 shadow-[0_16px_48px_rgba(15,23,42,0.14)] animate-in fade-in slide-in-from-top-1 duration-200">
            <p className="text-[15px] font-semibold text-slate-900">Le planning se peint</p>
            <ol className="mt-3 space-y-2 text-[13px] leading-relaxed text-slate-600">
                <li><span className="font-semibold text-primary-600">1.</span> Choisissez une mission dans la barre du bas.</li>
                <li><span className="font-semibold text-primary-600">2.</span> Glissez un rectangle sur les jours et les SDR à planifier.</li>
                <li><span className="font-semibold text-primary-600">3.</span> Une erreur ? Ctrl+Z. Tout le reste est dans le <span className="font-semibold">?</span> en haut.</li>
            </ol>
            <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl bg-primary-600 py-2 text-[13px] font-semibold text-white hover:bg-primary-700">
                Compris
            </button>
        </div>
    );
}

function GridSkeleton() {
    return (
        <div className="space-y-5 px-2 pt-10">
            {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                    <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200/70" />
                    <div className="h-4 w-28 animate-pulse rounded bg-slate-200/70" />
                    <div className="ml-6 grid flex-1 grid-cols-5 gap-4">
                        {Array.from({ length: 5 }).map((__, j) => (
                            <div key={j} className="h-8 animate-pulse rounded-full bg-slate-200/50" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function BoardSkeleton() {
    return (
        <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-2">
            <div className="flex items-center gap-3 px-6 pb-3 pt-4">
                <div className="h-7 w-32 animate-pulse rounded-lg bg-slate-200/70" />
                <div className="h-10 w-52 animate-pulse rounded-xl bg-slate-200/50" />
                <div className="h-10 w-64 animate-pulse rounded-xl bg-slate-200/50" />
            </div>
            <GridSkeleton />
        </div>
    );
}
