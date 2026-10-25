// GET /api/manager/emails/sent/[id] — one outbound email with its body, for the expanded row.

import { NextRequest } from "next/server";
import { NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { sentDetail } from "../../_lib/sent";

export const GET = withErrorHandler<Promise<{ id: string }>>(async (req: NextRequest, { params }) => {
    await requireRole(["MANAGER", "DEVELOPER"], req);
    const { id } = await params;
    const email = await sentDetail(id, {});
    if (!email) throw new NotFoundError("Email introuvable");
    return successResponse(email);
});
