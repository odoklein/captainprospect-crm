/**
 * Planning board engine — pure functions, no React.
 *
 * The board turns every gesture into an Intent ("paint these cells with
 * TALIS", "erase these", "move this block there"). An intent is resolved into
 * BoardOps against a given state, so the same intent can be previewed on the
 * optimistic state and then re-resolved against the server-confirmed state
 * when its turn comes in the write queue.
 */

import {
    ABSENCE_LABELS,
    SLOT_TIMES,
    addDaysToKey,
    blockDayUnits,
    daysBetweenKeys,
    isWeekendKey,
    keyToUtcDate,
    keysInRange,
    mondayOfKey,
    slotOf,
    type AbsenceKind,
    type BoardAbsence,
    type BoardBlock,
    type BoardMission,
    type BoardOp,
    type BoardOpResult,
    type BoardSnapshot,
    type Slot,
} from '@/lib/planning/board-shared';

// ── State ──────────────────────────────────────────────────────────────

export interface BoardState extends BoardSnapshot {
    /** Blocks cancelled during this session, kept so an undo can show them again at once. */
    cancelled: Record<string, BoardBlock>;
}

export function stateFromSnapshot(snapshot: BoardSnapshot, previous?: BoardState | null): BoardState {
    return { ...snapshot, cancelled: previous?.cancelled ?? {} };
}

export interface Cell {
    sdrId: string;
    date: string;
}

export const cellKey = (sdrId: string, date: string) => `${sdrId}|${date}`;

// ── Views & ranges ─────────────────────────────────────────────────────

export type ViewMode = 'week' | 'twoWeeks' | 'month';

export const VIEW_LABELS: Record<ViewMode, string> = {
    week: 'Semaine',
    twoWeeks: '2 semaines',
    month: 'Mois',
};

export interface BoardRange {
    from: string;
    to: string;
    /** Columns shown, in order. */
    days: string[];
}

export function monthStartKey(key: string): string {
    return `${key.slice(0, 7)}-01`;
}

function monthEndKey(key: string): string {
    const d = keyToUtcDate(monthStartKey(key));
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(0);
    return d.toISOString().slice(0, 10);
}

export function normalizeAnchor(view: ViewMode, key: string): string {
    return view === 'month' ? monthStartKey(key) : mondayOfKey(key);
}

export function computeRange(view: ViewMode, anchor: string, showWeekend: boolean): BoardRange {
    const from = normalizeAnchor(view, anchor);
    const to = view === 'week' ? addDaysToKey(from, 6) : view === 'twoWeeks' ? addDaysToKey(from, 13) : monthEndKey(from);
    const days = keysInRange(from, to).filter((k) => showWeekend || !isWeekendKey(k));
    return { from, to, days };
}

export function shiftAnchor(view: ViewMode, anchor: string, direction: 1 | -1): string {
    if (view === 'week') return addDaysToKey(anchor, 7 * direction);
    if (view === 'twoWeeks') return addDaysToKey(anchor, 14 * direction);
    const d = keyToUtcDate(monthStartKey(anchor));
    d.setUTCMonth(d.getUTCMonth() + direction);
    return d.toISOString().slice(0, 10);
}

const fmt = (key: string, opts: Intl.DateTimeFormatOptions) =>
    keyToUtcDate(key).toLocaleDateString('fr-FR', { timeZone: 'UTC', ...opts });

export function formatRangeLabel(view: ViewMode, range: BoardRange): string {
    if (view === 'month') {
        const label = fmt(range.from, { month: 'long', year: 'numeric' });
        return label.charAt(0).toUpperCase() + label.slice(1);
    }
    const first = range.days[0] ?? range.from;
    const last = range.days[range.days.length - 1] ?? range.to;
    const sameMonth = first.slice(0, 7) === last.slice(0, 7);
    const start = sameMonth ? String(Number(first.slice(8))) : fmt(first, { day: 'numeric', month: 'short' });
    return `${start} – ${fmt(last, { day: 'numeric', month: 'short' })}`;
}

