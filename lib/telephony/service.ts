// ============================================
// TELEPHONY — call log service (server-only). Every DB write of the softphone.
//
//   createOutboundCall()   POST /api/telephony/calls      (the SDR clicks « Appeler »)
//   acceptVoiceRequest()   POST /api/webhooks/twilio/voice  (Twilio asks what to dial)
//   applyLegStatus()       POST /api/webhooks/twilio/status?leg=child
//   applyDialResult()      POST /api/webhooks/twilio/status?leg=dial
//   applyRecording()       POST /api/webhooks/twilio/recording
//   linkCallToAction()     POST /api/actions                (the SDR saves the qualification)
// ============================================

import type { Prisma, TelephonyCall } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { callerIdFor, type TwilioConfig } from "./config";
import { checkDialNumber, phonesInField } from "./phone";
import { isFinalStatus, mapTwilioStatus, nextStatus, parseSeconds, type TelephonyStatus } from "./status";
import { identityFor, recordingMediaUrl, userIdFromIdentity } from "./twilio";
import { syncSummaryToAction } from "./summary";

/** Twilio must ask for TwiML within this delay of the row being created. */
const VOICE_REQUEST_WINDOW_MS = 2 * 60 * 1000;
/** A qualification saved this long after the call still belongs to it. */
const LINK_WINDOW_MS = 3 * 60 * 60 * 1000;

export class TelephonyError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

export interface CallView {
    id: string;
    status: TelephonyStatus;
    toNumber: string;
    fromNumber: string;
    contactId: string | null;
    companyId: string | null;
    actionId: string | null;
    startedAt: string;
    answeredAt: string | null;
    endedAt: string | null;
    durationSec: number | null;
    hasRecording: boolean;
}

export function presentCall(call: TelephonyCall): CallView {
    return {
        id: call.id,
        status: call.status,
        toNumber: call.toNumber,
        fromNumber: call.fromNumber,
        contactId: call.contactId,
        companyId: call.companyId,
        actionId: call.actionId,
        startedAt: call.startedAt.toISOString(),
        answeredAt: call.answeredAt?.toISOString() ?? null,
        endedAt: call.endedAt?.toISOString() ?? null,
        durationSec: call.durationSec,
        hasRecording: Boolean(call.recordingUrl),
    };
}

// ── Create ──────────────────────────────────────────────────────────────────

export async function createOutboundCall(
    config: TwilioConfig,
    input: { userId: string; to: string; contactId?: string | null; companyId?: string | null; campaignId?: string | null },
): Promise<TelephonyCall> {
    const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, isActive: true, twilioCallerId: true },
    });
    if (!user?.isActive) throw new TelephonyError("Utilisateur inactif", 403);

    const callerId = callerIdFor(config, user.twilioCallerId);
    if (!callerId) {
        throw new TelephonyError("Aucun numéro Twilio attribué à cet utilisateur (Paramètres → Téléphonie)", 409);
    }

    const check = checkDialNumber(input.to, { allowedCountries: config.allowedCountries });
    if (!check.ok) throw new TelephonyError(check.message, 422);

    // Resolve the record ids so a call is never attached to a contact of another company.
    const contactId = input.contactId ?? null;
    let companyId = input.companyId ?? null;
    if (contactId) {
        const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { companyId: true } });
        if (!contact) throw new TelephonyError("Contact introuvable", 404);
        if (companyId && contact.companyId !== companyId) throw new TelephonyError("Contact et société incohérents", 400);
        companyId = contact.companyId;
    } else if (companyId) {
        const exists = await prisma.company.count({ where: { id: companyId } });
        if (!exists) throw new TelephonyError("Société introuvable", 404);
    }

    return prisma.telephonyCall.create({
        data: {
            sdrId: user.id,
            toNumber: check.e164,
            fromNumber: callerId,
            contactId,
            companyId,
            campaignId: input.campaignId ?? null,
        },
    });
}

// ── Voice request (TwiML) ───────────────────────────────────────────────────

export type VoiceDecision =
    | { ok: true; call: TelephonyCall }
    | { ok: false; reason: string; message: string };

/**
 * Twilio asks what to dial for a browser call. The call must be a fresh row of
 * the very user whose token placed it, never seen before.
 */
