// ============================================
// TELEPHONY — inbound calls on a user's Twilio number. Server-only.
//
//   prospect calls +33… → /api/webhooks/twilio/incoming?step=start
//     owner = the user that number is assigned to (Paramètres → Téléphonie)
//     rows  = a TelephonyCall (direction INBOUND: recording, transcript, AI
//             summary, journal, post-call card) + an IncomingCall (« Appels à
//             traiter »: the caller's fiche, missed-call reminder)
//     TwiML = ring the owner's browser (<Client>) 20 s, else voicemail
//
// Convention shared with outbound calls: toNumber is always the PROSPECT's
// number and fromNumber our line, so the journal, its search and the link to
// the qualification work the same in both directions.
// ============================================

import { IncomingCallStatus, type TelephonyCall } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/exclusions/matching";
import { createNotification } from "@/lib/notifications";
import { createResolvedRow, notifyMissed } from "@/lib/incoming-calls/service";
import { transcribeAudioFr } from "@/lib/ai/mistral-transcribe";
import { integrationKey } from "@/lib/integrations/keys";
import type { TwilioConfig } from "./config";
import { toE164 } from "./phone";
import { isFinalStatus, mapTwilioStatus, nextStatus } from "./status";
import { isTwilioRecordingUrl, recordingMediaUrl } from "./twilio";

/** How long the browser rings before the caller goes to voicemail. */
export const INBOUND_RING_SEC = 20;

export type InboundStart =
    | { kind: "unassigned" }
    | {
          kind: "ring" | "voicemail";
          call: TelephonyCall;
          owner: { id: string; name: string; greeting: string | null };
          caller: { name: string | null; company: string | null };
      };

/** The active user this Twilio number is assigned to. */
async function ownerOf(number: string) {
    const e164 = toE164(number);
    if (!e164) return null;
    const users = await prisma.user.findMany({
        where: { isActive: true, twilioCallerId: { not: null } },
        select: { id: true, name: true, twilioCallerId: true, twilioReceiveCalls: true, voicemailGreeting: true },
    });
    return users.find((u) => toE164(u.twilioCallerId) === e164) ?? null;
}

