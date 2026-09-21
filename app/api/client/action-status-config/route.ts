import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { successResponse, requireRole, withErrorHandler } from "@/lib/api-utils";
import { statusConfigService } from "@/lib/services/StatusConfigService";

/**
 * GET /api/client/action-status-config
 * Returns status definitions and result categories for the client portal (Activité page)
 * and for the manager's client drawer, which renders the very same activity
 * components — sharing this endpoint is what keeps the two palettes identical.
 * Uses GLOBAL config so mission stats can show default counts for every status/category.
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["CLIENT", "MANAGER"], request);

    const config = await statusConfigService.getEffectiveStatusConfig({});
    const categories = await prisma.resultCategory.findMany({
        orderBy: { sortOrder: "asc" },
    });

    return successResponse({
        statuses: config.statuses,
        categories,
    });
});