export async function acceptVoiceRequest(params: Record<string, string>, now = new Date()): Promise<VoiceDecision> {
    const refuse = (reason: string, message = "Appel impossible.") => ({ ok: false as const, reason, message });

    const callId = params.callId?.trim();
    const parentSid = params.CallSid?.trim();
    const userId = userIdFromIdentity(params.From);
    if (!callId || !parentSid || !userId) return refuse("missing_params");

    const call = await prisma.telephonyCall.findUnique({ where: { id: callId } });
    if (!call) return refuse("unknown_call");
    // Compare in identity form: identities drop characters Twilio refuses (the "-" of
    // UUID user ids, in databases created before cuid), so the raw ids would never match.
    if (identityFor(call.sdrId) !== identityFor(userId)) return refuse("wrong_user");
    if (call.parentCallSid && call.parentCallSid !== parentSid) return refuse("replayed");
    if (call.status !== "INITIATED") return refuse("not_initiated");
    if (now.getTime() - call.createdAt.getTime() > VOICE_REQUEST_WINDOW_MS) {
        await prisma.telephonyCall.update({ where: { id: call.id }, data: { status: "FAILED", errorCode: "expired", endedAt: now } });
        return refuse("expired", "Appel expiré, merci de relancer l'appel.");
    }

    const updated = await prisma.telephonyCall.update({ where: { id: call.id }, data: { parentCallSid: parentSid } });
    return { ok: true, call: updated };
}

// ── Status callbacks ────────────────────────────────────────────────────────

async function applyStatus(
    callId: string,
    incoming: TelephonyStatus,
    extra: { childCallSid?: string | null; durationSec?: number | null; errorCode?: string | null; at?: Date },
): Promise<TelephonyCall | null> {
    const call = await prisma.telephonyCall.findUnique({ where: { id: callId } });
    if (!call) return null;

    const at = extra.at ?? new Date();
    const status = nextStatus(call.status, incoming);
    const data: Prisma.TelephonyCallUncheckedUpdateInput = {};
    if (status !== call.status) data.status = status;
    if (extra.childCallSid && !call.childCallSid) data.childCallSid = extra.childCallSid;
    if (status === "IN_PROGRESS" && !call.answeredAt) data.answeredAt = at;
    if (isFinalStatus(status)) {
        if (!call.endedAt) data.endedAt = at;
        if (status === "COMPLETED") {
            // Leg and <Dial> callbacks both carry a duration; keep the longest.
            if (extra.durationSec != null && extra.durationSec > (call.durationSec ?? -1)) data.durationSec = extra.durationSec;
        } else if (call.durationSec == null) {
            data.durationSec = 0; // never answered: no talk time
        }
    }
    if (extra.errorCode && !call.errorCode) data.errorCode = extra.errorCode;
    if (Object.keys(data).length === 0) return call;

    const updated = await prisma.telephonyCall.update({ where: { id: call.id }, data });
    await syncLinkedAction(updated);
    return updated;
}

function eventTime(params: Record<string, string>): Date | undefined {
    const d = params.Timestamp ? new Date(params.Timestamp) : null;
    return d && !Number.isNaN(d.getTime()) ? d : undefined;
}

/** <Number statusCallback>: progress of the PSTN leg to the prospect. */
export async function applyLegStatus(callId: string, params: Record<string, string>) {
    const status = mapTwilioStatus(params.CallStatus);
    if (!status) return null;
    return applyStatus(callId, status, {
        childCallSid: params.CallSid ?? null,
        durationSec: parseSeconds(params.CallDuration),
        errorCode: params.ErrorCode ?? null,
        at: eventTime(params),
    });
}

/** <Dial action>: the final outcome, once the bridge ends. */
export async function applyDialResult(callId: string, params: Record<string, string>) {
    const status = mapTwilioStatus(params.DialCallStatus);
    if (!status) return null;
    return applyStatus(callId, status, {
        childCallSid: params.DialCallSid ?? null,
        durationSec: parseSeconds(params.DialCallDuration),
        errorCode: params.ErrorCode ?? null,
    });
}

/** Recording status callback: store the media URL once Twilio has it ready. */
export async function applyRecording(config: TwilioConfig, callId: string, params: Record<string, string>) {
    if ((params.RecordingStatus ?? "").toLowerCase() !== "completed") return null;
    const url = recordingMediaUrl(config.accountSid, params.RecordingSid ?? "");
    if (!url) return null;
    const updated = await prisma.telephonyCall.updateMany({
        where: { id: callId },
        data: {
            recordingSid: params.RecordingSid,
            recordingUrl: url,
            recordingDurationSec: parseSeconds(params.RecordingDuration),
        },
    });
    if (updated.count === 0) return null;
    const call = await prisma.telephonyCall.findUnique({ where: { id: callId } });
    if (call) await syncLinkedAction(call);
    return call;
}

