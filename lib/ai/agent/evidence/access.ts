/**
 * Who may open a piece of evidence.
 *
 * Evidence is as private as the conversation it came from: only the manager
 * who ran the turn, while still active, and only if the record's scope still
 * matches the conversation's project. Pure, so the rule is tested without a
 * database; the route answers 404 on any denial (no existence oracle).
 */

export interface EvidenceAccessSubject {
    userId: string;
    clientId: string | null;
    missionId: string | null;
    conversation: { createdById: string; clientId: string | null; missionId: string | null };
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
    if (evidence.userId !== viewer.id || evidence.conversation.createdById !== viewer.id) {
        return { allowed: false, reason: "not_owner" };
    }
    if (evidence.clientId !== evidence.conversation.clientId || evidence.missionId !== evidence.conversation.missionId) {
        return { allowed: false, reason: "scope_mismatch" };
    }
    return { allowed: true };
}
