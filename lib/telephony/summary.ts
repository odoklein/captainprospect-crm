// ============================================
// TELEPHONY — AI summary of a softphone call, from its live transcript.
//
// Runs once per call, after Twilio stops the transcription (or lazily when
// someone looks at an ended call whose summary never started). The claim on
// aiSummaryStatus makes concurrent triggers harmless.
//
// The model only restates what was said: a conversation too short to
// summarise is marked "skipped", never padded.
// ============================================

import { prisma } from "@/lib/prisma";
import { AiCallError, callJsonModel } from "@/lib/ai/json-call";
import { transcriptText } from "./transcription";

export interface CallAiSummary {
    summary: string;
    keyPoints: string[];
    objections: string[];
    nextSteps: string[];
}

export type SummaryState =
    | { status: "none" }
    | { status: "pending" }
    | { status: "done"; data: CallAiSummary; at: string | null }
    | { status: "skipped"; reason: string }
    | { status: "failed"; reason: string };

/** Fewer words than this and there was no conversation to summarise. */
export const MIN_WORDS = 25;
/** A pending summary older than this is considered lost and may be retried. */
const STALE_PENDING_MS = 3 * 60_000;

const SYSTEM = `Tu aides une équipe de SDR (prospection B2B par téléphone, en français).
On te donne la transcription automatique d'un appel entre un SDR et un prospect. La transcription peut contenir des erreurs de reconnaissance.

Réponds UNIQUEMENT avec un objet JSON :
{
  "summary": "2 à 3 phrases factuelles : qui a été joint, ce qui a été dit, où en est le prospect",
  "keyPoints": ["fait concret appris pendant l'appel", ...],
  "objections": ["objection ou réticence exprimée par le prospect", ...],
  "nextSteps": ["prochaine étape convenue ou à faire", ...]
}

Règles :
- N'invente rien : chaque élément doit venir de la transcription. Une liste peut être vide.
- 4 points clés maximum, 3 objections maximum, 3 prochaines étapes maximum, chacun en une ligne courte.
- Pas de formule de politesse, pas d'évaluation du SDR.`;

function list(v: unknown, max: number): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim().slice(0, 300))
        .slice(0, max);
}

/** Validates the model's JSON; null when it has no usable summary. */
export function normalizeSummary(raw: unknown): CallAiSummary | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const summary = typeof o.summary === "string" ? o.summary.trim().slice(0, 1200) : "";
    if (!summary) return null;
    return {
        summary,
        keyPoints: list(o.keyPoints, 4),
        objections: list(o.objections, 3),
        nextSteps: list(o.nextSteps, 3),
    };
}

/** The summary as plain text for Action.callSummary (read by older screens). */
export function summaryText(s: CallAiSummary): string {
    const parts = [s.summary];
    if (s.keyPoints.length) parts.push(`Points clés :\n${s.keyPoints.map((x) => `• ${x}`).join("\n")}`);
    if (s.objections.length) parts.push(`Objections :\n${s.objections.map((x) => `• ${x}`).join("\n")}`);
    if (s.nextSteps.length) parts.push(`Prochaines étapes :\n${s.nextSteps.map((x) => `• ${x}`).join("\n")}`);
    return parts.join("\n\n");
}

export function readSummaryState(call: {
    aiSummary: unknown;
    aiSummaryStatus: string | null;
    aiSummaryError: string | null;
    aiSummaryAt: Date | null;
}): SummaryState {
    switch (call.aiSummaryStatus) {
        case "pending":
            return { status: "pending" };
        case "done": {
            const data = normalizeSummary(call.aiSummary);
            return data ? { status: "done", data, at: call.aiSummaryAt?.toISOString() ?? null } : { status: "failed", reason: "Résumé illisible" };
        }
        case "skipped":
            return { status: "skipped", reason: call.aiSummaryError ?? "Conversation trop courte" };
        case "failed":
            return { status: "failed", reason: call.aiSummaryError ?? "Résumé indisponible" };
        default:
            return { status: "none" };
    }
}

