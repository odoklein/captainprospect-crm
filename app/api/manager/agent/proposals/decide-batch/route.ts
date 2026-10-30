// ============================================
// POST /api/manager/agent/proposals/decide-batch — DecideBatchBody → DecideBatchResponse
// Sequential, in the given order (« Tout approuver »). A failure on a danger
// card (outward or irreversible) stops the batch: the rest stay PENDING.
// Secrets are never returned in bulk: a tool that reveals one must be
// approved on its own card.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import type { AgentProposalState, DecideBatchResponse } from "@/lib/assistant/api-contract";
import { isAgentUnavailable } from "@/lib/agent/api";
import { decideBatch } from "@/lib/agent/proposals";
import { loadProposalItems } from "@/lib/agent/proposals-api";

export const dynamic = "force-dynamic";

const Body = z.object({
    ids: z.array(z.string().min(1)).min(1).max(50),
    decision: z.enum(["approve", "reject"]),
});

const ERRORS: Record<string, string> = {
    not_found: "Proposition introuvable.",
    not_pending: "Déjà traitée.",
    expired: "Proposition expirée.",
};

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = await validateRequest(request, Body);
    try {
        const results = await decideBatch({ ids: body.ids, decision: body.decision, approver: session.user.id });
        const items = await loadProposalItems(results.map((r) => r.id));
        const data: DecideBatchResponse = {
            results: results.map((r) => {
                const state: AgentProposalState = items.get(r.id)?.state ?? "PENDING";
                if (!r.result) return { id: r.id, ok: false, state, error: r.skipped ?? "Non traitée." };
                const ok = r.result.kind === "executed" || r.result.kind === "rejected";
                return { id: r.id, ok, state, ...(ok ? {} : { error: r.result.error ?? ERRORS[r.result.kind] ?? "Échec." }) };
            }),
        };
        return successResponse(data);
    } catch (error) {
        if (isAgentUnavailable(error)) return successResponse({ results: body.ids.map((id) => ({ id, ok: false, state: "PENDING" as const, error: "Agent indisponible." })) });
        throw error;
    }
});