/** The campaign the caller belongs to: their list's strategy, else the mission's first active campaign. */
async function campaignFor(companyId: string | null, missionId: string | null): Promise<string | null> {
    if (companyId) {
        const company = await prisma.company.findUnique({ where: { id: companyId }, select: { list: { select: { campaignId: true, missionId: true } } } });
        if (company?.list?.campaignId) return company.list.campaignId;
        missionId = missionId ?? company?.list?.missionId ?? null;
    }
    if (!missionId) return null;
    const campaign = await prisma.campaign.findFirst({ where: { missionId, isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
    return campaign?.id ?? null;
}

/** Step 1: Twilio asks what to do with a call to one of our numbers. Idempotent on CallSid. */
export async function startInboundCall(params: Record<string, string>): Promise<InboundStart> {
    const owner = await ownerOf(params.To ?? params.Called ?? "");
    if (!owner) return { kind: "unassigned" };

    const callSid = params.CallSid ?? null;
    const caller = toE164(params.From ?? params.Caller ?? "") ?? (params.From || "anonymous");
    const line = toE164(owner.twilioCallerId) ?? owner.twilioCallerId!;

    let call = callSid ? await prisma.telephonyCall.findUnique({ where: { parentCallSid: callSid } }) : null;
    if (!call) {
        const incomingId = await createResolvedRow({ id: owner.id, name: owner.name, alloPhoneNumber: null }, caller, line, phoneKey(caller), {
            status: IncomingCallStatus.RINGING,
            startedAt: new Date(),
        });
        const row = await prisma.incomingCall.findUnique({
            where: { id: incomingId },
            select: { contactId: true, companyId: true, missionId: true },
        });
        call = await prisma.telephonyCall.create({
            data: {
                direction: "INBOUND",
                sdrId: owner.id,
                toNumber: caller, // the prospect, as for outbound calls
                fromNumber: line,
                contactId: row?.contactId ?? null,
                companyId: row?.companyId ?? null,
                campaignId: await campaignFor(row?.companyId ?? null, row?.missionId ?? null),
                parentCallSid: callSid,
                status: "RINGING",
                incomingCallId: incomingId,
            },
        });
    }

    const incoming = call.incomingCallId
        ? await prisma.incomingCall.findUnique({ where: { id: call.incomingCallId }, select: { callerName: true, companyName: true } })
        : null;
    return {
        kind: owner.twilioReceiveCalls ? "ring" : "voicemail",
        call,
        owner: { id: owner.id, name: owner.name, greeting: owner.voicemailGreeting },
        caller: { name: incoming?.callerName ?? null, company: incoming?.companyName ?? null },
    };
}

/** Keeps the « Appels à traiter » row in step with the call. */
export async function syncIncomingRow(callId: string): Promise<void> {
    const call = await prisma.telephonyCall.findUnique({ where: { id: callId } });
    if (!call || call.direction !== "INBOUND" || !call.incomingCallId) return;
    const final = isFinalStatus(call.status);
    const status = call.answeredAt
        ? final
            ? IncomingCallStatus.COMPLETED
            : IncomingCallStatus.ANSWERED
        : final
          ? IncomingCallStatus.MISSED
          : IncomingCallStatus.RINGING;
    await prisma.incomingCall.update({
        where: { id: call.incomingCallId },
        data: {
            status,
            answeredAt: call.answeredAt,
            endedAt: call.endedAt,
            durationSec: call.durationSec,
            result: call.voicemail ? "VOICEMAIL" : call.status,
        },
    });
}

/**
 * Step 2 (<Dial action>): the browser answered and the call is over, or it
 * did not (no answer, declined, busy elsewhere). Returns whether it was answered.
 */
export async function applyInboundDial(callId: string, params: Record<string, string>): Promise<boolean> {
    const call = await prisma.telephonyCall.findUnique({ where: { id: callId } });
    if (!call) return false;
    const dialStatus = mapTwilioStatus(params.DialCallStatus);
    const answered = dialStatus === "COMPLETED" && Boolean(call.answeredAt ?? Number(params.DialCallDuration) > 0);
    const status = answered ? "COMPLETED" : dialStatus === "BUSY" ? "BUSY" : "NO_ANSWER";
    await prisma.telephonyCall.update({
        where: { id: callId },
        data: {
            status: nextStatus(call.status, status) ?? status,
            answeredAt: answered ? call.answeredAt ?? new Date(Date.now() - (Number(params.DialCallDuration) || 0) * 1000) : call.answeredAt,
            endedAt: call.endedAt ?? new Date(),
            durationSec: answered ? Number(params.DialCallDuration) || call.durationSec : call.durationSec,
            childCallSid: call.childCallSid ?? params.DialCallSid ?? null,
        },
    });
    await syncIncomingRow(callId);
    return answered;
}

/**
 * The caller's leg is over (number status callback). A missed call without a
 * message gets its « Appel manqué » notification here, once.
 */
export async function finalizeInboundCall(params: Record<string, string>): Promise<void> {
    const callSid = params.CallSid;
    if (!callSid) return;
    const call = await prisma.telephonyCall.findUnique({ where: { parentCallSid: callSid } });
    if (!call || call.direction !== "INBOUND") return;
    const status = mapTwilioStatus(params.CallStatus);
    if (!status || !isFinalStatus(status)) return;
    if (!isFinalStatus(call.status) || !call.endedAt) {
        await prisma.telephonyCall.update({
            where: { id: call.id },
            data: { status: call.answeredAt ? "COMPLETED" : status === "COMPLETED" ? "NO_ANSWER" : status, endedAt: call.endedAt ?? new Date() },
        });
    }
    await syncIncomingRow(call.id);
    if (!call.answeredAt && !call.voicemail && call.incomingCallId) {
        // The recording callback may still be on its way: give it a moment.
        await new Promise((r) => setTimeout(r, 4000));
        const fresh = await prisma.telephonyCall.findUnique({ where: { id: call.id }, select: { voicemail: true } });
        if (!fresh?.voicemail) await notifyMissed(call.sdrId, call.incomingCallId);
    }
}

/** The caller left a message: store it, transcribe it, tell the owner. */
export async function applyVoicemail(config: TwilioConfig, callId: string, params: Record<string, string>): Promise<void> {
    if ((params.RecordingStatus ?? "").toLowerCase() !== "completed") return;
    const url = recordingMediaUrl(config.accountSid, params.RecordingSid ?? "");
    const call = await prisma.telephonyCall.findUnique({ where: { id: callId } });
    if (!url || !call || call.direction !== "INBOUND") return;
    const seconds = Number(params.RecordingDuration) || null;
    await prisma.telephonyCall.update({
        where: { id: callId },
        data: { voicemail: true, recordingSid: params.RecordingSid, recordingUrl: url, recordingDurationSec: seconds },
    });
    if (call.incomingCallId) await prisma.incomingCall.update({ where: { id: call.incomingCallId }, data: { recordingUrl: url, result: "VOICEMAIL" } });

    let text: string | null = null;
    try {
        text = await transcribeRecording(url);
    } catch (err) {
        console.error("[telephony/inbound] voicemail transcription failed", err);
    }
    if (text) {
        await prisma.telephonyTranscriptLine.upsert({
            where: { callId_speaker_seq: { callId, speaker: "prospect", seq: 0 } },
            create: { callId, speaker: "prospect", seq: 0, text: text.slice(0, 20_000), at: call.endedAt ?? new Date() },
            update: { text: text.slice(0, 20_000) },
        });
        if (call.incomingCallId) await prisma.incomingCall.update({ where: { id: call.incomingCallId }, data: { summary: text.slice(0, 2000) } });
    }

    const row = call.incomingCallId
        ? await prisma.incomingCall.findUnique({ where: { id: call.incomingCallId }, select: { callerName: true, companyName: true, fromNumber: true } })
        : null;
    const who = row?.callerName ?? row?.companyName ?? call.toNumber;
    await createNotification({
        userId: call.sdrId,
        title: "Message vocal",
        message: text ? `${who} : « ${text.slice(0, 160)}${text.length > 160 ? "…" : ""} »` : `${who} vous a laissé un message${seconds ? ` (${seconds} s)` : ""}.`,
        type: "warning",
        link: "/sdr/appels",
    });
}

async function transcribeRecording(url: string): Promise<string | null> {
    const sid = integrationKey("TWILIO_ACCOUNT_SID");
    const token = integrationKey("TWILIO_AUTH_TOKEN");
    const parsed = new URL(url);
    if (!sid || !token || !isTwilioRecordingUrl(parsed, sid)) return null;
    const res = await fetch(parsed, { headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` } });
    if (!res.ok) return null;
    const result = await transcribeAudioFr(Buffer.from(await res.arrayBuffer()), "message.mp3", "audio/mpeg");
    return result.ok ? result.text.trim() || null : null;
}
