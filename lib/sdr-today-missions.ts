import { DateTime } from 'luxon';
import { prisma } from '@/lib/prisma';
import { userHasPermission } from '@/lib/api-utils';
import { SDR_VISIBLE_MISSION_STATUSES } from '@/lib/constants/missionStatus';

/**
 * Permission that frees an SDR from the planning: they may switch between every
 * running mission, with or without a block in today's planning. Off by default;
 * granted per user (Paramètres → Permissions) or per role.
 */
export const SDR_ALL_MISSIONS_PERMISSION = 'features.sdr_all_missions';

/** App timezone for "today" so Vercel (UTC) and localhost match the same calendar day. */
const APP_TIMEZONE = 'Europe/Paris';

/**
 * Missions an SDR is actually scheduled on today, per their ScheduleBlock planning.
 * This is the single source of truth for "today's planning" scoping — an SDR must
 * never see or act on leads from a mission that isn't in this set, regardless of
 * any long-lived SDRAssignment record.
 */
export async function getTodaySdrMissionIds(sdrId: string): Promise<string[]> {
    const nowInAppTz = DateTime.now().setZone(APP_TIMEZONE);
    const todayStr = nowInAppTz.toFormat('yyyy-MM-dd');
    const tomorrowStr = nowInAppTz.plus({ days: 1 }).toFormat('yyyy-MM-dd');
    const startOfToday = new Date(`${todayStr}T00:00:00.000Z`);
    const startOfTomorrow = new Date(`${tomorrowStr}T00:00:00.000Z`);

    const blocks = await prisma.scheduleBlock.findMany({
        where: {
            sdrId,
            date: { gte: startOfToday, lt: startOfTomorrow },
            status: { not: 'CANCELLED' },
            OR: [
                { suggestionStatus: null },
                { suggestionStatus: 'CONFIRMED' },
            ],
        },
        select: { missionId: true },
    });

    return [...new Set(blocks.map((b) => b.missionId))];
}

/**
 * The missions an SDR may see and work right now: today's planning, plus every
 * running mission (SDR-visible status, within its dates) when the SDR holds
 * {@link SDR_ALL_MISSIONS_PERMISSION}. Use this for access checks (missions,
 * lists, queue, callbacks); keep {@link getTodaySdrMissionIds} for what is
 * about the planning itself (daily brief, daily feedback).
 */
export async function getSdrMissionScope(sdrId: string, role = 'SDR'): Promise<string[]> {
    const [planned, free] = await Promise.all([
        getTodaySdrMissionIds(sdrId),
        userHasPermission(SDR_ALL_MISSIONS_PERMISSION, sdrId, role),
    ]);
    if (!free) return planned;
    const now = new Date();
    const running = await prisma.mission.findMany({
        where: {
            status: { in: SDR_VISIBLE_MISSION_STATUSES },
            startDate: { lte: now },
            endDate: { gte: now },
        },
        select: { id: true },
    });
    return [...new Set([...planned, ...running.map((m) => m.id)])];
}
