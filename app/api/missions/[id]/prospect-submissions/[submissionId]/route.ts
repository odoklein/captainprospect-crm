// ============================================
// PATCH /api/missions/[id]/prospect-submissions/[submissionId]
// { decision: "APPROVE", listId? } → creates the company/contact (409 if it
//   became a duplicate or another manager already decided)
// { decision: "REJECT", reason }   → drops it, the SDR is told why
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { submissionDecisionSchema } from "@/lib/prospect-submissions/schemas";
import { getPendingSubmission } from "@/lib/prospect-submissions/service";
import { approveSubmission, rejectSubmission } from "@/lib/prospect-submissions/review";

export const PATCH = withErrorHandler(
    async (request: NextRequest, { params }: { params: Promise<{ id: string; submissionId: string }> }) => {
        const session = await requireRole(["MANAGER"], request);
        const { id, submissionId } = await params;
        const body = await validateRequest(request, submissionDecisionSchema);

        const submission = await getPendingSubmission(id, submissionId);
        if (!submission) return errorResponse("Déjà traitée par un autre manager.", 409);

        const result =
            body.decision === "APPROVE"
                ? await approveSubmission(request, session, submission, body.listId)
                : await rejectSubmission(request, session, submission, body.reason);

        if (!result.ok) {
            return NextResponse.json(
                { success: false, error: result.error, data: result.check ? { check: result.check } : undefined },
                { status: result.status },
            );
        }
        return successResponse(result);
    },
);
