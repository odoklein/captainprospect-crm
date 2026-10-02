import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { successResponse, requirePlanningAccess, withErrorHandler, validateRequest } from '@/lib/api-utils';
import { createNotification } from '@/lib/notifications';
import {
    DATE_KEY_RE,
    addDaysToKey,
    keyToUtcDate,
    parisTodayKey,
    utcDateToKey,
    type BatchResponse,
    type BoardOp,
    type BoardOpResult,
} from '@/lib/planning/board-shared';

const time = z.string().regex(/^\d{2}:\d{2}$/);
const dateKey = z.string().regex(DATE_KEY_RE);
const absenceType = z.enum(['VACATION', 'SICK', 'TRAINING']);

const opSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('create'), sdrId: z.string().min(1), missionId: z.string().min(1), date: dateKey, startTime: time, endTime: time }),
    z.object({
        type: z.literal('update'),
        id: z.string().min(1),
        sdrId: z.string().min(1).optional(),
        missionId: z.string().min(1).optional(),
        date: dateKey.optional(),
        startTime: time.optional(),
        endTime: time.optional(),
        status: z.enum(['SCHEDULED', 'CANCELLED']).optional(),
    }),
    z.object({ type: z.literal('absence-add'), sdrId: z.string().min(1), date: dateKey, absenceType }),
    z.object({ type: z.literal('absence-remove-day'), sdrId: z.string().min(1), date: dateKey }),
    z.object({ type: z.literal('absence-update'), id: z.string().min(1), absenceType }),
]);

const batchSchema = z.object({ ops: z.array(opSchema).min(1).max(400) });

type Tx = Prisma.TransactionClient;

interface MissionWindow {
    name: string;
    startKey: string;
    endKey: string;
}

/** Per-SDR summary of what changed on days from today on, for one notification each. */
interface SdrChanges {
    added: Map<string, string[]>;
    removed: number;
}

