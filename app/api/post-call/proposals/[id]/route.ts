import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { TELEPHONY_ROLES } from "@/lib/telephony/roles";
import { ProposalError, decideProposal } from "@/lib/post-call/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ decision: z.enum(["apply", "dismiss"]) });

/** POST /api/post-call/proposals/[id] { decision } — the SDR applies or dismisses one of their call's proposals. */
export const POST = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole([...TELEPHONY_ROLES], request);
    const { id } = await params;
    const { decision } = await validateRequest(request, schema);
    try {
        const result = await decideProposal(id, session.user.id, decision);
        audit(request, session, {
            action: decision === "apply" ? "AI_PROPOSAL_APPLIED" : "AI_PROPOSAL_DISMISSED",
            entityType: "PostCallProposal",
            entityId: id,
            summary: decision === "apply" ? "Proposition post-appel appliquée" : "Proposition post-appel écartée",
            after: result,
        });
        return successResponse(result);
    } catch (err) {
        if (err instanceof ProposalError) return errorResponse(err.message, err.status);
        throw err;
    }
});
