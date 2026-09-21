'use client';

import { useMemo, useState } from 'react';
import type { DragEvent, MutableRefObject } from 'react';
import { Clock, UserCircle, Loader2, Lock, Plus, Phone, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMissionColor } from '../planning-utils';
import { CHANNEL_ICONS, DAY_LABELS_SHORT, DAY_CELL_CAPACITY, getBlockDayUnits, formatDayValue } from './utils';
import type {
    CalBlock,
    CalTeamMember,
    DeleteConfirmPopoverState,
    DragState,
    MonthlyData,
    QuickAddCell,
    WeekDay,
} from './types';

/**
 * Layout constants.
 *
 * Rows have a FIXED height so the grid never reflows when missions are added:
 * a cell that overflows shows a "+N" chip instead of pushing the whole week down.
 */
const SDR_COL_WIDTH = 196;
const WEEKEND_COLLAPSED_WIDTH = 56;
const CELL_FOOTER_HEIGHT = 18;

const DENSITY = {
    compact: { rowHeight: 100, maxChips: 2 },
    comfort: { rowHeight: 164, maxChips: 4 },
} as const;

type Density = keyof typeof DENSITY;

/** Reference week capacity (in days) used for the per-SDR weekly load bar. */
const WEEK_REFERENCE_DAYS = 5;

