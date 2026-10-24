import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import type { ProspectCandidate } from "./matching";
import type { PendingProspectSubmission } from "./types";
import {
    checkSubmission,
    claimPendingSubmission,
    createProspectRows,
    listPendingSubmissions,
    loadMissionContext,
    lockMission,
    saveOrigin,
    type MissionContext,
    type SubmissionCheck,
} from "./service";

// ============================================
// MANAGER REVIEW of pending SDR submissions
// ============================================

export interface ReviewItem extends PendingProspectSubmission {
    missionName: string;
    clientName: string;
    lists: Array<{ id: string; name: string }>;
    check: SubmissionCheck;
}

function candidateOf(s: PendingProspectSubmission): ProspectCandidate {
    return { company: s.company, contact: s.contact, existingCompanyId: s.existingCompanyId };
}

/** Pending submissions with a fresh duplicate/blacklist check (the base moved since). */
export async function listReviewItems(missionId?: string): Promise<ReviewItem[]> {
    const pending = await listPendingSubmissions({ missionId });
    const missions = new Map<string, MissionContext | null>();
    for (const id of new Set(pending.map((p) => p.missionId))) {
        missions.set(id, await loadMissionContext(id));
    }

    const items: ReviewItem[] = [];
    for (const submission of pending) {
        const mission = missions.get(submission.missionId);
        if (!mission) continue;
        const check = await checkSubmission(mission, candidateOf(submission), { excludePendingId: submission.id });
        items.push({
            ...submission,
            missionName: mission.name,
            clientName: mission.clientName,
            lists: mission.lists,
            check,
        });
    }
    return items;
}

export type DecisionResult =
    | { ok: true; companyId?: string; contactId?: string | null }
    | { ok: false; status: number; error: string; check?: SubmissionCheck };

type Actor = { user: { id: string; role: string; name?: string | null; sessionId?: string | null } };

function submissionLabel(s: PendingProspectSubmission): string {
    const person = [s.contact?.firstName, s.contact?.lastName].filter(Boolean).join(" ");
    return s.existingCompanyId && person ? `${person} — ${s.company.name}` : s.company.name;
}

export async function approveSubmission(
    request: NextRequest,
    session: Actor,
    submission: PendingProspectSubmission,
    listId: string | null | undefined,
): Promise<DecisionResult> {
    const mission = await loadMissionContext(submission.missionId);
    if (!mission) return { ok: false, status: 404, error: "Mission introuvable" };
    const targetListId = listId || submission.listId;
    if (!mission.lists.some((l) => l.id === targetListId)) {
        return { ok: false, status: 400, error: "Choisissez une liste active de la mission." };
    }

    const managerName = session.user.name ?? "Manager";
    const result = await prisma.$transaction(async (tx) => {
        await lockMission(tx, mission.id);
        // The claim is the first write: a second manager approving at the same time gets 0.
        if (!(await claimPendingSubmission(tx, mission.id, submission.id))) return { taken: true } as const;

        const check = await checkSubmission(mission, candidateOf(submission), {
            db: tx,
            excludePendingId: submission.id,
        });
        if (check.blacklistHit || check.duplicates.length > 0) {
            // Throwing rolls the claim back: the submission stays pending for another look.
            throw new DuplicateAtApproval(check);
        }

        const rows = await createProspectRows(tx, {
            listId: targetListId,
            company: submission.company,
            contact: submission.contact,
            existingCompanyId: submission.existingCompanyId,
        });
        await saveOrigin(tx, rows.companyId, {
            v: 1,
            addedById: submission.sdrId,
            addedByName: submission.sdrName,
            source: submission.source,
            note: submission.note,
            referrer: submission.referrer,
            mode: "VALIDATION",
            approvedById: session.user.id,
            approvedByName: managerName,
            contactId: rows.contactId,
            at: new Date().toISOString(),
        });
        return { rows } as const;
    }).catch((err) => {
        if (err instanceof DuplicateAtApproval) return { conflict: err.check } as const;
        throw err;
    });

    if ("taken" in result) return { ok: false, status: 409, error: "Déjà traitée par un autre manager." };
    if ("conflict" in result) {
        return {
            ok: false,
            status: 409,
            error: result.conflict.blacklistHit
                ? "Ce prospect est désormais sur la BlackList."
                : "Ce prospect est désormais déjà dans la base.",
            check: result.conflict,
        };
    }

    audit(request, session, {
        action: "CREATE",
        entityType: "Company",
        entityId: result.rows.companyId,
        summary: `${managerName} valide « ${submissionLabel(submission)} » proposé par ${submission.sdrName} (${mission.name})`,
        before: submission,
        metadata: { via: "sdr-prospect", mode: "VALIDATION", contactId: result.rows.contactId },
    });
    void createNotification({
        userId: submission.sdrId,
        title: `Société validée : ${submission.company.name}`,
        message: "Elle est dans votre file d'appels.",
        type: "success",
        link: "/sdr/action",
    });
    return { ok: true, companyId: result.rows.companyId, contactId: result.rows.contactId };
}

export async function rejectSubmission(
    request: NextRequest,
    session: Actor,
    submission: PendingProspectSubmission,
    reason: string,
): Promise<DecisionResult> {
    const claimed = await prisma.$transaction((tx) => claimPendingSubmission(tx, submission.missionId, submission.id));
    if (!claimed) return { ok: false, status: 409, error: "Déjà traitée par un autre manager." };

    const managerName = session.user.name ?? "Manager";
    audit(request, session, {
        action: "DELETE",
        entityType: "ProspectSubmission",
        entityId: submission.id,
        summary: `${managerName} refuse « ${submissionLabel(submission)} » proposé par ${submission.sdrName} : ${reason}`,
        before: submission,
    });
    void createNotification({
        userId: submission.sdrId,
        title: `Proposition refusée : ${submission.company.name}`,
        message: `Motif : ${reason}`,
        type: "warning",
    });
    return { ok: true };
}

class DuplicateAtApproval extends Error {
    constructor(public check: SubmissionCheck) {
        super("duplicate at approval");
    }
}
