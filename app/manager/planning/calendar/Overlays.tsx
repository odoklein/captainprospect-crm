'use client';

import type { DragEvent } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeleteConfirmPopoverState } from './types';

export function DeleteConfirmPopover({
    state,
    deleting,
    onCancel,
    onConfirm,
}: {
    state: DeleteConfirmPopoverState;
    deleting: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const top = Math.min(window.innerHeight - 160, Math.max(16, state.top + 8));
    const left = Math.min(window.innerWidth - 300, Math.max(16, state.left + 8));
    return (
        <div className="fixed inset-0 z-[70]" onClick={onCancel}>
            <div
                className="absolute w-[280px] rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-sm shadow-xl shadow-slate-900/10 p-3.5 animate-in fade-in zoom-in-95 duration-150"
                style={{ top, left }}
                onClick={(event) => event.stopPropagation()}
            >
                <p className="text-xs font-semibold text-slate-800">Supprimer ce créneau ?</p>
                <p className="text-[11px] text-slate-500 mt-1 truncate">
                    {state.sdrName} · {state.missionName}
                </p>
                <div className="mt-3 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                        disabled={deleting}
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={deleting}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                    >
                        {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        Supprimer
                    </button>
                </div>
            </div>
        </div>
    );
}

export function TrashDropZone({
    isOver,
    isDeleting,
    onDragOver,
    onDragLeave,
    onDrop,
}: {
    isOver: boolean;
    isDeleting: boolean;
    onDragOver: (event: DragEvent<HTMLDivElement>) => void;
    onDragLeave: () => void;
    onDrop: (event: DragEvent<HTMLDivElement>) => void;
}) {
    return (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center pointer-events-none">
            <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={cn(
                    'pointer-events-auto flex items-center gap-2 rounded-full border px-5 py-2.5 shadow-lg shadow-red-500/10 transition-all duration-200',
                    isDeleting && 'opacity-90',
                    isOver
                        ? 'bg-red-600 border-red-600 text-white scale-110 shadow-red-500/30'
                        : 'bg-white/95 backdrop-blur-sm border-red-200 text-red-600',
                )}
            >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span className="text-xs font-semibold">
                    {isDeleting ? 'Suppression en cours...' : isOver ? 'Relâchez pour supprimer' : 'Glissez ici pour supprimer'}
                </span>
            </div>
        </div>
    );
}
