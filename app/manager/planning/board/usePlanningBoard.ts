'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    SKIP_LABELS,
    type BatchResponse,
    type BoardOp,
    type BoardSnapshot,
    type SkipReason,
} from '@/lib/planning/board-shared';
import {
    applyOps,
    buildIndex,
    describeIntent,
    resolveIntent,
    stateFromSnapshot,
    type BoardState,
    type Intent,
    type Resolution,
} from './engine';

// ── Transport ──────────────────────────────────────────────────────────

/** Where the board reads and writes. Swappable so the board can run on fixtures. */
export interface BoardTransport {
    load(from: string, to: string, signal?: AbortSignal): Promise<BoardSnapshot>;
    commit(ops: BoardOp[]): Promise<BatchResponse>;
}

async function readJson<T>(res: Response): Promise<T> {
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error || 'Une erreur est survenue');
    return json.data as T;
}

export const httpTransport: BoardTransport = {
    async load(from, to, signal) {
        return readJson<BoardSnapshot>(await fetch(`/api/planning/board?from=${from}&to=${to}`, { signal, cache: 'no-store' }));
    },
    async commit(ops) {
        return readJson<BatchResponse>(await fetch('/api/planning/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ops }),
        }));
    },
};

// ── Hook ───────────────────────────────────────────────────────────────

interface PendingIntent {
    id: number;
    intent: Intent;
}

interface HistoryEntry {
    label: string;
    /** Ops that revert the entry — run them to undo (or, from the redo stack, to redo). */
    ops: BoardOp[];
}

export interface BoardFeedback {
    id: number;
    label: string;
    detail?: string;
    tone: 'ok' | 'warn' | 'error';
    canUndo: boolean;
    canRedo: boolean;
}

export interface BoardRangeKey {
    from: string;
    to: string;
}

const rangeKey = (r: BoardRangeKey) => `${r.from}|${r.to}`;
const CACHE_LIMIT = 12;

function skipSummary(resolution: Resolution, serverReasons: SkipReason[]): string | undefined {
    const parts: string[] = [];
    const { absent, outOfRange, occupied } = resolution.skipped;
    const counts = new Map<string, number>();
    const add = (label: string, n: number) => n > 0 && counts.set(label, (counts.get(label) ?? 0) + n);
    add(SKIP_LABELS.absent, absent);
    add(SKIP_LABELS['out-of-range'], outOfRange);
    add('déjà planifié', occupied);
    for (const reason of serverReasons) add(SKIP_LABELS[reason], 1);
    for (const [label, n] of counts) parts.push(`${n} ${label}`);
    return parts.length ? `Ignoré : ${parts.join(', ')}` : undefined;
}

