'use client';

import { useEffect, useMemo, useState } from 'react';
import { Brush, ChevronLeft, ChevronRight, Copy, Loader2, X } from 'lucide-react';
import { addDaysToKey, isWeekendKey, keysInRange, type BoardOp, type BoardSnapshot } from '@/lib/planning/board-shared';
import { buildIndex, cellKey, formatLongDate, formatShortDate, resolveIntent, stateFromSnapshot } from './engine';
import type { BoardTransport } from './usePlanningBoard';

interface PlanWeekDialogProps {
    transport: BoardTransport;
    initialMonday: string;
    /** SDRs shown on the board — the copy never touches hidden test accounts. */
    sdrIds: string[];
    onCopy: (ops: BoardOp[], label: string, monday: string) => void;
    onPlanByHand: (monday: string) => void;
    onClose: () => void;
}

/**
 * "Planifier la semaine": the bulk path. It previews, then copies the previous
 * week onto days that are still free — planned days are never overwritten,
 * absences and finished missions are skipped.
 */
export function PlanWeekDialog({ transport, initialMonday, sdrIds, onCopy, onPlanByHand, onClose }: PlanWeekDialogProps) {
    const [monday, setMonday] = useState(initialMonday);
    // Results are tagged with the week they belong to, so switching weeks shows
    // "loading" without resetting state inside the effect.
    const [loaded, setLoaded] = useState<{ monday: string; snapshot?: BoardSnapshot; error?: string } | null>(null);
    const snapshot = loaded?.monday === monday ? loaded.snapshot ?? null : null;
    const error = loaded?.monday === monday ? loaded.error ?? null : null;
    const previousMonday = addDaysToKey(monday, -7);
    const friday = addDaysToKey(monday, 4);

    useEffect(() => {
        const controller = new AbortController();
        transport.load(previousMonday, addDaysToKey(monday, 6), controller.signal)
            .then((data) => setLoaded({ monday, snapshot: data }))
            .catch((err: unknown) => {
                if (!controller.signal.aborted) setLoaded({ monday, error: err instanceof Error ? err.message : 'Chargement impossible' });
            });
        return () => controller.abort();
    }, [transport, monday, previousMonday]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const preview = useMemo(() => {
        if (!snapshot) return null;
        const state = stateFromSnapshot(snapshot);
        const index = buildIndex(state);
        const eligible = new Set(sdrIds);
        const targetDays = keysInRange(monday, friday);

        let freeDays = 0;
        const sdrsWithFreeDays = new Set<string>();
        for (const sdrId of eligible) {
            for (const day of targetDays) {
                const key = cellKey(sdrId, day);
                if (index.absenceByCell.has(key) || (index.blocksByCell.get(key)?.length ?? 0) > 0) continue;
                freeDays += 1;
                sdrsWithFreeDays.add(sdrId);
            }
        }

        const creates = state.blocks
            .filter((b) => eligible.has(b.sdrId) && b.date >= previousMonday && b.date < monday && !isWeekendKey(b.date))
            .map((b) => ({ sdrId: b.sdrId, missionId: b.missionId, date: addDaysToKey(b.date, 7), startTime: b.startTime, endTime: b.endTime }));
        const resolution = resolveIntent(state, index, { kind: 'copy', creates }, { canEditAbsences: state.canEditAbsences });
        const copiedSdrs = new Set(resolution.ops.flatMap((op) => (op.type === 'create' ? [op.sdrId] : [])));

        return { freeDays, sdrsWithFreeDays: sdrsWithFreeDays.size, sourceBlocks: creates.length, resolution, copiedSdrs: copiedSdrs.size };
    }, [snapshot, sdrIds, monday, friday, previousMonday]);

    const skipped = preview?.resolution.skipped;
    const skippedParts = skipped
        ? [
            skipped.occupied > 0 && `${skipped.occupied} jour${skipped.occupied > 1 ? 's' : ''} déjà planifié${skipped.occupied > 1 ? 's' : ''} gardé${skipped.occupied > 1 ? 's' : ''} tel${skipped.occupied > 1 ? 's' : ''} quel${skipped.occupied > 1 ? 's' : ''}`,
            skipped.outOfRange > 0 && `${skipped.outOfRange} sur une mission terminée`,
            skipped.absent > 0 && `${skipped.absent} sur une absence`,
        ].filter(Boolean)
        : [];

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 p-4 animate-in fade-in duration-150" onMouseDown={onClose}>
            <div
                className="w-full max-w-[520px] rounded-3xl bg-white p-6 shadow-[0_24px_64px_rgba(15,23,42,0.22)] animate-in zoom-in-95 duration-150"
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="plan-week-title"
            >
                <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <h2 id="plan-week-title" className="text-[20px] font-semibold tracking-tight text-slate-900">
                            Semaine du {formatLongDate(monday).replace(/^\S+\s/, '')}
                        </h2>
                        <p className="mt-0.5 text-[13px] text-slate-500">
                            {preview
                                ? preview.freeDays === 0
                                    ? 'Toute l’équipe est déjà planifiée.'
                                    : `${preview.sdrsWithFreeDays} SDR ont encore des jours libres · ${preview.freeDays} jours à planifier`
                                : error ?? 'Analyse de la semaine…'}
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setMonday(addDaysToKey(monday, -7))} aria-label="Semaine précédente" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100">
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => setMonday(addDaysToKey(monday, 7))} aria-label="Semaine suivante" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100">
                            <ChevronRight className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={onClose} aria-label="Fermer" className="ml-1 rounded-xl p-2 text-slate-400 hover:bg-slate-100">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <section className="mt-5 rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2">
                        <Copy className="h-4 w-4 text-primary-500" />
                        <h3 className="text-[14px] font-semibold text-slate-900">Reprendre la semaine précédente</h3>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
                        Chaque SDR retrouve les missions qu’il avait du {formatShortDate(previousMonday)} au {formatShortDate(addDaysToKey(previousMonday, 4))}, même jour, même durée — seulement sur ses jours encore libres.
                    </p>

                    <div className="mt-3 min-h-[44px] rounded-xl bg-slate-50 px-3 py-2.5">
                        {!preview ? (
                            <span className="flex items-center gap-2 text-[12px] text-slate-400">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calcul…
                            </span>
                        ) : preview.sourceBlocks === 0 ? (
                            <span className="text-[12px] text-slate-500">La semaine précédente est vide : rien à reprendre.</span>
                        ) : (
                            <>
                                <p className="text-[13px] font-semibold text-slate-800">
                                    {preview.resolution.touched === 0
                                        ? 'Rien à copier'
                                        : `${preview.resolution.touched} jour${preview.resolution.touched > 1 ? 's' : ''} à copier pour ${preview.copiedSdrs} SDR`}
                                </p>
                                {skippedParts.length > 0 && <p className="mt-0.5 text-[12px] text-slate-500">{skippedParts.join(' · ')}</p>}
                            </>
                        )}
                    </div>

                    <button
                        type="button"
                        disabled={!preview || preview.resolution.ops.length === 0}
                        onClick={() => {
                            if (!preview) return;
                            onCopy(preview.resolution.ops, `${preview.resolution.touched} jours copiés depuis la semaine précédente`, monday);
                        }}
                        className="mt-3 w-full rounded-xl bg-primary-600 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                    >
                        {preview && preview.resolution.touched > 0 ? `Copier ${preview.resolution.touched} jours` : 'Copier'}
                    </button>
                </section>

                <section className="mt-3 rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2">
                        <Brush className="h-4 w-4 text-primary-500" />
                        <h3 className="text-[14px] font-semibold text-slate-900">Planifier à la main</h3>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
                        Choisissez une mission dans la barre du bas puis glissez sur les cases. Cliquez le nom d’un SDR pour remplir toute sa semaine d’un coup.
                    </p>
                    <button
                        type="button"
                        onClick={() => onPlanByHand(monday)}
                        className="mt-3 w-full rounded-xl border border-slate-200 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        Ouvrir la semaine
                    </button>
                </section>
            </div>
        </div>
    );
}
