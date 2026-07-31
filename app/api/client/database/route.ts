import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { portalVisibleMissionWhere } from "@/lib/portal-visibility";

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    const clientId = (session.user as { clientId?: string | null }).clientId;

    if (!clientId) {
        return successResponse({ companies: [] });
    }

    const companies = await prisma.company.findMany({
        where: {
            list: {
                mission: {
                    clientId,
                    AND: [portalVisibleMissionWhere()],
                },
            },
        },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            name: true,
            country: true,
            industry: true,
            size: true,
            phone: true,
            website: true,
            contacts: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    title: true,
                    email: true,
                    phone: true,
                },
            },
        },
    });

    return successResponse({ companies });
});

