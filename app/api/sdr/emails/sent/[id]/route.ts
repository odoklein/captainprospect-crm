// ============================================
// GET /api/sdr/emails/sent/[id] — one of my sent emails, with its body.
// No DELETE: sent emails are history (managers and the contact timeline rely on them).
// ============================================

import { NextRequest } from "next/server";
import { NotFoundError, requireAuth, successResponse, withErrorHandler } from "@/lib/api-utils";
import { sentDetail } from "@/app/api/manager/emails/_lib/sent";

export const GET = withErrorHandler<Promise<{ id: string }>>(async (req: NextRequest, { params }) => {
    const session = await requireAuth(req);
    const { id } = await params;
    const email = await sentDetail(id, { sentById: session.user.id });
    if (!email) throw new NotFoundError("Email introuvable");
    return successResponse(email);
});
