import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    const clientId = (session.user as { clientId?: string | null }).clientId;

    if (!clientId) {
        return successResponse({ items: [], total: 0 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Prisma.ActionWhereInput = {
        channel: "CALL" as const,
        campaign: {
            mission: {
                clientId,
                AND: [portalVisibleMissionWhere()],
            },
        },
    };

    if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            where.createdAt.lte = end;
        }
    }

    const [calls, total] = await Promise.all([
        prisma.action.findMany({
            where,
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                createdAt: true,
                callbackDate: true,
                result: true,
                note: true,
                duration: true,
                company: {
                    select: {
                        id: true,
                        name: true,
                        industry: true,
                        country: true,
                    },
                },
                contact: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        title: true,
                        email: true,
                        phone: true,
                        company: {
                            select: {
                                id: true,
                                name: true,
                                industry: true,
                                country: true,
                            },
                        },
                    },
                },
                campaign: {
                    select: {
                        id: true,
                        name: true,
                        mission: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
        }),
        prisma.action.count({ where }),
    ]);

    return successResponse({ items: calls, total });
});

