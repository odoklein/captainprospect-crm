// ============================================
// POST /api/sdr/assistant/execute — confirm or refuse an action the SDR
// assistant proposed (today: rescheduling one of the user's callbacks).
//
// Same rules as the Assistant Projet's /execute: the action is read from the
// stored message (never from the request), must be a `confirm` tool of the
// SDR allowlist, is claimed atomically (a double click runs it once), expires
// after ASSISTANT_ACTION_TTL_HOURS, and is re-authorised at click time with
// the user's current role and permissions.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler, NotFoundError } from "@/lib/api-utils";
import { buildAssistantContext } from "@/lib/ai/tools/context";
import { getTool } from "@/lib/ai/tools/registry";
import { authorizeToolCall } from "@/lib/ai/tools/guard";
import { logAssistantAction } from "@/lib/ai/tools/executor";
import { SDR_TOOL_NAMES } from "@/lib/ai/tools/definitions/sdr";
import { prismaActionStore, settlePendingAction, type StoredAction } from "@/lib/ai/agent/actions";
import { getActionTtlMs } from "@/lib/ai/agent/models";
import { SDR_ASSISTANT_ROLES } from "@/lib/sdr-assistant/server";

const ExecuteBody = z.object({
    conversationId: z.string().min(1).max(64),
    messageId: z.string().min(1).max(64),
    decision: z.enum(["confirm", "cancel"]).default("confirm"),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(SDR_ASSISTANT_ROLES, request);
    const body = await validateRequest(request, ExecuteBody);

    const message = await prisma.assistantMessage.findUnique({
        where: { id: body.messageId },
        select: {
            id: true,
            action: true,
            createdAt: true,
            conversation: { select: { id: true, createdById: true, clientId: true, folderId: true } },
        },
    });
    if (
        !message ||
        message.conversation.id !== body.conversationId ||
        message.conversation.createdById !== session.user.id ||
        message.conversation.clientId !== null ||
        message.conversation.folderId !== null
    ) {
        throw new NotFoundError("Action introuvable");
    }

    const stored = message.action as unknown as StoredAction | null;
    if (!stored?.tool) return errorResponse("Ce message ne porte aucune action.", 400);

    const tool = getTool(stored.tool);
    if (body.decision === "confirm" && (!tool || tool.risk !== "confirm" || !SDR_TOOL_NAMES.has(tool.name))) {
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
    if (settled.kind === "not_pending") return errorResponse("Cette action a déjà été traitée.", 409);
    if (settled.kind === "expired") {
        return errorResponse("Cette proposition a expiré. Redemandez-la à l'assistant pour repartir de données à jour.", 410);
    }
    if (settled.kind === "cancelled") return successResponse({ state: "cancelled" });

    const ctx = await buildAssistantContext({
        userId: session.user.id,
        conversationId: message.conversation.id,
        toolAllowlist: SDR_TOOL_NAMES,
    });

    try {
        const args = authorizeToolCall(tool!, tool!.name, stored.args, ctx);
        const outcome = await tool!.execute(args, ctx);
        await prismaActionStore.save(message.id, { ...stored, state: "confirmed", outcome: outcome.message, settledAt: new Date().toISOString() });
        await logAssistantAction({ ctx, tool: tool!.name, args: stored.args, outcome: outcome.message, confirmed: true, ok: true });
        return successResponse({ state: "confirmed", message: outcome.message });
    } catch (error) {
        const detail = error instanceof Error ? error.message : "L'action a échoué";
        await prismaActionStore.save(message.id, { ...stored, state: "failed", outcome: detail, settledAt: new Date().toISOString() });
        await logAssistantAction({ ctx, tool: tool!.name, args: stored.args, outcome: detail, confirmed: true, ok: false });
        return errorResponse(detail, 400);
    }
});
