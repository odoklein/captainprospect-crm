import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    withErrorHandler,
    requireRole,
} from "@/lib/api-utils";

/**
 * GET /api/support/manager/alerts
 * Returns recent client-activity notifications for the current manager.
 * Filters to titles containing client-related keywords (Signal, Avis, Demande report, Annulation, Message support).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);

    const notifications = await prisma.notification.findMany({
        where: {
            userId: session.user.id,
            OR: [
                { title: { startsWith: "Signal client" } },
                { title: { startsWith: "Avis client" } },
                { title: { startsWith: "Demande report" } },
                { title: { startsWith: "Annulation client" } },
                { title: { startsWith: "Message support" } },
                { title: { startsWith: "Suggestion SDR" } },
            ],
        },
        orderBy: { createdAt: "desc" },
        take: 30,
    });

    const unreadCount = await prisma.notification.count({
        where: {
            userId: session.user.id,
            isRead: false,
            OR: [
                { title: { startsWith: "Signal client" } },
                { title: { startsWith: "Avis client" } },
                { title: { startsWith: "Demande report" } },
                { title: { startsWith: "Annulation client" } },
                { title: { startsWith: "Message support" } },
                { title: { startsWith: "Suggestion SDR" } },
            ],
        },
    });

    return successResponse({ alerts: notifications, unreadCount });
});

/**
 * PATCH /api/support/manager/alerts
 * Mark all client-activity alerts as read for the current manager.
 */
export const PATCH = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);

    await prisma.notification.updateMany({
        where: {
            userId: session.user.id,
            isRead: false,
            OR: [
                { title: { startsWith: "Signal client" } },
                { title: { startsWith: "Avis client" } },
                { title: { startsWith: "Demande report" } },
                { title: { startsWith: "Annulation client" } },
                { title: { startsWith: "Message support" } },
                { title: { startsWith: "Suggestion SDR" } },
            ],
        },
        data: { isRead: true },
    });

    return successResponse({ ok: true });
});
