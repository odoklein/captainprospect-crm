'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Search, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ABSENCE_LABELS, type AbsenceKind, type BoardMission, type BoardSdr, type Slot } from '@/lib/planning/board-shared';
import {
    cellEntries,
    cellKey,
    describeProgress,
    formatLongDate,
    missionColor,
    type BoardIndex,
    type BoardState,
    type Cell,
    type Intent,
    type MissionColor,
} from './engine';
import { HATCH, type CellFocus } from './BoardGrid';

const SLOT_CHOICES: Array<{ slot: Slot; label: string }> = [
    { slot: 'full', label: 'Journée' },
    { slot: 'am', label: '½ matin' },
    { slot: 'pm', label: '½ après-midi' },
];

const ABSENCE_CHOICES: AbsenceKind[] = ['VACATION', 'SICK', 'TRAINING'];

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
    return (
        <div className="flex rounded-xl bg-slate-100 p-1">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    onClick={() => onChange(o.value)}
                    className={cn(
                        'flex-1 rounded-lg py-1.5 text-[12px] font-medium transition-colors',
                        value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function MissionList({
    missions,
    sdrId,
    colors,
    today,
    excludeId,
    onPick,
}: {
    missions: BoardMission[];
    sdrId: string;
    colors: Map<string, MissionColor>;
    today: string;
    excludeId?: string;
    onPick: (missionId: string) => void;
}) {
    const [query, setQuery] = useState('');
    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = missions.filter((m) => m.id !== excludeId && (!q || `${m.name} ${m.clientName}`.toLowerCase().includes(q)));
        return {
            own: list.filter((m) => m.assignedSdrIds.includes(sdrId)),
            other: list.filter((m) => !m.assignedSdrIds.includes(sdrId)),
        };
    }, [missions, query, sdrId, excludeId]);

    const row = (m: BoardMission) => (
        <li key={m.id}>
            <button
                type="button"
                onClick={() => onPick(m.id)}
                className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-slate-50"
            >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: missionColor(colors, m.id).solid }} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-slate-800">{m.name}</span>
                    <span className="block truncate text-[11px] text-slate-400">{describeProgress(m, today, false)}</span>
                </span>
            </button>
        </li>
    );

    return (
        <div>
            {missions.length > 7 && (
                <label className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 px-2.5 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Rechercher une mission"
                        className="h-8 w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400"
                    />
                </label>
            )}
            <div className="max-h-[240px] overflow-y-auto">
                {groups.own.length > 0 && (
                    <>
                        <p className="px-2 pb-1 text-[11px] font-medium text-slate-400">Ses missions</p>
                        <ul>{groups.own.map(row)}</ul>
                    </>
                )}
                {groups.other.length > 0 && (
                    <>
                        <p className={cn('px-2 pb-1 text-[11px] font-medium text-slate-400', groups.own.length > 0 && 'pt-2')}>
                            {groups.own.length > 0 ? 'Autres missions' : 'Missions en cours'}
                        </p>
                        <ul>{groups.other.map(row)}</ul>
                    </>
                )}
                {groups.own.length + groups.other.length === 0 && (
                    <p className="px-2 py-3 text-center text-[12px] text-slate-400">Aucune mission en cours ce jour-là</p>
                )}
            </div>
        </div>
    );
}

interface CellPopoverProps {
    cell: Cell;
    anchor: DOMRect;
    focus: CellFocus;
    state: BoardState;
    index: BoardIndex;
    colors: Map<string, MissionColor>;
    sdr: BoardSdr | undefined;
    onIntent: (intent: Intent) => void;
    onClose: () => void;
}