/**
 * POST /api/planning/batch — apply a list of planning writes in one transaction.
 *
 * Every board gesture (a brush stroke, a move, a copy of last week, an undo)
 * is one batch. Each op is validated against the state left by the previous
 * ones: duplicates (same SDR, day and mission), absent days and dates outside
 * the mission are skipped rather than failing the whole batch. The response
 * carries the inverse ops, which is what the board's undo sends back.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requirePlanningAccess(request);
    const { ops } = await validateRequest(request, batchSchema);
    const isManager = session.user.role === 'MANAGER';
    const today = parisTodayKey();

    const missionIds = [...new Set(ops.flatMap((op) => ('missionId' in op && op.missionId ? [op.missionId] : [])))];
    const missionRows = missionIds.length
        ? await prisma.mission.findMany({ where: { id: { in: missionIds } }, select: { id: true, name: true, startDate: true, endDate: true } })
        : [];
    const missions = new Map<string, MissionWindow>(
        missionRows.map((m) => [m.id, { name: m.name.trim(), startKey: utcDateToKey(m.startDate), endKey: utcDateToKey(m.endDate) }]),
    );

    const changes = new Map<string, SdrChanges>();
    const track = (sdrId: string, date: string) => {
        if (date < today) return null;
        let entry = changes.get(sdrId);
        if (!entry) changes.set(sdrId, (entry = { added: new Map(), removed: 0 }));
        return entry;
    };

    const { results, inverse } = await prisma.$transaction(async (tx) => {
        const results: BoardOpResult[] = [];
        const inverse: BoardOp[] = [];

        for (const op of ops) {
            switch (op.type) {
                case 'create': {
                    const mission = missions.get(op.missionId);
                    if (!mission) { results.push({ ok: false, reason: 'not-found' }); break; }
                    if (op.date < mission.startKey || op.date > mission.endKey) { results.push({ ok: false, reason: 'out-of-range' }); break; }
                    if (op.startTime >= op.endTime) { results.push({ ok: false, reason: 'out-of-range' }); break; }
                    if (await isAbsent(tx, op.sdrId, op.date)) { results.push({ ok: false, reason: 'absent' }); break; }
                    if (await findLiveDuplicate(tx, op.sdrId, op.missionId, op.date)) { results.push({ ok: false, reason: 'duplicate' }); break; }

                    await ensureAssignment(tx, op.sdrId, op.missionId);
                    const block = await tx.scheduleBlock.create({
                        data: {
                            sdrId: op.sdrId,
                            missionId: op.missionId,
                            date: keyToUtcDate(op.date),
                            startTime: op.startTime,
                            endTime: op.endTime,
                            suggestionStatus: 'CONFIRMED',
                            createdById: session.user.id,
                        },
                        select: { id: true },
                    });
                    results.push({ ok: true, id: block.id });
                    inverse.push({ type: 'update', id: block.id, status: 'CANCELLED' });
                    const entry = track(op.sdrId, op.date);
                    if (entry) entry.added.set(mission.name, [...(entry.added.get(mission.name) ?? []), op.date]);
                    break;
                }

                case 'update': {
                    const existing = await tx.scheduleBlock.findUnique({
                        where: { id: op.id },
                        select: { id: true, sdrId: true, missionId: true, date: true, startTime: true, endTime: true, status: true },
                    });
                    if (!existing) { results.push({ ok: false, reason: 'not-found' }); break; }

                    const prevDate = utcDateToKey(existing.date);
                    const next = {
                        sdrId: op.sdrId ?? existing.sdrId,
                        missionId: op.missionId ?? existing.missionId,
                        date: op.date ?? prevDate,
                        startTime: op.startTime ?? existing.startTime,
                        endTime: op.endTime ?? existing.endTime,
                        status: op.status ?? existing.status,
                    };
                    const placementChanged =
                        next.sdrId !== existing.sdrId || next.missionId !== existing.missionId || next.date !== prevDate;
                    const revived = existing.status === 'CANCELLED' && next.status !== 'CANCELLED';

                    if (next.startTime >= next.endTime) { results.push({ ok: false, reason: 'out-of-range' }); break; }
                    if (next.status !== 'CANCELLED' && (placementChanged || revived)) {
                        if (next.missionId !== existing.missionId || next.date !== prevDate || revived) {
                            let mission = missions.get(next.missionId);
                            if (!mission) {
                                const row = await tx.mission.findUnique({ where: { id: next.missionId }, select: { name: true, startDate: true, endDate: true } });
                                if (row) {
                                    mission = { name: row.name.trim(), startKey: utcDateToKey(row.startDate), endKey: utcDateToKey(row.endDate) };
                                    missions.set(next.missionId, mission);
                                }
                            }
                            if (!mission) { results.push({ ok: false, reason: 'not-found' }); break; }
                            if (next.date < mission.startKey || next.date > mission.endKey) { results.push({ ok: false, reason: 'out-of-range' }); break; }
                        }
                        if ((next.sdrId !== existing.sdrId || next.date !== prevDate || revived) && await isAbsent(tx, next.sdrId, next.date)) {
                            results.push({ ok: false, reason: 'absent' }); break;
                        }
                        if (await findLiveDuplicate(tx, next.sdrId, next.missionId, next.date, existing.id)) {
                            results.push({ ok: false, reason: 'duplicate' }); break;
                        }
                        await ensureAssignment(tx, next.sdrId, next.missionId);
                    }

                    await tx.scheduleBlock.update({
                        where: { id: existing.id },
                        data: {
                            sdrId: next.sdrId,
                            missionId: next.missionId,
                            date: keyToUtcDate(next.date),
                            startTime: next.startTime,
                            endTime: next.endTime,
                            status: next.status,
                        },
                    });

                    const undo: BoardOp = { type: 'update', id: existing.id };
                    if (op.sdrId !== undefined) undo.sdrId = existing.sdrId;
                    if (op.missionId !== undefined) undo.missionId = existing.missionId;
                    if (op.date !== undefined) undo.date = prevDate;
                    if (op.startTime !== undefined) undo.startTime = existing.startTime;
                    if (op.endTime !== undefined) undo.endTime = existing.endTime;
                    if (op.status !== undefined) undo.status = existing.status === 'CANCELLED' ? 'CANCELLED' : 'SCHEDULED';
                    results.push({ ok: true });
                    inverse.push(undo);

                    if (existing.status !== 'CANCELLED' && (next.status === 'CANCELLED' || placementChanged)) {
                        const entry = track(existing.sdrId, prevDate);
                        if (entry) entry.removed += 1;
                    }
                    if (next.status !== 'CANCELLED' && (revived || placementChanged)) {
                        const entry = track(next.sdrId, next.date);
                        const name = missions.get(next.missionId)?.name;
                        if (entry && name) entry.added.set(name, [...(entry.added.get(name) ?? []), next.date]);
                    }
                    break;
                }

                case 'absence-add': {
                    if (!isManager) { results.push({ ok: false, reason: 'forbidden' }); break; }
                    if (await isAbsent(tx, op.sdrId, op.date)) { results.push({ ok: false, reason: 'already-absent' }); break; }
                    const absence = await tx.sdrAbsence.create({
                        data: {
                            sdrId: op.sdrId,
                            startDate: keyToUtcDate(op.date),
                            endDate: keyToUtcDate(op.date),
                            type: op.absenceType,
                            impactsPlanning: true,
                        },
                        select: { id: true },
                    });
                    results.push({ ok: true, id: absence.id });
                    inverse.push({ type: 'absence-remove-day', sdrId: op.sdrId, date: op.date });
                    break;
                }

                case 'absence-remove-day': {
                    if (!isManager) { results.push({ ok: false, reason: 'forbidden' }); break; }
                    const day = keyToUtcDate(op.date);
                    const covering = await tx.sdrAbsence.findMany({
                        where: { sdrId: op.sdrId, impactsPlanning: true, startDate: { lte: day }, endDate: { gte: day } },
                    });
                    if (covering.length === 0) { results.push({ ok: false, reason: 'not-found' }); break; }
                    for (const a of covering) {
                        const start = utcDateToKey(a.startDate);
                        const end = utcDateToKey(a.endDate);
                        if (start === op.date && end === op.date) {
                            await tx.sdrAbsence.delete({ where: { id: a.id } });
                        } else if (start === op.date) {
                            await tx.sdrAbsence.update({ where: { id: a.id }, data: { startDate: keyToUtcDate(addDaysToKey(op.date, 1)) } });
                        } else if (end === op.date) {
                            await tx.sdrAbsence.update({ where: { id: a.id }, data: { endDate: keyToUtcDate(addDaysToKey(op.date, -1)) } });
                        } else {
                            // The day sits inside a longer absence: split it in two.
                            await tx.sdrAbsence.update({ where: { id: a.id }, data: { endDate: keyToUtcDate(addDaysToKey(op.date, -1)) } });
                            await tx.sdrAbsence.create({
                                data: {
                                    sdrId: a.sdrId,
                                    startDate: keyToUtcDate(addDaysToKey(op.date, 1)),
                                    endDate: a.endDate,
                                    type: a.type,
                                    impactsPlanning: a.impactsPlanning,
                                    note: a.note,
                                },
                            });
                        }
                        const kind = a.type === 'SICK' || a.type === 'TRAINING' ? a.type : 'VACATION';
                        inverse.push({ type: 'absence-add', sdrId: op.sdrId, date: op.date, absenceType: kind });
                    }
                    results.push({ ok: true });
                    break;
                }

                case 'absence-update': {
                    if (!isManager) { results.push({ ok: false, reason: 'forbidden' }); break; }
                    const existing = await tx.sdrAbsence.findUnique({ where: { id: op.id }, select: { id: true, type: true } });
                    if (!existing) { results.push({ ok: false, reason: 'not-found' }); break; }
                    await tx.sdrAbsence.update({ where: { id: op.id }, data: { type: op.absenceType } });
                    const kind = existing.type === 'SICK' || existing.type === 'TRAINING' ? existing.type : 'VACATION';
                    results.push({ ok: true });
                    inverse.push({ type: 'absence-update', id: op.id, absenceType: kind });
                    break;
                }
            }
        }

        return { results, inverse: inverse.reverse() };
    }, { timeout: 30_000, maxWait: 10_000 });

    // One notification per SDR and batch, only about days still ahead.
    await notifySdrs(changes, session.user.name ?? 'Votre manager').catch((err) => {
        console.error('Planning batch notification failed (non-blocking):', err);
    });

    const body: BatchResponse = { results, inverse };
    return successResponse(body);
});

async function isAbsent(tx: Tx, sdrId: string, date: string): Promise<boolean> {
    const day = keyToUtcDate(date);
    const absence = await tx.sdrAbsence.findFirst({
        where: { sdrId, impactsPlanning: true, startDate: { lte: day }, endDate: { gte: day } },
        select: { id: true },
    });
    return !!absence;
}

async function findLiveDuplicate(tx: Tx, sdrId: string, missionId: string, date: string, excludeId?: string) {
    return tx.scheduleBlock.findFirst({
        where: {
            sdrId,
            missionId,
            date: keyToUtcDate(date),
            status: { not: 'CANCELLED' },
            ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true },
    });
}

async function ensureAssignment(tx: Tx, sdrId: string, missionId: string) {
    await tx.sDRAssignment.upsert({
        where: { missionId_sdrId: { missionId, sdrId } },
        create: { missionId, sdrId },
        update: {},
    });
}

function formatDays(dates: string[]): string {
    const sorted = [...new Set(dates)].sort();
    const fmt = (key: string) =>
        keyToUtcDate(key).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
    if (sorted.length === 1) return fmt(sorted[0]);
    return `${sorted.length} j, du ${fmt(sorted[0])} au ${fmt(sorted[sorted.length - 1])}`;
}

async function notifySdrs(changes: Map<string, SdrChanges>, managerName: string) {
    const entries = [...changes.entries()].filter(([, c]) => c.added.size > 0 || c.removed > 0);
    if (entries.length === 0) return;

    const users = await prisma.user.findMany({
        where: { id: { in: entries.map(([id]) => id) } },
        select: { id: true, role: true },
    });
    const roleById = new Map(users.map((u) => [u.id, u.role]));

    for (const [sdrId, c] of entries) {
        const parts = [...c.added.entries()].map(([mission, dates]) => `${mission} (${formatDays(dates)})`);
        if (c.removed > 0) parts.push(`${c.removed} créneau${c.removed > 1 ? 'x' : ''} retiré${c.removed > 1 ? 's' : ''}`);
        await createNotification({
            userId: sdrId,
            title: 'Votre planning a changé',
            message: `${parts.join(' · ')}. Par ${managerName}`,
            type: 'info',
            link: roleById.get(sdrId) === 'BUSINESS_DEVELOPER' ? '/bd/dashboard' : '/sdr/dashboard',
        });
    }
}
