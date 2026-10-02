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

interface UndoEntry {
    label: string;
    inverse: BoardOp[];
}

export interface BoardFeedback {
    id: number;
    label: string;
    detail?: string;
    tone: 'ok' | 'warn' | 'error';
    canUndo: boolean;
}

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

export function usePlanningBoard({ transport, from, to }: { transport: BoardTransport; from: string; to: string }) {
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

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const undoStack = useRef<UndoEntry[]>([]);
    const [undoDepth, setUndoDepth] = useState(0);
    const [feedback, setFeedback] = useState<BoardFeedback | null>(null);

    const rangeRef = useRef({ from, to });
    rangeRef.current = { from, to };
    const nextId = useRef(1);
    const writeVersion = useRef(0);
    const processing = useRef(false);
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Initial and range loads. A snapshot fetched while a write was in flight
    // may predate it, so it is replaced by a quiet refresh right after.
    useEffect(() => {
        const controller = new AbortController();
        const startedAt = writeVersion.current;
        setLoading(true);
        setError(null);
        transport.load(from, to, controller.signal)
            .then((snapshot) => {
                setConfirmed(stateFromSnapshot(snapshot, confirmedRef.current));
                setLoading(false);
                if (writeVersion.current !== startedAt) scheduleRefresh();
            })
            .catch((err: unknown) => {
                if (controller.signal.aborted) return;
                setError(err instanceof Error ? err.message : 'Chargement impossible');
                setLoading(false);
            });
        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transport, from, to]);

    const refresh = useCallback(async () => {
        const startedAt = writeVersion.current;
        const range = rangeRef.current;
        try {
            const snapshot = await transport.load(range.from, range.to);
            if (writeVersion.current !== startedAt || pendingRef.current.length > 0) return;
            if (rangeRef.current.from !== range.from || rangeRef.current.to !== range.to) return;
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
        try {
            while (pendingRef.current.length > 0) {
                const item = pendingRef.current[0];
                const base = confirmedRef.current;
                if (!base) break;
                const index = buildIndex(base);
                const resolution = resolveIntent(base, index, item.intent, { canEditAbsences: base.canEditAbsences });
                const label = describeIntent(item.intent, resolution.touched, index.missionsById);

                if (resolution.ops.length === 0) {
                    const detail = skipSummary(resolution, []);
                    if (detail) setFeedback({ id: item.id, label: 'Rien à modifier', detail, tone: 'warn', canUndo: false });
                    setPending(pendingRef.current.slice(1));
                    continue;
                }

                try {
                    writeVersion.current += 1;
                    const response = await transport.commit(resolution.ops);
                    const after = confirmedRef.current ?? base;
                    setConfirmed(applyOps(after, resolution.ops, response.results));

                    const reasons = response.results.filter((r) => !r.ok && r.reason).map((r) => r.reason as SkipReason);
                    const appliedAny = response.results.some((r) => r.ok);
                    const isUndo = item.intent.kind === 'ops' && !item.intent.undoable;
                    if (appliedAny && !isUndo && response.inverse.length > 0) {
                        undoStack.current = [...undoStack.current.slice(-49), { label, inverse: response.inverse }];
                        setUndoDepth(undoStack.current.length);
                    }
                    setFeedback({
                        id: item.id,
                        label: appliedAny ? label : 'Rien à modifier',
                        detail: skipSummary(resolution, reasons),
                        tone: appliedAny ? (reasons.length ? 'warn' : 'ok') : 'warn',
                        canUndo: appliedAny && !isUndo,
                    });
                } catch (err) {
                    setFeedback({
                        id: item.id,
                        label: 'Modification non enregistrée',
                        detail: err instanceof Error ? err.message : undefined,
                        tone: 'error',
                        canUndo: false,
                    });
                }
                setPending(pendingRef.current.slice(1));
            }
        } finally {
            processing.current = false;
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
        setUndoDepth(undoStack.current.length);
        dispatch({ kind: 'ops', ops: last.inverse, label: `Annulé · ${last.label}` });
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
        loading,
        error,
        saving: pending.length > 0,
        dispatch,
        undo,
        canUndo: undoDepth > 0,
        feedback,
        dismissFeedback: () => setFeedback(null),
        reload: refresh,
    };
}
