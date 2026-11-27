import { NextRequest } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { loadPilotage } from "@/lib/manager-pilotage/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manager/pilotage
 * The « Salle de pilotage » (/manager/pilotage) in one read: the month's
 * landing and its levers, the signals to decide on now, the team live, and
 * the patterns of the last 20 working days (heatmap, closers). The page
 * refetches it every minute; the heavy aggregates are memoised server-side
 * (lib/manager-pilotage/server).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    return successResponse(await loadPilotage());
});
