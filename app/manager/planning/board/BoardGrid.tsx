'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ABSENCE_LABELS, isWeekendKey, isoWeekday, type BoardAbsence, type BoardBlock, type BoardSdr } from '@/lib/planning/board-shared';
import {
    avatarColor,
    cellEntries,
    cellKey,
    formatDayHeader,
    formatDays,
    initials,
    missionColor,
    sdrLoad,
    type BoardIndex,
    type BoardState,
    type Cell,
    type CellEntry,
    type MissionColor,
    type ViewMode,
} from './engine';

/** What a pointer gesture does: paint a mission, paint an absence, erase — or nothing (null). */
export type Brush = { kind: 'mission'; missionId: string } | { kind: 'absence' } | { kind: 'eraser' } | null;

export type CellFocus =
    | { kind: 'empty'; slot?: 'am' | 'pm' }
    | { kind: 'block'; blockId: string }
    | { kind: 'absence'; absence: BoardAbsence };

export const HATCH = 'repeating-linear-gradient(135deg, #F1F5F9 0 6px, #E2E8F0 6px 12px)';

const LAYOUT: Record<ViewMode, { head: number; minCol: number; row: number; pill: string; avatar: number }> = {
    week: { head: 210, minCol: 128, row: 84, pill: 'h-9 px-4 text-[13px] rounded-full', avatar: 44 },
    twoWeeks: { head: 190, minCol: 82, row: 64, pill: 'h-8 px-3 text-[12px] rounded-full', avatar: 34 },
    month: { head: 160, minCol: 40, row: 50, pill: 'h-7 px-1.5 text-[11px] rounded-md', avatar: 28 },
};

export function shortName(name: string): string {
    const words = name.trim().split(/\s+/);
    return words[0].length >= 4 || words.length === 1 ? words[0] : words.slice(0, 2).join(' ');
}

interface BoardGridProps {
    state: BoardState;
    index: BoardIndex;
    colors: Map<string, MissionColor>;
    view: ViewMode;
    days: string[];
    sdrs: BoardSdr[];
    brush: Brush;
    activeCellKey: string | null;
    onStroke: (cells: Cell[], half: boolean) => void;
    onOpenCell: (cell: Cell, anchor: DOMRect, focus: CellFocus) => void;
    onMove: (blockId: string, to: Cell) => void;
    footer?: ReactNode;
}