export function usePlanningBoard({
    transport,
    from,
    to,
    neighbours = [],
}: {
    transport: BoardTransport;
    from: string;
    to: string;
    /** Periods the planner is likely to open next (previous / next), loaded ahead. */
    neighbours?: BoardRangeKey[];
}) {
    const [confirmed, setConfirmedState] = useState<BoardState | null>(null);
    const confirmedRef = useRef<BoardState | null>(null);
    const setConfirmed = useCallback((next: BoardState | null) => {
        confirmedRef.current = next;
        setConfirmedState(next);
    }, []);

    const [pending, setPendingState] = useState<PendingIntent[]>([]);
    const pendingRef = useRef<PendingIntent[]>([]);
    const setPending = useCallback((next: PendingIntent[]) => {
        pendingRef.current = next;
        setPendingState(next);
    }, []);

    /**
     * The snapshot the period opened with. Unlike `state` it does not follow
     * edits, so what is derived from it (the dock order) stays put while painting.
     */
    const [baseline, setBaseline] = useState<BoardSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<BoardFeedback | null>(null);

    const undoStack = useRef<HistoryEntry[]>([]);
    const redoStack = useRef<HistoryEntry[]>([]);
    const [historyDepth, setHistoryDepth] = useState({ undo: 0, redo: 0 });
    const syncHistory = () => setHistoryDepth({ undo: undoStack.current.length, redo: redoStack.current.length });

    const rangeRef = useRef({ from, to });
    rangeRef.current = { from, to };
    const nextId = useRef(1);
    const writeVersion = useRef(0);
    const processing = useRef(false);
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    /** Snapshots by period. Any write clears it: a neighbour may be stale after a copy. */
    const cache = useRef(new Map<string, BoardSnapshot>());
    const [cacheVersion, setCacheVersion] = useState(0);
    const remember = (key: string, snapshot: BoardSnapshot) => {
        cache.current.delete(key);
        cache.current.set(key, snapshot);
        while (cache.current.size > CACHE_LIMIT) cache.current.delete(cache.current.keys().next().value as string);
    };

    // Period loads. A cached period shows at once and is refreshed quietly.
    // A snapshot fetched while a write was in flight may predate it, so it is
    // followed by a quiet refresh.
    useEffect(() => {
        const controller = new AbortController();
        const key = rangeKey({ from, to });
        const startedAt = writeVersion.current;
        const cached = cache.current.get(key);
        if (cached) {
            setConfirmed(stateFromSnapshot(cached, confirmedRef.current));
            setBaseline(cached);
            setLoading(false);
        } else {
            setLoading(true);
        }
        setError(null);
        transport.load(from, to, controller.signal)
            .then((snapshot) => {
                remember(key, snapshot);
                const stale = writeVersion.current !== startedAt || pendingRef.current.length > 0;
                if (!stale || !cached) setConfirmed(stateFromSnapshot(snapshot, confirmedRef.current));
                if (stale) scheduleRefresh();
                if (!cached) setBaseline(snapshot);
                setLoading(false);
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted || cached) return;
                setError(err instanceof Error ? err.message : 'Chargement impossible');
                setLoading(false);
            });
        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transport, from, to]);

    // Load the neighbouring periods in the background once the current one is in.
    const neighbourKeys = neighbours.map(rangeKey).join(',');
    useEffect(() => {
        if (loading) return;
        const controller = new AbortController();
        const timer = setTimeout(() => {
            for (const range of neighbours) {
                const key = rangeKey(range);
                if (cache.current.has(key)) continue;
                transport.load(range.from, range.to, controller.signal)
                    .then((snapshot) => remember(key, snapshot))
                    .catch(() => { /* a miss only means a normal load later */ });
            }
        }, 400);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transport, neighbourKeys, loading, cacheVersion]);

    const refresh = useCallback(async () => {
        const startedAt = writeVersion.current;
        const range = rangeRef.current;
        try {
            const snapshot = await transport.load(range.from, range.to);
            if (writeVersion.current !== startedAt || pendingRef.current.length > 0) return;
            if (rangeRef.current.from !== range.from || rangeRef.current.to !== range.to) return;
            remember(rangeKey(range), snapshot);
            setConfirmed(stateFromSnapshot(snapshot, confirmedRef.current));
            setError(null);
        } catch { /* the next write or navigation reloads */ }
    }, [transport, setConfirmed]);

    function scheduleRefresh() {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => void refresh(), 700);
    }

    useEffect(() => () => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
    }, []);

    const processQueue = useCallback(async () => {
        if (processing.current) return;
        processing.current = true;
        let wrote = false;
        try {
            while (pendingRef.current.length > 0) {
                const item = pendingRef.current[0];
                const base = confirmedRef.current;
                if (!base) break;
                const index = buildIndex(base);
                const resolution = resolveIntent(base, index, item.intent, { canEditAbsences: base.canEditAbsences });
                const label = describeIntent(item.intent, resolution.touched, index.missionsById);
                const role = item.intent.kind === 'ops' ? item.intent.role : 'action';

                if (resolution.ops.length === 0) {
                    const detail = skipSummary(resolution, []);
                    if (detail) setFeedback({ id: item.id, label: 'Rien à modifier', detail, tone: 'warn', canUndo: false, canRedo: false });
                    setPending(pendingRef.current.slice(1));
                    continue;
                }

                try {
                    writeVersion.current += 1;
                    wrote = true;
                    const response = await transport.commit(resolution.ops);
                    const after = confirmedRef.current ?? base;
                    setConfirmed(applyOps(after, resolution.ops, response.results));

                    const reasons = response.results.filter((r) => !r.ok && r.reason).map((r) => r.reason as SkipReason);
                    const appliedAny = response.results.some((r) => r.ok);
                    if (appliedAny && response.inverse.length > 0) {
                        // An undo's inverse is its redo. Anything else goes on the undo
                        // stack, and a fresh action makes what could be redone meaningless.
                        const historyLabel = item.intent.kind === 'ops' ? item.intent.historyLabel ?? label : label;
                        const entry = { label: historyLabel, ops: response.inverse };
                        if (role === 'undo') {
                            redoStack.current = [...redoStack.current.slice(-49), entry];
                        } else {
                            undoStack.current = [...undoStack.current.slice(-49), entry];
                            if (role !== 'redo') redoStack.current = [];
                        }
                        syncHistory();
                    }
                    setFeedback({
                        id: item.id,
                        label: appliedAny ? label : 'Rien à modifier',
                        detail: skipSummary(resolution, reasons),
                        tone: appliedAny ? (reasons.length ? 'warn' : 'ok') : 'warn',
                        canUndo: appliedAny && role !== 'undo',
                        canRedo: appliedAny && role === 'undo',
                    });
                } catch (err) {
                    setFeedback({
                        id: item.id,
                        label: 'Modification non enregistrée',
                        detail: err instanceof Error ? err.message : undefined,
                        tone: 'error',
                        canUndo: false,
                        canRedo: false,
                    });
                }
                setPending(pendingRef.current.slice(1));
            }
        } finally {
            processing.current = false;
            if (wrote) {
                cache.current.clear();
                setCacheVersion((v) => v + 1);
            }
            scheduleRefresh();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transport, setConfirmed, setPending]);

    const dispatch = useCallback((intent: Intent) => {
        setPending([...pendingRef.current, { id: nextId.current++, intent }]);
        void processQueue();
    }, [processQueue, setPending]);

    const undo = useCallback(() => {
        const last = undoStack.current[undoStack.current.length - 1];
        if (!last) return;
        undoStack.current = undoStack.current.slice(0, -1);
        syncHistory();
        dispatch({ kind: 'ops', ops: last.ops, label: `Annulé · ${last.label}`, historyLabel: last.label, role: 'undo' });
    }, [dispatch]);

    const redo = useCallback(() => {
        const last = redoStack.current[redoStack.current.length - 1];
        if (!last) return;
        redoStack.current = redoStack.current.slice(0, -1);
        syncHistory();
        dispatch({ kind: 'ops', ops: last.ops, label: `Rétabli · ${last.label}`, historyLabel: last.label, role: 'redo' });
    }, [dispatch]);

    // What the board shows: the confirmed state plus every write still queued.
    const state = useMemo(() => {
        if (!confirmed) return null;
        let view = confirmed;
        for (const item of pending) {
            const resolution = resolveIntent(view, buildIndex(view), item.intent, { canEditAbsences: view.canEditAbsences });
            view = applyOps(view, resolution.ops, undefined, (i) => `tmp-${item.id}-${i}`);
        }
        return view;
    }, [confirmed, pending]);

    return {
        state,
        baseline,
        loading,
        error,
        saving: pending.length > 0,
        dispatch,
        undo,
        redo,
        canUndo: historyDepth.undo > 0,
        canRedo: historyDepth.redo > 0,
        feedback,
        dismissFeedback: () => setFeedback(null),
        reload: refresh,
    };
}
