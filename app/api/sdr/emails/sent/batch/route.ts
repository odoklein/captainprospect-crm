// ============================================
// POST /api/sdr/emails/sent/batch — { action: "resend", emailIds }
// Resends my FAILED emails through the sending service (a new email is created,
// the failed one stays as history). Deleting sent emails is not possible.
// ============================================

import { NextRequest } from "next/server";
import { errorResponse, requireAuth, successResponse, withErrorHandler } from "@/lib/api-utils";
import { resendFailed, RESEND_CAP } from "@/app/api/manager/emails/_lib/sent";

export const POST = withErrorHandler(async (req: NextRequest) => {
    const session = await requireAuth(req);
    const body = await req.json().catch(() => null);
    const emailIds: unknown = body?.emailIds;

    if (body?.action !== "resend") return errorResponse("Action invalide (seul « resend » est possible)", 400);
    if (!Array.isArray(emailIds) || emailIds.length === 0 || !emailIds.every((x) => typeof x === "string")) {
        return errorResponse("emailIds requis", 400);
    }
    if (emailIds.length > RESEND_CAP) return errorResponse(`Maximum ${RESEND_CAP} emails par renvoi`, 400);

    const result = await resendFailed(emailIds as string[], { sentById: session.user.id }, session.user.id);
    return successResponse(result);
});
