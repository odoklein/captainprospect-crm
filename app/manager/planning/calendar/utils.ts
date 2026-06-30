import { Phone, Mail, Linkedin } from 'lucide-react';
import { calcHours } from '../planning-utils';
import type { SnapshotMission } from '../PlanningMonthContext';
import type { CalBlock, MonthlyData } from './types';

export const CHANNEL_ICONS: Record<string, typeof Phone> = { CALL: Phone, EMAIL: Mail, LINKEDIN: Linkedin };
export const DAY_LABELS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const DAY_CELL_CAPACITY = 2;
export const HOURS_PER_DAY = 8;

export function groupBlocksByDate(blocks: CalBlock[]): Record<string, CalBlock[]> {
    const grouped: Record<string, CalBlock[]> = {};
    for (const block of blocks) {
        const key = block.date;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(block);
    }
    return grouped;
}

export function getBlockDayUnits(block: Pick<CalBlock, 'startTime' | 'endTime'>): number {
    const hours = calcHours(block.startTime, block.endTime);
    if (hours <= 0) return 0;
    return hours / HOURS_PER_DAY;
}

export function findAllocationIdForMission(
    missions: SnapshotMission[],
    month: string,
    missionId: string,
    sdrId: string,
): string | null {
    const mission = missions.find((entry) => entry.id === missionId);
    const plan = mission?.missionMonthPlans.find((entry) => entry.month === month);
    return plan?.allocations.find((allocation) => allocation.sdrId === sdrId)?.id ?? null;
}

export function formatDayValue(value: number): string {
    if (Number.isInteger(value)) return `${value}j`;
    return `${value.toFixed(1).replace('.', ',')}j`;
}

export function sanitizeDayValue(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.round(value * 10) / 10);
}

export function formatFullDate(date: string): string {
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

export function normalizeMonthlyData(payload: MonthlyData): MonthlyData {
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

export function toDateString(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function firstMondayOfMonth(year: number, mon: number): Date {
    const firstOfMonth = new Date(year, mon - 1, 1);
    let startDow = firstOfMonth.getDay() - 1;
    if (startDow < 0) startDow = 6;
    const firstMonday = new Date(firstOfMonth);
    firstMonday.setDate(firstMonday.getDate() - startDow);
    return firstMonday;
}

export function endOfMonthFromMonthKey(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    return `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
}

export function getWeeksLeftIncludingCurrent(weekStartDateStr: string, monthEndDateStr: string): number {
    const weekStart = new Date(`${weekStartDateStr}T00:00:00`);
    const monthEnd = new Date(`${monthEndDateStr}T00:00:00`);
    if (Number.isNaN(weekStart.getTime()) || Number.isNaN(monthEnd.getTime()) || weekStart > monthEnd) return 1;

    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((monthEnd.getTime() - weekStart.getTime()) / msPerDay);
    return Math.floor(diffDays / 7) + 1;
}

export function countActiveMonthsFrom(monthKey: string, missionEndDateStr: string): number {
    const [year, month] = monthKey.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(`${missionEndDateStr}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;

    return ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth()) + 1;
}

export function formatShortDate(dateLike: string): string {
    const d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) return dateLike;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
