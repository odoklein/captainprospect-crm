import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";

export const runtime = "nodejs";

// ============================================
// PUT /api/client/letter/assumptions
// « Vos hypothèses »: the two figures only the client knows, set once from the
// portal home, that turn held RDV into an estimated pipeline. Null clears one.
// ============================================

const schema = z.object({
    /** Euros HT. */
    avgDealValue: z.number().int().min(1).max(100_000_000).nullable(),
    /** Share of held RDV that become an opportunity, 0–1. */
    meetingToOppRate: z.number().gt(0).max(1).nullable(),
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["CLIENT"], request);
    const clientId = session.user.clientId;
    if (!clientId) return errorResponse("Aucun espace client rattaché", 403);

    const body = await validateRequest(request, schema);
    const client = await prisma.client.update({
        where: { id: clientId },
        data: {
            portalAvgDealValue: body.avgDealValue,
            portalMeetingToOppRate: body.meetingToOppRate,
            portalAssumptionsUpdatedAt: new Date(),
        },
        select: { portalAvgDealValue: true, portalMeetingToOppRate: true, portalAssumptionsUpdatedAt: true },
    });

    return successResponse({
        avgDealValue: client.portalAvgDealValue,
        meetingToOppRate: client.portalMeetingToOppRate,
        updatedAt: client.portalAssumptionsUpdatedAt?.toISOString() ?? null,
    });
});
