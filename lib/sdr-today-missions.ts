import { DateTime } from 'luxon';
import { prisma } from '@/lib/prisma';

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
