import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import {
    AuthError,
    ValidationError,
    errorResponse,
    requireAuth,
    successResponse,
    withErrorHandler,
} from "@/lib/api-utils";
import {
    canActOnClient,
    canCreateExclusion,
    canViewAllExclusions,
    canViewExclusions,
    type ExclusionActor,
} from "@/lib/exclusions/permissions";
import { createExclusionSchema, createManualExclusionSchema } from "@/lib/exclusions/schemas";
import { createExclusionFromRow, createManualExclusion } from "@/lib/exclusions/service";

function actorFrom(session: { user: { id: string; role: string; clientId?: string | null } }): ExclusionActor {
    return {
        id: session.user.id,
        role: session.user.role as ExclusionActor["role"],
        clientId: session.user.clientId ?? null,
    };
}

/** Same errors as validateRequest, for a body that has already been read. */
function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        throw new ValidationError(
            parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")
        );
    }
    return parsed.data;
}

/**
 * The internal exclusions surface. Clients never reach this route — they go
 * through /api/client/exclusions, which forces scope and clientId from the
 * session rather than trusting a payload.
 */

// ============================================
// GET /api/exclusions — the journal
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const actor = actorFrom(session);

    if (!canViewExclusions(actor)) {
        throw new AuthError("Accès non autorisé", 403);
    }

    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state") ?? "active";
    const scope = searchParams.get("scope");
    const scopeId = searchParams.get("scopeId");
    const source = searchParams.get("source");
    const search = searchParams.get("search")?.trim();

    const where: Prisma.ExclusionWhereInput = {};

    if (state === "active") {
        where.liftedAt = null;
        where.OR = [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
    } else if (state === "lifted") {
        where.liftedAt = { not: null };
    }

    if (scope) where.scope = scope as Prisma.ExclusionWhereInput["scope"];
    if (scopeId) where.scopeId = scopeId;
    if (source) where.source = source as Prisma.ExclusionWhereInput["source"];
    if (search) {
        where.AND = [
            {
                OR: [
                    { label: { contains: search, mode: "insensitive" } },
                    { reason: { contains: search, mode: "insensitive" } },
                ],
            },
        ];
    }

    // A non-manager only ever sees the rules covering the clients they work on.
    // Managers see everything, which is the point of the journal.
    if (!canViewAllExclusions(actor)) {
        if (actor.clientId) {
            where.scopeId = actor.clientId;
            where.scope = "CLIENT";
        }
    }

    const rows = await prisma.exclusion.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        take: 300,
    });

    // The author's name matters more than their id when reading a journal entry.
    const userIds = [
        ...new Set(rows.flatMap((r) => [r.createdById, r.liftedById].filter(Boolean) as string[])),
    ];
    const users = userIds.length
        ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
        : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    const clientIds = [...new Set(rows.filter((r) => r.scope === "CLIENT" && r.scopeId).map((r) => r.scopeId!))];
    const missionIds = [...new Set(rows.filter((r) => r.scope === "MISSION" && r.scopeId).map((r) => r.scopeId!))];
    const [clients, missions] = await Promise.all([
        clientIds.length
            ? prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } })
            : [],
        missionIds.length
            ? prisma.mission.findMany({ where: { id: { in: missionIds } }, select: { id: true, name: true } })
            : [],
    ]);
    const scopeNameById = new Map<string, string>([
        ...clients.map((c) => [c.id, c.name] as const),
        ...missions.map((m) => [m.id, m.name] as const),
    ]);

    return successResponse(
        rows.map((row) => ({
            ...row,
            createdByName: nameById.get(row.createdById) ?? null,
            liftedByName: row.liftedById ? nameById.get(row.liftedById) ?? null : null,
            scopeName: row.scopeId ? scopeNameById.get(row.scopeId) ?? null : null,
        }))
    );
});

// ============================================
// POST /api/exclusions — create a rule
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const actor = actorFrom(session);

    const body = await request.json();

    // Two shapes on one route: from an existing prospect row, or typed by hand
    // to pre-empt a company that has not been imported yet.
    const isManual = typeof body?.companyName === "string" && !body?.companyId && !body?.contactId;

    if (isManual) {
        const input = parseBody(createManualExclusionSchema, body);

        if (!canCreateExclusion(actor, input.scope)) {
            throw new AuthError("Portée non autorisée pour votre rôle", 403);
        }
        if (input.scope === "CLIENT" && !canActOnClient(actor, input.scopeId ?? null)) {
            throw new AuthError("Client non autorisé", 403);
        }

        try {
            const rule = await createManualExclusion({
                scope: input.scope,
                scopeId: input.scopeId ?? null,
                companyName: input.companyName,
                website: input.website ?? null,
                phone: input.phone ?? null,
                reason: input.reason,
                duration: input.duration,
                actorId: actor.id,
            });
            return successResponse(rule, 201);
        } catch (err) {
            return errorResponse(err instanceof Error ? err.message : "Création impossible", 400);
        }
    }

    // CLIENT scope without scopeId (SDR drawer): derive the client from the prospect's
    // own list rather than trusting the browser.
    if (body?.scope === "CLIENT" && !body?.scopeId && (body?.companyId || body?.contactId)) {
        const companyForScope = body.companyId
            ? await prisma.company.findUnique({
                  where: { id: String(body.companyId) },
                  select: { list: { select: { mission: { select: { clientId: true } } } } },
              })
            : (
                  await prisma.contact.findUnique({
                      where: { id: String(body.contactId) },
                      select: { company: { select: { list: { select: { mission: { select: { clientId: true } } } } } } },
                  })
              )?.company ?? null;
        body.scopeId = companyForScope?.list?.mission?.clientId ?? null;
    }

    const input = parseBody(createExclusionSchema, body);

    if (!canCreateExclusion(actor, input.scope)) {
        throw new AuthError("Portée non autorisée pour votre rôle", 403);
    }
    if (input.scope === "CLIENT" && !canActOnClient(actor, input.scopeId ?? null)) {
        throw new AuthError("Client non autorisé", 403);
    }

    try {
        const rule = await createExclusionFromRow({
            target: input.target,
            scope: input.scope,
            scopeId: input.scopeId ?? null,
            companyId: input.companyId ?? null,
            contactId: input.contactId ?? null,
            reason: input.reason,
            duration: input.duration,
            // Derived from the role, never from the payload: the journal has to
            // say truthfully who put the prospect out of reach.
            source: actor.role === "MANAGER" ? "MANAGER" : "SDR_ACTION",
            actorId: actor.id,
        });
        return successResponse(rule, 201);
    } catch (err) {
        if (err instanceof ValidationError || err instanceof AuthError) throw err;
        return errorResponse(err instanceof Error ? err.message : "Création impossible", 400);
    }
});