// ── Link to the qualification ───────────────────────────────────────────────

/** Copies what the call knows onto its Action, without overwriting what the SDR typed. */
async function syncLinkedAction(call: TelephonyCall): Promise<void> {
    if (!call.actionId) return;
    const action = await prisma.action.findUnique({
        where: { id: call.actionId },
        select: { duration: true, callRecordingUrl: true },
    });
    if (!action) return;
    const data: { duration?: number; callRecordingUrl?: string } = {};
    if (action.duration == null && call.durationSec) data.duration = call.durationSec;
    if (!action.callRecordingUrl && call.recordingUrl) data.callRecordingUrl = call.recordingUrl;
    if (Object.keys(data).length) await prisma.action.update({ where: { id: call.actionId }, data });
}

async function numbersForAction(action: { contactId?: string | null; companyId?: string | null }): Promise<string[]> {
    const [contact, company] = await Promise.all([
        action.contactId
            ? prisma.contact.findUnique({
                  where: { id: action.contactId },
                  select: { phone: true, additionalPhones: true, company: { select: { phone: true } } },
              })
            : null,
        action.companyId ? prisma.company.findUnique({ where: { id: action.companyId }, select: { phone: true } }) : null,
    ]);
    const fields = [
        contact?.phone,
        ...((contact?.additionalPhones as string[] | null | undefined) ?? []),
        contact?.company?.phone,
        company?.phone,
    ];
    return [...new Set(fields.flatMap((f) => phonesInField(typeof f === "string" ? f : null)))];
}

/**
 * The SDR saved a CALL action: attach the latest softphone call they placed to
 * that same contact (or company) in the last hours, if one is still unlinked.
 * Returns the linked call, or null when the call went through tel:/Allo.
 */
export async function linkCallToAction(action: {
    id: string;
    sdrId: string;
    contactId?: string | null;
    companyId?: string | null;
    /** The exact call being qualified (« Mes appels » → Sans statut). Must be this SDR's, unlinked. */
    callId?: string | null;
}): Promise<TelephonyCall | null> {
    if (action.callId) {
        const claimed = await prisma.telephonyCall.updateMany({
            where: { id: action.callId, sdrId: action.sdrId, actionId: null, parentCallSid: { not: null } },
            data: { actionId: action.id },
        });
        if (claimed.count === 0) return null;
        const linked = await prisma.telephonyCall.findUnique({ where: { id: action.callId } });
        if (linked) {
            await syncLinkedAction(linked);
            await syncSummaryToAction(linked.id, { fillFiche: false });
        }
        return linked;
    }

    const targets = [
        ...(action.contactId ? [{ contactId: action.contactId }] : []),
        ...(action.companyId ? [{ companyId: action.companyId }] : []),
    ];
    if (targets.length === 0) return null;

    const recent = {
        sdrId: action.sdrId,
        actionId: null,
        parentCallSid: { not: null }, // Twilio actually placed it
        createdAt: { gte: new Date(Date.now() - LINK_WINDOW_MS) },
    };
    let call = await prisma.telephonyCall.findFirst({
        where: { ...recent, OR: targets },
        orderBy: { createdAt: "desc" },
    });

    // Calls dialled from a plain tel: link carry no record id: match them by number.
    if (!call) {
        const numbers = await numbersForAction(action);
        if (numbers.length > 0) {
            call = await prisma.telephonyCall.findFirst({
                where: { ...recent, contactId: null, companyId: null, toNumber: { in: numbers } },
                orderBy: { createdAt: "desc" },
            });
        }
    }
    if (!call) return null;

    // updateMany + actionId: null so two concurrent saves cannot both claim it.
    const claimed = await prisma.telephonyCall.updateMany({
        where: { id: call.id, actionId: null },
        data: { actionId: action.id },
    });
    if (claimed.count === 0) return null;

    const linked = { ...call, actionId: action.id };
    await syncLinkedAction(linked);
    // A summary/transcript may already exist (the SDR qualified after the AI finished).
    await syncSummaryToAction(call.id, { fillFiche: false });
    return linked;
}
