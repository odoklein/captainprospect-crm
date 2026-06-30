'use client';

import { useState, useEffect, useCallback, useMemo, useRef, forwardRef } from 'react';
import type { DragEvent, MutableRefObject } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    Plus,
    X,
    Clock,
    UserCircle,
    Loader2,
    Check,
    Phone,
    Mail,
    Linkedin,
    CalendarDays,
    Trash2,
    Users,
    Lock,
    Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    usePlanningMonth,
    type SnapshotMission,
    type SnapshotSdr,
} from './PlanningMonthContext';
import {
    calcHours,
    getMissionColor,
    formatMonthLabel,
    getSdrStatus,
    SDR_STATUS_CONFIG,
} from './planning-utils';
import { useToast } from '@/components/ui';

interface CalBlock {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    suggestionStatus: string | null;
    notes: string | null;
    sdrId: string;
    missionId: string;
    allocationId: string | null;
    sdr: { id: string; name: string; email: string; role: string };
    mission: { id: string; name: string; channel: string; client: { id: string; name: string } };
    createdBy: { id: string; name: string };
}

interface CalTeamMember {
    id: string;
    name: string;
    email: string;
    role: string;
}

interface MonthlyData {
    month: string;
    daysInMonth: number;
    blocks: CalBlock[];
    blocksByDate: Record<string, CalBlock[]>;
    team: CalTeamMember[];
    missions: SnapshotMission[];
    sdrs: SnapshotSdr[];
}

interface QuickAddCell {
    sdrId: string;
    date: string;
}

interface DragState {
    blockId: string;
    sourceSdrId: string;
    sourceDate: string;
    block: CalBlock;
}

interface CellPosition {
    top: number;
    left: number;
}

interface DeleteConfirmPopoverState {
    blockId: string;
    missionName: string;
    sdrName: string;
    top: number;
    left: number;
}

interface WeekDay {
    date: Date;
    dateStr: string;
    isToday: boolean;
    isCurrentMonth: boolean;
}

interface MissionOption {
    mission: SnapshotMission;
    allocationId: string | null;
}

const CHANNEL_ICONS: Record<string, typeof Phone> = { CALL: Phone, EMAIL: Mail, LINKEDIN: Linkedin };
const DAY_LABELS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAY_CELL_CAPACITY = 2;
const HOURS_PER_DAY = 8;