function friendly(err: unknown): string {
    if (err instanceof AiCallError) {
        switch (err.code) {
            case "MISSING_KEY":
                return "IA non configurée (clé manquante)";
            case "QUOTA":
                return "Crédits IA épuisés";
            case "TIMEOUT":
                return "L'IA n'a pas répondu à temps";
            default:
                return "Résumé IA indisponible";
        }
    }
    return "Résumé IA indisponible";
}

/**
 * Builds the summary of an ended call. Safe to call several times: only the
 * caller that claims the call does the work. Returns the final state.
 */
export async function summarizeCall(callId: string): Promise<SummaryState> {
    const staleBefore = new Date(Date.now() - STALE_PENDING_MS);
    const claim = await prisma.telephonyCall.updateMany({
        where: {
            id: callId,
            endedAt: { not: null },
            OR: [{ aiSummaryStatus: null }, { aiSummaryStatus: "pending", updatedAt: { lt: staleBefore } }],
        },
        data: { aiSummaryStatus: "pending", aiSummaryError: null },
    });
    if (claim.count === 0) {
        const call = await prisma.telephonyCall.findUnique({ where: { id: callId } });
        return call ? readSummaryState(call) : { status: "none" };
    }

    const call = await prisma.telephonyCall.findUnique({
        where: { id: callId },
        include: { transcript: { orderBy: [{ at: "asc" }, { seq: "asc" }] }, sdr: { select: { id: true, name: true } } },
    });
    if (!call) return { status: "none" };

    const text = transcriptText(call.transcript, { sdr: "SDR", prospect: "Prospect" });
    const words = text.split(/\s+/).filter(Boolean).length;

    const finish = async (data: { aiSummaryStatus: string; aiSummary?: object; aiSummaryError?: string | null }) => {
        const updated = await prisma.telephonyCall.update({
            where: { id: callId },
            data: { ...data, aiSummaryAt: new Date() },
        });
        await syncSummaryToAction(updated.id);
        return readSummaryState(updated);
    };

    if (words < MIN_WORDS) {
        return finish({ aiSummaryStatus: "skipped", aiSummaryError: call.transcript.length ? "Conversation trop courte pour un résumé" : "Aucune transcription pour cet appel" });
    }

    try {
        const { parsed } = await callJsonModel({
            system: SYSTEM,
            user: `Transcription de l'appel :\n\n${text.slice(0, 24_000)}`,
            maxTokens: 700,
            temperature: 0.2,
            timeoutMs: 45_000,
            surface: "call_summary",
            dataClass: "raw_crm",
            userId: call.sdr.id,
        });
        const data = normalizeSummary(parsed);
        if (!data) return finish({ aiSummaryStatus: "failed", aiSummaryError: "Réponse de l'IA inutilisable" });
        return finish({ aiSummaryStatus: "done", aiSummary: data as unknown as object });
    } catch (err) {
        console.error("[telephony/summary] failed", err);
        return finish({ aiSummaryStatus: "failed", aiSummaryError: friendly(err) });
    }
}

/** Copies the AI summary and transcript onto the call's qualification, without overwriting anything. */
export async function syncSummaryToAction(callId: string): Promise<void> {
    const call = await prisma.telephonyCall.findUnique({
        where: { id: callId },
        include: { transcript: { orderBy: [{ at: "asc" }, { seq: "asc" }] } },
    });
    if (!call?.actionId) return;
    const action = await prisma.action.findUnique({ where: { id: call.actionId }, select: { callSummary: true, callTranscription: true } });
    if (!action) return;

    const data: { callSummary?: string; callTranscription?: string } = {};
    const state = readSummaryState(call);
    if (!action.callSummary && state.status === "done") data.callSummary = summaryText(state.data);
    if (!action.callTranscription && call.transcript.length) data.callTranscription = transcriptText(call.transcript);
    if (Object.keys(data).length) await prisma.action.update({ where: { id: call.actionId }, data });
}
