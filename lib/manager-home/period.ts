// Server-only builder for GET /api/manager/home/period. See ./types.ts.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { outcomeOf } from "./outcomes";
import { bucketSeries, type CountRow, type PeriodRange } from "./rules";
import type { ManagerHomePeriod, PeriodTotals, RecentMeeting } from "./types";

const RECENT_MEETINGS = 12;

function actionWhere(from: Date, to: Date, missionId: string | null): Prisma.ActionWhereInput {
    return {
        createdAt: { gte: from, lt: to },
        ...(missionId ? { campaign: { is: { missionId } } } : {}),
    };
}

async function totals(from: Date, to: Date, missionId: string | null): Promise<PeriodTotals> {
    const rows = await prisma.action.groupBy({
        by: ["result"],
        where: actionWhere(from, to, missionId),
        _count: { _all: true },
    });
    let actions = 0, meetings = 0, hotLeads = 0;
    for (const row of rows) {
        const n = row._count._all;
        const family = outcomeOf(row.result);
        actions += n;
        if (family === "meeting") meetings += n;
        // Same definition as the dashboard's "Leads chauds": interested + callback families.
        if (family === "interested" || family === "callback") hotLeads += n;
    }
    return { actions, meetings, hotLeads };
}

/**
 * Counts per UTC hour (daily chart) or UTC day (weekly chart). Hours, not days,
 * so the Paris-day bucketing in bucketSeries stays exact across the UTC offset.
 */
async function rawCounts(range: PeriodRange, missionId: string | null): Promise<CountRow[]> {
    const unit = range.granularity === "week" ? Prisma.sql`'day'` : Prisma.sql`'hour'`;
    const missionFilter = missionId
        ? Prisma.sql`AND a."campaignId" IN (SELECT c.id FROM "Campaign" c WHERE c."missionId" = ${missionId})`
        : Prisma.empty;
    const rows = await prisma.$queryRaw<{ at: Date; actions: number; meetings: number }[]>`
        SELECT date_trunc(${unit}, a."createdAt") AS at,
               COUNT(*)::int AS actions,
               COUNT(*) FILTER (WHERE a."result" = 'MEETING_BOOKED')::int AS meetings
        FROM "Action" a
        WHERE a."createdAt" >= ${range.from} AND a."createdAt" < ${range.to}
        ${missionFilter}
        GROUP BY 1
    `;
    return rows.map((r) => ({ at: new Date(r.at), actions: Number(r.actions), meetings: Number(r.meetings) }));
}

async function recentMeetings(range: PeriodRange, missionId: string | null): Promise<RecentMeeting[]> {
    const rows = await prisma.action.findMany({
        where: { ...actionWhere(range.from, range.to, missionId), result: "MEETING_BOOKED" },
        orderBy: { createdAt: "desc" },
        take: RECENT_MEETINGS,
        select: {
            id: true,
            createdAt: true,
            callbackDate: true,
            confirmationStatus: true,
            sdr: { select: { name: true } },
            contact: { select: { firstName: true, lastName: true, company: { select: { name: true } } } },
            company: { select: { name: true } },
            campaign: { select: { mission: { select: { name: true } } } },
        },
    });
    return rows.map((r) => {
        const contactName = r.contact
            ? [r.contact.firstName, r.contact.lastName].filter(Boolean).join(" ").trim() || null
            : null;
        return {
            id: r.id,
            createdAt: r.createdAt.toISOString(),
            meetingAt: r.callbackDate?.toISOString() ?? null,
            sdrName: r.sdr.name,
            contactName,
            companyName: r.contact?.company?.name ?? r.company?.name ?? null,
            missionName: r.campaign?.mission?.name ?? null,
            confirmationStatus: r.confirmationStatus,
        };
    });
}

export async function getManagerHomePeriod(range: PeriodRange, missionId: string | null): Promise<ManagerHomePeriod> {
    const [current, previous, counts, meetings] = await Promise.all([
        totals(range.from, range.to, missionId),
        totals(range.prevFrom, range.prevTo, missionId),
        rawCounts(range, missionId),
        recentMeetings(range, missionId),
    ]);
    return {
        range: {
            start: range.start,
            end: range.end,
            days: range.days,
            prevStart: range.prevStart,
            prevEnd: range.prevEnd,
            granularity: range.granularity,
        },
        current,
        previous,
        series: bucketSeries(counts, range),
        recentMeetings: meetings,
    };
}
