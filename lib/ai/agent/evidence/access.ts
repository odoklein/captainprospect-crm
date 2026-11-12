/**
 * Who may open a piece of evidence.
 *
 * Evidence is as private as the conversation it came from: the manager who
 * ran the turn, while still active — or, when the conversation is SHARED, any
 * active manager (who can read the thread, so can read its sources). Either
 * way the record must have been produced for that conversation's author and
 * its scope must still match the conversation's project. Pure, so the rule is
 * tested without a database; the route answers 404 on any denial (no
 * existence oracle).
 */

export interface EvidenceAccessSubject {
    userId: string;
    clientId: string | null;
    missionId: string | null;
    conversation: {
        createdById: string;
        clientId: string | null;
        missionId: string | null;
        /** Absent on a database without the v4 columns = PRIVATE. */
        visibility?: "PRIVATE" | "SHARED" | null;
    };
}

export interface EvidenceViewer {
    id: string;
    role: string;
    isActive: boolean;
}

export function evidenceAccessDecision(
    evidence: EvidenceAccessSubject,
    viewer: EvidenceViewer,
): { allowed: true } | { allowed: false; reason: string } {
    if (!viewer.isActive) return { allowed: false, reason: "inactive_account" };
    if (viewer.role !== "MANAGER") return { allowed: false, reason: "role_denied" };
    // The record belongs to the turn's author, whoever reads it.
    if (evidence.userId !== evidence.conversation.createdById) return { allowed: false, reason: "not_owner" };
    const owner = evidence.conversation.createdById === viewer.id;
    if (!owner && evidence.conversation.visibility !== "SHARED") return { allowed: false, reason: "not_owner" };
    if (evidence.clientId !== evidence.conversation.clientId || evidence.missionId !== evidence.conversation.missionId) {
        return { allowed: false, reason: "scope_mismatch" };
    }
    return { allowed: true };
}