export function MonthCalendar() {
    const { month, setMonth, snapshot, loading: monthLoading, reload, backgroundSync, assignSdrToMission } = usePlanningMonth();
    const { success, error: showError } = useToast();

    const [data, setData] = useState<MonthlyData | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [weekOffset, setWeekOffset] = useState(0);
    const [weekMultiSelectEnabled, setWeekMultiSelectEnabled] = useState(false);
    const [hoveredSdrId, setHoveredSdrId] = useState<string | null>(null);
    const [highlightedSdrId, setHighlightedSdrId] = useState<string | null>(null);
    const [loadDrawerOpen, setLoadDrawerOpen] = useState(false);
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
        const isCurrentMonth =
            now.getFullYear() === year && now.getMonth() + 1 === mon;

        let nextWeekOffset = 0;
        if (isCurrentMonth) {
            const firstOfMonth = new Date(year, mon - 1, 1);
            let startDow = firstOfMonth.getDay() - 1;
            if (startDow < 0) startDow = 6;
            const firstMonday = new Date(firstOfMonth);
            firstMonday.setDate(firstMonday.getDate() - startDow);

            const todayAtMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const firstMondayAtMidnight = new Date(
                firstMonday.getFullYear(),
                firstMonday.getMonth(),
                firstMonday.getDate()
            );
            const diffDays = Math.floor(
                (todayAtMidnight.getTime() - firstMondayAtMidnight.getTime()) / (1000 * 60 * 60 * 24)
            );
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

    const weekScrollKey = useMemo(() => currentWeekKey(weekOffset, month), [weekOffset, month]);

    useEffect(() => {
        if (!highlightedSdrId) return;
        const timeout = window.setTimeout(() => {
            rowRefs.current[highlightedSdrId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
        return () => window.clearTimeout(timeout);
    }, [highlightedSdrId, weekScrollKey]);

    const currentWeek = useMemo(() => {
        const [year, mon] = month.split('-').map(Number);
        const firstOfMonth = new Date(year, mon - 1, 1);
        let startDow = firstOfMonth.getDay() - 1;
        if (startDow < 0) startDow = 6;
        const firstMonday = new Date(firstOfMonth);
        firstMonday.setDate(firstMonday.getDate() - startDow + weekOffset * 7);

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

    const weekSdrs = useMemo(() => {
        if (!data) return [];
        return [...data.team].sort((a, b) => a.name.localeCompare(b.name));
    }, [data]);

    const capacitySdrs = useMemo(() => snapshot?.sdrs ?? data?.sdrs ?? [], [snapshot?.sdrs, data?.sdrs]);

    const teamLoadByDate = useMemo(() => {
        const entries: Record<string, number> = {};
        const sdrCountWithCapacity = capacitySdrs.filter((sdr) => getMonthlyCapacity(sdr) > 0).length;
        for (const day of currentWeek) {
            const blocks = data?.blocksByDate[day.dateStr] ?? [];
            const totalUnits = blocks.reduce((sum, block) => sum + getBlockDayUnits(block), 0);
            entries[day.dateStr] = sdrCountWithCapacity > 0 ? Math.round((totalUnits / sdrCountWithCapacity) * 100) : 0;
        }
        return entries;
    }, [capacitySdrs, currentWeek, data]);

    const weekDateSet = useMemo(() => new Set(currentWeek.map((day) => day.dateStr)), [currentWeek]);

    const missionTargetsByClient = useMemo(() => {
        if (!data) return [];
        const byClient = new Map<string, {
            clientName: string;
            missions: Array<{
                id: string;
                name: string;
                startDate: string;
                endDate: string;
                totalContractDays: number | null;
                totalPlannedDays: number;
                contractDeltaDays: number | null;
                monthTargetDays: number;
                monthAllocatedDays: number;
                monthScheduledDays: number;
                monthRemainingDays: number;
                suggestedMonthTargetDays: number;
                weekPlacedDays: number;
                weekRecommendedAddDays: number;
                shouldAddThisWeek: boolean;
            }>;
        }>();

        const monthEndDate = endOfMonthFromMonthKey(month);
        const currentWeekStart = currentWeek[0]?.dateStr ?? `${month}-01`;
        const weeksLeftIncludingCurrent = Math.max(1, getWeeksLeftIncludingCurrent(currentWeekStart, monthEndDate));

        for (const mission of data.missions) {
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
    }, [currentWeek, data, month, weekDateSet]);

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

    function prevNav() {
        navigateWeek(-1);
    }

    function nextNav() {
        navigateWeek(1);
    }

    function goToToday() {
        const now = new Date();
        setMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
        setWeekOffset(0);
    }

    async function handleDuplicateWeek() {
        if (!data || isDuplicatingWeek) return;

        // Collect all blocks in the current week
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
                // Shift date by +7 days. block.date is already a full ISO timestamp
                // (matches how blocksByDate keys are derived server-side), so use UTC-based
                // arithmetic instead of re-parsing it as a local date string.
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
                // Navigate to the next week
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

    function handleDrawerRowClick(sdrId: string) {
        setHighlightedSdrId(sdrId);
    }

    if (monthLoading && !data) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="h-full flex overflow-hidden bg-white">
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <button onClick={prevNav} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <h2 className="text-sm font-bold text-slate-800 capitalize min-w-[200px] text-center">
                            {weekLabel}
                        </h2>
                        <button onClick={nextNav} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                            <ChevronRight className="w-5 h-5" />
                        </button>
                        <button
                            onClick={goToToday}
                            className="ml-2 px-3 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                        >
                            Aujourd&apos;hui
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">{data?.blocks.length ?? 0}</span> créneaux
                            <span className="text-slate-300 mx-1">·</span>
                            <span className="font-semibold text-slate-700">{data?.team.length ?? 0}</span> SDRs
                        </div>

                        <button
                            onClick={() => setLoadDrawerOpen((open) => !open)}
                            className={cn(
                                'inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                                loadDrawerOpen
                                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                            )}
                        >
                            <Users className="w-4 h-4" />
                            Charge équipe
                        </button>

                        <button
                            onClick={handleDuplicateWeek}
                            disabled={isDuplicatingWeek}
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Dupliquer tous les créneaux de cette semaine vers la semaine suivante"
                        >
                            {isDuplicatingWeek ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                            Dupliquer → S+1
                        </button>

                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setWeekMultiSelectEnabled((current) => !current)}
                                className={cn(
                                    'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                                    weekMultiSelectEnabled
                                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                                )}
                                title="Activer la sélection multiple des jours"
                            >
                                Multi-sélection
                            </button>
                            {selectedDates.length > 0 && (
                                <>
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
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-h-0 flex overflow-hidden">
                    <MissionTargetsPanel month={month} clients={missionTargetsByClient} />

                    <div className="flex-1 min-w-0 flex overflow-hidden">
                        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                            <WeekView
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
                                weekMultiSelectEnabled={weekMultiSelectEnabled}
                                hoveredSdrId={hoveredSdrId}
                                highlightedSdrId={highlightedSdrId}
                                dragState={dragState}
                                dragOverCell={dragOverCell}
                                teamLoadByDate={teamLoadByDate}
                                onSetHoveredSdrId={setHoveredSdrId}
                                onSetDragState={setDragState}
                                onSetDragOverCell={setDragOverCell}
                                onOpenQuickAdd={openQuickAdd}
                                onMoveBlock={handleBlockMove}
                                onDeleteBlock={handleDeleteBlock}
                                onOpenDeleteConfirm={setDeleteConfirmPopover}
                                rowRefs={rowRefs}
                                onSetDragOverTrash={setDragOverTrash}
                                deletingBlockId={deletingBlockId}
                            />
                        </div>

                        <div
                            className={cn(
                                'border-l border-slate-200 bg-white flex flex-col transition-all duration-300 overflow-hidden flex-shrink-0',
                                selectedDate ? 'w-[380px]' : 'w-0',
                            )}
                        >
                            {selectedDate && (
                                <DaySidebar
                                    date={selectedDate}
                                    blocks={selectedBlocks}
                                    team={data?.team ?? []}
                                    missions={data?.missions ?? []}
                                    onClose={() => setSelectedDate(null)}
                                    showAddForm={showAddForm}
                                    setShowAddForm={setShowAddForm}
                                    onReload={reload}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {loadDrawerOpen && (
                <LoadDrawer
                    month={month}
                    sdrs={capacitySdrs}
                    highlightedSdrId={highlightedSdrId}
                    onSelectSdr={handleDrawerRowClick}
                />
            )}

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

function WeekView({
    days,
    data,
    sdrs,
    selectedDate,
    selectedDates,
    onSelectDate,
    weekMultiSelectEnabled,
    hoveredSdrId,
    highlightedSdrId,
    dragState,
    dragOverCell,
    teamLoadByDate,
    onSetHoveredSdrId,
    onSetDragState,
    onSetDragOverCell,
    onOpenQuickAdd,
    onMoveBlock,
    onDeleteBlock,
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
    highlightedSdrId: string | null;
    dragState: DragState | null;
    dragOverCell: QuickAddCell | null;
    teamLoadByDate: Record<string, number>;
    onSelectDate: (date: string, append: boolean) => void;
    weekMultiSelectEnabled: boolean;
    onSetHoveredSdrId: (id: string | null) => void;
    onSetDragState: (state: DragState | null) => void;
    onSetDragOverCell: (cell: QuickAddCell | null) => void;
    onOpenQuickAdd: (cell: QuickAddCell, target: HTMLElement) => void;
    onMoveBlock: (blockId: string, newDate: string, newSdrId: string) => Promise<void>;
    onDeleteBlock: (blockId: string) => Promise<void>;
    onOpenDeleteConfirm: (state: DeleteConfirmPopoverState | null) => void;
    rowRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
    onSetDragOverTrash: (active: boolean) => void;
    deletingBlockId: string | null;
}) {
    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="grid flex-shrink-0 border-b border-slate-200 bg-slate-50/80" style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
                <div className="px-3 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-r border-slate-200 flex items-center">
                    SDR
                </div>
                {days.map((day, index) => (
                    <button
                        key={day.dateStr}
                        type="button"
                        onClick={(event) => onSelectDate(day.dateStr, weekMultiSelectEnabled || event.ctrlKey || event.metaKey)}
                        className={cn(
                            'px-2 py-3 text-center border-r border-slate-200 last:border-r-0 transition-colors',
                            selectedDate === day.dateStr && 'bg-indigo-50',
                            selectedDates.includes(day.dateStr) && 'ring-1 ring-inset ring-indigo-300',
                            day.isToday && 'bg-indigo-50/60',
                            index >= 5 && 'bg-slate-100/40',
                        )}
                        title={weekMultiSelectEnabled ? 'Multi-sélection active' : 'Cliquez pour ouvrir le jour · Ctrl/Cmd+clic pour multi-sélection'}
                    >
                        <div className="text-[10px] font-semibold text-slate-500 uppercase">{DAY_LABELS_SHORT[index]}</div>
                        <div
                            className={cn(
                                'text-lg font-bold mt-0.5 w-8 h-8 mx-auto flex items-center justify-center rounded-full',
                                day.isToday ? 'bg-indigo-600 text-white' : day.isCurrentMonth ? 'text-slate-800' : 'text-slate-300',
                            )}
                        >
                            {day.date.getDate()}
                        </div>
                    </button>
                ))}
            </div>

            <div className="grid flex-shrink-0 border-b border-slate-200 bg-white" style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}>
                <div className="px-3 py-3 border-r border-slate-200 flex items-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Team load
                </div>
                {days.map((day) => {
                    const pct = teamLoadByDate[day.dateStr] ?? 0;
                    const barClass = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500';
                    return (
                        <div key={day.dateStr} className="px-2 py-3 border-r border-slate-100 last:border-r-0">
                            <div className="h-6 rounded-full bg-slate-100 overflow-hidden relative">
                                <div className={cn('h-full transition-all', barClass)} style={{ width: `${Math.min(pct, 100)}%` }} />
                                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-700">
                                    {pct}%
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex-1 overflow-y-auto">
                {sdrs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                        Aucun SDR cette semaine
                    </div>
                ) : (
                    sdrs.map((sdr) => {
                        const isHovered = hoveredSdrId === sdr.id;
                        const isHighlighted = highlightedSdrId === sdr.id;

                        return (
                            <div
                                key={sdr.id}
                                ref={(node) => {
                                    rowRefs.current[sdr.id] = node;
                                }}
                                className={cn(
                                    'grid border-b border-slate-100 transition-colors',
                                    isHighlighted && 'bg-indigo-50/50',
                                    isHovered && !isHighlighted && 'bg-slate-50/70',
                                )}
                                style={{ gridTemplateColumns: '180px repeat(7, 1fr)' }}
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
                                                if (weekMultiSelectEnabled || event.ctrlKey || event.metaKey) {
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
                                                dayBlocks.length === 0 && 'hover:bg-slate-50',
                                                isDropTarget && 'bg-indigo-50 ring-1 ring-inset ring-indigo-300',
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
                                                                'rounded-lg px-2 py-1.5 text-[10px] leading-tight border shadow-sm cursor-move',
                                                                dragState?.blockId === block.id && 'opacity-60',
                                                                isDeleting && 'opacity-50 cursor-not-allowed',
                                                            )}
                                                            style={{
                                                                backgroundColor: color.hex + '10',
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

function DeleteConfirmPopover({
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
                className="absolute w-[280px] rounded-xl border border-slate-200 bg-white shadow-2xl p-3"
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
                        className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                        disabled={deleting}
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={deleting}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                    >
                        {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        Supprimer
                    </button>
                </div>
            </div>
        </div>
    );
}

function TrashDropZone({
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
                    'pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 shadow-lg transition-all',
                    isDeleting && 'opacity-90',
                    isOver
                        ? 'bg-red-600 border-red-600 text-white scale-105'
                        : 'bg-white border-red-200 text-red-600',
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

interface QuickAddPopoverProps {
    cell: QuickAddCell;
    position: CellPosition;
    team: CalTeamMember[];
    missions: SnapshotMission[];
    month: string;
    selectedDates: string[];
    onClose: () => void;
    onCreated: () => Promise<void>;
    assignSdrToMission: (missionId: string, sdrId: string) => Promise<boolean>;
}

const QuickAddPopover = forwardRef<HTMLDivElement, QuickAddPopoverProps>(function QuickAddPopover(
    {
        cell,
        position,
        team,
        missions,
        month,
        selectedDates,
        onClose,
        onCreated,
        assignSdrToMission,
    },
    ref,
) {
    const { success, error: showError } = useToast();
    const [sdrId, setSdrId] = useState(cell.sdrId);
    const [missionId, setMissionId] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('17:00');
    const [submitting, setSubmitting] = useState(false);
    const [applyToSelectedDates, setApplyToSelectedDates] = useState(true);

    useEffect(() => {
        setSdrId(cell.sdrId);
        setMissionId('');
        setApplyToSelectedDates(true);
        setStartTime('09:00');
        setEndTime('17:00');
    }, [cell]);

    const missionOptions = useMemo(() => {
        if (!sdrId) {
            return {
                allocated: [] as MissionOption[],
                others: missions.map((mission) => ({ mission, allocationId: null })),
            };
        }

        const allocated: MissionOption[] = [];
        const others: MissionOption[] = [];

        for (const mission of missions) {
            const allocationId = findAllocationIdForMission([mission], month, mission.id, sdrId);
            if (allocationId) {
                allocated.push({ mission, allocationId });
            } else {
                others.push({ mission, allocationId: null });
            }
        }

        return { allocated, others };
    }, [missions, month, sdrId]);

    useEffect(() => {
        if (!missionId) return;
        const exists = [...missionOptions.allocated, ...missionOptions.others].some((entry) => entry.mission.id === missionId);
        if (!exists) setMissionId('');
    }, [missionId, missionOptions]);

    const selectedSdr = team.find((member) => member.id === sdrId);
    const selectedMission = [...missionOptions.allocated, ...missionOptions.others].find((entry) => entry.mission.id === missionId);
    const effectiveSelectedDates = useMemo(() => {
        if (!cell.sdrId) return [cell.date];
        const dates = selectedDates.includes(cell.date) ? selectedDates : [cell.date, ...selectedDates];
        const unique = Array.from(new Set(dates));
        return unique.sort((a, b) => a.localeCompare(b));
    }, [cell.date, cell.sdrId, selectedDates]);
    const canBulkCreate = !!cell.sdrId && effectiveSelectedDates.length > 1;
    const targetDates = canBulkCreate && applyToSelectedDates ? effectiveSelectedDates : [cell.date];

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!sdrId || !missionId) return;

        setSubmitting(true);
        try {
            const isAssigned = selectedMission?.mission.sdrAssignments.some((assignment) => assignment.sdr.id === sdrId) ?? false;
            if (!isAssigned) {
                const ok = await assignSdrToMission(missionId, sdrId);
                if (!ok) {
                    setSubmitting(false);
                    return;
                }
            }

            let createdCount = 0;
            let firstError: string | null = null;
            for (const date of targetDates) {
                const res = await fetch('/api/planning', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sdrId,
                        missionId,
                        date,
                        startTime,
                        endTime,
                        ...(selectedMission?.allocationId ? { allocationId: selectedMission.allocationId } : {}),
                    }),
                });
                const json = await res.json();
                if (json.success) {
                    createdCount += 1;
                } else if (!firstError) {
                    firstError = json.error || 'Impossible de créer le créneau';
                }
            }
            if (createdCount > 0) {
                const label = createdCount > 1 ? `${createdCount} créneaux créés` : 'Créneau créé';
                success(label, `${startTime}–${endTime}`);
                await onCreated();
            } else {
                showError('Erreur', firstError || 'Impossible de créer le créneau');
            }
        } catch {
            showError('Erreur', 'Une erreur est survenue');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div
            ref={ref}
            className="fixed z-40 w-[320px] rounded-2xl border border-slate-200 bg-white shadow-2xl"
            style={{ top: position.top, left: position.left }}
        >
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-slate-900">Nouveau créneau</p>
                        <p className="text-xs text-slate-500 mt-1">
                            {formatFullDate(cell.date)}
                            {selectedSdr && <> · {selectedSdr.name}</>}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {!cell.sdrId && (
                    <div>
                        <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">SDR</label>
                        <select
                            value={sdrId}
                            onChange={(event) => setSdrId(event.target.value)}
                            className="mt-1 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 outline-none"
                            required
                        >
                            <option value="">Sélectionner...</option>
                            {team.map((member) => (
                                <option key={member.id} value={member.id}>{member.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div>
                    <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Mission</label>
                    <select
                        value={missionId}
                        onChange={(event) => setMissionId(event.target.value)}
                        className="mt-1 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 outline-none"
                        required
                        disabled={!sdrId}
                    >
                        <option value="">Sélectionner...</option>
                        {missionOptions.allocated.length > 0 && (
                            <optgroup label="Missions allouées">
                                {missionOptions.allocated.map((entry) => (
                                    <option key={entry.mission.id} value={entry.mission.id}>
                                        {entry.mission.name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                        {missionOptions.others.length > 0 && (
                            <optgroup label="Autres missions">
                                {missionOptions.others.map((entry) => (
                                    <option key={entry.mission.id} value={entry.mission.id}>
                                        {entry.mission.name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Début</label>
                        <input
                            type="time"
                            value={startTime}
                            onChange={(event) => setStartTime(event.target.value)}
                            className="mt-1 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 outline-none"
                            required
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Fin</label>
                        <input
                            type="time"
                            value={endTime}
                            onChange={(event) => setEndTime(event.target.value)}
                            className="mt-1 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 outline-none"
                            required
                        />
                    </div>
                </div>

                {canBulkCreate && (
                    <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                        <input
                            type="checkbox"
                            checked={applyToSelectedDates}
                            onChange={(event) => setApplyToSelectedDates(event.target.checked)}
                            className="mt-0.5"
                        />
                        <span className="text-[11px] text-slate-600">
                            Appliquer aux {effectiveSelectedDates.length} jours sélectionnés
                        </span>
                    </label>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                    <button type="button" onClick={onClose} className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 font-medium">
                        Annuler
                    </button>
                    <button
                        type="submit"
                        disabled={submitting || !sdrId || !missionId}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                        {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Créer
                    </button>
                </div>
            </form>
        </div>
    );
});

function LoadDrawer({
    month,
    sdrs,
    highlightedSdrId,
    onSelectSdr,
}: {
    month: string;
    sdrs: SnapshotSdr[];
    highlightedSdrId: string | null;
    onSelectSdr: (sdrId: string) => void;
}) {
    return (
        <div className="w-[280px] flex-shrink-0 border-l border-slate-200 bg-white">
            <div className="px-4 py-4 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">Charge équipe — {formatMonthLabel(month)}</h3>
            </div>

            <div className="overflow-y-auto h-full px-3 py-3 space-y-2">
                {sdrs.map((sdr) => {
                    const capacity = getMonthlyCapacity(sdr);
                    const allocated = sdr.sdrDayAllocations.reduce((sum, allocation) => sum + allocation.allocatedDays, 0);
                    const pct = capacity > 0 ? Math.round((allocated / capacity) * 100) : 0;
                    const status = getSdrStatus(allocated, capacity);
                    const barClass =
                        status === 'overloaded'
                            ? 'bg-red-500'
                            : status === 'near'
                                ? 'bg-amber-500'
                                : status === 'optimal'
                                    ? 'bg-emerald-500'
                                    : 'bg-blue-500';

                    return (
                        <button
                            key={sdr.id}
                            type="button"
                            onClick={() => onSelectSdr(sdr.id)}
                            className={cn(
                                'w-full text-left p-3 rounded-xl border transition-colors',
                                highlightedSdrId === sdr.id
                                    ? 'border-indigo-300 bg-indigo-50'
                                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                            )}
                        >
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-sm font-medium text-slate-800 truncate">{sdr.name}</span>
                                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', SDR_STATUS_CONFIG[status].className)}>
                                    {pct}%
                                </span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div className={cn('h-full transition-all', barClass)} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
                                <span>{allocated}/{capacity}j</span>
                                {pct >= 100 && <span className="text-amber-600 font-semibold">⚠</span>}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}


function DaySidebar({
    date,
    blocks,
    team,
    missions,
    onClose,
    showAddForm,
    setShowAddForm,
    onReload,
}: {
    date: string;
    blocks: CalBlock[];
    team: CalTeamMember[];
    missions: SnapshotMission[];
    onClose: () => void;
    showAddForm: boolean;
    setShowAddForm: (value: boolean) => void;
    onReload: () => Promise<void>;
}) {
    const { success, error: showError } = useToast();
    const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });

    const [cancelling, setCancelling] = useState<string | null>(null);
    const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
    const [updatingMissionId, setUpdatingMissionId] = useState<string | null>(null);

    async function handleCancel(blockId: string) {
        setCancelling(blockId);
        try {
            const res = await fetch(`/api/planning/${blockId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'CANCELLED' }),
            });
            const json = await res.json();
            if (json.success) {
                success('Créneau annulé', '');
                await onReload();
            } else {
                showError('Erreur', json.error || "Impossible d'annuler");
            }
        } catch {
            showError('Erreur', 'Une erreur est survenue');
        } finally {
            setCancelling(null);
            setPendingCancelId(null);
        }
    }

    async function handleUpdateMission(blockId: string, missionId: string) {
        setUpdatingMissionId(blockId);
        try {
            const res = await fetch(`/api/planning/${blockId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ missionId }),
            });
            const json = await res.json();
            if (json.success) {
                success('Mission mise à jour', 'Le créneau a été réaffecté.');
                await onReload();
            } else {
                showError('Erreur', json.error || 'Impossible de modifier la mission');
            }
        } catch {
            showError('Erreur', 'Une erreur est survenue');
        } finally {
            setUpdatingMissionId(null);
        }
    }

    const sdrGroups = useMemo(() => {
        const groups = new Map<string, { sdr: CalBlock['sdr']; blocks: CalBlock[] }>();
        for (const block of blocks) {
            if (!groups.has(block.sdr.id)) groups.set(block.sdr.id, { sdr: block.sdr, blocks: [] });
            groups.get(block.sdr.id)?.blocks.push(block);
        }
        return [...groups.values()];
    }, [blocks]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/50 flex-shrink-0">
                <div>
                    <h3 className="text-sm font-bold text-slate-800 capitalize">{dayLabel}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        {blocks.length} créneau{blocks.length !== 1 ? 'x' : ''}
                        {sdrGroups.length > 0 && <> · {sdrGroups.length} SDR{sdrGroups.length > 1 ? 's' : ''}</>}
                    </p>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className={cn(
                            'p-2 rounded-lg transition-colors',
                            showAddForm ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-400 hover:text-indigo-500',
                        )}
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {showAddForm && (
                <AddBlockForm
                    date={date}
                    team={team}
                    missions={missions}
                    onCreated={async () => {
                        setShowAddForm(false);
                        await onReload();
                    }}
                    onCancel={() => setShowAddForm(false)}
                />
            )}

            <div className="flex-1 overflow-y-auto">
                {blocks.length === 0 && !showAddForm && (
                    <button
                        type="button"
                        onClick={() => setShowAddForm(true)}
                        className="flex flex-col items-center justify-center py-16 text-slate-400 w-full hover:bg-slate-50 transition-colors"
                    >
                        <CalendarDays className="w-10 h-10 mb-3 text-slate-200" />
                        <p className="text-sm font-medium text-slate-500">Aucun créneau</p>
                        <p className="text-xs mt-1 text-slate-400 underline">
                            Cliquez ici pour planifier un créneau.
                        </p>
                    </button>
                )}

                {sdrGroups.map(({ sdr, blocks: sdrBlocks }) => (
                    <div key={sdr.id} className="border-b border-slate-100">
                        <div className="flex items-center gap-2 px-4 py-2 bg-slate-50/60">
                            <UserCircle className="w-4 h-4 text-slate-400" />
                            <span className="text-xs font-bold text-slate-700">{sdr.name}</span>
                            <span className="text-[10px] text-slate-400">{sdrBlocks.length} créneau{sdrBlocks.length > 1 ? 'x' : ''}</span>
                        </div>
                        <div className="px-3 py-2 space-y-2">
                            {sdrBlocks.map((block) => {
                                const color = getMissionColor(block.mission.id);
                                const Icon = CHANNEL_ICONS[block.mission.channel] || Phone;
                                const isUpdatingMission = updatingMissionId === block.id;

                                return (
                                    <div
                                        key={block.id}
                                        className="rounded-xl p-3 border transition-shadow hover:shadow-sm"
                                        style={{ borderColor: color.hex + '40', borderLeftWidth: '4px', borderLeftColor: color.hex }}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <div className={cn('w-5 h-5 rounded-md flex items-center justify-center', color.bg)}>
                                                        <Icon className={cn('w-3 h-3', color.text)} />
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-800 truncate">{block.mission.name}</span>
                                                </div>
                                                <p className="text-[11px] text-slate-400 mt-0.5 ml-6">{block.mission.client.name}</p>
                                                <div className="mt-2 ml-6">
                                                    <label className="block text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">
                                                        Mission
                                                    </label>
                                                    <select
                                                        value={block.mission.id}
                                                        disabled={isUpdatingMission || cancelling === block.id}
                                                        onChange={(event) => {
                                                            const nextMissionId = event.target.value;
                                                            if (!nextMissionId || nextMissionId === block.mission.id) return;
                                                            void handleUpdateMission(block.id, nextMissionId);
                                                        }}
                                                        className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 outline-none disabled:opacity-60"
                                                    >
                                                        {missions.map((mission) => (
                                                            <option key={mission.id} value={mission.id}>
                                                                {mission.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (pendingCancelId === block.id) {
                                                        void handleCancel(block.id);
                                                    } else {
                                                        setPendingCancelId(block.id);
                                                    }
                                                }}
                                                disabled={cancelling === block.id}
                                                className={cn(
                                                    'p-1 rounded-lg flex-shrink-0 transition-colors',
                                                    pendingCancelId === block.id
                                                        ? 'bg-red-50 text-red-600'
                                                        : 'text-slate-300 hover:text-red-500 hover:bg-red-50',
                                                )}
                                                title={pendingCancelId === block.id ? 'Confirmer ?' : 'Annuler'}
                                            >
                                                {cancelling === block.id ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-3 mt-2 ml-6 text-[11px]">
                                            <div className="flex items-center gap-1 text-slate-500">
                                                <Clock className="w-3 h-3 text-slate-400" />
                                                <span className="font-medium">{block.startTime} – {block.endTime}</span>
                                            </div>
                                            {isUpdatingMission && (
                                                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-600">
                                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                                    Mise à jour...
                                                </span>
                                            )}
                                            {block.suggestionStatus && (
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full',
                                                        block.suggestionStatus === 'CONFIRMED' && 'bg-emerald-50 text-emerald-700',
                                                        block.suggestionStatus === 'SUGGESTED' && 'bg-amber-50 text-amber-700',
                                                    )}
                                                >
                                                    {block.suggestionStatus === 'CONFIRMED' && (
                                                        <>
                                                            <Check className="w-2.5 h-2.5" /> Confirmé
                                                        </>
                                                    )}
                                                    {block.suggestionStatus === 'SUGGESTED' && 'Suggestion'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="px-3 pb-3">
                            <button
                                type="button"
                                onClick={() => setShowAddForm(true)}
                                className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg py-2 transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Ajouter mission
                            </button>
                        </div>
                    </div>
                ))}

                {blocks.length > 0 && !showAddForm && (
                    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-600">
                        Pour planifier automatiquement plusieurs jours sur une mission, utilisez l&apos;affectation dans la carte mission.
                    </div>
                )}
            </div>
        </div>
    );
}

function AddBlockForm({
    date,
    team,
    missions,
    onCreated,
    onCancel,
}: {
    date: string;
    team: CalTeamMember[];
    missions: SnapshotMission[];
    onCreated: () => Promise<void>;
    onCancel: () => void;
}) {
    const { success, error: showError } = useToast();
    const [sdrId, setSdrId] = useState('');
    const [missionId, setMissionId] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('17:00');
    const [submitting, setSubmitting] = useState(false);

    const filteredMissions = missions;

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!sdrId || !missionId) return;

        setSubmitting(true);
        try {
            const res = await fetch('/api/planning', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sdrId, missionId, date, startTime, endTime }),
            });
            const json = await res.json();
            if (json.success) {
                success('Créneau créé', `${startTime}–${endTime}`);
                await onCreated();
            } else {
                showError('Erreur', json.error || 'Impossible de créer le créneau');
            }
        } catch {
            showError('Erreur', 'Une erreur est survenue');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="border-b border-slate-200 px-4 py-3 space-y-3 bg-indigo-50/30 flex-shrink-0">
            <p className="text-xs font-bold text-slate-700">Nouveau créneau</p>

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">SDR</label>
                    <select
                        value={sdrId}
                        onChange={(event) => setSdrId(event.target.value)}
                        className="mt-0.5 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 outline-none"
                        required
                    >
                        <option value="">Sélectionner...</option>
                        {team.map((member) => (
                            <option key={member.id} value={member.id}>{member.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Mission</label>
                    <select
                        value={missionId}
                        onChange={(event) => setMissionId(event.target.value)}
                        className="mt-0.5 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 outline-none"
                        required
                    >
                        <option value="">Sélectionner...</option>
                        {filteredMissions.map((mission) => (
                            <option key={mission.id} value={mission.id}>{mission.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Début</label>
                    <input
                        type="time"
                        value={startTime}
                        onChange={(event) => setStartTime(event.target.value)}
                        className="mt-0.5 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 outline-none"
                        required
                    />
                </div>
                <div>
                    <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Fin</label>
                    <input
                        type="time"
                        value={endTime}
                        onChange={(event) => setEndTime(event.target.value)}
                        className="mt-0.5 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100 outline-none"
                        required
                    />
                </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
                <button
                    type="submit"
                    disabled={submitting || !sdrId || !missionId}
                    className="flex-1 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
                >
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Créer le créneau
                </button>
                <button type="button" onClick={onCancel} className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 font-medium">
                    Annuler
                </button>
            </div>
        </form>
    );
}

function MissionTargetsPanel({
    month,
    clients,
}: {
    month: string;
    clients: Array<{
        clientName: string;
        missions: Array<{
            id: string;
            name: string;
            startDate: string;
            endDate: string;
            totalContractDays: number | null;
            totalPlannedDays: number;
            contractDeltaDays: number | null;
            monthTargetDays: number;
            monthAllocatedDays: number;
            monthScheduledDays: number;
            monthRemainingDays: number;
            suggestedMonthTargetDays: number;
            weekPlacedDays: number;
            weekRecommendedAddDays: number;
            shouldAddThisWeek: boolean;
        }>;
    }>;
}) {
    return (
        <aside className="w-[320px] flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
            <div className="px-4 py-3 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900">Clients & missions</h3>
                <p className="text-[11px] text-slate-500 mt-1">Objectif du mois: {formatMonthLabel(month)}</p>
            </div>

            <div className="px-3 py-3 space-y-3">
                {clients.length === 0 ? (
                    <div className="text-xs text-slate-500 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        Aucun objectif mission défini pour ce mois.
                    </div>
                ) : (
                    clients.map((client) => (
                        <div key={client.clientName} className="rounded-xl border border-slate-200 bg-white">
                            <div className="px-3 py-2 border-b border-slate-100">
                                <p className="text-xs font-semibold text-slate-800 truncate">{client.clientName}</p>
                            </div>
                            <div className="px-2 py-2 space-y-1.5">
                                {client.missions.map((mission) => {
                                    const weeklyDecisionClass = mission.shouldAddThisWeek
                                        ? 'text-amber-700 bg-amber-50'
                                        : 'text-emerald-700 bg-emerald-50';
                                    const contractDeltaClass = mission.contractDeltaDays == null
                                        ? 'text-slate-600 bg-slate-100'
                                        : mission.contractDeltaDays > 0
                                            ? 'text-amber-700 bg-amber-50'
                                            : mission.contractDeltaDays < 0
                                                ? 'text-red-700 bg-red-50'
                                                : 'text-emerald-700 bg-emerald-50';
                                    return (
                                        <div key={mission.id} className="rounded-lg px-2 py-2 hover:bg-slate-50 border border-slate-100">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] font-semibold text-slate-700 truncate">{mission.name}</span>
                                                <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap', weeklyDecisionClass)}>
                                                    {mission.shouldAddThisWeek ? `Ajouter ~${formatDayValue(mission.weekRecommendedAddDays)}` : 'OK cette semaine'}
                                                </span>
                                            </div>
                                            <div className="mt-1.5 text-[10px] text-slate-600 flex flex-wrap gap-x-2 gap-y-1">
                                                <span>Contrat: {mission.totalContractDays != null ? `${mission.totalContractDays}j` : 'n/a'}</span>
                                                <span>Planifiés: {mission.totalPlannedDays}j</span>
                                                {mission.contractDeltaDays != null && (
                                                    <span className={cn('px-1.5 py-0.5 rounded-full font-medium', contractDeltaClass)}>
                                                        {mission.contractDeltaDays > 0
                                                            ? `Sous-planifié: ${mission.contractDeltaDays}j`
                                                            : mission.contractDeltaDays < 0
                                                                ? `Sur-planifié: ${Math.abs(mission.contractDeltaDays)}j`
                                                                : 'Contrat équilibré'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-1 text-[10px] text-slate-600 flex flex-wrap gap-x-2 gap-y-1">
                                                <span>Mois: cible {mission.monthTargetDays > 0 ? mission.monthTargetDays : mission.suggestedMonthTargetDays}j</span>
                                                <span>alloués {mission.monthAllocatedDays}j</span>
                                                {mission.monthScheduledDays > 0 && <span>placés {formatDayValue(mission.monthScheduledDays)}</span>}
                                                <span>reste {mission.monthRemainingDays}j</span>
                                            </div>
                                            <div className="mt-1 text-[10px] text-slate-600 flex flex-wrap gap-x-2 gap-y-1">
                                                <span>Placés cette semaine: {formatDayValue(mission.weekPlacedDays)}</span>
                                                <span>À ajouter conseillé: {formatDayValue(mission.weekRecommendedAddDays)}</span>
                                            </div>
                                            <div className="mt-1 text-[10px] text-slate-500">
                                                Période: {formatShortDate(mission.startDate)} → {formatShortDate(mission.endDate)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </aside>
    );
}

function groupBlocksByDate(blocks: CalBlock[]): Record<string, CalBlock[]> {
    const grouped: Record<string, CalBlock[]> = {};
    for (const block of blocks) {
        const key = block.date;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(block);
    }
    return grouped;
}

function getBlockDayUnits(block: Pick<CalBlock, 'startTime' | 'endTime'>): number {
    const hours = calcHours(block.startTime, block.endTime);
    if (hours <= 0) return 0;
    return hours / HOURS_PER_DAY;
}

function getMonthlyCapacity(sdr: SnapshotSdr): number {
    return sdr.sdrMonthCapacities[0]?.effectiveAvailableDays ?? 0;
}

function findAllocationIdForMission(
    missions: SnapshotMission[],
    month: string,
    missionId: string,
    sdrId: string,
): string | null {
    const mission = missions.find((entry) => entry.id === missionId);
    const plan = mission?.missionMonthPlans.find((entry) => entry.month === month);
    return plan?.allocations.find((allocation) => allocation.sdrId === sdrId)?.id ?? null;
}

function formatDayValue(value: number): string {
    if (Number.isInteger(value)) return `${value}j`;
    return `${value.toFixed(1).replace('.', ',')}j`;
}

function sanitizeDayValue(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.round(value * 10) / 10);
}

function formatFullDate(date: string): string {
    return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });
}

function normalizeDateKey(dateKey: string): string {
    const [year, month, day] = dateKey.split('-');
    if (!year || !month || !day) return dateKey;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function normalizeMonthlyData(payload: MonthlyData): MonthlyData {
    const normalizedByDate: Record<string, CalBlock[]> = {};
    for (const [rawKey, blocks] of Object.entries(payload.blocksByDate ?? {})) {
        const normalizedKey = normalizeDateKey(rawKey).slice(0, 10);
        normalizedByDate[normalizedKey] = blocks;
    }
    return {
        ...payload,
        blocksByDate: normalizedByDate,
    };
}

function toDateString(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function firstMondayOfMonth(year: number, mon: number): Date {
    const firstOfMonth = new Date(year, mon - 1, 1);
    let startDow = firstOfMonth.getDay() - 1;
    if (startDow < 0) startDow = 6;
    const firstMonday = new Date(firstOfMonth);
    firstMonday.setDate(firstMonday.getDate() - startDow);
    return firstMonday;
}

function currentWeekKey(weekOffset: number, month: string): string {
    return `${month}:${weekOffset}`;
}

function endOfMonthFromMonthKey(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    return `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
}

function getWeeksLeftIncludingCurrent(weekStartDateStr: string, monthEndDateStr: string): number {
    const weekStart = new Date(`${weekStartDateStr}T00:00:00`);
    const monthEnd = new Date(`${monthEndDateStr}T00:00:00`);
    if (Number.isNaN(weekStart.getTime()) || Number.isNaN(monthEnd.getTime()) || weekStart > monthEnd) return 1;

    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((monthEnd.getTime() - weekStart.getTime()) / msPerDay);
    return Math.floor(diffDays / 7) + 1;
}

function countActiveMonthsFrom(monthKey: string, missionEndDateStr: string): number {
    const [year, month] = monthKey.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(`${missionEndDateStr}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;

    return ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth()) + 1;
}

function formatShortDate(dateLike: string): string {
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return dateLike;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
