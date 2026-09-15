// ============================================
// GET  /api/manager/assistant/conversations — projects picker + threads
// POST /api/manager/assistant/conversations — start a new thread on a project
//
// A conversation belongs to a project, not to a user. Switching project means
// switching thread, which is what keeps one project's context out of another's.
// ============================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
    requireRole,
    successResponse,
    validateRequest,
    withErrorHandler,
    NotFoundError,
} from "@/lib/api-utils";
import { resolveProjectBinding } from "@/lib/ai/tools/context";

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const missionId = searchParams.get("missionId");

    // The picker: every client with its missions.
    const clients = await prisma.client.findMany({
        where: { archivedAt: null },
        orderBy: { name: "asc" },
        select: {
            id: true,
            name: true,
            missions: {
                where: { isActive: true },
                orderBy: { startDate: "desc" },
                select: { id: true, name: true, status: true },
            },
        },
    });

    // No clientId is not an empty state — it is the agency-wide view, which has
    // its own threads (clientId null).
    const conversations = await prisma.assistantConversation.findMany({
        where: {
            clientId: clientId || null,
            missionId: clientId ? missionId || null : null,
            createdById: session.user.id,
        },
        orderBy: { lastMessageAt: "desc" },
        take: 20,
        select: {
            id: true,
            title: true,
            summary: true,
            messageCount: true,
            lastMessageAt: true,
            updatedAt: true,
        },
    });

    // Resume the most recent thread for this exact project binding.
    const activeId = searchParams.get("conversationId") || conversations[0]?.id || null;

    const messages = activeId
        ? await prisma.assistantMessage.findMany({
            where: { conversationId: activeId },
            orderBy: { createdAt: "asc" },
            take: 100,
            select: {
                id: true,
                role: true,
                content: true,
                trace: true,
                action: true,
                createdAt: true,
            },
        })
        : [];

    return successResponse({
        clients,
        conversations,
        conversationId: activeId,
        messages: messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            trace: m.trace,
            action: m.action,
            createdAt: m.createdAt.toISOString(),
        })),
    });
});

const CreateBody = z.object({
    /** Omitted = a "vue agence" thread, bound to no project. */
    clientId: z.string().optional().nullable(),
    missionId: z.string().optional().nullable(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = await validateRequest(request, CreateBody);

    // Resolving here rejects a mission that belongs to another client before a
    // thread is ever created against it.
    const project = body.clientId
        ? await resolveProjectBinding(body.clientId, body.missionId)
        : null;

    const conversation = await prisma.assistantConversation.create({
        data: {
            clientId: project?.clientId ?? null,
            missionId: project?.missionId ?? null,
            createdById: session.user.id,
            title: project
                ? project.missionName
                    ? `${project.clientName} — ${project.missionName}`
                    : project.clientName
                : "Vue agence",
        },
        select: { id: true, title: true, createdAt: true },
    });

    return successResponse({ conversation }, 201);
});

const DeleteBody = z.object({ conversationId: z.string().min(1) });

export const DELETE = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = await validateRequest(request, DeleteBody);

    const conversation = await prisma.assistantConversation.findUnique({
        where: { id: body.conversationId },
        select: { id: true, createdById: true },
    });
    if (!conversation || conversation.createdById !== session.user.id) {
        throw new NotFoundError("Conversation introuvable");
    }

    await prisma.assistantConversation.delete({ where: { id: conversation.id } });
    return successResponse({ deleted: true });
});
