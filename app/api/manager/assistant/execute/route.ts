// ============================================
// POST /api/manager/assistant/execute — run a confirmed action
//
// The body is echoed back by the browser, so it is untrusted input: the tool
// must be a known `confirm` tool, the arguments are re-parsed against their zod
// schema, and every id is re-checked against the conversation's project inside
// the executor. The click is the authorisation; this payload is only the subject.
//
// The pending action is read from the stored message rather than the request,
// so a tampered body cannot execute something the manager never saw on screen.
// It is then claimed atomically (pending → executing): a double click or two
// tabs execute it once. A card older than ASSISTANT_ACTION_TTL_HOURS is refused.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
    errorResponse,
    requireRole,
    successResponse,
    validateRequest,
    withErrorHandler,
    NotFoundError,
} from "@/lib/api-utils";
import { buildAssistantContext } from "@/lib/ai/tools/context";
import { getTool } from "@/lib/ai/tools/registry";
import { authorizeToolCall } from "@/lib/ai/tools/guard";
import { logAssistantAction } from "@/lib/ai/tools/executor";
import type { WriteOutcome } from "@/lib/ai/tools/types";
import { prismaActionStore, settlePendingAction, type StoredAction } from "@/lib/ai/agent/actions";
import { getActionTtlMs } from "@/lib/ai/agent/models";

const ExecuteBody = z.object({
    conversationId: z.string().min(1),
    messageId: z.string().min(1),
    /** "confirm" runs it, "cancel" records the refusal. */
    decision: z.enum(["confirm", "cancel"]).default("confirm"),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = await validateRequest(request, ExecuteBody);

    const message = await prisma.assistantMessage.findUnique({
        where: { id: body.messageId },
        select: {
            id: true,
            action: true,
            createdAt: true,
            conversation: {
                select: { id: true, clientId: true, missionId: true, createdById: true },
            },
        },
    });
    if (
        !message ||
        message.conversation.id !== body.conversationId ||
        message.conversation.createdById !== session.user.id
    ) {
        throw new NotFoundError("Action introuvable");
    }

    const stored = message.action as unknown as StoredAction | null;
    if (!stored?.tool) {
        return errorResponse("Ce message ne porte aucune action.", 400);
    }

    const tool = getTool(stored.tool);
    if (body.decision === "confirm" && (!tool || tool.risk !== "confirm")) {
        // Read and safe-write tools are not reachable here, and neither is
        // anything the model invented.
        return errorResponse("Action non autorisée", 400);
    }

    const settled = await settlePendingAction({
        store: prismaActionStore,
        messageId: message.id,
        stored,
        decision: body.decision,
        messageCreatedAt: message.createdAt,
        now: new Date(),
        ttlMs: getActionTtlMs(),
    });

    if (settled.kind === "not_pending") {
        // Double-click, or a stale tab. Replaying a send is exactly what this guard exists for.
        return errorResponse("Cette action a déjà été traitée.", 409);
    }
    if (settled.kind === "expired") {
        return errorResponse("Cette proposition a expiré. Redemande-la à l'assistant pour repartir de données à jour.", 410);
    }
    if (settled.kind === "cancelled") {
        return successResponse({ state: "cancelled" });
    }

    // Claimed: this request alone may execute. Identity, role, permissions and
    // project are resolved again now, not taken from the proposal.
    const ctx = await buildAssistantContext({
        userId: session.user.id,
        clientId: message.conversation.clientId,
        missionId: message.conversation.missionId,
        conversationId: message.conversation.id,
    });

    let outcome: WriteOutcome;
    try {
        const args = authorizeToolCall(tool!, tool!.name, stored.args, ctx);
        outcome = await tool!.execute(args, ctx);
    } catch (error) {
        const detail = error instanceof Error ? error.message : "L'action a échoué";

        await prismaActionStore.save(message.id, { ...stored, state: "failed", outcome: detail, settledAt: new Date().toISOString() });
        await logAssistantAction({
            ctx,
            tool: tool!.name,
            args: stored.args,
            outcome: detail,
            confirmed: true,
            ok: false,
        });

        return errorResponse(detail, 400);
    }

    await prismaActionStore.save(message.id, {
        ...stored,
        state: "confirmed",
        outcome: outcome.message,
        settledAt: new Date().toISOString(),
    });
    await logAssistantAction({
        ctx,
        tool: tool!.name,
        args: stored.args,
        outcome: outcome.message,
        confirmed: true,
        ok: true,
    });

    // `secret` is returned to the browser and deliberately never written to the
    // message: the transcript must stay safe to re-read.
    return successResponse({
        state: "confirmed",
        message: outcome.message,
        secret: outcome.secret ?? null,
        refresh: outcome.refresh ?? false,
        artifactId: outcome.artifactId ?? null,
    });
});
