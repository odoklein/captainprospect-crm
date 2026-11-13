// ============================================
// POST-CALL SERVICE — stores, auto-applies and applies proposals (server-only).
//
// What it may write, and how:
//   CREATE_TASK / PREPARE_EMAIL   a Task (source AI) assigned to the SDR. An email is
//                                 NEVER sent from here: the draft sits in the task.
//   RECORD_FACTS                  the proposal itself, marked applied (human- or policy-confirmed facts)
//   SET_DISPOSITION_PROVIDER      an Action through ActionService.createAction — the same
//                                 validated path as the SDR's own save (allowed codes, notes)
// Dispositions read by the AI, meetings and exclusions are never applied here: the
// SDR confirms them in the existing forms (call card, booking drawer, exclusion drawer).
// ============================================

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { actionService } from "@/lib/services/ActionService";
import { statusConfigService } from "@/lib/services/StatusConfigService";
import type { CallSuggestion } from "@/lib/telephony/suggestion";
import type { CallAiSummary } from "@/lib/telephony/summary-shape";
import type { AttemptRow } from "@/lib/dialer/store";
import { POLICY_KEY, parsePolicy, type AutomationPolicy, type ProposalKind } from "./policy";
import { buildProposals, plain, type Proposal } from "./proposals";

/** Applied on a click from the proposals list. The others go through their own form. */
export const CLICK_APPLICABLE: ProposalKind[] = ["CREATE_TASK", "PREPARE_EMAIL", "RECORD_FACTS"];
/** May run with no click, when the policy and the proposal's own eligibility allow it. */
const AUTO_APPLICABLE: ProposalKind[] = ["CREATE_TASK", "RECORD_FACTS", "SET_DISPOSITION_PROVIDER"];
/** Shown in the proposals list (dispositions stay on the existing call card). */
const LISTED: ProposalKind[] = ["CREATE_TASK", "PREPARE_EMAIL", "RECORD_FACTS", "PROPOSE_MEETING", "PROPOSE_EXCLUSION"];

export class ProposalError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

export async function readAutomationPolicy(): Promise<AutomationPolicy> {
    const row = await prisma.systemConfig.findUnique({ where: { key: POLICY_KEY } }).catch(() => null);
    return parsePolicy(row?.value);
}

interface CallRef {
    id: string;
    sdrId: string;
    contactId: string | null;
    companyId: string | null;
    campaignId: string | null;
}

async function persist(call: CallRef, proposals: Proposal[]): Promise<void> {
    if (proposals.length === 0) return;
    await prisma.postCallProposal.createMany({
        skipDuplicates: true, // key = callId:kind:payloadHash → proposing twice is harmless
        data: proposals.map((p) => ({
            key: p.key,
            callId: call.id,
            sdrId: call.sdrId,
            contactId: call.contactId,
            companyId: call.companyId,
            campaignId: call.campaignId,
            kind: p.kind,
            mode: p.mode,
            source: p.source,
            title: p.title,
            payload: p.payload as Prisma.InputJsonValue,
            evidence: p.evidence as Prisma.InputJsonValue,
            confidence: p.confidence,
            holdReason: p.holdReason,
            blocked: p.blocked,
        })),
    });
}

/** Claims a PROPOSED row (compare-and-set) so a double click or a concurrent auto-run applies it once. */
async function claim(id: string, by: string): Promise<boolean> {
    const r = await prisma.postCallProposal.updateMany({ where: { id, status: "PROPOSED" }, data: { status: "APPLIED", decidedBy: by, decidedAt: new Date() } });
    return r.count === 1;
}

