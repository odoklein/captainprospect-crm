// ============================================
// GET /api/manager/assistant/evidence/[id] — open one cited source
//
// What a citation chip shows: which tool ran, with which arguments, when, over
// which period, the summary and the figures it returned. The scrubbed payload
// is included only while the evidence is still fresh; after that only the
// summary and facts remain (see lib/ai/agent/evidence/policy.ts).
//
// Access is the conversation's: its author, still active, same project scope.
// Any denial is a 404, so an id cannot be probed.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { getTool } from "@/lib/ai/tools/registry";
import { scrubSensitive } from "@/lib/ai/tools/redact";
import { resolveProjectBinding } from "@/lib/ai/tools/context";
import { evidenceAccessDecision } from "@/lib/ai/agent/evidence/access";
import { describePeriod } from "@/lib/ai/agent/evidence/summary";
import type { EvidencePeriod, Fact } from "@/lib/ai/agent/evidence/facts";

const Params = z.object({ id: z.string().min(1).max(64) });

export const GET = withErrorHandler(
    async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
        const session = await requireRole(["MANAGER"], request);
        const { id } = Params.parse(await params);

        const [evidence, viewer] = await Promise.all([
            prisma.assistantEvidence.findUnique({
                where: { id },
                select: {
                    id: true,
                    userId: true,
                    clientId: true,
                    missionId: true,
                    tool: true,
                    args: true,
                    status: true,
                    errorCode: true,
                    summary: true,
                    facts: true,
                    period: true,
                    resultDigest: true,
                    payload: true,
                    retrievedAt: true,
                    expiresAt: true,
                    run: {
                        select: {
                            conversation: { select: { createdById: true, clientId: true, missionId: true } },
                        },
                    },
                },
            }),
            prisma.user.findUnique({
                where: { id: session.user.id },
                select: { id: true, role: true, isActive: true },
            }),
        ]);
        if (!evidence || !viewer) throw new NotFoundError("Source introuvable");

        const decision = evidenceAccessDecision(
            { ...evidence, conversation: evidence.run.conversation },
            viewer,
        );
        if (!decision.allowed) throw new NotFoundError("Source introuvable");

        // The project must still exist and still be this client's mission.
        if (evidence.clientId) await resolveProjectBinding(evidence.clientId, evidence.missionId);

        const fresh = evidence.expiresAt > new Date();
        const facts = (Array.isArray(evidence.facts) ? (evidence.facts as unknown as Fact[]) : [])
            .filter((f) => f.derived !== "sum")
            .slice(0, 80);

        return successResponse({
            id: evidence.id,
            tool: evidence.tool,
            toolLabel: getTool(evidence.tool)?.label ?? evidence.tool,
            status: evidence.status,
            errorCode: evidence.errorCode,
            summary: evidence.summary,
            period: describePeriod(evidence.period as unknown as EvidencePeriod | null),
            args: scrubSensitive(evidence.args),
            facts: facts.map((f) => ({ key: f.key, value: f.value, unit: f.unit, entity: f.entity ?? null })),
            digest: evidence.resultDigest,
            retrievedAt: evidence.retrievedAt.toISOString(),
            expiresAt: evidence.expiresAt.toISOString(),
            fresh,
            payload: fresh && evidence.payload ? scrubSensitive(evidence.payload) : null,
        });
    },
);
