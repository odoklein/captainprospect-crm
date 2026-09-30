import { NextRequest } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { deleteOldAuthEvents } from "@/lib/auth-event";
import { deleteOldUserSessions } from "@/lib/user-session";
import { deleteOldAuditEvents } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

// Retention cleanup — DEVELOPER only (can be called by cron or manually).
// Reads retention period from SystemConfig key "authEventRetentionDays" (default 90).
// Same retention window covers UserSession rows (revoked/stale sign-ins) and AuditEvent rows.
export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["DEVELOPER"], request);

    const config = await prisma.systemConfig.findUnique({
        where: { key: "authEventRetentionDays" },
    });
    const retentionDays = config?.value ? parseInt(config.value, 10) : 90;
    const days = isNaN(retentionDays) || retentionDays < 1 ? 90 : retentionDays;

    const [deletedAuthEvents, deletedUserSessions, deletedAuditEvents] = await Promise.all([
        deleteOldAuthEvents(days),
        deleteOldUserSessions(days),
        deleteOldAuditEvents(days),
    ]);

    return successResponse({
        deleted: deletedAuthEvents,
        deletedUserSessions,
        deletedAuditEvents,
        retentionDays: days,
    });
});
