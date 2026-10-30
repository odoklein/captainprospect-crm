// ============================================
// POST /api/manager/agent/runs/[id]/cancel → AgentRunCard
//   QUEUED / DEFERRED  → CANCELLED at once
//   RUNNING            → cancelRequestedAt set; the run polls it while it
//                        works and stops at the next boundary (missions,
//                        reports), then reads CANCELLED
//   WAITING_APPROVAL   → CANCELLED, its pending proposals refused
//   finished           → 409
// ============================================

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getRunCard, isAgentUnavailable } from "@/lib/agent/api";
import { withStore } from "@/lib/agent/store";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireRole(["MANAGER"], request);
    const { id } = await params;
    const now = new Date();
    try {
        const run = await withStore(() => prisma.agentRun.findUnique({ where: { id }, select: { id: true, status: true } }));
        if (!run) throw new NotFoundError("Exécution introuvable");

        if (run.status === "QUEUED" || run.status === "DEFERRED") {
            await withStore(() =>
                prisma.agentRun.updateMany({
                    where: { id, status: { in: ["QUEUED", "DEFERRED"] } },
                    data: { status: "CANCELLED", cancelRequestedAt: now, finishedAt: now, lockedBy: null, error: "Annulée avant son démarrage." },
                }),
            );
        } else if (run.status === "RUNNING") {
            await withStore(() => prisma.agentRun.updateMany({ where: { id, cancelRequestedAt: null }, data: { cancelRequestedAt: now } }));
        } else if (run.status === "WAITING_APPROVAL") {
            await withStore(() =>
                prisma.$transaction([
                    prisma.agentProposal.updateMany({
                        where: { runId: id, state: "PENDING" },
                        data: { state: "REJECTED", decidedAt: now, decidedById: session.user.id, outcome: "Exécution annulée : proposition retirée." },
                    }),
                    prisma.agentRun.updateMany({ where: { id, status: "WAITING_APPROVAL" }, data: { status: "CANCELLED", cancelRequestedAt: now } }),
                ]),
            );
        } else {
            return errorResponse("Cette exécution est déjà terminée.", 409);
        }
        return successResponse(await getRunCard(id));
    } catch (error) {
        if (isAgentUnavailable(error)) throw new NotFoundError("Exécution introuvable");
        throw error;
    }
});