export function WeekGrid({
    days,
    data,
    sdrs,
    selectedDate,
    selectedDates,
    onSelectDate,
    onToggleCellDate,
    hoveredSdrId,
    dragState,
    dragOverCell,
    onSetHoveredSdrId,
    onSetDragState,
    onSetDragOverCell,
    onOpenQuickAdd,
    onMoveBlock,
    onOpenDeleteConfirm,
    rowRefs,
    onSetDragOverTrash,
    deletingBlockId,
}: {
    days: WeekDay[];
    data: MonthlyData | null;
    sdrs: CalTeamMember[];
    selectedDate: string | null;
    selectedDates: string[];
    hoveredSdrId: string | null;
    dragState: DragState | null;
    dragOverCell: QuickAddCell | null;
    /** Day-header click — opens the day detail panel. */
    onSelectDate: (date: string, append: boolean) => void;
    /** Cell click — updates the multi-day selection only, without opening the day panel. */
    onToggleCellDate: (date: string, append: boolean) => void;
    onSetHoveredSdrId: (id: string | null) => void;
    onSetDragState: (state: DragState | null) => void;
    onSetDragOverCell: (cell: QuickAddCell | null) => void;
    onOpenQuickAdd: (cell: QuickAddCell, target: HTMLElement) => void;
    onMoveBlock: (blockId: string, newDate: string, newSdrId: string) => Promise<void>;
    onOpenDeleteConfirm: (state: DeleteConfirmPopoverState | null) => void;
    rowRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
    onSetDragOverTrash: (active: boolean) => void;
    deletingBlockId: string | null;
}) {
    const [density, setDensity] = useState<Density>('compact');
    const [weekendPref, setWeekendPref] = useState<boolean | null>(null);

    const sdrIds = useMemo(() => new Set(sdrs.map((sdr) => sdr.id)), [sdrs]);

    /** Blocks of the displayed SDRs, indexed per cell, per day and per SDR-week. */
    const index = useMemo(() => {
        const byCell = new Map<string, CalBlock[]>();
        const byDate = new Map<string, { sdrIds: Set<string>; units: number }>();
        const bySdrWeek = new Map<string, number>();

        for (const day of days) {
            const dayEntry = { sdrIds: new Set<string>(), units: 0 };
            byDate.set(day.dateStr, dayEntry);

            for (const block of data?.blocksByDate[day.dateStr] ?? []) {
                if (!sdrIds.has(block.sdr.id)) continue;

                const key = `${day.dateStr}|${block.sdr.id}`;
                const list = byCell.get(key);
                if (list) list.push(block);
                else byCell.set(key, [block]);

                const units = getBlockDayUnits(block);
                dayEntry.sdrIds.add(block.sdr.id);
                dayEntry.units += units;
                bySdrWeek.set(block.sdr.id, (bySdrWeek.get(block.sdr.id) ?? 0) + units);
            }
        }

        for (const list of byCell.values()) {
            list.sort((a, b) => a.startTime.localeCompare(b.startTime));
        }

        return { byCell, byDate, bySdrWeek };
    }, [data, days, sdrIds]);

    const weekendHasBlocks = useMemo(
        () => days.slice(5).some((day) => (index.byDate.get(day.dateStr)?.units ?? 0) > 0),
        [days, index],
    );
    const showWeekend = weekendPref ?? weekendHasBlocks;

    const gridCols = useMemo(() => {
        const weekend = showWeekend
            ? 'repeat(2, minmax(0, 0.8fr))'
            : `repeat(2, ${WEEKEND_COLLAPSED_WIDTH}px)`;
        return `${SDR_COL_WIDTH}px repeat(5, minmax(0, 1fr)) ${weekend}`;
    }, [showWeekend]);

    const { rowHeight, maxChips } = DENSITY[density];

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* ── Day header ───────────────────────────────────────────── */}
            <div
                className="grid flex-shrink-0 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50/60"
                style={{ gridTemplateColumns: gridCols }}
            >
                <div className="px-3 py-2 border-r border-slate-200 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">SDR</span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setDensity((current) => (current === 'compact' ? 'comfort' : 'compact'))}
                            className="px-1.5 py-0.5 text-[10px] font-medium rounded-md border border-slate-200 text-slate-500 bg-white hover:border-slate-300 hover:text-slate-700 transition-colors"
                            title="Hauteur des lignes — la grille garde toujours la même hauteur, seul le nombre de créneaux affichés change"
                        >
                            {density === 'compact' ? 'Compact' : 'Confort'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setWeekendPref(!showWeekend)}
                            className={cn(
                                'p-1 rounded-md border transition-colors',
                                showWeekend
                                    ? 'border-slate-200 text-slate-500 bg-white hover:text-slate-700'
                                    : 'border-transparent text-slate-300 hover:text-slate-500',
                            )}
                            title={showWeekend ? 'Réduire le week-end' : 'Afficher le week-end'}
                        >
                            {showWeekend ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                </div>

                {days.map((day, dayIndex) => {
                    const isWeekend = dayIndex >= 5;
                    const collapsed = isWeekend && !showWeekend;
                    const coverage = index.byDate.get(day.dateStr);
                    const coveredSdrs = coverage?.sdrIds.size ?? 0;

                    return (
                        <button
                            key={day.dateStr}
                            type="button"
                            onClick={(event) => onSelectDate(day.dateStr, event.ctrlKey || event.metaKey)}
                            className={cn(
                                'px-2 py-2 text-center border-r border-slate-200 last:border-r-0 transition-colors',
                                selectedDate === day.dateStr && 'bg-indigo-50',
                                selectedDates.includes(day.dateStr) && 'ring-1 ring-inset ring-indigo-300',
                                day.isToday && 'bg-indigo-50/60',
                                isWeekend && 'bg-slate-100/40',
                            )}
                            title="Cliquez pour ouvrir le jour · Ctrl/Cmd+clic pour multi-sélection"
                        >
                            <div className="text-[10px] font-semibold text-slate-500 uppercase">
                                {collapsed ? DAY_LABELS_SHORT[dayIndex].slice(0, 1) : DAY_LABELS_SHORT[dayIndex]}
                            </div>
                            <div
                                className={cn(
                                    'text-base font-bold mt-0.5 w-7 h-7 mx-auto flex items-center justify-center rounded-full transition-all',
                                    day.isToday
                                        ? 'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                                        : day.isCurrentMonth ? 'text-slate-800' : 'text-slate-300',
                                )}
                            >
                                {day.date.getDate()}
                            </div>

                            {/* Coverage line — fixed height so the header never shifts */}
                            <div className="h-4 mt-0.5 flex items-center justify-center">
                                {collapsed ? (
                                    coveredSdrs > 0 && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                ) : coveredSdrs === 0 ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 rounded-full text-[9px] font-semibold text-amber-700 bg-amber-100/80">
                                        <span className="w-1 h-1 rounded-full bg-amber-500" />
                                        Aucune mission
                                    </span>
                                ) : (
                                    <span className="text-[9px] font-medium text-slate-400 tabular-nums">
                                        {coveredSdrs}/{sdrs.length} SDR · {formatDayValue(coverage?.units ?? 0)}
                                    </span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* ── SDR rows ─────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
                {sdrs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                        Aucun SDR cette semaine
                    </div>
                ) : (
                    sdrs.map((sdr) => {
                        const isHovered = hoveredSdrId === sdr.id;
                        const weekUnits = index.bySdrWeek.get(sdr.id) ?? 0;
                        const weekPct = Math.min(100, Math.round((weekUnits / WEEK_REFERENCE_DAYS) * 100));

                        return (
                            <div
                                key={sdr.id}
                                ref={(node) => {
                                    rowRefs.current[sdr.id] = node;
                                }}
                                className={cn(
                                    'grid border-b border-slate-100 transition-colors',
                                    isHovered && 'bg-slate-50/70',
                                )}
                                style={{ gridTemplateColumns: gridCols, height: rowHeight }}
                                onMouseEnter={() => onSetHoveredSdrId(sdr.id)}
                                onMouseLeave={() => onSetHoveredSdrId(null)}
                            >
                                {/* Row header — identity + weekly load */}
                                <div className="px-3 py-2 border-r border-slate-200 flex flex-col justify-center gap-1.5 overflow-hidden">
                                    <div className="flex items-start gap-2">
                                        <UserCircle className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold text-slate-800 truncate">{sdr.name}</p>
                                            <p className="text-[10px] text-slate-400">{sdr.role === 'SDR' ? 'SDR' : 'BD'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                                            <div
                                                className={cn(
                                                    'h-full rounded-full transition-all duration-300',
                                                    weekPct >= 100
                                                        ? 'bg-emerald-500'
                                                        : weekPct >= 60
                                                            ? 'bg-indigo-500'
                                                            : weekPct > 0
                                                                ? 'bg-amber-500'
                                                                : 'bg-transparent',
                                                )}
                                                style={{ width: `${weekPct}%` }}
                                            />
                                        </div>
                                        <span
                                            className={cn(
                                                'text-[9px] tabular-nums whitespace-nowrap',
                                                weekUnits === 0 ? 'text-amber-600 font-semibold' : 'text-slate-400',
                                            )}
                                            title="Jours planifiés cette semaine (référence : 5 j)"
                                        >
                                            {formatDayValue(weekUnits)}/{WEEK_REFERENCE_DAYS}j
                                        </span>
                                    </div>
                                </div>

                                {days.map((day, dayIndex) => {
                                    const isWeekend = dayIndex >= 5;
                                    const collapsed = isWeekend && !showWeekend;
                                    const dayBlocks = index.byCell.get(`${day.dateStr}|${sdr.id}`) ?? [];
                                    const usedCapacity = dayBlocks.reduce((sum, block) => sum + getBlockDayUnits(block), 0);
                                    const remainingCapacity = Math.max(0, DAY_CELL_CAPACITY - usedCapacity);
                                    const isFull = remainingCapacity <= 0;
                                    const isDropTarget = dragOverCell?.sdrId === sdr.id && dragOverCell.date === day.dateStr;
                                    const hasOverflow = dayBlocks.length > maxChips;
                                    const visibleBlocks = hasOverflow ? dayBlocks.slice(0, maxChips - 1) : dayBlocks;
                                    const overflowCount = dayBlocks.length - visibleBlocks.length;

                                    const openQuickAdd = (target: HTMLElement, append: boolean) => {
                                        if (collapsed) {
                                            setWeekendPref(true);
                                            return;
                                        }
                                        if (isFull) return;
                                        onToggleCellDate(day.dateStr, append);
                                        onOpenQuickAdd({ sdrId: sdr.id, date: day.dateStr }, target);
                                    };

                                    return (
                                        <div
                                            key={day.dateStr}
                                            role="button"
                                            tabIndex={collapsed || isFull ? -1 : 0}
                                            aria-label={`${sdr.name}, ${day.dateStr}, ${dayBlocks.length} créneau(x)`}
                                            onClick={(event) => openQuickAdd(event.currentTarget, event.ctrlKey || event.metaKey)}
                                            onKeyDown={(event) => {
                                                if (event.key !== 'Enter' && event.key !== ' ') return;
                                                event.preventDefault();
                                                openQuickAdd(event.currentTarget, false);
                                            }}
                                            onDragOver={(event) => {
                                                if (deletingBlockId || collapsed) return;
                                                event.preventDefault();
                                                if (!dragState) return;
                                                onSetDragOverCell({ sdrId: sdr.id, date: day.dateStr });
                                            }}
                                            onDragLeave={() => onSetDragOverCell(null)}
                                            onDrop={(event) => {
                                                event.preventDefault();
                                                if (!dragState || deletingBlockId) return;
                                                void onMoveBlock(dragState.blockId, day.dateStr, sdr.id);
                                            }}
                                            className={cn(
                                                'group relative px-1.5 py-1 border-r border-slate-100 last:border-r-0 text-left transition-colors',
                                                'h-full overflow-hidden flex flex-col',
                                                !collapsed && !isFull && 'cursor-pointer',
                                                isWeekend && 'bg-slate-50/50',
                                                !day.isCurrentMonth && 'bg-slate-50/30',
                                                day.isToday && 'bg-indigo-50/25',
                                                selectedDates.includes(day.dateStr) && 'bg-indigo-50/40',
                                                isDropTarget && 'bg-indigo-50 ring-2 ring-inset ring-indigo-400',
                                            )}
                                        >
                                            {collapsed ? (
                                                <div className="flex-1 min-h-0 flex items-center justify-center">
                                                    {dayBlocks.length > 0 ? (
                                                        <span className="text-[10px] font-bold text-indigo-600 tabular-nums">
                                                            {dayBlocks.length}
                                                        </span>
                                                    ) : (
                                                        <span className="w-1 h-1 rounded-full bg-slate-200" />
                                                    )}
                                                </div>
                                            ) : dayBlocks.length === 0 ? (
                                                /* Free day — always explicit, never an empty void */
                                                <div className="flex-1 min-h-0 rounded-lg border border-dashed border-slate-200 text-slate-300 flex flex-col items-center justify-center gap-0.5 transition-colors group-hover:border-indigo-300 group-hover:bg-indigo-50/40 group-hover:text-indigo-500">
                                                    <Plus className="w-3.5 h-3.5" />
                                                    <span className="text-[9px] font-semibold uppercase tracking-wide">Libre</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="flex-1 min-h-0 flex flex-col gap-[3px] overflow-hidden">
                                                        {visibleBlocks.map((block) => {
                                                            const color = getMissionColor(block.mission.id);
                                                            const Icon = CHANNEL_ICONS[block.mission.channel] || Phone;
                                                            const isDeleting = deletingBlockId === block.id;
                                                            return (
                                                                <div
                                                                    key={block.id}
                                                                    onClick={(event) => event.stopPropagation()}
                                                                    onContextMenu={(event) => {
                                                                        event.preventDefault();
                                                                        event.stopPropagation();
                                                                        if (isDeleting || deletingBlockId) return;
                                                                        onOpenDeleteConfirm({
                                                                            blockId: block.id,
                                                                            missionName: block.mission.name,
                                                                            sdrName: block.sdr.name,
                                                                            top: event.clientY,
                                                                            left: event.clientX,
                                                                        });
                                                                    }}
                                                                    draggable={!isDeleting && !deletingBlockId}
                                                                    onDragStart={(event: DragEvent<HTMLDivElement>) => {
                                                                        if (isDeleting || deletingBlockId) {
                                                                            event.preventDefault();
                                                                            return;
                                                                        }
                                                                        event.dataTransfer.effectAllowed = 'move';
                                                                        onSetDragState({
                                                                            blockId: block.id,
                                                                            sourceSdrId: block.sdr.id,
                                                                            sourceDate: block.date,
                                                                            block,
                                                                        });
                                                                    }}
                                                                    onDragEnd={() => {
                                                                        onSetDragState(null);
                                                                        onSetDragOverCell(null);
                                                                        onSetDragOverTrash(false);
                                                                    }}
                                                                    title={`${block.mission.client.name} · ${block.mission.name}\n${block.startTime}–${block.endTime}\nGlisser pour déplacer · clic droit pour supprimer`}
                                                                    className={cn(
                                                                        'flex-shrink-0 rounded-md border shadow-sm cursor-move transition-all hover:-translate-y-px hover:shadow-md overflow-hidden',
                                                                        density === 'compact'
                                                                            ? 'h-[26px] px-1.5 flex items-center gap-1'
                                                                            : 'h-[32px] px-1.5 py-0.5 flex flex-col justify-center',
                                                                        dragState?.blockId === block.id && 'opacity-60',
                                                                        isDeleting && 'opacity-50 cursor-not-allowed',
                                                                    )}
                                                                    style={{
                                                                        backgroundColor: color.hex + '12',
                                                                        borderColor: color.hex + '40',
                                                                        borderLeftWidth: '3px',
                                                                        borderLeftColor: color.hex,
                                                                    }}
                                                                >
                                                                    {density === 'compact' ? (
                                                                        <>
                                                                            {isDeleting ? (
                                                                                <Loader2 className="w-3 h-3 flex-shrink-0 animate-spin text-red-500" />
                                                                            ) : (
                                                                                <Icon className="w-3 h-3 flex-shrink-0" style={{ color: color.hex }} />
                                                                            )}
                                                                            <span className="text-[10px] font-bold truncate leading-none" style={{ color: color.hex }}>
                                                                                {block.mission.name}
                                                                            </span>
                                                                            <span className="ml-auto text-[9px] text-slate-400 tabular-nums flex-shrink-0">
                                                                                {block.startTime}
                                                                            </span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <div className="flex items-center gap-1">
                                                                                <Icon className="w-3 h-3 flex-shrink-0" style={{ color: color.hex }} />
                                                                                <span className="text-[10px] font-bold truncate" style={{ color: color.hex }}>
                                                                                    {block.mission.name}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center gap-1 text-[9px] text-slate-400 mt-0.5">
                                                                                {isDeleting ? (
                                                                                    <>
                                                                                        <Loader2 className="w-2.5 h-2.5 animate-spin text-red-500" />
                                                                                        <span className="font-semibold text-red-600">Suppression…</span>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <Clock className="w-2.5 h-2.5" />
                                                                                        <span className="tabular-nums">{block.startTime}–{block.endTime}</span>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}

                                                        {hasOverflow && (
                                                            <button
                                                                type="button"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    onSelectDate(day.dateStr, false);
                                                                }}
                                                                className="flex-shrink-0 h-[16px] rounded-md bg-slate-100 text-slate-500 text-[9px] font-semibold hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
                                                                title="Voir tous les créneaux de ce jour"
                                                            >
                                                                +{overflowCount} autre{overflowCount > 1 ? 's' : ''}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Capacity footer — fixed height, always at the same spot */}
                                                    <div
                                                        className="flex-shrink-0 flex items-center gap-1.5 pt-1"
                                                        style={{ height: CELL_FOOTER_HEIGHT }}
                                                    >
                                                        <div className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                                                            <div
                                                                className={cn('h-full rounded-full transition-all', isFull ? 'bg-slate-300' : 'bg-indigo-400')}
                                                                style={{ width: `${Math.min(100, (usedCapacity / DAY_CELL_CAPACITY) * 100)}%` }}
                                                            />
                                                        </div>
                                                        {isFull ? (
                                                            <Lock className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
                                                        ) : (
                                                            <span className="text-[9px] text-slate-400 whitespace-nowrap flex-shrink-0 tabular-nums">
                                                                {formatDayValue(remainingCapacity)} libre
                                                            </span>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
