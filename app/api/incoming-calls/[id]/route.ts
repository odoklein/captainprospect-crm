import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse, NotFoundError, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { buildCallerDossier, findCallerCandidates } from "@/lib/incoming-calls/caller-lookup";
import { INCOMING_CALL_ROLES, presentIncomingCall } from "@/lib/incoming-calls/present";

export const dynamic = "force-dynamic";

async function loadOwnCall(id: string, userId: string) {
    const row = await prisma.incomingCall.findUnique({ where: { id } });
    if (!row || row.sdrId !== userId) throw new NotFoundError("Appel introuvable");
    return row;
}

/**
 * GET /api/incoming-calls/[id][?contactId=&companyId=&candidates=0]
 *
 * The caller's dossier for the panel. Without a selection it uses the match
 * stored at ring time; `contactId`/`companyId` preview another candidate, and
 * `candidates=0` skips re-running the phone match when the panel already has
 * the list.
 */
export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    const session = await requireRole(INCOMING_CALL_ROLES, request);
    const userId = session.user.id;
    const { id } = await params;
    const row = await loadOwnCall(id, userId);

    const search = request.nextUrl.searchParams;
    const wantCandidates = search.get("candidates") !== "0";
    const candidates = wantCandidates ? await findCallerCandidates(row.fromNumber, userId) : null;

    const pickedCompanyId = search.get("companyId");
    const selection = pickedCompanyId
        ? { companyId: pickedCompanyId, contactId: search.get("contactId") || null }
        : row.companyId
          ? { companyId: row.companyId, contactId: row.contactId }
          : candidates?.[0]
            ? { companyId: candidates[0].companyId, contactId: candidates[0].contactId }
            : null;

    const dossier = selection
        ? await buildCallerDossier({
              ...selection,
              sdrId: userId,
              callerKey: row.callerKey,
              excludeIncomingCallId: row.id,
          })
        : null;

    return successResponse({
        call: presentIncomingCall(row),
        candidates,
        selection: dossier ? selection : null,
        dossier,
    });
});

const patchSchema = z.object({
    dismiss: z.boolean().optional(),
    opened: z.boolean().optional(),
    /** Re-point the call at another candidate the user picked in the panel. */
    link: z.object({ companyId: z.string().min(1), contactId: z.string().min(1).nullable() }).optional(),
});

/** PATCH /api/incoming-calls/[id] — dismiss, mark the fiche as opened, or relink the caller. */
export const PATCH = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) => {
    const session = await requireRole(INCOMING_CALL_ROLES, request);
    const { id } = await params;
    await loadOwnCall(id, session.user.id);

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse("Requête invalide", 400);
    const { dismiss, opened, link } = parsed.data;

    const data: Parameters<typeof prisma.incomingCall.update>[0]["data"] = {};
    if (dismiss) data.dismissedAt = new Date();
    if (opened) data.openedAt = new Date();

    if (link) {
        const company = await prisma.company.findUnique({
            where: { id: link.companyId },
            select: { name: true, list: { select: { missionId: true } } },
        });
        if (!company) return errorResponse("Société introuvable", 404);

        let callerName: string | null = null;
        if (link.contactId) {
            const contact = await prisma.contact.findFirst({
                where: { id: link.contactId, companyId: link.companyId },
                select: { firstName: true, lastName: true },
            });
            if (!contact) return errorResponse("Contact introuvable", 404);
            callerName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || null;
        }

        Object.assign(data, {
            contactId: link.contactId,
            companyId: link.companyId,
            missionId: company.list?.missionId ?? null,
            callerName,
            companyName: company.name,
        });
    }

    const row = await prisma.incomingCall.update({ where: { id }, data });
    return successResponse({ call: presentIncomingCall(row) });
});
