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
import { callModelOptions } from "@/lib/ai/call-model";
import { transcriptText } from "./transcription";
import { statusConfigService } from "@/lib/services/StatusConfigService";
import { transcribeAudioFr } from "@/lib/ai/mistral-transcribe";
import { integrationKey } from "@/lib/integrations/keys";
import { getTwilioConfig } from "./config";
import { isTwilioRecordingUrl } from "./twilio";
import { fillRdvFicheIfEmpty } from "@/lib/call-enrichment/rdv-fiche";

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
  "suggestedStatus": "un code de la liste STATUTS fournie, ou null",
  "callbackAt": "date et heure de rappel convenues, au format AAAA-MM-JJTHH:MM (heure de Paris), ou null",
  "interest": "high" | "medium" | "low" | null,
  "decisionMakerStatus": "confirmed" | "other_person" | null,
  "statedRole": "fonction que l'interlocuteur a lui-même citée, ou null",
  "optOut": true | false,
  "promises": [{ "by": "sdr" | "prospect", "what": "engagement concret pris pendant l'appel" }],
  "meeting": { "mentioned": true | false, "at": "AAAA-MM-JJTHH:MM ou null" } | null,
  "confidence": nombre entre 0 et 1,
  "evidence": ["citation courte, mot pour mot, tirée de la transcription", ...]
}

