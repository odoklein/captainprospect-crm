// ============================================
// GET /api/email/analytics
// Email performance computed from the Email table (see _lib/metrics.ts).
//
// Query: period=7|30|90|custom, from/to=yyyy-MM-dd (custom), mailboxId, missionId
// Returns metrics + breakdowns + the filter options of the page.
// Managers and developers only — the figures cover every team mailbox.
// ============================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { computeEmailMetrics, resolvePeriod } from "./_lib/metrics";

export const GET = withErrorHandler(async (req: NextRequest) => {
    await requireRole(["MANAGER", "DEVELOPER"], req);

    const { searchParams } = new URL(req.url);
    const period = resolvePeriod(searchParams, "30");
    const mailboxId = searchParams.get("mailboxId") || searchParams.get("mailbox") || null;
    const missionId = searchParams.get("missionId") || searchParams.get("mission") || null;

    const [metrics, mailboxes, missions, outboundEver, trackedEver] = await Promise.all([
        computeEmailMetrics(period, { mailboxId, missionId }, { breakdowns: true }),
        prisma.mailbox.findMany({
            select: { id: true, email: true, provider: true, isActive: true },
            orderBy: { email: "asc" },
        }),
        // Missions that ever had an email, so the filter lists something useful.
        prisma.mission.findMany({
            where: { OR: [{ sentEmails: { some: {} } }, { emailThreads: { some: {} } }] },
            select: { id: true, name: true, client: { select: { name: true } } },
            orderBy: { name: "asc" },
            take: 300,
        }),
        prisma.email.count({ where: { direction: "OUTBOUND", status: { notIn: ["DRAFT"] } } }),
        prisma.email.count({ where: { direction: "OUTBOUND", trackingPixelId: { not: null } } }),
    ]);

    return successResponse({
        ...metrics,
        context: {
            outboundEver,
            trackedEver,
            mailboxCount: mailboxes.length,
        },
        options: {
            mailboxes: mailboxes.map((m) => ({ id: m.id, label: m.email, hint: m.provider, inactive: !m.isActive })),
            missions: missions.map((m) => ({ id: m.id, label: m.name, hint: m.client?.name ?? null })),
        },
    });
});