export function CellPopover({ cell, anchor, focus, state, index, colors, sdr, onIntent, onClose }: CellPopoverProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: anchor.bottom + 8, left: anchor.left });
    const [changing, setChanging] = useState(false);
    const [addSlot, setAddSlot] = useState<Slot>(focus.kind === 'empty' && focus.slot ? focus.slot : 'full');

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const { width, height } = el.getBoundingClientRect();
        const margin = 12;
        let top = anchor.bottom + 8;
        if (top + height > window.innerHeight - margin) top = Math.max(margin, anchor.top - height - 8);
        const left = Math.min(Math.max(margin, anchor.left + anchor.width / 2 - width / 2), window.innerWidth - width - margin);
        setPosition({ top, left });
    }, [anchor, changing, focus]);

    useEffect(() => {
        const onDown = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) onClose();
        };
        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    const runnable = state.missions
        .filter((m) => m.paintable && cell.date >= m.startDate && cell.date <= m.endDate)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const act = (intent: Intent) => {
        onIntent(intent);
        onClose();
    };

    const longDate = (key: string) => {
        const label = formatLongDate(key);
        return label.charAt(0).toUpperCase() + label.slice(1);
    };
    const subtitle = `${longDate(cell.date)} · ${sdr?.name ?? ''}`;

    let body;
    if (focus.kind === 'block') {
        const blocks = index.blocksByCell.get(cellKey(cell.sdrId, cell.date)) ?? [];
        const entry = cellEntries(blocks).find((e) => e.block.id === focus.blockId || e.duplicates.some((d) => d.id === focus.blockId));
        const block = entry?.block;
        const mission = block ? index.missionsById.get(block.missionId) : undefined;
        if (!entry || !block) {
            body = <p className="text-[13px] text-slate-500">Ce créneau vient de changer.</p>;
        } else {
            const color = missionColor(colors, block.missionId);
            body = (
                <>
                    <div className="flex items-start gap-2.5">
                        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color.solid }} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold text-slate-900">{mission?.name ?? 'Mission'}</p>
                            <p className="truncate text-[12px] text-slate-500">{subtitle}</p>
                        </div>
                    </div>
                    {mission && <p className="mt-2 text-[11px] text-slate-500">{describeProgress(mission, state.today)}</p>}

                    {entry.duplicates.length > 0 && (
                        <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                            Cette mission est posée {entry.duplicates.length + 1} fois ce jour.
                            <button
                                type="button"
                                onClick={() => act({ kind: 'dedupe' })}
                                className="ml-1 font-semibold underline underline-offset-2"
                            >
                                Supprimer les doublons
                            </button>
                        </div>
                    )}

                    {changing ? (
                        <div className="mt-3">
                            <MissionList
                                missions={runnable}
                                sdrId={cell.sdrId}
                                colors={colors}
                                today={state.today}
                                excludeId={block.missionId}
                                onPick={(missionId) => act({ kind: 'change-mission', blockId: block.id, missionId })}
                            />
                        </div>
                    ) : (
                        <>
                            <div className="mt-3">
                                <Segmented
                                    value={entry.slot}
                                    options={SLOT_CHOICES.map((c) => ({ value: c.slot, label: c.label }))}
                                    onChange={(slot) => slot !== entry.slot && act({ kind: 'set-slot', blockId: block.id, slot })}
                                />
                            </div>
                            <div className="mt-3 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setChanging(true)}
                                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                                >
                                    <ArrowLeftRight className="h-3.5 w-3.5" /> Changer de mission
                                </button>
                                <button
                                    type="button"
                                    onClick={() => act({ kind: 'remove-block', blockId: block.id })}
                                    className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-[12px] font-medium text-rose-600 hover:bg-rose-50"
                                >
                                    <Trash2 className="h-3.5 w-3.5" /> Retirer
                                </button>
                            </div>
                        </>
                    )}
                </>
            );
        }
    } else if (focus.kind === 'absence') {
        const a = focus.absence;
        const singleDay = a.startDate === a.endDate;
        const kind = (ABSENCE_CHOICES as string[]).includes(a.type) ? (a.type as AbsenceKind) : 'VACATION';
        body = (
            <>
                <div className="flex items-start gap-2.5">
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: HATCH }} />
                    <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-slate-900">{ABSENCE_LABELS[a.type] ?? 'Absence'}</p>
                        <p className="truncate text-[12px] text-slate-500">
                            {singleDay ? subtitle : `Du ${formatLongDate(a.startDate)} au ${formatLongDate(a.endDate)} · ${sdr?.name ?? ''}`}
                        </p>
                    </div>
                </div>
                {state.canEditAbsences ? (
                    <>
                        {singleDay && (
                            <div className="mt-3">
                                <Segmented
                                    value={kind}
                                    options={ABSENCE_CHOICES.map((k) => ({ value: k, label: ABSENCE_LABELS[k] }))}
                                    onChange={(absenceType) => absenceType !== kind && act({ kind: 'absence', cells: [cell], absenceType })}
                                />
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => act({ kind: 'erase', cells: [cell] })}
                            className="mt-3 w-full rounded-xl border border-slate-200 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                            {singleDay ? 'Retirer l’absence' : 'Retirer ce jour de l’absence'}
                        </button>
                        <p className="mt-2 text-[11px] text-slate-400">Les absences sont aussi prises en compte par le module RH.</p>
                    </>
                ) : (
                    <p className="mt-3 text-[12px] text-slate-500">Seul un manager peut modifier une absence.</p>
                )}
            </>
        );
    } else {
        body = (
            <>
                <p className="text-[14px] font-semibold text-slate-900">Ajouter une mission</p>
                <p className="truncate text-[12px] text-slate-500">{subtitle}</p>
                <div className="mt-3">
                    <Segmented
                        value={addSlot}
                        options={SLOT_CHOICES.map((c) => ({ value: c.slot, label: c.label }))}
                        onChange={setAddSlot}
                    />
                </div>
                <div className="mt-3">
                    <MissionList
                        missions={runnable}
                        sdrId={cell.sdrId}
                        colors={colors}
                        today={state.today}
                        onPick={(missionId) => act({ kind: 'place', cell, missionId, slot: addSlot })}
                    />
                </div>
                {state.canEditAbsences && (
                    <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3">
                        <span className="mr-auto text-[12px] text-slate-500">Absence ce jour :</span>
                        {ABSENCE_CHOICES.map((absenceType) => (
                            <button
                                key={absenceType}
                                type="button"
                                onClick={() => act({ kind: 'absence', cells: [cell], absenceType })}
                                className="rounded-lg px-2 py-1 text-[12px] font-medium text-slate-600 hover:bg-slate-100"
                            >
                                {ABSENCE_LABELS[absenceType]}
                            </button>
                        ))}
                    </div>
                )}
            </>
        );
    }

    return (
        <div
            ref={ref}
            className="fixed z-50 w-[320px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_16px_48px_rgba(15,23,42,0.16)] animate-in fade-in zoom-in-95 duration-100"
            style={position}
            role="dialog"
        >
            <button type="button" onClick={onClose} aria-label="Fermer" className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
            </button>
            {body}
        </div>
    );
}
