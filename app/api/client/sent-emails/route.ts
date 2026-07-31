import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    successResponse,
    requireRole,
    withErrorHandler,
} from "@/lib/api-utils";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";

// ============================================
// GET /api/client/sent-emails
// Enhanced: filters, stats, open/click counts, mission context
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);

    // Find client record
    const clientUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { clientId: true },
    });

    if (!clientUser?.clientId) {
        return successResponse({
            emails: [],
            stats: null,
            pagination: { total: 0, page: 1, limit: 25, totalPages: 0, hasMore: false },
        });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const skip = (page - 1) * limit;
    const sortBy = searchParams.get("sortBy") || "sentAt";
    const sortOrder = (searchParams.get("sortOrder") || "desc") as "asc" | "desc";
    const includeStats = searchParams.get("includeStats") === "true";

    // Filters
    const missionId = searchParams.get("missionId") || undefined;
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const hasOpened = searchParams.get("hasOpened") || undefined;
    const hasClicked = searchParams.get("hasClicked") || undefined;

    // Base filter: emails sent for this client's missions OR from client's own mailbox
    const baseWhere: Record<string, unknown> = {
        direction: "OUTBOUND",
        status: { not: "DRAFT" },
        OR: [
            {
                mission: {
                    clientId: clientUser.clientId,
                    AND: [portalVisibleMissionWhere()],
                },
            },
            {
                mailbox: {
                    ownerId: session.user.id,
                },
            },
        ],
    };

    if (missionId) {
        baseWhere.missionId = missionId;
        baseWhere.mission = {
            clientId: clientUser.clientId,
            AND: [portalVisibleMissionWhere()],
        };
        delete baseWhere.OR; // narrow to specific mission
    }

    if (status) {
        // Map display statuses to DB statuses
        if (status === "OPENED") {
            (baseWhere as Record<string, unknown>).OR = [
                { status: "OPENED" },
                { status: "CLICKED" },
                { status: "REPLIED" },
            ];
        } else {
            baseWhere.status = status;
        }
    }

    if (hasOpened === "true") baseWhere.openCount = { gt: 0 };
    if (hasOpened === "false") baseWhere.openCount = 0;
    if (hasClicked === "true") baseWhere.clickCount = { gt: 0 };
    if (hasClicked === "false") baseWhere.clickCount = 0;

    if (dateFrom || dateTo) {
        baseWhere.sentAt = {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo + "T23:59:59") } : {}),
        };
    }

    if (search) {
        const searchCondition = [
            { subject: { contains: search, mode: "insensitive" } },
            { toAddresses: { hasSome: [search] } },
            { contact: { firstName: { contains: search, mode: "insensitive" } } },
            { contact: { lastName: { contains: search, mode: "insensitive" } } },
        ];
        if (baseWhere.OR) {
            // Merge search into existing OR - wrap current OR in AND with search OR
            baseWhere.AND = [{ OR: baseWhere.OR as Record<string, unknown>[] }, { OR: searchCondition }];
            delete baseWhere.OR;
        } else {
            baseWhere.OR = searchCondition;
        }
    }

    const validSortFields: Record<string, unknown> = {
        sentAt: { sentAt: sortOrder },
        subject: { subject: sortOrder },
        openCount: { openCount: sortOrder },
        clickCount: { clickCount: sortOrder },
        status: { status: sortOrder },
    };
    const orderBy = validSortFields[sortBy] || { sentAt: "desc" };

    const [emails, total] = await Promise.all([
        prisma.email.findMany({
            where: baseWhere,
            orderBy,
            skip,
            take: limit,
            select: {
                id: true,
                subject: true,
                toAddresses: true,
                sentAt: true,
                openCount: true,
                clickCount: true,
                firstOpenedAt: true,
                lastOpenedAt: true,
                status: true,
                contact: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                        company: { select: { id: true, name: true } },
                    },
                },
                mission: {
                    select: { id: true, name: true },
                },
                template: { select: { id: true, name: true } },
                sentBy: { select: { id: true, name: true } },
            },
        }),
        prisma.email.count({ where: baseWhere }),
    ]);

    // Compute stats if requested
    let stats = null;
    if (includeStats) {
        const statusCounts = await prisma.email.groupBy({
            by: ["status"],
            where: baseWhere,
            _count: { id: true },
        });
        const byStatus: Record<string, number> = {};
        statusCounts.forEach((s) => { byStatus[s.status] = s._count.id; });

        const totalSent = total;
        const totalOpened = await prisma.email.count({ where: { ...baseWhere, openCount: { gt: 0 } } });
        const totalClicked = await prisma.email.count({ where: { ...baseWhere, clickCount: { gt: 0 } } });

        stats = {
            totalSent,
            totalOpened,
            totalClicked,
            totalReplied: byStatus["REPLIED"] || 0,
            totalBounced: byStatus["BOUNCED"] || 0,
            openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
            clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
            replyRate: totalSent > 0 ? Math.round(((byStatus["REPLIED"] || 0) / totalSent) * 100) : 0,
        };
    }

    return successResponse({
        emails,
        stats,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasMore: page * limit < total,
        },
    });
});
