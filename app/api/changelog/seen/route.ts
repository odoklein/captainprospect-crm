import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { markSeen } from "@/lib/changelog/service";

// POST /api/changelog/seen { ids, banner? } — the panel was opened (seen), or the banner was dismissed.
const body = z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(40), banner: z.boolean().optional() });

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER", "SDR", "BOOKER", "BUSINESS_DEVELOPER", "DEVELOPER"], request);
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse("Requête invalide", 400);
    return successResponse({ marked: await markSeen(session.user.id, parsed.data.ids, { banner: parsed.data.banner }) });
});
