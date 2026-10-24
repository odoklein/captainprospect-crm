import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { DateTime } from "luxon";
import type { ActionResult } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { codesOfFamily } from "@/lib/manager-home/outcomes";
import { APP_TIMEZONE } from "@/lib/stats/metrics";

// ============================================
// GET /api/sdr/stats
// Fetch SDR performance stats
//
// Same definitions as the Statistiques page and the manager home:
// - only Action.channel = CALL counts as an appel;
// - days are Europe/Paris days and the week starts on Monday;
// - a RDV is MEETING_BOOKED and not cancelled;
// - leads chauds are the interested + callback families, not one raw code.
// ============================================

// The families are plain strings; the Prisma enum only lists the same codes.
const CALLBACK_CODES = codesOfFamily("callback") as ActionResult[];
const INTERESTED_CODES = codesOfFamily("interested") as ActionResult[];

export async function GET() {
    try {
        const session = await getServerSession(authOptions);

        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: "Non autorisé" },
                { status: 401 }
            );
        }

        const sdrId = session.user.id;
        const now = DateTime.now().setZone(APP_TIMEZONE);
        const today = now.startOf("day");
        // ISO week: Monday 00:00 Paris.
        const weekStart = now.startOf("week");
        const lastWeekStart = weekStart.minus({ weeks: 1 });
        const nowDate = now.toJSDate();

        const callOnly = { sdrId, channel: "CALL" as const };

        const [actionsToday, meetingsBooked, callbacksPending, opportunitiesGenerated, thisWeekActions, lastWeekActions] =
            await Promise.all([
                prisma.action.count({
                    where: { ...callOnly, createdAt: { gte: today.toJSDate() } },
                }),
                prisma.action.count({
                    where: {
                        ...callOnly,
                        result: "MEETING_BOOKED",
                        confirmationStatus: { not: "CANCELLED" },
                        createdAt: { gte: weekStart.toJSDate() },
                    },
                }),
                // A callback is pending while its scheduled date is still ahead; a
                // callback logged this week without a date is still to be handled.
                prisma.action.count({
                    where: {
                        ...callOnly,
                        result: { in: CALLBACK_CODES },
                        OR: [
                            { callbackDate: { gte: nowDate } },
                            { callbackDate: null, createdAt: { gte: weekStart.toJSDate() } },
                        ],
                    },
                }),
                prisma.action.count({
                    where: {
                        ...callOnly,
                        result: { in: INTERESTED_CODES },
                        createdAt: { gte: weekStart.toJSDate() },
                    },
                }),
                prisma.action.count({
                    where: { ...callOnly, createdAt: { gte: weekStart.toJSDate() } },
                }),
                prisma.action.count({
                    where: {
                        ...callOnly,
                        createdAt: { gte: lastWeekStart.toJSDate(), lt: weekStart.toJSDate() },
                    },
                }),
            ]);

        // Keep the real sign: a drop is information, not something to clamp to 0.
        const weeklyProgress = lastWeekActions > 0
            ? Math.round(((thisWeekActions - lastWeekActions) / lastWeekActions) * 100)
            : thisWeekActions > 0 ? 100 : 0;

        return NextResponse.json({
            success: true,
            data: {
                actionsToday,
                meetingsBooked,
                callbacksPending,
                opportunitiesGenerated,
                weeklyProgress,
            },
        });
    } catch (error) {
        console.error("Error fetching SDR stats:", error);
        return NextResponse.json(
            { success: false, error: "Erreur serveur" },
            { status: 500 }
        );
    }
}