export function BoardGrid({
    state,
    index,
    colors,
    view,
    days,
    sdrs,
    brush,
    activeCellKey,
    onStroke,
    onOpenCell,
    onMove,
    footer,
}: BoardGridProps) {
    const layout = LAYOUT[view];
    const compact = view === 'month';
    const painting = brush !== null;

    // ── Brush strokes ─────────────────────────────────────────────────
    const [stroke, setStroke] = useState<{ keys: string[]; half: boolean } | null>(null);
    const strokeRef = useRef(stroke);
    strokeRef.current = stroke;
    const [hoverKey, setHoverKey] = useState<string | null>(null);

    useEffect(() => {
        if (!stroke) return;
        const finish = (event: PointerEvent) => {
            const current = strokeRef.current;
            setStroke(null);
            if (!current || current.keys.length === 0) return;
            const cells = current.keys.map((key) => {
                const [sdrId, date] = key.split('|');
                return { sdrId, date };
            });
            onStroke(cells, current.half || event.shiftKey);
        };
        const cancel = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setStroke(null);
        };
        window.addEventListener('pointerup', finish);
        window.addEventListener('keydown', cancel);
        return () => {
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('keydown', cancel);
        };
    }, [stroke, onStroke]);

    useEffect(() => {
        if (!painting) setStroke(null);
    }, [painting]);

    // ── Drag to move (no brush) ───────────────────────────────────────
    const [dragBlockId, setDragBlockId] = useState<string | null>(null);
    const [dropKey, setDropKey] = useState<string | null>(null);

    const brushColor = brush?.kind === 'mission' ? missionColor(colors, brush.missionId) : null;
    const gridTemplateColumns = `${layout.head}px repeat(${days.length}, minmax(${layout.minCol}px, 1fr))`;
    const strokeKeys = new Set(stroke?.keys ?? []);

    function paintRow(sdrId: string) {
        onStroke(days.filter((d) => !isWeekendKey(d)).map((date) => ({ sdrId, date })), false);
    }

    function renderPill(entry: CellEntry, cell: Cell, half: boolean, past: boolean) {
        const mission = index.missionsById.get(entry.missionId);
        const color = missionColor(colors, entry.missionId);
        const name = mission?.name ?? 'Mission';
        const label = half ? (compact ? initials(name) : `½ ${shortName(name)}`) : compact ? shortName(name) : name;
        const dupes = entry.duplicates.length;
        return (
            <button
                key={entry.block.id}
                type="button"
                draggable={!painting && !entry.block.id.startsWith('tmp-')}
                onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    setDragBlockId(entry.block.id);
                }}
                onDragEnd={() => {
                    setDragBlockId(null);
                    setDropKey(null);
                }}
                onClick={(event) => {
                    if (painting) return;
                    event.stopPropagation();
                    onOpenCell(cell, event.currentTarget.getBoundingClientRect(), { kind: 'block', blockId: entry.block.id });
                }}
                title={`${name}${mission ? ` · ${mission.clientName}` : ''}\n${entry.block.startTime}–${entry.block.endTime}${dupes ? `\nCompté ${dupes + 1} fois ce jour` : ''}`}
                className={cn(
                    'relative min-w-0 flex-1 flex items-center justify-center font-medium truncate transition-[transform,box-shadow] duration-150',
                    layout.pill,
                    !painting && 'cursor-grab hover:-translate-y-px hover:shadow-sm active:cursor-grabbing',
                    painting && 'pointer-events-none',
                    past && 'opacity-70',
                    dragBlockId === entry.block.id && 'opacity-40',
                    entry.block.id.startsWith('tmp-') && 'animate-pulse',
                )}
                style={{ backgroundColor: color.bg, color: color.text }}
            >
                <span className="truncate">{label}</span>
                {dupes > 0 && (
                    <span className="ml-1.5 shrink-0 rounded-full bg-white/80 px-1.5 text-[10px] font-semibold text-slate-500">
                        ×{dupes + 1}
                    </span>
                )}
            </button>
        );
    }

    function renderEmpty(cell: Cell, slot: 'am' | 'pm' | undefined, preview: boolean) {
        if (preview && brushColor) {
            return (
                <span
                    className={cn('flex flex-1 items-center justify-center border-2 bg-white', layout.pill)}
                    style={{ borderColor: brushColor.solid, color: brushColor.solid, boxShadow: `0 0 0 4px ${brushColor.bg}` }}
                >
                    <Plus className="h-4 w-4" />
                </span>
            );
        }
        return (
            <button
                type="button"
                tabIndex={painting ? -1 : 0}
                onClick={(event) => {
                    if (painting) return;
                    event.stopPropagation();
                    onOpenCell(cell, event.currentTarget.getBoundingClientRect(), { kind: 'empty', slot });
                }}
                aria-label="Ajouter une mission"
                className={cn(
                    'flex flex-1 items-center justify-center border border-dashed border-slate-200 text-slate-300 transition-colors',
                    layout.pill,
                    !painting && 'hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-500',
                    painting && 'pointer-events-none',
                    compact && 'border-transparent',
                )}
            >
                <Plus className={compact ? 'h-3 w-3 opacity-0 group-hover:opacity-100' : 'h-4 w-4'} />
            </button>
        );
    }

    function renderCell(sdr: BoardSdr, day: string) {
        const cell = { sdrId: sdr.id, date: day };
        const key = cellKey(sdr.id, day);
        const blocks = index.blocksByCell.get(key) ?? [];
        const absence = index.absenceByCell.get(key);
        const entries = cellEntries(blocks);
        const past = day < state.today;
        const inStroke = strokeKeys.has(key) || (!stroke && hoverKey === key && painting);
        const previewPaint = inStroke && brush?.kind === 'mission';

        let content: ReactNode;
        if (inStroke && brush?.kind === 'eraser' && (entries.length > 0 || absence)) {
            content = <span className={cn('flex flex-1 items-center justify-center border-2 border-dashed border-rose-300 bg-rose-50 text-rose-400', layout.pill)}>{compact ? '×' : 'Effacer'}</span>;
        } else if (inStroke && brush?.kind === 'absence') {
            content = <span className={cn('flex flex-1 items-center justify-center text-slate-500 ring-2 ring-slate-300', layout.pill)} style={{ background: HATCH }}>{compact ? '' : 'Absence'}</span>;
        } else if (absence) {
            content = (
                <button
                    type="button"
                    onClick={(event) => {
                        if (painting) return;
                        event.stopPropagation();
                        onOpenCell(cell, event.currentTarget.getBoundingClientRect(), { kind: 'absence', absence });
                    }}
                    className={cn('flex flex-1 items-center justify-center font-medium text-slate-500', layout.pill, painting && 'pointer-events-none')}
                    style={{ background: HATCH }}
                    title={ABSENCE_LABELS[absence.type] ?? 'Absence'}
                >
                    <span className="truncate">{compact ? '' : ABSENCE_LABELS[absence.type] ?? 'Absence'}</span>
                </button>
            );
        } else if (entries.length === 0) {
            content = renderEmpty(cell, undefined, previewPaint);
        } else if (entries.length === 1 && entries[0].slot === 'full') {
            content = previewPaint && entries[0].missionId !== (brush as { missionId: string }).missionId
                ? renderEmpty(cell, undefined, true)
                : renderPill(entries[0], cell, false, past);
        } else if (entries.length === 1) {
            const pill = renderPill(entries[0], cell, true, past);
            const free = renderEmpty(cell, entries[0].slot === 'am' ? 'pm' : 'am', previewPaint);
            content = entries[0].slot === 'am' ? <>{pill}{free}</> : <>{free}{pill}</>;
        } else {
            content = (
                <>
                    {renderPill(entries[0], cell, true, past)}
                    {renderPill(entries[1], cell, true, past)}
                    {entries.length > 2 && (
                        <span className="shrink-0 self-center text-[10px] font-semibold text-slate-400">+{entries.length - 2}</span>
                    )}
                </>
            );
        }

        const isToday = day === state.today;
        const weekStart = view !== 'week' && isoWeekday(day) === 1;
        return (
            <div
                key={key}
                role="gridcell"
                onPointerDown={(event) => {
                    if (!painting || event.button !== 0) return;
                    event.preventDefault();
                    setStroke({ keys: [key], half: event.shiftKey });
                }}
                onPointerEnter={() => {
                    if (!painting) return;
                    setHoverKey(key);
                    if (strokeRef.current && !strokeRef.current.keys.includes(key)) {
                        setStroke({ ...strokeRef.current, keys: [...strokeRef.current.keys, key] });
                    }
                }}
                onPointerLeave={() => setHoverKey((current) => (current === key ? null : current))}
                onDragOver={(event) => {
                    if (!dragBlockId) return;
                    event.preventDefault();
                    setDropKey(key);
                }}
                onDragLeave={() => setDropKey((current) => (current === key ? null : current))}
                onDrop={(event) => {
                    event.preventDefault();
                    if (dragBlockId) onMove(dragBlockId, cell);
                    setDragBlockId(null);
                    setDropKey(null);
                }}
                className={cn(
                    'group relative flex items-center gap-1.5 border-l border-dashed border-slate-200/80',
                    compact ? 'px-1' : 'px-2.5',
                    weekStart && 'border-solid border-slate-300/70',
                    isToday && 'bg-indigo-50/40',
                    painting && 'cursor-crosshair',
                    dropKey === key && 'bg-indigo-50 ring-2 ring-inset ring-indigo-300',
                    activeCellKey === key && 'bg-indigo-50/70',
                )}
                style={{ height: layout.row }}
            >
                {content}
            </div>
        );
    }

    return (
        <div className={cn('h-full overflow-auto', painting && 'select-none')} data-guide="grid">
            <div className="grid min-w-fit pb-32" style={{ gridTemplateColumns }} role="grid">
                {/* Header */}
                <div className="sticky left-0 top-0 z-20 bg-[#FAFAFB]" />
                {days.map((day) => {
                    const { weekday, day: num } = formatDayHeader(day);
                    const isToday = day === state.today;
                    const past = day < state.today;
                    const weekStart = view !== 'week' && isoWeekday(day) === 1;
                    return (
                        <div
                            key={day}
                            className={cn(
                                'sticky top-0 z-10 border-l border-dashed border-slate-200/80 bg-[#FAFAFB] pb-3 pt-2',
                                compact ? 'px-1 text-center' : 'px-4',
                                weekStart && 'border-solid border-slate-300/70',
                            )}
                        >
                            {compact ? (
                                <div className={cn('flex flex-col items-center leading-tight', past ? 'text-slate-400' : 'text-slate-700')}>
                                    <span className="text-[10px] font-medium uppercase">{weekday.slice(0, 1)}</span>
                                    <span className={cn('mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold', isToday && 'bg-indigo-600 text-white')}>
                                        {num}
                                    </span>
                                </div>
                            ) : (
                                <div className={cn('flex items-center gap-2 text-[15px] font-semibold', past ? 'text-slate-400' : 'text-slate-800', isToday && 'text-indigo-600')}>
                                    <span>{weekday} {num}</span>
                                    {isToday && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">Aujourd&apos;hui</span>}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Rows */}
                {sdrs.map((sdr) => {
                    const load = sdrLoad(index, sdr.id, days);
                    return (
                        <div key={sdr.id} className="contents">
                            <button
                                type="button"
                                onClick={() => painting && paintRow(sdr.id)}
                                className={cn(
                                    'sticky left-0 z-[5] flex items-center gap-3 bg-[#FAFAFB] pr-3 text-left',
                                    compact ? 'pl-1' : 'pl-2',
                                    painting ? 'cursor-pointer hover:bg-indigo-50/60' : 'cursor-default',
                                )}
                                style={{ height: layout.row }}
                                title={painting ? `Remplir toute la ligne de ${sdr.name}` : undefined}
                            >
                                <span
                                    className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
                                    style={{ width: layout.avatar, height: layout.avatar, backgroundColor: avatarColor(sdr.name), fontSize: layout.avatar * 0.36 }}
                                >
                                    {initials(sdr.name)}
                                </span>
                                <span className="min-w-0">
                                    <span className={cn('block truncate font-semibold text-slate-800', compact ? 'text-[12px]' : 'text-[15px]')}>
                                        {sdr.name}
                                    </span>
                                    {!compact && (
                                        <span className={cn('block text-[11px]', load.planned < load.capacity ? 'text-slate-400' : 'text-emerald-600')}>
                                            {formatDays(load.planned)} / {formatDays(load.capacity)}
                                            {!sdr.isActive && ' · inactif'}
                                        </span>
                                    )}
                                </span>
                            </button>
                            {days.map((day) => renderCell(sdr, day))}
                        </div>
                    );
                })}

                {footer && <div className="col-span-full pt-4">{footer}</div>}
            </div>
        </div>
    );
}
