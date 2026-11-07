import { NextRequest } from "next/server";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { parseJournalFilters } from "@/lib/calls-journal/filters";
import { getJournal } from "@/lib/calls-journal/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sdr/calls — « Mes appels »: the call journal limited to the signed-in
 * user's own calls, whatever sdrId the query carries.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["SDR", "BUSINESS_DEVELOPER", "BOOKER"], request);
    const parsed = parseJournalFilters(new URL(request.url).searchParams);
    if (!parsed.ok) return errorResponse(parsed.error, 400);
    return successResponse(await getJournal({ ...parsed.filters, sdrIds: [session.user.id] }, parsed.range));
});
