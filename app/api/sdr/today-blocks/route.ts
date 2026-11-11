import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getSdrMissionScope, SDR_ALL_MISSIONS_PERMISSION } from '@/lib/sdr-today-missions';
import { userHasPermission } from '@/lib/api-utils';

/** App timezone for "today" so Vercel (UTC) and localhost match the same calendar day. */
const APP_TIMEZONE = 'Europe/Paris';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Non autorisé' },
                { status: 401 }
            );
        }

        // Booker doesn't use planning — return empty blocks
        const userRole = (session.user as { role?: string }).role;
        if (userRole === 'BOOKER') {
            return NextResponse.json({
                success: true,
                data: {
                    todayBlocks: [],
                    todayMissionIds: [],
                    weekBlocks: [],
                    hasBlocksToday: false,
                },
            });
        }

        // Use app timezone so "today" is the same calendar day on Vercel (UTC) and localhost.
        // Build date range as UTC midnight for the Paris calendar day so PostgreSQL DATE
        // comparison is consistent regardless of DB session timezone (Vercel vs localhost).
        const nowInAppTz = DateTime.now().setZone(APP_TIMEZONE);
        const todayStr = nowInAppTz.toFormat('yyyy-MM-dd');
        const tomorrowStr = nowInAppTz.plus({ days: 1 }).toFormat('yyyy-MM-dd');
        const startOfToday = new Date(`${todayStr}T00:00:00.000Z`);
        const startOfTomorrow = new Date(`${tomorrowStr}T00:00:00.000Z`);

        const blocks = await prisma.scheduleBlock.findMany({
            where: {
                sdrId: session.user.id,
                date: { gte: startOfToday, lt: startOfTomorrow },
                status: { not: 'CANCELLED' },
                OR: [
                    { suggestionStatus: null },
                    { suggestionStatus: 'CONFIRMED' },
                ],
            },
            include: {
                mission: {
                    select: {
                        id: true,
                        name: true,
                        channel: true,
                        client: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: [{ startTime: 'asc' }],
        });

        // This week (Mon–Fri) in app timezone — use UTC midnight for Paris dates for consistent DB comparison
        const weekStartDt = nowInAppTz.startOf('week');
        const weekEndDt = weekStartDt.plus({ days: 5 });
        const weekStart = new Date(`${weekStartDt.toFormat('yyyy-MM-dd')}T00:00:00.000Z`);
        const weekEnd = new Date(`${weekEndDt.toFormat('yyyy-MM-dd')}T00:00:00.000Z`);

        const weekBlocks = await prisma.scheduleBlock.findMany({
            where: {
                sdrId: session.user.id,
                date: { gte: weekStart, lt: weekEnd },
                status: { not: 'CANCELLED' },
                OR: [
                    { suggestionStatus: null },
                    { suggestionStatus: 'CONFIRMED' },
                ],
            },
            select: {
                id: true,
                date: true,
                startTime: true,
                endTime: true,
                mission: {
                    select: { id: true, name: true, channel: true },
                },
            },
            orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        });

        const todayMissionIds = [...new Set(blocks.map((b) => b.mission.id))];

        // « Changer de mission sans planning »: the SDR may pick any running mission.
        const freeMissionSwitch = userRole === 'SDR'
            && await userHasPermission(SDR_ALL_MISSIONS_PERMISSION, session.user.id, userRole);
        const allowedMissionIds = freeMissionSwitch ? await getSdrMissionScope(session.user.id) : todayMissionIds;

        return NextResponse.json({
            success: true,
            data: {
                todayBlocks: blocks,
                todayMissionIds,
                weekBlocks,
                hasBlocksToday: blocks.length > 0,
                freeMissionSwitch,
                allowedMissionIds,
            },
        });
    } catch (error) {
        console.error('Error fetching today blocks:', error);
        return NextResponse.json(
            { success: false, error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