export function formatDayHeader(key: string): { weekday: string; day: string } {
    const weekday = fmt(key, { weekday: 'short' }).replace('.', '');
    return { weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1), day: String(Number(key.slice(8))) };
}

export function formatLongDate(key: string): string {
    return fmt(key, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function formatShortDate(key: string): string {
    return fmt(key, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDays(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1).replace('.', ',')} j`;
}

// ── Colors ─────────────────────────────────────────────────────────────

export interface MissionColor {
    bg: string;
    text: string;
    solid: string;
}

const PALETTE: MissionColor[] = [
    { bg: '#EDE9FE', text: '#6D28D9', solid: '#8B5CF6' },
    { bg: '#CCFBF1', text: '#0F766E', solid: '#14B8A6' },
    { bg: '#FFE4E6', text: '#BE123C', solid: '#F43F5E' },
    { bg: '#DBEAFE', text: '#1D4ED8', solid: '#3B82F6' },
    { bg: '#FEF3C7', text: '#B45309', solid: '#F59E0B' },
    { bg: '#D1FAE5', text: '#047857', solid: '#10B981' },
    { bg: '#FAE8FF', text: '#A21CAF', solid: '#D946EF' },
    { bg: '#E0F2FE', text: '#0369A1', solid: '#0EA5E9' },
    { bg: '#FFEDD5', text: '#C2410C', solid: '#F97316' },
    { bg: '#ECFCCB', text: '#4D7C0F', solid: '#84CC16' },
    { bg: '#E0E7FF', text: '#4338CA', solid: '#6366F1' },
    { bg: '#FCE7F3', text: '#BE185D', solid: '#EC4899' },
    { bg: '#CFFAFE', text: '#0E7490', solid: '#06B6D4' },
    { bg: '#FEF9C3', text: '#A16207', solid: '#EAB308' },
];

const FALLBACK_COLOR: MissionColor = { bg: '#F1F5F9', text: '#475569', solid: '#94A3B8' };

function hash(value: string): number {
    let h = 0;
    for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
    return Math.abs(h);
}

/** Distinct colors for every mission on screen, as stable as the mission set allows. */
export function assignMissionColors(missions: BoardMission[]): Map<string, MissionColor> {
    const ordered = [...missions].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const taken = new Set<number>();
    const colors = new Map<string, MissionColor>();
    for (const mission of ordered) {
        let slot = hash(mission.id) % PALETTE.length;
        for (let i = 0; i < PALETTE.length && taken.has(slot); i++) slot = (slot + 1) % PALETTE.length;
        taken.add(slot);
        colors.set(mission.id, PALETTE[slot]);
    }
    return colors;
}

export function missionColor(colors: Map<string, MissionColor>, missionId: string): MissionColor {
    return colors.get(missionId) ?? FALLBACK_COLOR;
}

const AVATAR_COLORS = ['#6366F1', '#0EA5E9', '#14B8A6', '#F59E0B', '#F43F5E', '#8B5CF6', '#10B981', '#EC4899', '#F97316', '#64748B'];

export function avatarColor(name: string): string {
    return AVATAR_COLORS[hash(name) % AVATAR_COLORS.length];
}

export function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Index ──────────────────────────────────────────────────────────────

export interface BoardIndex {
    blocksByCell: Map<string, BoardBlock[]>;
    absenceByCell: Map<string, BoardAbsence>;
    missionsById: Map<string, BoardMission>;
}

export function buildIndex(state: BoardState): BoardIndex {
    const blocksByCell = new Map<string, BoardBlock[]>();
    for (const block of state.blocks) {
        const key = cellKey(block.sdrId, block.date);
        const list = blocksByCell.get(key);
        if (list) list.push(block);
        else blocksByCell.set(key, [block]);
    }
    for (const list of blocksByCell.values()) {
        list.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.createdAt.localeCompare(b.createdAt));
    }

    const absenceByCell = new Map<string, BoardAbsence>();
    for (const absence of state.absences) {
        const start = absence.startDate < state.from ? state.from : absence.startDate;
        const end = absence.endDate > state.to ? state.to : absence.endDate;
        for (const day of keysInRange(start, end)) absenceByCell.set(cellKey(absence.sdrId, day), absence);
    }

    return { blocksByCell, absenceByCell, missionsById: new Map(state.missions.map((m) => [m.id, m])) };
}

/** What a cell shows: at most one entry per mission, with the part of the day it takes. */
export interface CellEntry {
    missionId: string;
    block: BoardBlock;
    /** Extra blocks of the same mission on the same day. */
    duplicates: BoardBlock[];
    slot: Slot;
}

export function cellEntries(blocks: BoardBlock[]): CellEntry[] {
    const byMission = new Map<string, BoardBlock[]>();
    for (const block of blocks) {
        const list = byMission.get(block.missionId);
        if (list) list.push(block);
        else byMission.set(block.missionId, [block]);
    }
    const entries = [...byMission.values()].map((list) => ({
        missionId: list[0].missionId,
        block: list[0],
        duplicates: list.slice(1),
        slot: slotOf(list[0].startTime, list[0].endTime),
    }));
    if (entries.length > 1) {
        // Legacy split days are two full-day blocks: show them as morning + afternoon.
        entries.sort((a, b) => a.block.startTime.localeCompare(b.block.startTime));
        entries[0].slot = 'am';
        entries[1].slot = 'pm';
    }
    return entries;
}

export function cellDayUnits(blocks: BoardBlock[]): number {
    const entries = cellEntries(blocks);
    if (entries.length > 1) return 1;
    return entries.length === 1 ? blockDayUnits(entries[0].block.startTime, entries[0].block.endTime) : 0;
}

// ── Intents ────────────────────────────────────────────────────────────

export type PaintMode = 'full' | 'half';

export type Intent =
    | { kind: 'paint'; cells: Cell[]; missionId: string; mode: PaintMode }
    | { kind: 'place'; cell: Cell; missionId: string; slot: Slot }
    | { kind: 'erase'; cells: Cell[] }
    | { kind: 'absence'; cells: Cell[]; absenceType: AbsenceKind }
    | { kind: 'move'; blockId: string; to: Cell }
    | { kind: 'set-slot'; blockId: string; slot: Slot }
    | { kind: 'change-mission'; blockId: string; missionId: string }
    | { kind: 'remove-block'; blockId: string }
    | { kind: 'dedupe' }
    | { kind: 'copy'; creates: Array<{ sdrId: string; missionId: string; date: string; startTime: string; endTime: string }> }
    /**
     * Ops resolved elsewhere: an undo or redo (from the history), or a previewed
     * bulk copy. `historyLabel` is the original action's name, kept across undo/redo.
     */
    | { kind: 'ops'; ops: BoardOp[]; label: string; role: 'undo' | 'redo' | 'bulk'; historyLabel?: string };

export interface Resolution {
    ops: BoardOp[];
    /** Cells the intent could not touch, by reason, before anything reaches the server. */
    skipped: { absent: number; outOfRange: number; occupied: number };
    /** Number of cells or blocks actually changed — what the confirmation counts. */
    touched: number;
}

export interface ResolveContext {
    canEditAbsences: boolean;
}

const cancelOp = (block: BoardBlock): BoardOp => ({ type: 'update', id: block.id, status: 'CANCELLED' });

function slotOps(block: BoardBlock, slot: Slot): BoardOp[] {
    const t = SLOT_TIMES[slot];
    return block.startTime === t.startTime && block.endTime === t.endTime ? [] : [{ type: 'update', id: block.id, ...t }];
}

function missionRunsOn(mission: BoardMission | undefined, date: string): boolean {
    return !!mission && date >= mission.startDate && date <= mission.endDate;
}

/**
 * Put `missionId` in a cell. `full` replaces whatever is there; a half day
 * keeps one other mission on the other half (`auto` picks the free half).
 */
function placeOps(blocks: BoardBlock[], cell: Cell, missionId: string, slot: Slot | 'auto'): BoardOp[] {
    const ops: BoardOp[] = [];
    const own = blocks.filter((b) => b.missionId === missionId);
    const others = blocks.filter((b) => b.missionId !== missionId);
    const keepOwn = own[0];
    own.slice(1).forEach((b) => ops.push(cancelOp(b)));

    if (slot === 'full') {
        others.forEach((b) => ops.push(cancelOp(b)));
        if (keepOwn) ops.push(...slotOps(keepOwn, 'full'));
        else ops.push({ type: 'create', sdrId: cell.sdrId, missionId, date: cell.date, ...SLOT_TIMES.full });
        return ops;
    }

    const keepOther = others[0];
    others.slice(1).forEach((b) => ops.push(cancelOp(b)));
    let ownSlot: 'am' | 'pm';
    if (slot === 'am' || slot === 'pm') ownSlot = slot;
    else if (keepOther) ownSlot = slotOf(keepOther.startTime, keepOther.endTime) === 'pm' ? 'am' : 'pm';
    else ownSlot = keepOwn && slotOf(keepOwn.startTime, keepOwn.endTime) === 'pm' ? 'pm' : 'am';

    if (keepOther) ops.push(...slotOps(keepOther, ownSlot === 'am' ? 'pm' : 'am'));
    if (keepOwn) ops.push(...slotOps(keepOwn, ownSlot));
    else ops.push({ type: 'create', sdrId: cell.sdrId, missionId, date: cell.date, ...SLOT_TIMES[ownSlot] });
    return ops;
}

function findBlock(state: BoardState, blockId: string): BoardBlock | undefined {
    return state.blocks.find((b) => b.id === blockId);
}

export function resolveIntent(state: BoardState, index: BoardIndex, intent: Intent, ctx: ResolveContext): Resolution {
    const res: Resolution = { ops: [], skipped: { absent: 0, outOfRange: 0, occupied: 0 }, touched: 0 };
    const cellBlocks = (c: Cell) => index.blocksByCell.get(cellKey(c.sdrId, c.date)) ?? [];
    const absenceAt = (c: Cell) => index.absenceByCell.get(cellKey(c.sdrId, c.date));
    const push = (ops: BoardOp[]) => {
        if (ops.length === 0) return;
        res.ops.push(...ops);
        res.touched += 1;
    };

    switch (intent.kind) {
        case 'paint':
        case 'place': {
            const mission = index.missionsById.get(intent.missionId);
            const cells = intent.kind === 'paint' ? intent.cells : [intent.cell];
            const slot: Slot | 'auto' = intent.kind === 'place' ? intent.slot : intent.mode === 'half' ? 'auto' : 'full';
            for (const cell of cells) {
                if (absenceAt(cell)) { res.skipped.absent += 1; continue; }
                if (!missionRunsOn(mission, cell.date)) { res.skipped.outOfRange += 1; continue; }
                push(placeOps(cellBlocks(cell), cell, intent.missionId, slot));
            }
            break;
        }

        case 'erase': {
            for (const cell of intent.cells) {
                const ops = cellBlocks(cell).map(cancelOp);
                if (absenceAt(cell) && ctx.canEditAbsences) ops.push({ type: 'absence-remove-day', sdrId: cell.sdrId, date: cell.date });
                push(ops);
            }
            break;
        }

        case 'absence': {
            if (!ctx.canEditAbsences) break;
            for (const cell of intent.cells) {
                const ops = cellBlocks(cell).map(cancelOp);
                const current = absenceAt(cell);
                if (!current) ops.push({ type: 'absence-add', sdrId: cell.sdrId, date: cell.date, absenceType: intent.absenceType });
                else if (current.type !== intent.absenceType && current.startDate === current.endDate) {
                    ops.push({ type: 'absence-update', id: current.id, absenceType: intent.absenceType });
                }
                push(ops);
            }
            break;
        }

        case 'move': {
            const block = findBlock(state, intent.blockId);
            if (!block || (block.sdrId === intent.to.sdrId && block.date === intent.to.date)) break;
            if (absenceAt(intent.to)) { res.skipped.absent += 1; break; }
            if (!missionRunsOn(index.missionsById.get(block.missionId), intent.to.date)) { res.skipped.outOfRange += 1; break; }
            const target = cellBlocks(intent.to);
            if (target.some((b) => b.missionId === block.missionId)) {
                push([cancelOp(block)]); // already there: the move just merges
            } else {
                push([...target.map(cancelOp), { type: 'update', id: block.id, sdrId: intent.to.sdrId, date: intent.to.date }]);
            }
            break;
        }

        case 'set-slot': {
            const block = findBlock(state, intent.blockId);
            if (!block) break;
            const blocks = cellBlocks(block);
            const ops: BoardOp[] = blocks.filter((b) => b.missionId === block.missionId && b.id !== block.id).map(cancelOp);
            const others = blocks.filter((b) => b.missionId !== block.missionId);
            if (intent.slot === 'full') {
                ops.push(...others.map(cancelOp), ...slotOps(block, 'full'));
            } else {
                ops.push(...slotOps(block, intent.slot));
                if (others[0]) ops.push(...slotOps(others[0], intent.slot === 'am' ? 'pm' : 'am'));
                ops.push(...others.slice(1).map(cancelOp));
            }
            push(ops);
            break;
        }

        case 'change-mission': {
            const block = findBlock(state, intent.blockId);
            if (!block || block.missionId === intent.missionId) break;
            if (!missionRunsOn(index.missionsById.get(intent.missionId), block.date)) { res.skipped.outOfRange += 1; break; }
            const already = cellBlocks(block).some((b) => b.missionId === intent.missionId);
            push(already ? [cancelOp(block)] : [{ type: 'update', id: block.id, missionId: intent.missionId }]);
            break;
        }

        case 'remove-block': {
            const block = findBlock(state, intent.blockId);
            if (block) push([cancelOp(block)]);
            break;
        }

        case 'dedupe': {
            for (const blocks of index.blocksByCell.values()) {
                const byMission = new Map<string, BoardBlock[]>();
                for (const b of blocks) byMission.set(b.missionId, [...(byMission.get(b.missionId) ?? []), b]);
                for (const list of byMission.values()) {
                    if (list.length < 2) continue;
                    const [, ...extra] = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
                    extra.forEach((b) => push([cancelOp(b)]));
                }
            }
            break;
        }

        case 'copy': {
            // Only free days are filled: what is already planned stays as it is.
            const filled = new Map<string, string[]>();
            const occupied = new Set<string>();
            for (const c of intent.creates) {
                const cell = { sdrId: c.sdrId, date: c.date };
                const key = cellKey(c.sdrId, c.date);
                if (absenceAt(cell)) { res.skipped.absent += 1; continue; }
                if (!missionRunsOn(index.missionsById.get(c.missionId), c.date)) { res.skipped.outOfRange += 1; continue; }
                if (cellBlocks(cell).length > 0) { occupied.add(key); continue; }
                const missions = filled.get(key) ?? [];
                if (missions.includes(c.missionId) || missions.length >= 2) continue;
                filled.set(key, [...missions, c.missionId]);
                res.ops.push({ type: 'create', ...c });
            }
            res.skipped.occupied = occupied.size;
            res.touched = filled.size;
            break;
        }

        case 'ops': {
            res.ops = intent.ops;
            res.touched = intent.ops.length;
            break;
        }
    }

    return res;
}

/** Human summary of a resolved intent, used by the confirmation bar. */
export function describeIntent(intent: Intent, touched: number, missionsById: Map<string, BoardMission>): string {
    const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
    switch (intent.kind) {
        case 'paint':
            return `${plural(touched, 'jour planifié', 'jours planifiés')} · ${missionsById.get(intent.missionId)?.name ?? 'mission'}${intent.mode === 'half' ? ' (½ journée)' : ''}`;
        case 'place':
            return `${intent.slot === 'full' ? 'Journée' : '½ journée'} ${missionsById.get(intent.missionId)?.name ?? ''} ajoutée`.trim();
        case 'erase':
            return plural(touched, 'case effacée', 'cases effacées');
        case 'absence':
            return `${plural(touched, 'jour', 'jours')} · ${ABSENCE_LABELS[intent.absenceType]}`;
        case 'move':
            return 'Créneau déplacé';
        case 'set-slot':
            return intent.slot === 'full' ? 'Passé en journée entière' : intent.slot === 'am' ? 'Passé en ½ journée (matin)' : 'Passé en ½ journée (après-midi)';
        case 'change-mission':
            return `Mission changée · ${missionsById.get(intent.missionId)?.name ?? ''}`;
        case 'remove-block':
            return 'Créneau retiré';
        case 'dedupe':
            return plural(touched, 'doublon supprimé', 'doublons supprimés');
        case 'copy':
            return plural(touched, 'jour copié', 'jours copiés');
        case 'ops':
            return intent.label;
    }
}

// ── Applying ops locally ───────────────────────────────────────────────

/**
 * Apply ops to a state. With `results` (server response) skipped ops are
 * dropped and created ids are the real ones; without, temporary ids are used.
 */
export function applyOps(state: BoardState, ops: BoardOp[], results?: BoardOpResult[], tmpId?: (i: number) => string): BoardState {
    let blocks = state.blocks;
    let absences = state.absences;
    let cancelled = state.cancelled;
    const now = new Date().toISOString();

    ops.forEach((op, i) => {
        const result = results?.[i];
        if (result && !result.ok) return;
        const newId = result?.id ?? tmpId?.(i) ?? `tmp-${i}-${now}`;

        switch (op.type) {
            case 'create':
                blocks = [...blocks, {
                    id: newId,
                    sdrId: op.sdrId,
                    missionId: op.missionId,
                    date: op.date,
                    startTime: op.startTime,
                    endTime: op.endTime,
                    createdAt: now,
                }];
                break;

            case 'update': {
                const live = blocks.find((b) => b.id === op.id);
                if (op.status === 'CANCELLED') {
                    if (!live) break;
                    blocks = blocks.filter((b) => b.id !== op.id);
                    cancelled = { ...cancelled, [op.id]: live };
                    break;
                }
                const base = live ?? (op.status === 'SCHEDULED' ? cancelled[op.id] : undefined);
                if (!base) break;
                const next: BoardBlock = {
                    ...base,
                    ...(op.sdrId !== undefined && { sdrId: op.sdrId }),
                    ...(op.missionId !== undefined && { missionId: op.missionId }),
                    ...(op.date !== undefined && { date: op.date }),
                    ...(op.startTime !== undefined && { startTime: op.startTime }),
                    ...(op.endTime !== undefined && { endTime: op.endTime }),
                };
                if (live) {
                    blocks = blocks.map((b) => (b.id === op.id ? next : b));
                } else {
                    blocks = [...blocks, next];
                    cancelled = { ...cancelled };
                    delete cancelled[op.id];
                }
                break;
            }

            case 'absence-add':
                absences = [...absences, { id: newId, sdrId: op.sdrId, startDate: op.date, endDate: op.date, type: op.absenceType }];
                break;

            case 'absence-remove-day': {
                const next: BoardAbsence[] = [];
                for (const a of absences) {
                    if (a.sdrId !== op.sdrId || op.date < a.startDate || op.date > a.endDate) { next.push(a); continue; }
                    if (a.startDate < op.date) next.push({ ...a, endDate: addDaysToKey(op.date, -1) });
                    if (a.endDate > op.date) next.push({ ...a, id: `${a.id}-split-${op.date}`, startDate: addDaysToKey(op.date, 1) });
                }
                absences = next;
                break;
            }

            case 'absence-update':
                absences = absences.map((a) => (a.id === op.id ? { ...a, type: op.absenceType } : a));
                break;
        }
    });

    return { ...state, blocks, absences, cancelled };
}

// ── Mission progress ───────────────────────────────────────────────────

export type MissionPace = 'over' | 'ending' | 'ok' | 'nocontract';

export interface MissionProgress {
    consumed: number;
    remaining: number | null;
    /** consumed / contract, uncapped. */
    ratio: number;
    pace: MissionPace;
}

/**
 * Contract use, all time. Deliberately no "behind pace" guess: the contract
 * figures are not reliable enough yet to judge a rhythm, only to show totals.
 */
export function missionProgress(mission: BoardMission, today: string): MissionProgress {
    const consumed = Math.round((mission.usedDays + mission.plannedDays) * 10) / 10;
    const contract = mission.totalContractDays;
    if (!contract) return { consumed, remaining: null, ratio: 0, pace: 'nocontract' };

    const remaining = Math.round((contract - consumed) * 10) / 10;
    const ratio = consumed / contract;
    if (remaining < -0.5) return { consumed, remaining, ratio, pace: 'over' };
    if (remaining >= 1 && mission.endDate >= today && daysBetweenKeys(today, mission.endDate) <= 7) {
        return { consumed, remaining, ratio, pace: 'ending' };
    }
    return { consumed, remaining, ratio, pace: 'ok' };
}

export function describeProgress(mission: BoardMission, today: string, withEnd = true): string {
    const p = missionProgress(mission, today);
    const end = withEnd ? ` · fin ${formatShortDate(mission.endDate)}` : '';
    if (p.pace === 'nocontract') return `${formatDays(p.consumed)} planifiés · pas de contrat renseigné${end}`;
    const base = `${formatDays(p.consumed)} / ${formatDays(mission.totalContractDays ?? 0)} du contrat`;
    if (p.pace === 'over') return `${base} · dépassé de ${formatDays(-(p.remaining ?? 0))}${end}`;
    return `${base} · reste ${formatDays(p.remaining ?? 0)}${end}`;
}

// ── Alerts ─────────────────────────────────────────────────────────────

export interface BoardAlerts {
    /** SDRs with no day planned on the range's upcoming working days. */
    unplannedSdrIds: string[];
    /** 'rest' when part of the range is already past and only the remaining days count. */
    unplannedScope: 'all' | 'rest';
    endingMissions: BoardMission[];
    duplicateBlocks: number;
    /** Blocks on hidden weekend columns. */
    weekendBlocks: number;
}

export function computeAlerts(
    state: BoardState,
    index: BoardIndex,
    visibleSdrIds: string[],
    showWeekend: boolean,
): BoardAlerts {
    const workingDays = keysInRange(state.from, state.to).filter((k) => !isWeekendKey(k));
    const upcoming = workingDays.filter((k) => k >= state.today);
    const considered = upcoming.length > 0 ? upcoming : workingDays;

    const unplannedSdrIds = visibleSdrIds.filter((sdrId) => {
        let available = 0;
        for (const day of considered) {
            const key = cellKey(sdrId, day);
            if ((index.blocksByCell.get(key)?.length ?? 0) > 0) return false;
            if (!index.absenceByCell.has(key)) available += 1;
        }
        return available > 0;
    });

    const endingMissions = state.missions
        .filter((m) => m.paintable && m.endDate >= state.today && m.endDate >= state.from && m.endDate <= state.to)
        .sort((a, b) => a.endDate.localeCompare(b.endDate));

    const visible = new Set(visibleSdrIds);
    let duplicateBlocks = 0;
    for (const [key, blocks] of index.blocksByCell) {
        if (!visible.has(key.slice(0, key.indexOf('|')))) continue;
        duplicateBlocks += cellEntries(blocks).reduce((sum, e) => sum + e.duplicates.length, 0);
    }

    const weekendBlocks = showWeekend ? 0 : state.blocks.filter((b) => isWeekendKey(b.date) && visible.has(b.sdrId)).length;

    const unplannedScope = upcoming.length > 0 && upcoming.length < workingDays.length ? 'rest' : 'all';
    return { unplannedSdrIds, unplannedScope, endingMissions, duplicateBlocks, weekendBlocks };
}

/** Working-day load of an SDR over the shown columns, absences excluded from the capacity. */
export function sdrLoad(index: BoardIndex, sdrId: string, days: string[]): { planned: number; capacity: number } {
    let planned = 0;
    let capacity = 0;
    for (const day of days) {
        if (isWeekendKey(day)) continue;
        const key = cellKey(sdrId, day);
        if (index.absenceByCell.has(key)) continue;
        capacity += 1;
        planned += cellDayUnits(index.blocksByCell.get(key) ?? []);
    }
    return { planned: Math.round(planned * 10) / 10, capacity };
}
