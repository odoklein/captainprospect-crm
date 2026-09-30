import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPaceConfig } from "@/lib/sdr-pace/config";
import { computeEffectiveTime, computePace, type Interval } from "@/lib/sdr-pace/pace";

// ============================================
// GET /api/sdr/pace
// Where the SDR stands against today's call pace: calls done, calls expected at
// this point of their effective calling time, and the resulting status.
// ============================================

const APP_TIMEZONE = "Europe/Paris";

function minuteOfDay(hhmm: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: "Non autorisé" }, { status: 401 });
        }
        const sdrId = session.user.id;

        const now = DateTime.now().setZone(APP_TIMEZONE);
        const startOfDay = now.startOf("day");
        const todayKey = now.toFormat("yyyy-MM-dd");
        const tomorrowKey = now.plus({ days: 1 }).toFormat("yyyy-MM-dd");
        // ScheduleBlock.date is a @db.Date: compare against UTC midnight of the Paris day
        // (same convention as /api/sdr/today-blocks).
        const dayStart = new Date(`${todayKey}T00:00:00.000Z`);
        const dayEnd = new Date(`${tomorrowKey}T00:00:00.000Z`);

        const [config, calls, scheduleBlocks] = await Promise.all([
            getPaceConfig(),
            prisma.action.findMany({
                where: { sdrId, channel: "CALL", createdAt: { gte: startOfDay.toJSDate() } },
                select: { createdAt: true },
            }),
            prisma.scheduleBlock.findMany({
                where: {
                    sdrId,
                    date: { gte: dayStart, lt: dayEnd },
                    status: { not: "CANCELLED" },
                    OR: [{ suggestionStatus: null }, { suggestionStatus: "CONFIRMED" }],
                },
                select: { startTime: true, endTime: true },
            }),
        ]);

        const blocks: Interval[] = [];
        for (const b of scheduleBlocks) {
            const start = minuteOfDay(b.startTime);
            const end = minuteOfDay(b.endTime);
            if (start !== null && end !== null && end > start) blocks.push({ start, end });
        }

        const callMinutes = calls.map((c) => {
            const t = DateTime.fromJSDate(c.createdAt, { zone: APP_TIMEZONE });
            return t.hour * 60 + t.minute + t.second / 60;
        });
        const nowMinute = now.hour * 60 + now.minute + now.second / 60;

        const time = computeEffectiveTime({ blocks, callMinutes, nowMinute });
        const pace = computePace({
            callsDone: calls.length,
            dailyQuota: config.dailyQuota,
            targetHours: config.targetHours,
            time,
        });

        return NextResponse.json({
            success: true,
            data: {
                ...pace,
                isCallingTime: time.isCallingTime,
                forgivenPauseMinutes: Math.round(time.forgivenPauseMinutes),
                config,
            },
        });
    } catch (error) {
        console.error("Error computing SDR pace:", error);
        return NextResponse.json({ success: false, error: "Erreur serveur" }, { status: 500 });
    }
}
