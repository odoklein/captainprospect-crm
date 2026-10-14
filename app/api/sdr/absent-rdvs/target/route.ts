import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse, requireRole, withErrorHandler } from "@/lib/api-utils";

// ============================================
// GET /api/sdr/absent-rdvs/target?contactId=…|companyId=…
// The open absence on one prospect, for the red banner of the action drawer:
// whoever opens the prospect (not only the SDR who booked it) must see that
// the client reported them absent, and whether to call them back.
// Same "open" rule as the call queue: not set aside or retired by a manager,
// mission still running. Recontact NO is returned too — that is exactly what
// the SDR must know before calling.
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["SDR", "BUSINESS_DEVELOPER", "BOOKER", "MANAGER"], request);

    const contactId = request.nextUrl.searchParams.get("contactId");
    const companyId = request.nextUrl.searchParams.get("companyId");
    if (!contactId && !companyId) return errorResponse("contactId ou companyId requis", 400);

    const row = await prisma.action.findFirst({
        where: {
            result: "MEETING_BOOKED",
            ...(contactId ? { contactId } : { companyId: companyId!, contactId: null }),
            meetingFeedback: { is: { outcome: "NO_SHOW", standByAt: null, outOfScopeAt: null } },
            campaign: { is: { mission: { is: { isActive: true } } } },
        },
        orderBy: { callbackDate: "desc" },
        select: {
            id: true,
            callbackDate: true,
            sdr: { select: { name: true } },
            campaign: { select: { mission: { select: { name: true } } } },
            meetingFeedback: {
                select: { recontactRequested: true, clientNote: true, source: true, createdAt: true },
            },
        },
    });

    if (!row?.meetingFeedback) return successResponse(null);

    return successResponse({
        actionId: row.id,
        rdvDate: row.callbackDate?.toISOString() ?? null,
        reportedAt: row.meetingFeedback.createdAt.toISOString(),
        recontactRequested: row.meetingFeedback.recontactRequested,
        clientNote: row.meetingFeedback.clientNote?.trim() || null,
        source: row.meetingFeedback.source,
        missionName: row.campaign?.mission?.name ?? null,
        bookedBy: row.sdr?.name ?? null,
    });
});
