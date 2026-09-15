/**
 * Builds the assistant's authorization envelope. The one place in the tool
 * system that touches the database before a tool runs.
 *
 * Resolving the project here — rather than trusting the id the browser sent —
 * is what makes the binding real: an unknown or mismatched project fails now,
 * loudly, instead of quietly widening every later query.
 */

import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/api-utils";
import type { UserRole } from "@prisma/client";
import { AssistantContext, ProjectBinding } from "./types";

/** Automatic (`safe_write`) actions allowed per user message. */
export const MAX_AUTO_WRITES_PER_REQUEST = 3;

/** Effective permission codes: role defaults, then per-user overrides. */
async function resolvePermissions(userId: string, role: UserRole): Promise<string[]> {
    const [roleGrants, userOverrides] = await Promise.all([
        prisma.rolePermission.findMany({
            where: { role, granted: true },
            select: { permission: { select: { code: true } } },
        }),
        prisma.userPermission.findMany({
            where: { userId },
            select: { granted: true, permission: { select: { code: true } } },
        }),
    ]);

    const codes = new Set(roleGrants.map((r) => r.permission.code));
    for (const override of userOverrides) {
        // An explicit user row wins over the role default, in both directions.
        if (override.granted) codes.add(override.permission.code);
        else codes.delete(override.permission.code);
    }
    return Array.from(codes);
}

/**
 * Resolves a client + optional mission into the binding every tool reads.
 * A mission belonging to another client is rejected rather than silently
 * dropped — answering about the wrong project is worse than an error.
 */
export async function resolveProjectBinding(
    clientId: string,
    missionId?: string | null,
): Promise<ProjectBinding> {
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, name: true },
    });
    if (!client) throw new NotFoundError("Client introuvable");

    if (!missionId) {
        return {
            clientId: client.id,
            clientName: client.name,
            missionId: null,
            missionName: null,
        };
    }

    const mission = await prisma.mission.findUnique({
        where: { id: missionId },
        select: { id: true, name: true, clientId: true },
    });
    if (!mission) throw new NotFoundError("Mission introuvable");
    if (mission.clientId !== client.id) {
        throw new ValidationError("Cette mission n'appartient pas à ce client");
    }

    return {
        clientId: client.id,
        clientName: client.name,
        missionId: mission.id,
        missionName: mission.name,
    };
}

export async function buildAssistantContext(params: {
    userId: string;
    clientId?: string | null;
    missionId?: string | null;
    conversationId?: string | null;
}): Promise<AssistantContext> {
    const user = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { id: true, name: true, role: true, isActive: true },
    });
    if (!user) throw new NotFoundError("Utilisateur introuvable");

    const permissions = await resolvePermissions(user.id, user.role);

    const project = params.clientId
        ? await resolveProjectBinding(params.clientId, params.missionId)
        : null;

    return {
        userId: user.id,
        userName: user.name,
        role: user.role,
        isActive: user.isActive,
        permissions,
        project,
        resolvedAt: new Date(),
        autoWriteBudget: MAX_AUTO_WRITES_PER_REQUEST,
        conversationId: params.conversationId ?? null,
    };
}

/**
 * The project binding, or a thrown error.
 *
 * Tools call this instead of reading `ctx.project` directly, so the narrowing
 * and the failure message live in one place.
 */
export function requireProject(ctx: AssistantContext): ProjectBinding {
    if (!ctx.project) {
        throw new ValidationError(
            "Aucun projet sélectionné. Choisis un client et une mission avant de continuer.",
        );
    }
    return ctx.project;
}
