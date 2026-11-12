// ============================================
// POST /api/manager/agent/proposals/[id]/decide — DecideProposalBody → DecideProposalResponse
// Any active manager. Approve executes the tool under the approver's own
// context (lib/agent/proposals.ts); a double click gets 409, an expired
// proposal 410. An execution error answers 200 with the proposal FAILED and
// the error as `outcome`. A secret is returned once and never stored.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, NotFoundError, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import type { DecideProposalResponse } from "@/lib/assistant/api-contract";
import { isAgentUnavailable } from "@/lib/agent/api";
import { decideProposal } from "@/lib/agent/proposals";
import { loadProposalItem } from "@/lib/agent/proposals-api";

export const dynamic = "force-dynamic";

const Body = z.object({ decision: z.enum(["approve", "reject"]) });

export const POST = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    const body = await validateRequest(request, Body);
    try {
        const result = await decideProposal({ proposalId: id, decision: body.decision, approver: session.user.id });
        if (result.kind === "not_found") throw new NotFoundError("Proposition introuvable");
        const proposal = await loadProposalItem(id);
        if (!proposal) throw new NotFoundError("Proposition introuvable");
        if (result.kind === "expired" || (result.kind === "not_pending" && proposal.state === "EXPIRED")) {
            return errorResponse("Cette proposition a expiré. Relance l'agent pour repartir de données à jour.", 410);
        }
        if (result.kind === "not_pending") return errorResponse("Cette proposition a déjà été traitée.", 409);
        const data: DecideProposalResponse = { proposal, secret: result.secret ?? null };
        return successResponse(data);
    } catch (error) {
        if (isAgentUnavailable(error)) throw new NotFoundError("Proposition introuvable");
        throw error;
    }
});
