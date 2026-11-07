import { NextRequest } from "next/server";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { parseJournalFilters } from "@/lib/calls-journal/filters";
import { getJournal } from "@/lib/calls-journal/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manager/calls — the call journal.
 *   ?start=&end=              Paris days (default: today)
 *   &view=journal|unqualified journal = calls with a logged status; unqualified = integrated-phone calls without one
 *   &sdrId=&missionId=&result=&recording=1&q=&page=&limit=
 * Manager only: it exposes every SDR's calls and recordings.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const parsed = parseJournalFilters(new URL(request.url).searchParams);
    if (!parsed.ok) return errorResponse(parsed.error, 400);
    return successResponse(await getJournal(parsed.filters, parsed.range));
});
