'use client';

import type { DragEvent, MutableRefObject } from 'react';
import { Clock, UserCircle, Loader2, Lock, Plus, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMissionColor } from '../planning-utils';
import { CHANNEL_ICONS, DAY_LABELS_SHORT, DAY_CELL_CAPACITY, getBlockDayUnits, formatDayValue } from './utils';
import type {
    CalTeamMember,
    DeleteConfirmPopoverState,
    DragState,
    MonthlyData,
    QuickAddCell,
    WeekDay,
} from './types';

const GRID_COLS = '180px repeat(7, 1fr)';

export function WeekGrid({
    days,
    data,
    sdrs,
    selectedDate,
    selectedDates,
    onSelectDate,
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
    onSelectDate: (date: string, append: boolean) => void;
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
    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Day header */}
            <div className="grid flex-shrink-0 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50/60" style={{ gridTemplateColumns: GRID_COLS }}>
                <div className="px-3 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-r border-slate-200 flex items-center">
                    SDR
                </div>
                {days.map((day, index) => (
                    <button
                        key={day.dateStr}
                        type="button"
                        onClick={(event) => onSelectDate(day.dateStr, event.ctrlKey || event.metaKey)}
                        className={cn(
                            'px-2 py-3 text-center border-r border-slate-200 last:border-r-0 transition-colors',
                            selectedDate === day.dateStr && 'bg-indigo-50',
                            selectedDates.includes(day.dateStr) && 'ring-1 ring-inset ring-indigo-300',
                            day.isToday && 'bg-indigo-50/60',
                            index >= 5 && 'bg-slate-100/40',
                        )}
                        title="Cliquez pour ouvrir le jour · Ctrl/Cmd+clic pour multi-sélection"
                    >
                        <div className="text-[10px] font-semibold text-slate-500 uppercase">{DAY_LABELS_SHORT[index]}</div>
                        <div
                            className={cn(
                                'text-lg font-bold mt-0.5 w-8 h-8 mx-auto flex items-center justify-center rounded-full transition-all',
                                day.isToday
                                    ? 'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                                    : day.isCurrentMonth ? 'text-slate-800' : 'text-slate-300',
                            )}
                        >
                            {day.date.getDate()}
                        </div>
                    </button>
                ))}
            </div>

            {/* SDR rows */}
            <div className="flex-1 overflow-y-auto">
                {sdrs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                        Aucun SDR cette semaine
                    </div>
                ) : (
                    sdrs.map((sdr) => {
                        const isHovered = hoveredSdrId === sdr.id;

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
                                style={{ gridTemplateColumns: GRID_COLS }}
                                onMouseEnter={() => onSetHoveredSdrId(sdr.id)}
                                onMouseLeave={() => onSetHoveredSdrId(null)}
                            >
                                <div className="px-3 py-2 border-r border-slate-200 flex items-start gap-2 min-h-[92px]">
                                    <UserCircle className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-slate-800 truncate">{sdr.name}</p>
                                        <p className="text-[10px] text-slate-400">{sdr.role === 'SDR' ? 'SDR' : 'BD'}</p>
                                    </div>
                                </div>

                                {days.map((day, index) => {
                                    const dayBlocks = (data?.blocksByDate[day.dateStr] ?? [])
                                        .filter((block) => block.sdr.id === sdr.id)
                                        .sort((a, b) => a.startTime.localeCompare(b.startTime));
                                    const usedCapacity = dayBlocks.reduce((sum, block) => sum + getBlockDayUnits(block), 0);
                                    const remainingCapacity = Math.max(0, DAY_CELL_CAPACITY - usedCapacity);
                                    const isWeekend = index >= 5;
                                    const isDropTarget = dragOverCell?.sdrId === sdr.id && dragOverCell.date === day.dateStr;

                                    return (
                                        <button
                                            key={day.dateStr}
                                            type="button"
                                            onClick={(event) => {
                                                if (remainingCapacity <= 0) return;
                                                if (event.ctrlKey || event.metaKey) {
                                                    onSelectDate(day.dateStr, true);
                                                } else {
                                                    onSelectDate(day.dateStr, false);
                                                }
                                                onOpenQuickAdd({ sdrId: sdr.id, date: day.dateStr }, event.currentTarget);
                                            }}
                                            onDragOver={(event) => {
                                                if (deletingBlockId) return;
                                                event.preventDefault();
                                                if (!dragState) return;
                                                onSetDragOverCell({ sdrId: sdr.id, date: day.dateStr });
                                            }}
                                            onDragLeave={() => {
                                                onSetDragOverCell(null);
                                            }}
                                            onDrop={(event) => {
                                                event.preventDefault();
                                                if (!dragState || deletingBlockId) return;
                                                void onMoveBlock(dragState.blockId, day.dateStr, sdr.id);
                                            }}
                                            className={cn(
                                                'px-2 py-2 border-r border-slate-100 last:border-r-0 text-left transition-colors min-h-[92px] flex flex-col justify-between',
                                                isWeekend && 'bg-slate-50/40',
                                                dayBlocks.length === 0 && 'hover:bg-indigo-50/40',
                                                isDropTarget && 'bg-indigo-50 ring-2 ring-inset ring-indigo-400',
                                            )}
                                        >
                                            <div className="space-y-1">
                                                {dayBlocks.length === 0 && (
                                                    <div className="h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 text-slate-300" />
                                                )}

                                                {dayBlocks.map((block) => {
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
                                                            className={cn(
                                                                'rounded-lg px-2 py-1.5 text-[10px] leading-tight border shadow-sm cursor-move transition-all hover:-translate-y-px hover:shadow-md',
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
                                                            <div className="flex items-center gap-1">
                                                                <Icon className="w-3 h-3 flex-shrink-0" style={{ color: color.hex }} />
                                                                <span className="font-bold truncate" style={{ color: color.hex }}>
                                                                    {block.mission.name}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-1 text-slate-400 mt-0.5">
                                                                <Clock className="w-2.5 h-2.5" />
                                                                <span>{block.startTime}–{block.endTime}</span>
                                                            </div>
                                                            {isDeleting && (
                                                                <div className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-semibold text-red-600">
                                                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                                                    Suppression...
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            <div className="pt-2 text-[10px] text-slate-500 flex items-center justify-between">
                                                {remainingCapacity > 0 ? (
                                                    <span>{formatDayValue(remainingCapacity)} libre</span>
                                                ) : usedCapacity > 0 ? (
                                                    <span className="inline-flex items-center gap-1 text-slate-400">
                                                        <Lock className="w-3 h-3" />
                                                    </span>
                                                ) : (
                                                    <span />
                                                )}

                                                {dayBlocks.length === 0 && (
                                                    <Plus className="w-3.5 h-3.5 text-slate-300" />
                                                )}
                                            </div>
                                        </button>
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
