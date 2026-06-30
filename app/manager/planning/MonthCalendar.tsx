'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlanningMonth } from './PlanningMonthContext';
import { useToast } from '@/components/ui';

import type {
    CalBlock,
    CellPosition,
    ClientTargets,
    DeleteConfirmPopoverState,
    DragState,
    MonthlyData,
    QuickAddCell,
    WeekDay,
} from './calendar/types';
import {
    countActiveMonthsFrom,
    endOfMonthFromMonthKey,
    findAllocationIdForMission,
    firstMondayOfMonth,
    getBlockDayUnits,
    getWeeksLeftIncludingCurrent,
    groupBlocksByDate,
    normalizeMonthlyData,
    sanitizeDayValue,
    toDateString,
} from './calendar/utils';
import { WeekGrid } from './calendar/WeekGrid';
import { DayPanel } from './calendar/DayPanel';
import { MissionPanel } from './calendar/MissionPanel';
import { QuickAddPopover } from './calendar/QuickAddPopover';
import { DeleteConfirmPopover, TrashDropZone } from './calendar/Overlays';

export function MonthCalendar() {
    const { month, setMonth, snapshot, loading: monthLoading, reload, backgroundSync, assignSdrToMission } = usePlanningMonth();
    const { success, error: showError } = useToast();

    const [data, setData] = useState<MonthlyData | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [weekOffset, setWeekOffset] = useState(0);
    const [hoveredSdrId, setHoveredSdrId] = useState<string | null>(null);
    const [filterClientId, setFilterClientId] = useState<string>('');
    const [filterSdrId, setFilterSdrId] = useState<string>('');
    const [quickAddCell, setQuickAddCell] = useState<QuickAddCell | null>(null);
    const [quickAddPosition, setQuickAddPosition] = useState<CellPosition | null>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [dragOverCell, setDragOverCell] = useState<QuickAddCell | null>(null);
    const [dragOverTrash, setDragOverTrash] = useState(false);
    const [deletingBlockId, setDeletingBlockId] = useState<string | null>(null);
    const [deleteConfirmPopover, setDeleteConfirmPopover] = useState<DeleteConfirmPopoverState | null>(null);
    const [isDuplicatingWeek, setIsDuplicatingWeek] = useState(false);

    const quickAddRef = useRef<HTMLDivElement | null>(null);
    const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const skipMonthResetRef = useRef(false);

    useEffect(() => {
        if (!snapshot) {
            if (monthLoading) setData(null);
            return;
        }
        setData(normalizeMonthlyData(snapshot as unknown as MonthlyData));
    }, [snapshot, monthLoading]);

    useEffect(() => {
        if (skipMonthResetRef.current) {
            skipMonthResetRef.current = false;
            return;
        }
        const [year, mon] = month.split('-').map(Number);
        const now = new Date();
        const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === mon;

        let nextWeekOffset = 0;
        if (isCurrentMonth) {
            const firstMonday = firstMondayOfMonth(year, mon);
            const todayAtMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const firstMondayAtMidnight = new Date(firstMonday.getFullYear(), firstMonday.getMonth(), firstMonday.getDate());
            const diffDays = Math.floor((todayAtMidnight.getTime() - firstMondayAtMidnight.getTime()) / (1000 * 60 * 60 * 24));
            nextWeekOffset = Math.max(0, Math.floor(diffDays / 7));
        }

        setWeekOffset(nextWeekOffset);
        setSelectedDate(null);
        setSelectedDates([]);
        setShowAddForm(false);
        setQuickAddCell(null);
        setQuickAddPosition(null);
    }, [month]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!quickAddRef.current) return;
            if (quickAddRef.current.contains(event.target as Node)) return;
            setQuickAddCell(null);
            setQuickAddPosition(null);
        };
        if (quickAddCell) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [quickAddCell]);

    const currentWeek = useMemo(() => {
        const [year, mon] = month.split('-').map(Number);
        const firstMonday = new Date(firstMondayOfMonth(year, mon));
        firstMonday.setDate(firstMonday.getDate() + weekOffset * 7);

        const days: WeekDay[] = [];
        const todayStr = toDateString(new Date());

        for (let i = 0; i < 7; i++) {
            const date = new Date(firstMonday);
            date.setDate(date.getDate() + i);
            const dateStr = toDateString(date);
            days.push({
                date,
                dateStr,
                isToday: dateStr === todayStr,
                isCurrentMonth: date.getMonth() + 1 === mon && date.getFullYear() === year,
            });
        }
        return days;
    }, [month, weekOffset]);

    const weekLabel = useMemo(() => {
        if (currentWeek.length === 0) return '';
        const start = currentWeek[0].date;
        const end = currentWeek[6].date;
        return `${start.getDate()} ${start.toLocaleDateString('fr-FR', { month: 'short' })} – ${end.getDate()} ${end.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}`;
    }, [currentWeek]);

    const selectedBlocks = useMemo(() => {
        if (!selectedDate || !data) return [];
        return data.blocksByDate[selectedDate] ?? [];
    }, [selectedDate, data]);

    const sortedSdrs = useMemo(() => {
        if (!data) return [];
        return [...data.team].sort((a, b) => a.name.localeCompare(b.name));
    }, [data]);

    const weekSdrs = useMemo(() => {
        if (!filterSdrId) return sortedSdrs;
        return sortedSdrs.filter((sdr) => sdr.id === filterSdrId);
    }, [sortedSdrs, filterSdrId]);

    const clientOptions = useMemo(() => {
        if (!data) return [] as Array<{ id: string; name: string }>;
        const map = new Map<string, string>();
        for (const mission of data.missions) {
            map.set(mission.client.id, mission.client.name);
        }
        return [...map.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [data]);

    const weekDateSet = useMemo(() => new Set(currentWeek.map((day) => day.dateStr)), [currentWeek]);

    const missionTargetsByClient = useMemo<ClientTargets[]>(() => {
        if (!data) return [];
        const byClient = new Map<string, ClientTargets>();

        const monthEndDate = endOfMonthFromMonthKey(month);
        const currentWeekStart = currentWeek[0]?.dateStr ?? `${month}-01`;
        const weeksLeftIncludingCurrent = Math.max(1, getWeeksLeftIncludingCurrent(currentWeekStart, monthEndDate));

        for (const mission of data.missions) {
            if (filterClientId && mission.client.id !== filterClientId) continue;
            const monthPlan = mission.missionMonthPlans.find((entry) => entry.month === month);
            const monthTargetDays = monthPlan?.targetDays ?? 0;
            const monthAllocatedDays = monthPlan?.allocations.reduce((sum, allocation) => sum + allocation.allocatedDays, 0) ?? 0;
            const monthScheduledDays = data.blocks
                .filter((block) => block.mission.id === mission.id)
                .reduce((sum, block) => sum + getBlockDayUnits(block), 0);
            const effectiveAllocatedDays = Math.max(monthAllocatedDays, monthScheduledDays);
            const monthRemainingDays = Math.max(0, monthTargetDays - effectiveAllocatedDays);

            const totalPlannedDays = mission.missionMonthPlans.reduce((sum, entry) => sum + entry.targetDays, 0);
            const contractDeltaDays = mission.totalContractDays != null
                ? mission.totalContractDays - totalPlannedDays
                : null;

            const activeMonthsLeft = Math.max(1, countActiveMonthsFrom(month, mission.endDate.slice(0, 10)));
            const suggestedMonthTargetDays = monthTargetDays > 0
                ? monthTargetDays
                : mission.totalContractDays != null
                    ? Math.max(0, Math.ceil((mission.totalContractDays - totalPlannedDays) / activeMonthsLeft))
                    : 0;

            const weekPlacedDays = data.blocks
                .filter((block) => block.mission.id === mission.id && weekDateSet.has(block.date))
                .reduce((sum, block) => sum + getBlockDayUnits(block), 0);

            const weekTargetPace = monthRemainingDays / weeksLeftIncludingCurrent;
            const weekRecommendedAddDays = Math.max(0, weekTargetPace - weekPlacedDays);
            const shouldAddThisWeek = monthRemainingDays > 0 && weekPlacedDays + 0.01 < weekTargetPace;

            const hasPlanningSignal =
                monthTargetDays > 0 ||
                totalPlannedDays > 0 ||
                (mission.totalContractDays ?? 0) > 0 ||
                monthScheduledDays > 0 ||
                weekPlacedDays > 0;
            if (!hasPlanningSignal) continue;

            const key = mission.client.id;
            if (!byClient.has(key)) {
                byClient.set(key, { clientName: mission.client.name, missions: [] });
            }
            byClient.get(key)?.missions.push({
                id: mission.id,
                name: mission.name,
                startDate: mission.startDate,
                endDate: mission.endDate,
                totalContractDays: mission.totalContractDays ?? null,
                totalPlannedDays,
                contractDeltaDays,
                monthTargetDays,
                monthAllocatedDays: effectiveAllocatedDays,
                monthScheduledDays,
                monthRemainingDays,
                suggestedMonthTargetDays,
                weekPlacedDays: sanitizeDayValue(weekPlacedDays),
                weekRecommendedAddDays: sanitizeDayValue(weekRecommendedAddDays),
                shouldAddThisWeek,
            });
        }

        return [...byClient.values()]
            .map((entry) => ({
                ...entry,
                missions: entry.missions.sort((a, b) => a.name.localeCompare(b.name)),
            }))
            .sort((a, b) => a.clientName.localeCompare(b.clientName));
    }, [currentWeek, data, month, weekDateSet, filterClientId]);

    const openQuickAdd = useCallback((cell: QuickAddCell, target: HTMLElement) => {
        const rect = target.getBoundingClientRect();
        const popoverWidth = 320;
        const popoverHeight = 260;
        const margin = 12;
        let left = rect.left;
        let top = rect.bottom + 8;

        if (left + popoverWidth > window.innerWidth - margin) {
            left = window.innerWidth - popoverWidth - margin;
        }
        if (top + popoverHeight > window.innerHeight - margin) {
            top = Math.max(margin, rect.top - popoverHeight - 8);
        }

        setQuickAddCell(cell);
        setQuickAddPosition({ top, left: Math.max(margin, left) });
    }, []);

    const closeQuickAdd = useCallback(() => {
        setQuickAddCell(null);
        setQuickAddPosition(null);
    }, []);

    const handleBlockMove = useCallback(async (blockId: string, newDate: string, newSdrId: string) => {
        if (!dragState || !data) return;
        const sourceBlock = dragState.block;
        if (sourceBlock.sdr.id === newSdrId && sourceBlock.date === newDate) {
            setDragState(null);
            setDragOverCell(null);
            return;
        }

        const previousData = data;
        setData((prev) => {
            if (!prev) return prev;
            const blocks = prev.blocks.map((block) =>
                block.id === blockId
                    ? {
                        ...block,
                        date: newDate,
                        sdrId: newSdrId,
                        sdr: {
                            ...block.sdr,
                            id: newSdrId,
                            name: prev.team.find((member) => member.id === newSdrId)?.name ?? block.sdr.name,
                            email: prev.team.find((member) => member.id === newSdrId)?.email ?? block.sdr.email,
                            role: prev.team.find((member) => member.id === newSdrId)?.role ?? block.sdr.role,
                        },
                    }
                    : block,
            );
            return { ...prev, blocks, blocksByDate: groupBlocksByDate(blocks) };
        });
        setDragState(null);
        setDragOverCell(null);

        try {
            if (sourceBlock.sdr.id === newSdrId) {
                const res = await fetch(`/api/planning/${blockId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date: newDate }),
                });
                const json = await res.json();
                if (!json.success) {
                    showError('Erreur', json.error || 'Déplacement échoué');
                    setData(previousData);
                    await reload();
                }
                return;
            }

            const targetMission = data.missions.find((mission) => mission.id === sourceBlock.mission.id);
            const isAssigned = targetMission?.sdrAssignments.some((assignment) => assignment.sdr.id === newSdrId) ?? false;
            if (!isAssigned) {
                const ok = await assignSdrToMission(sourceBlock.mission.id, newSdrId);
                if (!ok) {
                    setData(previousData);
                    await reload();
                    return;
                }
            }

            const allocationId = findAllocationIdForMission(data.missions, month, sourceBlock.mission.id, newSdrId);
            const createRes = await fetch('/api/planning', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sdrId: newSdrId,
                    missionId: sourceBlock.mission.id,
                    date: newDate,
                    startTime: sourceBlock.startTime,
                    endTime: sourceBlock.endTime,
                    ...(allocationId ? { allocationId } : {}),
                }),
            });
            const createJson = await createRes.json();
            if (!createJson.success) {
                showError('Erreur', createJson.error || 'Déplacement échoué');
                setData(previousData);
                backgroundSync();
                return;
            }

            const cancelRes = await fetch(`/api/planning/${blockId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'CANCELLED' }),
            });
            const cancelJson = await cancelRes.json();
            if (!cancelJson.success) {
                showError('Erreur', cancelJson.error || 'Déplacement échoué');
            }

            backgroundSync();
        } catch {
            showError('Erreur', 'Déplacement échoué');
            setData(previousData);
            await reload();
        }
    }, [assignSdrToMission, backgroundSync, data, dragState, month, reload, showError]);

    const handleDeleteBlock = useCallback(async (blockId: string) => {
        if (deletingBlockId) return;
        setDeleteConfirmPopover(null);
        setDragState(null);
        setDragOverCell(null);
        setDragOverTrash(false);
        setDeletingBlockId(blockId);

        try {
            const res = await fetch(`/api/planning/${blockId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'CANCELLED' }),
            });
            const json = await res.json();
            if (!json.success) {
                showError('Erreur', json.error || 'Suppression échouée');
                return;
            }
            success('Créneau supprimé', '');
        } catch {
            showError('Erreur', 'Suppression échouée');
        } finally {
            setDeletingBlockId(null);
            backgroundSync();
        }
    }, [backgroundSync, deletingBlockId, showError, success]);

    function navigateWeek(delta: number) {
        const [year, mon] = month.split('-').map(Number);
        const targetMonday = new Date(firstMondayOfMonth(year, mon));
        targetMonday.setDate(targetMonday.getDate() + (weekOffset + delta) * 7);
        const targetMonth = `${targetMonday.getFullYear()}-${String(targetMonday.getMonth() + 1).padStart(2, '0')}`;

        if (targetMonth !== month) {
            const newFirstMonday = firstMondayOfMonth(targetMonday.getFullYear(), targetMonday.getMonth() + 1);
            const diffDays = Math.round((targetMonday.getTime() - newFirstMonday.getTime()) / 86400000);
            skipMonthResetRef.current = true;
            setMonth(targetMonth);
            setWeekOffset(Math.floor(diffDays / 7));
        } else {
            setWeekOffset((current) => current + delta);
        }
    }

    function goToToday() {
        const now = new Date();
        setMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
        setWeekOffset(0);
    }

    async function handleDuplicateWeek() {
        if (!data || isDuplicatingWeek) return;

        const weekBlocks: CalBlock[] = [];
        for (const day of currentWeek) {
            const dayBlocks = data.blocksByDate[day.dateStr] ?? [];
            weekBlocks.push(...dayBlocks);
        }

        if (weekBlocks.length === 0) {
            showError('Aucun créneau', 'Aucun créneau à dupliquer cette semaine.');
            return;
        }

        setIsDuplicatingWeek(true);
        let createdCount = 0;
        let skippedCount = 0;

        try {
            for (const block of weekBlocks) {
                const sourceDate = new Date(block.date);
                sourceDate.setUTCDate(sourceDate.getUTCDate() + 7);
                const nextDate = sourceDate.toISOString().slice(0, 10);

                try {
                    const res = await fetch('/api/planning', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sdrId: block.sdr.id,
                            missionId: block.mission.id,
                            date: nextDate,
                            startTime: block.startTime,
                            endTime: block.endTime,
                            ...(block.allocationId ? { allocationId: block.allocationId } : {}),
                        }),
                    });
                    const json = await res.json();
                    if (json.success) {
                        createdCount++;
                    } else {
                        skippedCount++;
                    }
                } catch {
                    skippedCount++;
                }
            }

            if (createdCount > 0) {
                success(
                    `${createdCount} créneau${createdCount > 1 ? 'x' : ''} dupliqué${createdCount > 1 ? 's' : ''}`,
                    skippedCount > 0 ? `${skippedCount} ignoré${skippedCount > 1 ? 's' : ''} (conflit ou hors mission)` : 'Semaine suivante prête',
                );
                backgroundSync();
                setWeekOffset((current) => current + 1);
            } else {
                showError('Erreur', 'Aucun créneau n\'a pu être dupliqué (conflits ou missions terminées).');
            }
        } catch {
            showError('Erreur', 'Une erreur est survenue lors de la duplication.');
        } finally {
            setIsDuplicatingWeek(false);
        }
    }

    if (monthLoading && !data) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        );
    }

    const selectFilterClass = (active: boolean) => cn(
        'text-xs font-medium rounded-lg border px-2.5 py-1.5 bg-white transition-colors focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100',
        active ? 'border-indigo-300 text-indigo-700 bg-indigo-50' : 'border-slate-200 text-slate-600 hover:border-slate-300',
    );

    return (
        <div className="h-full flex overflow-hidden bg-white">
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white/80 backdrop-blur-sm flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50/60 overflow-hidden shadow-sm shadow-slate-900/[0.02]">
                            <button onClick={() => navigateWeek(-1)} className="p-2 hover:bg-white text-slate-500 transition-colors">
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="px-4 py-1.5 text-sm font-bold text-slate-800 min-w-[210px] text-center capitalize select-none">
                                {weekLabel}
                            </span>
                            <button onClick={() => navigateWeek(1)} className="p-2 hover:bg-white text-slate-500 transition-colors">
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                        <button
                            onClick={goToToday}
                            className="px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                        >
                            Aujourd&apos;hui
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        <select
                            value={filterClientId}
                            onChange={(e) => setFilterClientId(e.target.value)}
                            className={selectFilterClass(!!filterClientId)}
                            title="Filtrer les missions par client"
                        >
                            <option value="">Tous les clients</option>
                            {clientOptions.map((client) => (
                                <option key={client.id} value={client.id}>{client.name}</option>
                            ))}
                        </select>

                        <select
                            value={filterSdrId}
                            onChange={(e) => setFilterSdrId(e.target.value)}
                            className={selectFilterClass(!!filterSdrId)}
                            title="Afficher un seul SDR"
                        >
                            <option value="">Tous les SDR</option>
                            {sortedSdrs.map((sdr) => (
                                <option key={sdr.id} value={sdr.id}>{sdr.name}</option>
                            ))}
                        </select>

                        <button
                            onClick={handleDuplicateWeek}
                            disabled={isDuplicatingWeek}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Dupliquer tous les créneaux de cette semaine vers la semaine suivante"
                        >
                            {isDuplicatingWeek ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                            Dupliquer → S+1
                        </button>

                        {selectedDates.length > 0 && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-slate-500">
                                    {selectedDates.length} jour{selectedDates.length > 1 ? 's' : ''} sélectionné{selectedDates.length > 1 ? 's' : ''}
                                </span>
                                <button
                                    onClick={() => {
                                        setSelectedDates([]);
                                        setSelectedDate(null);
                                    }}
                                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                    Effacer
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 min-h-0 flex overflow-hidden">
                    <MissionPanel month={month} clients={missionTargetsByClient} />

                    <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
                        <WeekGrid
                            days={currentWeek}
                            data={data}
                            sdrs={weekSdrs}
                            selectedDate={selectedDate}
                            selectedDates={selectedDates}
                            onSelectDate={(date, append) => {
                                setSelectedDates((current) => {
                                    if (!append) {
                                        const isSingleSelection = current.length === 1 && current[0] === date;
                                        const next = isSingleSelection ? [] : [date];
                                        setSelectedDate(next[0] ?? null);
                                        return next;
                                    }

                                    const exists = current.includes(date);
                                    const next = exists ? current.filter((d) => d !== date) : [...current, date];
                                    const normalized = [...new Set(next)].sort((a, b) => a.localeCompare(b));
                                    setSelectedDate(normalized[0] ?? null);
                                    return normalized;
                                });
                            }}
                            hoveredSdrId={hoveredSdrId}
                            dragState={dragState}
                            dragOverCell={dragOverCell}
                            onSetHoveredSdrId={setHoveredSdrId}
                            onSetDragState={setDragState}
                            onSetDragOverCell={setDragOverCell}
                            onOpenQuickAdd={openQuickAdd}
                            onMoveBlock={handleBlockMove}
                            onOpenDeleteConfirm={setDeleteConfirmPopover}
                            rowRefs={rowRefs}
                            onSetDragOverTrash={setDragOverTrash}
                            deletingBlockId={deletingBlockId}
                        />

                        {selectedDate && (
                            <>
                                <div
                                    className="absolute inset-0 bg-slate-900/10 z-20"
                                    onClick={() => setSelectedDate(null)}
                                />
                                <div className="absolute right-0 top-0 h-full w-[380px] border-l border-slate-200 bg-white flex flex-col shadow-2xl z-30 animate-in slide-in-from-right duration-200">
                                    <DayPanel
                                        date={selectedDate}
                                        blocks={selectedBlocks}
                                        team={data?.team ?? []}
                                        missions={data?.missions ?? []}
                                        onClose={() => setSelectedDate(null)}
                                        showAddForm={showAddForm}
                                        setShowAddForm={setShowAddForm}
                                        onReload={reload}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {quickAddCell && quickAddPosition && data && (
                <QuickAddPopover
                    ref={quickAddRef}
                    cell={quickAddCell}
                    position={quickAddPosition}
                    team={data.team}
                    missions={data.missions}
                    month={month}
                    selectedDates={selectedDates}
                    onClose={closeQuickAdd}
                    onCreated={async () => {
                        closeQuickAdd();
                        await reload();
                    }}
                    assignSdrToMission={assignSdrToMission}
                />
            )}

            {dragState && (
                <TrashDropZone
                    isOver={dragOverTrash}
                    isDeleting={!!deletingBlockId}
                    onDragOver={(event) => {
                        if (deletingBlockId) return;
                        event.preventDefault();
                        setDragOverTrash(true);
                    }}
                    onDragLeave={() => setDragOverTrash(false)}
                    onDrop={(event) => {
                        event.preventDefault();
                        if (!dragState || deletingBlockId) return;
                        void handleDeleteBlock(dragState.blockId);
                    }}
                />
            )}

            {deleteConfirmPopover && (
                <DeleteConfirmPopover
                    state={deleteConfirmPopover}
                    deleting={deletingBlockId === deleteConfirmPopover.blockId}
                    onCancel={() => setDeleteConfirmPopover(null)}
                    onConfirm={() => void handleDeleteBlock(deleteConfirmPopover.blockId)}
                />
            )}
        </div>
    );
}