Règles :
- N'invente rien : chaque élément doit venir de la transcription. Une liste peut être vide.
- 4 points clés maximum, 3 objections maximum, 3 prochaines étapes maximum, chacun en une ligne courte.
- Pas de formule de politesse, pas d'évaluation du SDR.
- qualification : null pour tout ce qui n'a pas été dit explicitement.
- suggestedStatus : le statut que le SDR devrait enregistrer d'après la conversation, choisi UNIQUEMENT dans la liste STATUTS ; null si aucun ne convient clairement.
- callbackAt : seulement si un moment précis de rappel a été convenu (« jeudi 14 h »), calculé à partir de la DATE DE L'APPEL fournie ; null sinon. Jamais de date inventée.
- interest, decisionMakerStatus, optOut, meeting : uniquement si une phrase de la transcription le montre clairement ; cette phrase doit figurer MOT POUR MOT dans "evidence" (4 citations maximum, 160 caractères chacune). Sans citation exacte : null (ou false pour optOut, jamais true par déduction).
- decisionMakerStatus : "confirmed" seulement si l'interlocuteur dit lui-même qu'il décide ou signe ; "other_person" si il désigne quelqu'un d'autre ; sinon null.
- optOut : true seulement si le prospect demande explicitement à ne plus être appelé ou contacté.
- meeting.at : seulement si un jour ET une heure ont été dits ; sinon null.
- promises : ce que l'une des deux personnes s'est engagée à faire (envoyer un document, rappeler, transmettre un contact). Pas de suppositions.
- confidence : ta certitude sur ces champs structurés (0 à 1). Transcription bruitée, courte ou ambiguë → valeur basse.`;

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
export function normalizeSummary(
    raw: unknown,
    allowedStatuses?: ReadonlySet<string>,
    /** Given when the summary is being WRITTEN: evidence quotes are then checked against it. */
    check?: { transcript: string; mixed: boolean },
): CallAiSummary | null {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const summary = typeof o.summary === "string" ? o.summary.trim().slice(0, 1200) : "";
    if (!summary) return null;
    const q = (o.qualification && typeof o.qualification === "object" ? o.qualification : {}) as Record<string, unknown>;
    const suggested = typeof o.suggestedStatus === "string" ? o.suggestedStatus.trim().toUpperCase() : "";
    const structured = normalizeStructured(o, check);
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
        callbackAt: localDateTime(o.callbackAt),
        ...structured,
    };
}

type Structured = Pick<CallAiSummary, "interest" | "decisionMakerStatus" | "statedRole" | "optOut" | "promises" | "meeting" | "confidence" | "evidence">;

/**
 * The structured post-call fields. When `check` is given (the summary is being written),
 * every evidence quote must appear in the transcript; claims left without a verified quote
 * are dropped, never trusted. A suspected opt-out is the one exception: it is kept even
 * without proof, because the safe reading of « maybe asked not to be called » is a human check.
 */
export function normalizeStructured(o: Record<string, unknown>, check?: { transcript: string; mixed: boolean }): Structured {
    const quotes = list(o.evidence, 4).map((q) => q.replace(/^[«"“\s]+|[»"”\s]+$/g, "").slice(0, 160)).filter(Boolean);
    const evidence = check ? quotes.filter((q) => quoteInTranscript(q, check.transcript)) : quotes;
    const supported = evidence.length > 0;

    const interestRaw = typeof o.interest === "string" ? o.interest.trim().toLowerCase() : "";
    const dmRaw = typeof o.decisionMakerStatus === "string" ? o.decisionMakerStatus.trim().toLowerCase() : "";
    const confRaw = typeof o.confidence === "number" && Number.isFinite(o.confidence) ? Math.max(0, Math.min(1, o.confidence)) : null;

    const meetingObj = o.meeting && typeof o.meeting === "object" ? (o.meeting as Record<string, unknown>) : null;
    const meetingMentioned = meetingObj?.mentioned === true;

    const promises = (Array.isArray(o.promises) ? o.promises : [])
        .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : null))
        .filter((p): p is Record<string, unknown> => !!p && (p.by === "sdr" || p.by === "prospect") && typeof p.what === "string" && p.what.trim().length > 0)
        .map((p) => ({ by: p.by as "sdr" | "prospect", what: (p.what as string).trim().slice(0, 200) }))
        .slice(0, 4);

    return {
        interest: supported && (interestRaw === "high" || interestRaw === "medium" || interestRaw === "low") ? interestRaw : null,
        // Two voices mixed without attribution: nobody can tell who « I decide » was said by.
        decisionMakerStatus: supported && !check?.mixed && (dmRaw === "confirmed" || dmRaw === "other_person") ? dmRaw : null,
        statedRole: field(o.statedRole),
        optOut: o.optOut === true,
        promises,
        meeting: meetingMentioned && (supported || !check) ? { mentioned: true, at: localDateTime(meetingObj?.at) } : null,
        confidence: supported ? confRaw : null,
        evidence,
    };
}

/** Accent/case/punctuation-insensitive: speech recognition and the model may differ on both. */
function squash(text: string): string {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** A quote counts when each of its « … »-separated pieces (≥ 10 chars) is found in the transcript. */
export function quoteInTranscript(quote: string, transcript: string): boolean {
    const haystack = ` ${squash(transcript)} `;
    const pieces = quote.split(/…|\.{3}/).map(squash).filter((p) => p.length >= 10);
    return pieces.length > 0 && pieces.every((p) => haystack.includes(` ${p} `));
}

/** "2026-11-12T14:00" (Paris wall time) or null; anything else is dropped. */
export function localDateTime(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) return null;
    const [y, mo, d, h, mi] = m.slice(1).map(Number);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || y < 2020 || y > 2100) return null;
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
}

/** "jeudi 2026-11-12 14:05" in Paris time: what the model needs to resolve « jeudi ». */
function parisStamp(d: Date): string {
    const parts = new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("weekday")} ${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
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
                // Which key, or that the model may not see call data (DeepSeek hosted in China).
                return err.message || "IA non configurée (clé manquante)";
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
            user: `DATE DE L'APPEL : ${parisStamp(call.startedAt)}\n\nSTATUTS (code : libellé)\n${statusList || "(aucun)"}\n\nTranscription de l'appel${mixed ? " (issue de l'enregistrement : les deux voix sont mélangées, sans indication de qui parle)" : ""} :\n\n${text.slice(0, 24_000)}`,
            maxTokens: 1400,
            temperature: 0.2,
            timeoutMs: 45_000,
            surface: "call_summary",
            dataClass: "raw_crm",
            userId: call.sdr.id,
            ...callModelOptions(),
        });
        const data = normalizeSummary(parsed, allowed, { transcript: text, mixed });
        if (!data) return finish({ aiSummaryStatus: "failed", aiSummaryError: "Réponse de l'IA inutilisable" });
        return finish({ aiSummaryStatus: "done", aiSummary: data as unknown as object });
    } catch (err) {
        console.error("[telephony/summary] failed", err);
        return finish({ aiSummaryStatus: "failed", aiSummaryError: friendly(err) });
    }
}

/**
 * Copies the AI summary and transcript onto the call's qualification, without overwriting anything.
 * `fillFiche: false` when called inside a user request (the SDR saving): the fiche is an AI call,
 * the caller schedules it after the response instead.
 */
export async function syncSummaryToAction(callId: string, opts: { fillFiche?: boolean } = {}): Promise<void> {
    const call = await prisma.telephonyCall.findUnique({
        where: { id: callId },
        include: { transcript: { orderBy: [{ at: "asc" }, { seq: "asc" }] } },
    });
    if (!call?.actionId) return;
    const action = await prisma.action.findUnique({ where: { id: call.actionId }, select: { callSummary: true, callTranscription: true } });
    if (!action) return;

    const data: { callSummary?: string; callTranscription?: string; callEnrichmentAt?: Date; callEnrichmentError?: null } = {};
    const state = readSummaryState(call);
    if (!action.callSummary && state.status === "done") data.callSummary = summaryText(state.data);
    // Only once the call is over: an RDV is often booked while still on the line, and copying
    // the live transcript then would freeze a half conversation on the RDV (never overwritten).
    if (!action.callTranscription && call.endedAt && call.transcript.length) data.callTranscription = transcriptText(call.transcript);
    if (Object.keys(data).length) {
        data.callEnrichmentAt = new Date();
        data.callEnrichmentError = null;
        await prisma.action.update({ where: { id: call.actionId }, data });
    }
    // An RDV booked from the softphone gets its fiche written from the conversation.
    if (call.endedAt && opts.fillFiche !== false) await fillRdvFicheIfEmpty(call.actionId);
}