async function execute(row: { id: string; kind: string; sdrId: string; title: string; payload: Prisma.JsonValue; callId: string; contactId: string | null; companyId: string | null; campaignId: string | null }, actorId: string): Promise<string | null> {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    switch (row.kind as ProposalKind) {
        case "CREATE_TASK": {
            const task = await prisma.task.create({
                data: {
                    title: plain(String(payload.title ?? row.title), 200),
                    description: "Engagement pris pendant un appel (proposé par l'analyse de l'appel).",
                    source: "AI",
                    sourceRef: `proposal:${row.id}`,
                    assigneeId: row.sdrId,
                    createdById: actorId === "auto" ? row.sdrId : actorId,
                },
            });
            return task.id;
        }
        case "PREPARE_EMAIL": {
            const to = typeof payload.to === "string" ? payload.to : null;
            if (!to) throw new ProposalError("Aucune adresse email pour ce contact", 422);
            const task = await prisma.task.create({
                data: {
                    title: plain(`Envoyer l'email promis à ${to}`, 200),
                    // The draft is text in a task: the SDR copies, edits and sends it from their mailbox.
                    description: `Objet : ${plain(String(payload.subject ?? ""), 150)}\n\n${String(payload.body ?? "").slice(0, 4000)}`,
                    source: "AI",
                    sourceRef: `proposal:${row.id}`,
                    assigneeId: row.sdrId,
                    createdById: actorId,
                },
            });
            return task.id;
        }
        case "RECORD_FACTS":
            return null; // the applied proposal IS the confirmed record
        case "SET_DISPOSITION_PROVIDER": {
            if (!row.campaignId || (!row.contactId && !row.companyId)) throw new ProposalError("Appel sans prospect ni campagne", 422);
            const code = String(payload.statusCode ?? "");
            const config = await statusConfigService.getEffectiveStatusConfig({ campaignId: row.campaignId });
            const statusDef = config.statuses.find((s) => s.code === code);
            if (!statusDef) throw new ProposalError(`Statut ${code} absent de cette mission`, 422);
            const action = await actionService.createAction(
                {
                    contactId: row.contactId ?? undefined,
                    companyId: row.companyId ?? undefined,
                    sdrId: row.sdrId,
                    campaignId: row.campaignId,
                    channel: "CALL",
                    result: code,
                    note: plain(String(payload.note ?? ""), 500) || undefined,
                } as Parameters<typeof actionService.createAction>[0],
                statusDef,
            );
            return action?.id ?? null;
        }
        default:
            throw new ProposalError("Cette proposition se valide dans son formulaire (fiche, prise de RDV ou exclusion)", 409);
    }
}

async function runAuto(callId: string): Promise<void> {
    const rows = await prisma.postCallProposal.findMany({ where: { callId, status: "PROPOSED", mode: "auto", kind: { in: AUTO_APPLICABLE } } });
    for (const row of rows) {
        if (!(await claim(row.id, "auto"))) continue;
        try {
            const ref = await execute(row, "auto");
            await prisma.postCallProposal.update({ where: { id: row.id }, data: { resultRef: ref } });
        } catch (err) {
            await prisma.postCallProposal.update({ where: { id: row.id }, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 300) : "échec" } });
        }
    }
}

export interface ProposalView {
    id: string;
    kind: string;
    status: string;
    mode: string;
    title: string;
    payload: unknown;
    evidence: string[];
    confidence: number | null;
    holdReason: string | null;
    blocked: string | null;
    decidedBy: string | null;
    applicable: boolean;
}

/**
 * Builds, stores and auto-applies the follow-up proposals of an ended softphone call,
 * then returns them for the call card. Safe to call on every poll.
 */
export async function proposalsForCall(input: {
    call: CallRef & { aiSummaryStatus: string | null };
    summary: CallAiSummary | null;
    disposition: CallSuggestion;
    contact: { firstName: string | null; email: string | null } | null;
}): Promise<{ proposals: ProposalView[]; gaps: string[] }> {
    let gaps: string[] = [];
    if (input.summary) {
        const policy = await readAutomationPolicy();
        const set = buildProposals({ callId: input.call.id, now: new Date(), disposition: input.disposition, summary: input.summary, contact: input.contact, policy });
        gaps = set.gaps;
        await persist(input.call, set.proposals.filter((p) => LISTED.includes(p.kind)));
        await runAuto(input.call.id);
    }
    const rows = await prisma.postCallProposal.findMany({ where: { callId: input.call.id, kind: { in: LISTED }, status: { not: "DISMISSED" } }, orderBy: { createdAt: "asc" } });
    return {
        gaps,
        proposals: rows.map((r) => ({
            id: r.id,
            kind: r.kind,
            status: r.status,
            mode: r.mode,
            title: r.title,
            payload: r.payload,
            evidence: Array.isArray(r.evidence) ? (r.evidence as string[]) : [],
            confidence: r.confidence,
            holdReason: r.holdReason,
            blocked: r.blocked,
            decidedBy: r.decidedBy,
            applicable: r.status === "PROPOSED" && !r.blocked && CLICK_APPLICABLE.includes(r.kind as ProposalKind),
        })),
    };
}

