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
            // Excluded rows stay visible here on purpose: the client must be
            // able to see that their "ne plus contacter" was applied, and to
            // tell an excluded company apart from one that was never worked.
            excludedAt: true,
            exclusionId: true,
            contacts: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    title: true,
                    email: true,
                    phone: true,
                    excludedAt: true,
                    exclusionId: true,
                },
            },
        },
    });

    // Attach the reason so the badge can explain itself without a second call.
    const exclusionIds = [
        ...new Set(
            companies
                .flatMap((c) => [c.exclusionId, ...c.contacts.map((ct) => ct.exclusionId)])
                .filter((id): id is string => !!id)
        ),
    ];
    const exclusions = exclusionIds.length
        ? await prisma.exclusion.findMany({
              where: { id: { in: exclusionIds } },
              select: { id: true, reason: true, target: true, createdAt: true, expiresAt: true },
          })
        : [];

    return successResponse({ companies, exclusions });
});

