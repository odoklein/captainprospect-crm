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
import { statusConfigService } from "@/lib/services/StatusConfigService";
import { transcribeAudioFr } from "@/lib/ai/mistral-transcribe";
import { integrationKey } from "@/lib/integrations/keys";
import { getTwilioConfig } from "./config";
import { isTwilioRecordingUrl } from "./twilio";

/** How long an answered call may wait for Twilio's recording before we give up on it. */
const RECORDING_WAIT_MS = 5 * 60_000;

type RecordingTranscript = { status: "done" } | { status: "waiting" } | { status: "unavailable"; reason: string };

/**
 * Fallback when the live transcription produced nothing usable: transcribe the
 * call's Twilio recording (both voices mixed) and store it as one line,
 * speaker "mixed". Needs TWILIO_RECORD_CALLS=1.
 */
async function transcriptFromRecording(call: {
    id: string;
    answeredAt: Date | null;
    startedAt: Date;
    endedAt: Date | null;
    recordingUrl: string | null;
}): Promise<RecordingTranscript> {
    const config = getTwilioConfig();
    if (!call.recordingUrl) {
        const recent = call.endedAt && Date.now() - call.endedAt.getTime() < RECORDING_WAIT_MS;
        if (config?.record && call.answeredAt && recent) return { status: "waiting" };
        return { status: "unavailable", reason: config?.record ? "Aucun enregistrement reçu pour cet appel" : "Transcription en direct vide et enregistrement désactivé (TWILIO_RECORD_CALLS)" };
    }
    const sid = integrationKey("TWILIO_ACCOUNT_SID");
    const token = integrationKey("TWILIO_AUTH_TOKEN");
    let url: URL;
    try {
        url = new URL(call.recordingUrl);
    } catch {
        return { status: "unavailable", reason: "Enregistrement illisible" };
    }
    if (!sid || !token || !isTwilioRecordingUrl(url, sid)) return { status: "unavailable", reason: "Enregistrement illisible" };

    const res = await fetch(url, { headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` } });
    if (!res.ok) return { status: "unavailable", reason: `Enregistrement indisponible (HTTP ${res.status})` };
    const audio = Buffer.from(await res.arrayBuffer());
    const result = await transcribeAudioFr(audio, "appel.mp3", "audio/mpeg");
    if (!result.ok) return { status: "unavailable", reason: result.message };
    const text = result.text.trim();
    if (!text) return { status: "unavailable", reason: "Enregistrement sans parole détectée" };

    await prisma.telephonyTranscriptLine.upsert({
        where: { callId_speaker_seq: { callId: call.id, speaker: "mixed", seq: 0 } },
        create: { callId: call.id, speaker: "mixed", seq: 0, text: text.slice(0, 60_000), at: call.answeredAt ?? call.startedAt },
        update: { text: text.slice(0, 60_000) },
    });
    return { status: "done" };
}

import { QUALIFICATION_LABELS, type CallAiSummary, type Qualification, type SummaryState } from "./summary-shape";
export { QUALIFICATION_LABELS, type CallAiSummary, type Qualification, type SummaryState };

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
  "nextSteps": ["prochaine étape convenue ou à faire", ...],
  "qualification": {
    "need": "besoin exprimé, ou null",
    "currentSolution": "solution ou prestataire actuel, ou null",
    "timing": "échéance ou calendrier évoqué, ou null",
    "decisionMaker": "qui décide (l'interlocuteur ou une autre personne), ou null",
    "budget": "budget évoqué, ou null"
  },
  "suggestedStatus": "un code de la liste STATUTS fournie, ou null"
}

Règles :
- N'invente rien : chaque élément doit venir de la transcription. Une liste peut être vide.
- 4 points clés maximum, 3 objections maximum, 3 prochaines étapes maximum, chacun en une ligne courte.
- Pas de formule de politesse, pas d'évaluation du SDR.
- qualification : null pour tout ce qui n'a pas été dit explicitement.
- suggestedStatus : le statut que le SDR devrait enregistrer d'après la conversation, choisi UNIQUEMENT dans la liste STATUTS ; null si aucun ne convient clairement.`;

function list(v: unknown, max: number): string[] {
    if (!Array.isArray(v)) return [];
    return v
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim().slice(0, 300))
        .slice(0, max);
}

function field(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t && !/^(null|n\/a|non (précisé|évoqué|mentionné)|inconnu)\.?$/i.test(t) ? t.slice(0, 200) : null;
}

/**
 * Validates the model's JSON; null when it has no usable summary.
 * `allowedStatuses` drops a suggested status the mission does not have.
 */
export function normalizeSummary(raw: unknown, allowedStatuses?: ReadonlySet<string>): CallAiSummary | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const summary = typeof o.summary === "string" ? o.summary.trim().slice(0, 1200) : "";
    if (!summary) return null;
    const q = (o.qualification && typeof o.qualification === "object" ? o.qualification : {}) as Record<string, unknown>;
    const suggested = typeof o.suggestedStatus === "string" ? o.suggestedStatus.trim().toUpperCase() : "";
    return {
        summary,
        keyPoints: list(o.keyPoints, 4),
        objections: list(o.objections, 3),
        nextSteps: list(o.nextSteps, 3),
        qualification: {
            need: field(q.need),
            currentSolution: field(q.currentSolution),
            timing: field(q.timing),
            decisionMaker: field(q.decisionMaker),
            budget: field(q.budget),
        },
        suggestedStatus:
            suggested && /^[A-Z0-9_]{1,64}$/.test(suggested) && (!allowedStatuses || allowedStatuses.has(suggested)) ? suggested : null,
    };
}

/** The summary as plain text for Action.callSummary (read by older screens). */
export function summaryText(s: CallAiSummary): string {
    const parts = [s.summary];
    if (s.keyPoints.length) parts.push(`Points clés :\n${s.keyPoints.map((x) => `• ${x}`).join("\n")}`);
    if (s.objections.length) parts.push(`Objections :\n${s.objections.map((x) => `• ${x}`).join("\n")}`);
    if (s.nextSteps.length) parts.push(`Prochaines étapes :\n${s.nextSteps.map((x) => `• ${x}`).join("\n")}`);
    const qual = (Object.keys(QUALIFICATION_LABELS) as (keyof Qualification)[])
        .filter((k) => s.qualification[k])
        .map((k) => `• ${QUALIFICATION_LABELS[k]} : ${s.qualification[k]}`);
    if (qual.length) parts.push(`Qualification :\n${qual.join("\n")}`);
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

    const load = () =>
        prisma.telephonyCall.findUnique({
            where: { id: callId },
            include: { transcript: { orderBy: [{ at: "asc" }, { seq: "asc" }] }, sdr: { select: { id: true, name: true } } },
        });
    let call = await load();
    if (!call) return { status: "none" };

    const countWords = (c: NonNullable<typeof call>) => transcriptText(c.transcript, { sdr: "SDR", prospect: "Prospect" }).split(/\s+/).filter(Boolean).length;
    let fallbackReason: string | null = null;

    // Live transcription empty or too thin: fall back on the recording.
    if (countWords(call) < MIN_WORDS && call.answeredAt) {
        let fromRecording: RecordingTranscript;
        try {
            fromRecording = await transcriptFromRecording(call);
        } catch (err) {
            console.error("[telephony/summary] recording transcription failed", err);
            fromRecording = { status: "unavailable", reason: "Transcription de l'enregistrement impossible" };
        }
        if (fromRecording.status === "waiting") {
            // Release the claim: the recording webhook will start the summary again.
            await prisma.telephonyCall.update({ where: { id: callId }, data: { aiSummaryStatus: null } });
            return { status: "pending" };
        }
        if (fromRecording.status === "done") call = (await load()) ?? call;
        else fallbackReason = fromRecording.reason;
    }

    const mixed = call.transcript.some((l) => l.speaker === "mixed");
    const text = transcriptText(call.transcript, { sdr: "SDR", prospect: "Prospect" });
    const words = countWords(call);

    const finish = async (data: { aiSummaryStatus: string; aiSummary?: object; aiSummaryError?: string | null }) => {
        const updated = await prisma.telephonyCall.update({
            where: { id: callId },
            data: { ...data, aiSummaryAt: new Date() },
        });
        await syncSummaryToAction(updated.id);
        return readSummaryState(updated);
    };

    if (words < MIN_WORDS) {
        return finish({
            aiSummaryStatus: "skipped",
            aiSummaryError: !call.answeredAt
                ? "Appel non décroché"
                : call.transcript.length
                  ? "Conversation trop courte pour un résumé"
                  : fallbackReason ?? "Aucune transcription pour cet appel",
        });
    }

    // The mission's own statuses: the only ones the AI may suggest.
    const config = await statusConfigService
        .getEffectiveStatusConfig(call.campaignId ? { campaignId: call.campaignId } : {})
        .catch(() => ({ statuses: [] as { code: string; label: string }[] }));
    const allowed = new Set(config.statuses.map((x) => x.code));
    const statusList = config.statuses.map((x) => `${x.code} : ${x.label}`).join("\n");

    try {
        const { parsed } = await callJsonModel({
            system: SYSTEM,
            user: `STATUTS (code : libellé)\n${statusList || "(aucun)"}\n\nTranscription de l'appel${mixed ? " (issue de l'enregistrement : les deux voix sont mélangées, sans indication de qui parle)" : ""} :\n\n${text.slice(0, 24_000)}`,
            maxTokens: 900,
            temperature: 0.2,
            timeoutMs: 45_000,
            surface: "call_summary",
            dataClass: "raw_crm",
            userId: call.sdr.id,
        });
        const data = normalizeSummary(parsed, allowed);
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
