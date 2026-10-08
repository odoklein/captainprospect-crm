import { isClientCountableMeeting } from "@/lib/meetings/clientVisibility";
import { NextRequest } from "next/server";
import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { successResponse, requireRole, withErrorHandler } from "@/lib/api-utils";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";
import { REPORT_ZONE, parisMonthKey } from "@/lib/reporting/period";
import type { ReportingOverview } from "@/lib/reporting/types";

// ============================================
// GET /api/client/reporting/monthly-summary
// Month-by-month activity since launch (Paris months, zero-filled) plus what
// the report builder needs: the client's missions and its launch date.
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    const clientId = (session.user as { clientId?: string }).clientId;
    const now = new Date();
    const empty: ReportingOverview = { launchDate: null, missions: [], months: [], generatedAt: now.toISOString() };
    if (!clientId) return successResponse(empty);

    const missions = await prisma.mission.findMany({
        where: { clientId, AND: [portalVisibleMissionWhere()] },
        select: { id: true, name: true, isActive: true, startDate: true },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    if (missions.length === 0) return successResponse(empty);

    const launch = DateTime.fromJSDate(new Date(Math.min(...missions.map((m) => m.startDate.getTime()))))
        .setZone(REPORT_ZONE)
        .startOf("day");

    const actions = await prisma.action.findMany({
        where: {
            campaign: { missionId: { in: missions.map((m) => m.id) } },
            createdAt: { gte: launch.startOf("month").toJSDate() },
        },
        select: { createdAt: true, result: true, confirmationStatus: true, channel: true, contactId: true, companyId: true },
    });

    const byMonth = new Map<string, { meetings: number; calls: number; actions: number; touched: Set<string> }>();
    const current = DateTime.fromJSDate(now).setZone(REPORT_ZONE).startOf("month");
    for (let m = launch.startOf("month"); m <= current; m = m.plus({ months: 1 })) {
        byMonth.set(m.toFormat("yyyy-MM"), { meetings: 0, calls: 0, actions: 0, touched: new Set() });
    }

    for (const a of actions) {
        const entry = byMonth.get(parisMonthKey(a.createdAt));
        if (!entry) continue;
        entry.actions++;
        if (a.channel === "CALL") entry.calls++;
        if (isClientCountableMeeting(a)) entry.meetings++;
        if (a.contactId) entry.touched.add(a.contactId);
        else if (a.companyId) entry.touched.add(`company:${a.companyId}`);
    }

    const body: ReportingOverview = {
        launchDate: launch.toISODate(),
        missions: missions.map((m) => ({ id: m.id, name: m.name, isActive: m.isActive })),
        months: [...byMonth.entries()].map(([key, e]) => ({
            key,
            meetings: e.meetings,
            calls: e.calls,
            actions: e.actions,
            contactsTouched: e.touched.size,
        })),
        generatedAt: now.toISOString(),
    };
    return successResponse(body);
});
