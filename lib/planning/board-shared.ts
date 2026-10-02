/**
 * Planning board — pure helpers and wire types shared by the board API routes
 * (`/api/planning/board`, `/api/planning/batch`) and the board UI.
 *
 * The board treats a ScheduleBlock as "an SDR works this mission on this day":
 * 97% of real blocks are 09:00–17:00, so hours only distinguish a full day from
 * a half day. Dates travel as `YYYY-MM-DD` keys and are turned into UTC
 * midnights for `@db.Date` columns, so no timezone can shift a day.
 */

// ── Time slots ─────────────────────────────────────────────────────────

export const FULL_DAY = { startTime: '09:00', endTime: '17:00' } as const;
export const HALF_AM = { startTime: '09:00', endTime: '13:00' } as const;
export const HALF_PM = { startTime: '13:00', endTime: '17:00' } as const;

export type Slot = 'full' | 'am' | 'pm';

export const SLOT_TIMES: Record<Slot, { startTime: string; endTime: string }> = {
    full: FULL_DAY,
    am: HALF_AM,
    pm: HALF_PM,
};

function minutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

export function blockHours(startTime: string, endTime: string): number {
    return Math.max(0, (minutes(endTime) - minutes(startTime)) / 60);
}

/** Share of a working day a block represents, capped at one day. */
export function blockDayUnits(startTime: string, endTime: string): number {
    return Math.min(1, blockHours(startTime, endTime) / 8);
}

/** Which part of the day a block covers; anything longer than ~4.5h is a full day. */
export function slotOf(startTime: string, endTime: string): Slot {
    if (blockHours(startTime, endTime) > 4.5) return 'full';
    return minutes(startTime) < 12 * 60 ? 'am' : 'pm';
}

// ── Date keys ──────────────────────────────────────────────────────────

