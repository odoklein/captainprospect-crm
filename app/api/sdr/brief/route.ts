import { NextRequest } from "next/server";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getTodaySdrMissionIds } from "@/lib/sdr-today-missions";
import { getPrecallBrief } from "@/lib/sdr-assistant/brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * GET /api/sdr/brief?companyId=&contactId=&missionId=[&refresh=1]
 * AI pre-call brief for one prospect, cached until its inputs change.
 * SDRs only get prospects of today's planned missions (same rule as the queue).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["SDR", "BUSINESS_DEVELOPER", "BOOKER", "MANAGER"], request);
    const sp = new URL(request.url).searchParams;
    const companyId = sp.get("companyId") ?? "";
    const contactId = sp.get("contactId") || null;
    const missionId = sp.get("missionId") ?? "";
    if (!ID_RE.test(companyId) || !ID_RE.test(missionId) || (contactId && !ID_RE.test(contactId))) {
        return errorResponse("Paramètres invalides", 400);
    }
    if (session.user.role === "SDR") {
        const today = await getTodaySdrMissionIds(session.user.id);
        if (!today.includes(missionId)) return errorResponse("Mission hors de votre planning du jour", 403);
    }
    const result = await getPrecallBrief({
        contactId,
        companyId,
        missionId,
        userId: session.user.id,
        refresh: sp.get("refresh") === "1",
    });
    return successResponse(result);
});