export async function decideProposal(id: string, userId: string, decision: "apply" | "dismiss"): Promise<{ status: string; resultRef: string | null }> {
    const row = await prisma.postCallProposal.findUnique({ where: { id } });
    if (!row || row.sdrId !== userId) throw new ProposalError("Proposition introuvable", 404);
    if (row.status !== "PROPOSED") throw new ProposalError("Proposition déjà traitée", 409);

    if (decision === "dismiss") {
        const r = await prisma.postCallProposal.updateMany({ where: { id, status: "PROPOSED" }, data: { status: "DISMISSED", decidedBy: userId, decidedAt: new Date() } });
        if (r.count === 0) throw new ProposalError("Proposition déjà traitée", 409);
        return { status: "DISMISSED", resultRef: null };
    }
    if (!CLICK_APPLICABLE.includes(row.kind as ProposalKind)) throw new ProposalError("Cette proposition se valide dans son formulaire (fiche, prise de RDV ou exclusion)", 409);
    if (row.blocked) throw new ProposalError(row.blocked, 422);
    if (!(await claim(id, userId))) throw new ProposalError("Proposition déjà traitée", 409);
    try {
        const ref = await execute(row, userId);
        await prisma.postCallProposal.update({ where: { id }, data: { resultRef: ref } });
        return { status: "APPLIED", resultRef: ref };
    } catch (err) {
        await prisma.postCallProposal.update({ where: { id }, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 300) : "échec" } });
        throw err instanceof ProposalError ? err : new ProposalError("Application impossible", 500);
    }
}

// ── parallel dialer: lines that never reached the SDR ──────────────────────

const UNANSWERED_NOTES: Partial<Record<string, string>> = {
    NO_ANSWER: "Pas de réponse (numérotation parallèle).",
    BUSY: "Ligne occupée (numérotation parallèle).",
    VOICEMAIL: "Messagerie détectée automatiquement (numérotation parallèle).",
};

/**
 * An unanswered parallel line is logged as « pas de réponse » ONLY when the organisation
 * set SET_DISPOSITION_PROVIDER to auto. Otherwise the attempt log alone records it
 * (the SDR never spoke to anyone, there is nothing for them to confirm).
 */
export async function recordUnansweredOutcome(a: AttemptRow): Promise<void> {
    const note = a.outcome ? UNANSWERED_NOTES[a.outcome] : undefined;
    if (!note || !a.campaignId || (!a.contactId && !a.companyId)) return;
    const policy = await readAutomationPolicy();
    if (policy.SET_DISPOSITION_PROVIDER !== "auto") return;
    const config = await statusConfigService.getEffectiveStatusConfig({ campaignId: a.campaignId }).catch(() => null);
    const nrp = config?.statuses.find((s) => s.code === "NO_RESPONSE");
    if (!nrp) return;
    const disposition: CallSuggestion = {
        state: "ready", source: "twilio", note, callbackAt: null, confirmable: true,
        status: { code: nrp.code, label: nrp.label, color: nrp.color ?? null, requiresNote: Boolean(nrp.requiresNote), triggersCallback: Boolean(nrp.triggersCallback) },
    };
    const set = buildProposals({ callId: a.id, now: new Date(), disposition, summary: null, contact: null, policy });
    await persist({ id: a.id, sdrId: a.sdrId, contactId: a.contactId, companyId: a.companyId, campaignId: a.campaignId }, set.proposals);
    await runAuto(a.id);
}