export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function keyToUtcDate(key: string): Date {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

export function utcDateToKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function addDaysToKey(key: string, days: number): string {
    const d = keyToUtcDate(key);
    d.setUTCDate(d.getUTCDate() + days);
    return utcDateToKey(d);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(key: string): number {
    const day = keyToUtcDate(key).getUTCDay();
    return day === 0 ? 7 : day;
}

export function isWeekendKey(key: string): boolean {
    return isoWeekday(key) >= 6;
}

export function mondayOfKey(key: string): string {
    return addDaysToKey(key, 1 - isoWeekday(key));
}

export function daysBetweenKeys(fromKey: string, toKey: string): number {
    return Math.round((keyToUtcDate(toKey).getTime() - keyToUtcDate(fromKey).getTime()) / 86_400_000);
}

/** Inclusive list of keys from → to. */
export function keysInRange(fromKey: string, toKey: string): string[] {
    const keys: string[] = [];
    for (let k = fromKey; k <= toKey; k = addDaysToKey(k, 1)) keys.push(k);
    return keys;
}

export function workingDaysInRange(fromKey: string, toKey: string): number {
    if (fromKey > toKey) return 0;
    return keysInRange(fromKey, toKey).filter((k) => !isWeekendKey(k)).length;
}

/** Today's key in France, where every planner works. */
export function parisTodayKey(now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now);
}

// ── Test accounts ──────────────────────────────────────────────────────

/** "ZTest SDR", "ZtestBookeur", "odo test" — never "Testud". */
const TEST_ACCOUNT_RE = /^ztest|\btest\b/i;

export function isTestAccountName(name: string): boolean {
    return TEST_ACCOUNT_RE.test(name.trim());
}

// ── Contract consumption ───────────────────────────────────────────────

export interface ConsumptionBlock {
    sdrId: string;
    missionId: string;
    date: string;
    startTime: string;
    endTime: string;
}

/**
 * Days consumed per mission. An SDR-day never counts for more than one day:
 * duplicates of a mission collapse, and a day shared by missions is split
 * between them (two legacy 09:00–17:00 blocks on one day = ½ + ½).
 */
export function computeMissionConsumption(
    blocks: ConsumptionBlock[],
    todayKey: string,
): Map<string, { usedDays: number; plannedDays: number }> {
    const bySdrDay = new Map<string, Map<string, number>>();
    for (const b of blocks) {
        const key = `${b.sdrId}|${b.date}`;
        let perMission = bySdrDay.get(key);
        if (!perMission) bySdrDay.set(key, (perMission = new Map()));
        perMission.set(b.missionId, Math.min(1, (perMission.get(b.missionId) ?? 0) + blockDayUnits(b.startTime, b.endTime)));
    }

    const result = new Map<string, { usedDays: number; plannedDays: number }>();
    for (const [key, perMission] of bySdrDay) {
        const date = key.slice(key.indexOf('|') + 1);
        const total = [...perMission.values()].reduce((s, v) => s + v, 0);
        const scale = total > 1 ? 1 / total : 1;
        for (const [missionId, units] of perMission) {
            const entry = result.get(missionId) ?? { usedDays: 0, plannedDays: 0 };
            if (date < todayKey) entry.usedDays += units * scale;
            else entry.plannedDays += units * scale;
            result.set(missionId, entry);
        }
    }
    for (const entry of result.values()) {
        entry.usedDays = Math.round(entry.usedDays * 10) / 10;
        entry.plannedDays = Math.round(entry.plannedDays * 10) / 10;
    }
    return result;
}

// ── Wire types ─────────────────────────────────────────────────────────

export type AbsenceKind = 'VACATION' | 'SICK' | 'TRAINING';

export const ABSENCE_LABELS: Record<string, string> = {
    VACATION: 'Congé',
    SICK: 'Maladie',
    TRAINING: 'Formation',
    PUBLIC_HOLIDAY: 'Férié',
    PARTIAL: 'Absence partielle',
};

export interface BoardBlock {
    id: string;
    sdrId: string;
    missionId: string;
    date: string;
    startTime: string;
    endTime: string;
    createdAt: string;
}

export interface BoardAbsence {
    id: string;
    sdrId: string;
    startDate: string;
    endDate: string;
    type: string;
}

export interface BoardSdr {
    id: string;
    name: string;
    role: string;
    isActive: boolean;
    isTest: boolean;
}

export interface BoardMission {
    id: string;
    name: string;
    clientName: string;
    startDate: string;
    endDate: string;
    createdAt: string;
    totalContractDays: number | null;
    /** Days consumed before today, all time. */
    usedDays: number;
    /** Days planned from today on, all time. */
    plannedDays: number;
    assignedSdrIds: string[];
    /** Active and running during the requested range: can receive new days. */
    paintable: boolean;
}

export interface BoardSnapshot {
    from: string;
    to: string;
    today: string;
    sdrs: BoardSdr[];
    missions: BoardMission[];
    blocks: BoardBlock[];
    absences: BoardAbsence[];
    canEditAbsences: boolean;
}

/** One write inside a `/api/planning/batch` call. */
export type BoardOp =
    | { type: 'create'; sdrId: string; missionId: string; date: string; startTime: string; endTime: string }
    | {
        type: 'update';
        id: string;
        sdrId?: string;
        missionId?: string;
        date?: string;
        startTime?: string;
        endTime?: string;
        status?: 'SCHEDULED' | 'CANCELLED';
    }
    | { type: 'absence-add'; sdrId: string; date: string; absenceType: AbsenceKind }
    | { type: 'absence-remove-day'; sdrId: string; date: string }
    | { type: 'absence-update'; id: string; absenceType: AbsenceKind };

export type SkipReason = 'duplicate' | 'absent' | 'out-of-range' | 'not-found' | 'already-absent' | 'forbidden';

export interface BoardOpResult {
    ok: boolean;
    /** Id of the created block or absence. */
    id?: string;
    reason?: SkipReason;
}

export interface BatchResponse {
    results: BoardOpResult[];
    /** Ops that undo this batch, already in the order they must run. */
    inverse: BoardOp[];
}

export const SKIP_LABELS: Record<SkipReason, string> = {
    duplicate: 'déjà planifié',
    absent: 'SDR absent',
    'out-of-range': 'hors dates de mission',
    'not-found': 'introuvable',
    'already-absent': 'déjà absent',
    forbidden: 'réservé aux managers',
};
