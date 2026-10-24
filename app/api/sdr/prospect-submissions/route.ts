// ============================================
// POST /api/sdr/prospect-submissions
// An SDR adds a company (+ contact) to the mission's base: a confrère the
// prospect redirected them to, or an inbound lead the client forwarded.
// Per mission (lib/prospect-submissions/settings.ts):
//   OFF        → refused
//   VALIDATION → stored as pending, managers notified (202)
//   DIRECT     → created right away, enters the calling queue (201)
// Duplicates in the mission (409) and blacklisted prospects (422) are always
// refused. `dryRun: true` only runs the checks, for the form's live warning.
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { audit } from "@/lib/audit";
import { notifyAllManagers } from "@/lib/notifications";
import { prospectSubmissionSchema } from "@/lib/prospect-submissions/schemas";
import { getProspectCreationMode } from "@/lib/prospect-submissions/settings";
import { canSubmitOnMission, resolveReferrer, SUBMITTER_ROLES } from "@/lib/prospect-submissions/access";
import { decideOutcome, type ProspectCandidate } from "@/lib/prospect-submissions/matching";
import {
    checkSubmission,
    createPendingSubmission,
    createProspectRows,
    findOtherMissionMatches,
    loadMissionContext,
    lockMission,
    saveOrigin,
} from "@/lib/prospect-submissions/service";

function outcomeResponse(status: number, error: string, data: Record<string, unknown>) {
    return NextResponse.json({ success: false, error, data }, { status });
}

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(SUBMITTER_ROLES, request);
    const input = await validateRequest(request, prospectSubmissionSchema);

    const mission = await loadMissionContext(input.missionId);
    if (!mission) return errorResponse("Mission introuvable", 404);
    if (!mission.isWorkable) return errorResponse("Cette mission n'est pas active.", 400);

    const mode = await getProspectCreationMode(mission.id);
    if (mode === "OFF") {
        return errorResponse("L'ajout de sociétés par les SDR n'est pas activé sur cette mission.", 403);
    }
    if (!(await canSubmitOnMission(session.user, mission.id))) {
        return errorResponse("Vous n'êtes pas planifié sur cette mission.", 403);
    }
    if (!mission.lists.some((l) => l.id === input.listId)) {
        return errorResponse("Cette liste n'appartient pas à la mission ou n'est pas active.", 400);
    }

    // Adding a contact to a company already in the base: it must be one of this mission's.
    let candidate: ProspectCandidate = {
        company: input.company,
        contact: input.contact ?? null,
        existingCompanyId: input.existingCompanyId ?? null,
    };
    if (input.existingCompanyId) {
        const existing = await prisma.company.findUnique({
            where: { id: input.existingCompanyId },
            select: { name: true, website: true, phone: true, excludedAt: true, list: { select: { missionId: true } } },
        });
        if (!existing || existing.list.missionId !== mission.id) {
            return errorResponse("Société introuvable dans cette mission.", 404);
        }
        if (existing.excludedAt) {
            return outcomeResponse(422, "Cette société est sur la BlackList de ce client.", { outcome: "BLACKLISTED" });
        }
        candidate = {
            ...candidate,
            company: { name: existing.name, website: existing.website, phone: existing.phone },
        };
    }

    const check = await checkSubmission(mission, candidate);
    const outcome = decideOutcome(mode, check.duplicates, check.blacklistHit);
    const otherMissionMatches = input.existingCompanyId
        ? []
        : await findOtherMissionMatches(mission.clientId, mission.id, candidate.company).catch(() => []);

    if (input.dryRun) {
        return successResponse({ outcome, mode, duplicates: check.duplicates, otherMissionMatches });
    }
    if (outcome === "BLACKLISTED") {
        return outcomeResponse(422, "Cette société est sur la BlackList de ce client : elle ne peut pas être ajoutée.", {
            outcome,
        });
    }
    if (outcome === "DUPLICATE") {
        return outcomeResponse(409, "Ce prospect est déjà dans la base de la mission.", {
            outcome,
            duplicates: check.duplicates,
        });
    }

    const referrer = await resolveReferrer(mission.id, input.fromCompanyId, input.fromContactId);
    const sdrName = session.user.name ?? "SDR";
    const label = input.existingCompanyId
        ? `${[input.contact?.firstName, input.contact?.lastName].filter(Boolean).join(" ")} — ${candidate.company.name}`
        : candidate.company.name;

    if (outcome === "QUEUE") {
        const submission = await createPendingSubmission({
            missionId: mission.id,
            listId: input.listId,
            sdrId: session.user.id,
            sdrName,
            source: input.source,
            note: input.note?.trim() || null,
            referrer,
            company: input.existingCompanyId ? candidate.company : input.company,
            contact: input.contact ?? null,
            existingCompanyId: input.existingCompanyId ?? null,
        });
        audit(request, session, {
            action: "CREATE",
            entityType: "ProspectSubmission",
            entityId: submission.id,
            summary: `${sdrName} propose « ${label} » (${mission.name})`,
            after: submission,
            metadata: { missionId: mission.id, mode },
        });
        void notifyAllManagers({
            title: "Nouvelle société proposée par un SDR",
            message: `${sdrName} propose « ${label} » pour ${mission.clientName} — ${mission.name}.`,
            type: "info",
            link: `/manager/propositions-sdr?mission=${mission.id}`,
        });
        return successResponse({ outcome: "PENDING", submissionId: submission.id, otherMissionMatches }, 202);
    }

    // DIRECT — lock the mission, re-check inside the transaction, create.
    const result = await prisma.$transaction(async (tx) => {
        await lockMission(tx, mission.id);
        const recheck = await checkSubmission(mission, candidate, { db: tx });
        if (recheck.blacklistHit || recheck.duplicates.length > 0) {
            return { kind: "conflict" as const, check: recheck };
        }
        const rows = await createProspectRows(tx, {
            listId: input.listId,
            company: input.company,
            contact: input.contact ?? null,
            existingCompanyId: input.existingCompanyId ?? null,
        });
        await saveOrigin(tx, rows.companyId, {
            v: 1,
            addedById: session.user.id,
            addedByName: sdrName,
            source: input.source,
            note: input.note?.trim() || null,
            referrer,
            mode: "DIRECT",
            approvedById: null,
            approvedByName: null,
            contactId: rows.contactId,
            at: new Date().toISOString(),
        });
        return { kind: "created" as const, rows };
    });

    if (result.kind === "conflict") {
        return outcomeResponse(409, "Ce prospect vient d'être ajouté par quelqu'un d'autre.", {
            outcome: "DUPLICATE",
            duplicates: result.check.duplicates,
        });
    }

    audit(request, session, {
        action: "CREATE",
        entityType: "Company",
        entityId: result.rows.companyId,
        summary: `${sdrName} ajoute « ${label} » (${mission.name})`,
        metadata: { via: "sdr-prospect", mode, source: input.source, contactId: result.rows.contactId },
    });

    return successResponse({ outcome: "CREATED", ...result.rows, otherMissionMatches }, 201);
});
