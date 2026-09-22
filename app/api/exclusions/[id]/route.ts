import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    AuthError,
    NotFoundError,
    errorResponse,
    requireAuth,
    successResponse,
    validateRequest,
    withErrorHandler,
} from "@/lib/api-utils";
import { canLiftExclusion, type ExclusionActor } from "@/lib/exclusions/permissions";
import { liftExclusionSchema } from "@/lib/exclusions/schemas";
import { liftExclusion } from "@/lib/exclusions/service";

/**
 * PATCH /api/exclusions/[id] — lift a rule.
 *
 * There is deliberately no DELETE: a lifted exclusion is kept as audit. When a
 * client asks six months later why their competitor was called again, the
 * journal has to be able to answer.
 */
export const PATCH = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireAuth(request);
    const actor: ExclusionActor = {
        id: session.user.id,
        role: session.user.role as ExclusionActor["role"],
        clientId: session.user.clientId ?? null,
    };

    const { id } = await params;
    const rule = await prisma.exclusion.findUnique({
        where: { id },
        select: { id: true, scope: true, scopeId: true, createdById: true, liftedAt: true, label: true },
    });

    if (!rule) throw new NotFoundError("Exclusion introuvable");
    if (!canLiftExclusion(actor, rule)) {
        throw new AuthError("Seul un manager peut lever cette exclusion", 403);
    }
    if (rule.liftedAt) {
        return errorResponse("Exclusion déjà levée", 409);
    }

    const input = await validateRequest(request, liftExclusionSchema);

    try {
        const result = await liftExclusion(id, actor.id, input.liftReason);
        return successResponse({ id, label: rule.label, ...result });
    } catch (err) {
        return errorResponse(err instanceof Error ? err.message : "Levée impossible", 400);
    }
});

/** GET /api/exclusions/[id] — one rule plus the rows it currently holds. */
export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireAuth(request);
    const { id } = await params;

    const rule = await prisma.exclusion.findUnique({ where: { id } });
    if (!rule) throw new NotFoundError("Exclusion introuvable");

    const [companies, contacts] = await Promise.all([
        prisma.company.findMany({
            where: { exclusionId: id },
            select: { id: true, name: true, listId: true },
            take: 100,
        }),
        prisma.contact.findMany({
            where: { exclusionId: id },
            select: { id: true, firstName: true, lastName: true, companyId: true },
            take: 100,
        }),
    ]);

    return successResponse({ ...rule, heldCompanies: companies, heldContacts: contacts });
});
