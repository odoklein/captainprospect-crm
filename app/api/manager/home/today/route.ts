// GET /api/manager/home/today — the « Tâches du jour » block of the manager home (lib/manager-home/today.ts).
import { NextRequest } from "next/server";
import { requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getTodayPayload } from "@/lib/manager-home/today";

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    return successResponse(await getTodayPayload(session.user));
});
