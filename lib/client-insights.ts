import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";

export interface ClientProductionInsight {
    month: string;
    firstCallAt: Date | null;
    plannedMonthDays: number | null;
    plannedWeekDays: number | null;
    plannedMonthDaysFromWeekly: number | null;
    hasMonthlyPlan: boolean;
    executedDays: number;
    workedCallDays: number;
    totalWorkedCallDays: number;
    totalActions: number;
    totalCalls: number;
    totalMeetings: number;
}

export function getParisMonthWindow(now: Date = new Date()) {
    const nowParis = DateTime.fromJSDate(now).setZone("Europe/Paris");
    return {
        currentMonth: nowParis.toFormat("yyyy-MM"),
        monthStart: nowParis.startOf("month").toUTC().toJSDate(),
        monthEnd: nowParis.endOf("month").toUTC().toJSDate(),
    };
}

function asNumber(value: unknown): number {
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "number") return value;
    if (typeof value === "string") return Number(value) || 0;
    return 0;
}

function emptyInsight(currentMonth: string): ClientProductionInsight {
    return {
        month: currentMonth,
        firstCallAt: null,
        plannedMonthDays: null,
        plannedWeekDays: null,
        plannedMonthDaysFromWeekly: null,
        hasMonthlyPlan: false,
        executedDays: 0,
        workedCallDays: 0,
        totalWorkedCallDays: 0,
        totalActions: 0,
        totalCalls: 0,
        totalMeetings: 0,
    };
}

export async function getClientProductionInsights(
    clientIds: string[],
    now: Date = new Date(),
): Promise<Map<string, ClientProductionInsight>> {
    const uniqueClientIds = Array.from(new Set(clientIds.filter(Boolean)));
    const { currentMonth, monthStart, monthEnd } = getParisMonthWindow(now);
    const insights = new Map<string, ClientProductionInsight>(
        uniqueClientIds.map((clientId) => [clientId, emptyInsight(currentMonth)]),
    );

    if (uniqueClientIds.length === 0) return insights;

    const [planRows, firstCallRows, totalWorkedRows, monthRows] = await Promise.all([
        prisma.mission.findMany({
            where: { clientId: { in: uniqueClientIds } },
            select: {
                clientId: true,
                missionPlans: {
                    where: {
                        status: "ACTIVE",
                        startDate: { lte: monthEnd },
                        OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
                    },
                    select: { frequency: true },
                },
                missionMonthPlans: {
                    where: { month: currentMonth },
                    select: { targetDays: true },
                },
            },
        }),
        prisma.$queryRaw<Array<{ clientId: string; firstCallAt: Date | null }>>(Prisma.sql`
            SELECT m."clientId" AS "clientId", MIN(a."createdAt") AS "firstCallAt"
            FROM "Action" a
            INNER JOIN "Campaign" c ON c."id" = a."campaignId"
            INNER JOIN "Mission" m ON m."id" = c."missionId"
            WHERE m."clientId" IN (${Prisma.join(uniqueClientIds)})
              AND a."channel"::text = 'CALL'
            GROUP BY m."clientId"
        `),
        prisma.$queryRaw<Array<{ clientId: string; workedDays: bigint | number }>>(Prisma.sql`
            SELECT m."clientId" AS "clientId",
                   COUNT(DISTINCT c."missionId" || ':' || a."sdrId" || ':' || to_char(a."createdAt" AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD')) AS "workedDays"
            FROM "Action" a
            INNER JOIN "Campaign" c ON c."id" = a."campaignId"
            INNER JOIN "Mission" m ON m."id" = c."missionId"
            WHERE m."clientId" IN (${Prisma.join(uniqueClientIds)})
              AND a."channel"::text = 'CALL'
            GROUP BY m."clientId"
        `),
        prisma.$queryRaw<Array<{
            clientId: string;
            totalActions: bigint | number;
            totalCalls: bigint | number;
            totalMeetings: bigint | number;
            workedCallDays: bigint | number;
        }>>(Prisma.sql`
            SELECT m."clientId" AS "clientId",
                   COUNT(*) AS "totalActions",
                   COUNT(*) FILTER (WHERE a."channel"::text = 'CALL') AS "totalCalls",
                   COUNT(*) FILTER (WHERE a."result"::text = 'MEETING_BOOKED') AS "totalMeetings",
                   COUNT(DISTINCT CASE
                       WHEN a."channel"::text = 'CALL'
                       THEN c."missionId" || ':' || a."sdrId" || ':' || to_char(a."createdAt" AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD')
                   END) AS "workedCallDays"
            FROM "Action" a
            INNER JOIN "Campaign" c ON c."id" = a."campaignId"
            INNER JOIN "Mission" m ON m."id" = c."missionId"
            WHERE m."clientId" IN (${Prisma.join(uniqueClientIds)})
              AND a."createdAt" >= ${monthStart}
              AND a."createdAt" <= ${monthEnd}
            GROUP BY m."clientId"
        `),
    ]);

    for (const mission of planRows) {
        const current = insights.get(mission.clientId);
        if (!current) continue;
        const weekly = mission.missionPlans.reduce((sum, plan) => sum + plan.frequency, 0);
        const monthly = mission.missionMonthPlans.reduce((sum, plan) => sum + plan.targetDays, 0);
        current.plannedWeekDays = (current.plannedWeekDays ?? 0) + weekly || current.plannedWeekDays;
        if (monthly > 0) {
            current.hasMonthlyPlan = true;
            current.plannedMonthDays = (current.plannedMonthDays ?? 0) + monthly;
        }
    }

    for (const insight of insights.values()) {
        if (insight.plannedWeekDays && !insight.plannedMonthDays) {
            insight.plannedMonthDaysFromWeekly = insight.plannedWeekDays * 4;
            insight.plannedMonthDays = insight.plannedMonthDaysFromWeekly;
        } else if (insight.plannedWeekDays) {
            insight.plannedMonthDaysFromWeekly = insight.plannedWeekDays * 4;
        }
    }

    for (const row of firstCallRows) {
        const current = insights.get(row.clientId);
        if (current) current.firstCallAt = row.firstCallAt;
    }

    for (const row of totalWorkedRows) {
        const current = insights.get(row.clientId);
        if (current) current.totalWorkedCallDays = asNumber(row.workedDays);
    }

    for (const row of monthRows) {
        const current = insights.get(row.clientId);
        if (!current) continue;
        current.totalActions = asNumber(row.totalActions);
        current.totalCalls = asNumber(row.totalCalls);
        current.totalMeetings = asNumber(row.totalMeetings);
        current.workedCallDays = asNumber(row.workedCallDays);
        current.executedDays = current.workedCallDays;
    }

    return insights;
}

export async function getClientProductionInsight(clientId: string, now: Date = new Date()) {
    const insights = await getClientProductionInsights([clientId], now);
    return insights.get(clientId) ?? emptyInsight(getParisMonthWindow(now).currentMonth);
}
