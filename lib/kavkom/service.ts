// ============================================
// KAVKOM — calls in the CRM (server-only). Every Kavkom call is a TelephonyCall row
// with provider "kavkom", so the call island, « Mes appels », the journal, the link to
// the qualification, the recording player and the AI summary need nothing new.
//
//   placeKavkomCall()        POST /api/telephony/calls (« Appeler »): row + active_call/call
//   hangupKavkomCall()       POST /api/telephony/calls/[id]/hangup: active_call/kill
//   applyKavkomEvent()       POST /api/webhooks/kavkom: live state, end of call, transcription
//   kavkomAudioUrl()         a fresh link to a recording (cdr/get_file_link, ./audio.ts)
//
// Ids on the row:
//   parentCallSid = "kavkom:<call uuid>"       the live call (originate, live webhook)
//   childCallSid  = "kavkom-cdr:<xml_cdr_uuid>" the CDR (recording, transcription)
// A call placed in Kavkom's own apps (not from the CRM) gets its row from the first event
// that names it, matched to the SDR by extension and to the prospect by number.
// ============================================

import { IncomingCallStatus, type Prisma, type TelephonyCall } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createResolvedRow, notifyMissed } from "@/lib/incoming-calls/service";
import { findCallerCandidates } from "@/lib/incoming-calls/caller-lookup";
import { phoneKey } from "@/lib/exclusions/matching";
import { checkDialNumber, toE164 } from "@/lib/telephony/phone";
import { isFinalStatus, nextStatus, type TelephonyStatus } from "@/lib/telephony/status";
import { TelephonyError, resolveCallTarget, syncLinkedAction } from "@/lib/telephony/service";
import { campaignFor, syncIncomingRow } from "@/lib/telephony/inbound";
import { kavkomErrorMessage } from "./api";
import { kavkomCallerIdFor, kavkomClient, normalizeExtension, type KavkomConfig } from "./config";
import {
    KAVKOM_PROVIDER,
    formatDestination,
    kavkomCallSid,
    kavkomRecordingRef,
    type KavkomCdrEvent,
    type KavkomEvent,
    type KavkomLiveEvent,
    type KavkomTranscriptionEvent,
} from "./webhook";

export { KAVKOM_PROVIDER };
const cdrSid = (cdrUuid: string) => `kavkom-cdr:${cdrUuid}`;
/** An event this close to a row's start (same SDR, same prospect) is that row's call. */
const MATCH_WINDOW_MS = 3 * 60_000;

// ── Users ───────────────────────────────────────────────────────────────────

async function userByExtension(extension: string | null) {
    const ext = normalizeExtension(extension);
    if (!ext) return null;
    return prisma.user.findFirst({
        where: { kavkomExtension: ext, isActive: true },
        select: { id: true, name: true, kavkomExtension: true, kavkomCallerId: true },
    });
}

// ── Place / hang up ─────────────────────────────────────────────────────────

/**
 * « Appeler » for a user with a Kavkom extension: the row first (it is the call's
 * identity in the CRM), then Kavkom rings the SDR's extension and bridges the prospect.
 */
export async function placeKavkomCall(
    config: KavkomConfig,
    input: { userId: string; to: string; contactId?: string | null; companyId?: string | null; campaignId?: string | null },
): Promise<TelephonyCall> {
    const user = await prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true, isActive: true, kavkomExtension: true, kavkomCallerId: true },
    });
    if (!user?.isActive) throw new TelephonyError("Utilisateur inactif", 403);
    const extension = normalizeExtension(user.kavkomExtension);
    if (!extension) throw new TelephonyError("Aucune extension Kavkom attribuée à cet utilisateur (fiche utilisateur → Téléphonie)", 409);

    const check = checkDialNumber(input.to, { allowedCountries: config.allowedCountries });
    if (!check.ok) throw new TelephonyError(check.message, 422);
    const { contactId, companyId } = await resolveCallTarget(input);
    const callerId = kavkomCallerIdFor(user);

    const call = await prisma.telephonyCall.create({
        data: {
            provider: KAVKOM_PROVIDER,
            sdrId: user.id,
            toNumber: check.e164,
            fromNumber: callerId ?? `Kavkom ${extension}`,
            contactId,
            companyId,
            campaignId: input.campaignId ?? null,
        },
    });

    const client = kavkomClient(config)!;
    try {
        const { callUuid } = await client.originate({
            extension,
            destination: formatDestination(check.e164, config.dialFormat),
            callerId,
            autoAnswer: config.autoAnswer,
        });
        // Without a uuid (older API answers), the row still counts as placed; events match it by number.
        return await prisma.telephonyCall.update({
            where: { id: call.id },
            data: { parentCallSid: kavkomCallSid(callUuid ?? `crm-${call.id}`), status: "RINGING" },
        });
    } catch (err) {
        await prisma.telephonyCall.update({
            where: { id: call.id },
            data: { status: "FAILED", errorCode: "kavkom_originate", endedAt: new Date(), durationSec: 0 },
        });
        console.error("[kavkom] originate failed", err);
        throw new TelephonyError(kavkomErrorMessage(err), 502);
    }
}

/** Kavkom's uuid of a row placed or seen through Kavkom. */
export function kavkomUuidOf(call: Pick<TelephonyCall, "parentCallSid">): string | null {
    const m = /^kavkom:(.+)$/.exec(call.parentCallSid ?? "");
    return m && !m[1].startsWith("crm-") ? m[1] : null;
}

/** « Raccrocher »: ends the call on Kavkom, and in the CRM right away (the CDR corrects it later). */
export async function hangupKavkomCall(config: KavkomConfig, callId: string, userId: string): Promise<TelephonyCall> {
    const call = await prisma.telephonyCall.findUnique({ where: { id: callId } });
    if (!call || call.sdrId !== userId || call.provider !== KAVKOM_PROVIDER) throw new TelephonyError("Appel introuvable", 404);
    if (isFinalStatus(call.status)) return call;

    const uuid = kavkomUuidOf(call);
    if (uuid) {
        try {
            await kavkomClient(config)!.kill(uuid);
        } catch (err) {
            // Already over on Kavkom's side (404/422) is fine; anything else is reported.
            console.warn("[kavkom] kill failed", err);
        }
    }
    const answered = Boolean(call.answeredAt);
    const now = new Date();
    const status: TelephonyStatus = answered ? "COMPLETED" : "CANCELED";
    const updated = await prisma.telephonyCall.update({
        where: { id: call.id },
        data: {
            status: nextStatus(call.status, status),
            endedAt: call.endedAt ?? now,
            durationSec: call.durationSec ?? (answered ? Math.max(0, Math.round((now.getTime() - call.answeredAt!.getTime()) / 1000)) : 0),
        },
    });
    await syncLinkedAction(updated);
    return updated;
}

// ── Finding the row of an event ─────────────────────────────────────────────

async function findRow(ids: { callUuid?: string | null; cdrUuid?: string | null }, fallback?: { sdrId: string; external: string | null; at: Date; direction: "INBOUND" | "OUTBOUND" }) {
    const sids = [ids.callUuid, ids.cdrUuid].filter((x): x is string => !!x).map(kavkomCallSid);
    const or: Prisma.TelephonyCallWhereInput[] = [];
    if (sids.length) or.push({ parentCallSid: { in: sids } });
    if (ids.cdrUuid) or.push({ childCallSid: cdrSid(ids.cdrUuid) });
    if (or.length) {
        const row = await prisma.telephonyCall.findFirst({ where: { provider: KAVKOM_PROVIDER, OR: or } });
        if (row) return row;
    }
    // The live uuid of the prospect's leg, or a CDR, may not be the one active_call/call returned:
    // same SDR, same prospect, started a moment before → same call.
    if (!fallback?.external) return null;
    const e164 = toE164(fallback.external) ?? fallback.external;
    const candidates = await prisma.telephonyCall.findMany({
        where: {
            provider: KAVKOM_PROVIDER,
            sdrId: fallback.sdrId,
            direction: fallback.direction,
            childCallSid: null,
            startedAt: { gte: new Date(fallback.at.getTime() - MATCH_WINDOW_MS), lte: new Date(fallback.at.getTime() + MATCH_WINDOW_MS) },
        },
        orderBy: { startedAt: "desc" },
        take: 10,
    });
    const key = phoneKey(e164);
    return candidates.find((c) => c.toNumber === e164 || (key && phoneKey(c.toNumber) === key)) ?? null;
}

/** A call Kavkom tells us about that the CRM did not place: the SDR dialled from Kavkom, or a prospect called in. */
async function createSeenCall(
    owner: { id: string; name: string },
    ev: { direction: "INBOUND" | "OUTBOUND"; external: string; callUuid: string | null; cdrUuid?: string | null; at: Date; status: TelephonyStatus },
): Promise<TelephonyCall> {
    const prospect = toE164(ev.external) ?? ev.external;
    const owned = await prisma.user.findUnique({ where: { id: owner.id }, select: { kavkomCallerId: true, kavkomExtension: true } });
    const line = toE164(owned?.kavkomCallerId) ?? `Kavkom ${owned?.kavkomExtension ?? ""}`.trim();

    let contactId: string | null = null;
    let companyId: string | null = null;
    let missionId: string | null = null;
    let incomingCallId: string | null = null;
    if (ev.direction === "INBOUND") {
        // « Appels à traiter »: the caller's fiche pops for the SDR, a missed call becomes a reminder.
        incomingCallId = await createResolvedRow({ id: owner.id, name: owner.name, alloPhoneNumber: null }, prospect, line, phoneKey(prospect), {
            status: IncomingCallStatus.RINGING,
            startedAt: ev.at,
        });
        const row = await prisma.incomingCall.findUnique({ where: { id: incomingCallId }, select: { contactId: true, companyId: true, missionId: true } });
        contactId = row?.contactId ?? null;
        companyId = row?.companyId ?? null;
        missionId = row?.missionId ?? null;
    } else {
        const best = (await findCallerCandidates(prospect, owner.id).catch(() => []))[0];
        contactId = best?.contactId ?? null;
        companyId = best?.companyId ?? null;
        missionId = best?.missionId ?? null;
    }

    try {
        return await prisma.telephonyCall.create({
            data: {
                provider: KAVKOM_PROVIDER,
                direction: ev.direction,
                sdrId: owner.id,
                toNumber: prospect,
                fromNumber: line,
                contactId,
                companyId,
                campaignId: await campaignFor(companyId, missionId),
                parentCallSid: kavkomCallSid(ev.callUuid ?? ev.cdrUuid!),
                childCallSid: ev.cdrUuid ? cdrSid(ev.cdrUuid) : null,
                status: ev.status,
                startedAt: ev.at,
                incomingCallId,
            },
        });
    } catch (err) {
        // Two deliveries of the same event racing: the other one created it.
        const existing = await findRow({ callUuid: ev.callUuid, cdrUuid: ev.cdrUuid });
        if (existing) return existing;
        throw err;
    }
}

const dirOf = (d: KavkomLiveEvent["direction"]): "INBOUND" | "OUTBOUND" | null => (d === "INBOUND" || d === "OUTBOUND" ? d : null);

/** An inbound call that ended without being answered: « Appel manqué », once. */
async function afterFinal(before: TelephonyCall, after: TelephonyCall): Promise<void> {
    if (after.direction !== "INBOUND") return;
    await syncIncomingRow(after.id);
    const turnedFinal = !isFinalStatus(before.status) && isFinalStatus(after.status);
    if (turnedFinal && !after.answeredAt && !after.voicemail && after.incomingCallId) await notifyMissed(after.sdrId, after.incomingCallId);
}

// ── Live state ──────────────────────────────────────────────────────────────

async function applyLive(ev: KavkomLiveEvent): Promise<{ callId: string | null; final: boolean }> {
    const owner = await userByExtension(ev.extension);
    const direction = dirOf(ev.direction) ?? "OUTBOUND";
    let row = await findRow({ callUuid: ev.callUuid }, owner ? { sdrId: owner.id, external: ev.external, at: ev.at, direction } : undefined);

    if (!row) {
        // Only the start of a call creates it: a stray "ended" for an unknown call is a late retry.
        if (!owner || !ev.external || ev.state === "ended" || ev.direction === "LOCAL") return { callId: null, final: false };
        row = await createSeenCall(owner, { direction, external: ev.external, callUuid: ev.callUuid, at: ev.at, status: ev.state === "answered" ? "IN_PROGRESS" : "RINGING" });
        if (ev.state === "answered") {
            row = await prisma.telephonyCall.update({ where: { id: row.id }, data: { answeredAt: ev.answeredAt ?? ev.at } });
        }
        if (row.direction === "INBOUND") await syncIncomingRow(row.id);
        return { callId: row.id, final: false };
    }

    const data: Prisma.TelephonyCallUncheckedUpdateInput = {};
    if (ev.state === "ringing") {
        const s = nextStatus(row.status, "RINGING");
        if (s !== row.status) data.status = s;
    } else if (ev.state === "answered") {
        const s = nextStatus(row.status, "IN_PROGRESS");
        if (s !== row.status) data.status = s;
        if (!row.answeredAt) data.answeredAt = ev.answeredAt ?? ev.at;
    } else {
        const answeredAt = row.answeredAt ?? ev.answeredAt;
        const s = nextStatus(row.status, answeredAt ? "COMPLETED" : "NO_ANSWER");
        if (s !== row.status) data.status = s;
        if (!row.endedAt) data.endedAt = ev.at;
        if (answeredAt && !row.answeredAt) data.answeredAt = answeredAt;
        if (row.durationSec == null) {
            data.durationSec = answeredAt ? ev.durationSec ?? Math.max(0, Math.round((ev.at.getTime() - answeredAt.getTime()) / 1000)) : 0;
        }
    }
    if (!Object.keys(data).length) return { callId: row.id, final: isFinalStatus(row.status) };
    const updated = await prisma.telephonyCall.update({ where: { id: row.id }, data });
    await syncLinkedAction(updated);
    await afterFinal(row, updated);
    return { callId: updated.id, final: isFinalStatus(updated.status) };
}

// ── End of call (CDR) ───────────────────────────────────────────────────────

async function applyCdr(ev: KavkomCdrEvent): Promise<{ callId: string | null; final: boolean; answered: boolean }> {
    const owner = await userByExtension(ev.extension);
    const direction = dirOf(ev.direction) ?? "OUTBOUND";
    let row = await findRow(
        { callUuid: ev.callUuid, cdrUuid: ev.cdrUuid },
        owner ? { sdrId: owner.id, external: ev.external, at: ev.startedAt, direction } : undefined,
    );
    if (!row) {
        if (!owner || !ev.external || ev.direction === "LOCAL") return { callId: null, final: false, answered: false };
        row = await createSeenCall(owner, { direction, external: ev.external, callUuid: ev.callUuid, cdrUuid: ev.cdrUuid, at: ev.startedAt, status: "RINGING" });
    }

    // The CDR is the final word, except that an answered call never becomes unanswered.
    const status: TelephonyStatus = row.status === "COMPLETED" && ev.status !== "COMPLETED" && row.answeredAt ? "COMPLETED" : ev.status;
    const answeredAt = ev.answeredAt ?? (status === "COMPLETED" ? row.answeredAt : null);
    const data: Prisma.TelephonyCallUncheckedUpdateInput = {
        status,
        answeredAt,
        endedAt: ev.endedAt ?? row.endedAt ?? new Date(),
        durationSec: status === "COMPLETED" ? ev.talkSec ?? ev.durationSec ?? row.durationSec : 0,
        errorCode: status === "FAILED" ? (ev.hangupCause ?? "failed").slice(0, 64) : row.errorCode,
    };
    if (!row.childCallSid) data.childCallSid = cdrSid(ev.cdrUuid);
    if (ev.hasRecording && (ev.talkSec ?? 0) > 0) {
        data.recordingUrl = kavkomRecordingRef(ev.cdrUuid);
        data.recordingSid = ev.cdrUuid;
        data.recordingDurationSec = ev.talkSec;
    }
    // Inbound and answered by voicemail: the recording is the message.
    if (row.direction === "INBOUND" && ev.voicemail && ev.hasRecording) {
        data.voicemail = true;
        data.recordingUrl = kavkomRecordingRef(ev.cdrUuid);
        data.recordingSid = ev.cdrUuid;
    }

    let updated: TelephonyCall;
    try {
        updated = await prisma.telephonyCall.update({ where: { id: row.id }, data });
    } catch (err) {
        // childCallSid already taken: this CDR was stored on another row (retry). Keep the rest.
        delete data.childCallSid;
        updated = await prisma.telephonyCall.update({ where: { id: row.id }, data });
        console.warn("[kavkom] duplicate CDR id", ev.cdrUuid, err);
    }
    if (updated.incomingCallId && updated.voicemail) {
        await prisma.incomingCall.update({ where: { id: updated.incomingCallId }, data: { recordingUrl: updated.recordingUrl, result: "VOICEMAIL" } });
    }
    await syncLinkedAction(updated);
    await afterFinal(row, updated);
    return { callId: updated.id, final: true, answered: Boolean(updated.answeredAt) && (updated.durationSec ?? 0) > 0 };
}

// ── Transcription ───────────────────────────────────────────────────────────

async function applyTranscription(ev: KavkomTranscriptionEvent): Promise<{ callId: string | null }> {
    const row = await findRow({ cdrUuid: ev.cdrUuid, callUuid: ev.cdrUuid });
    if (!row) return { callId: null };
    const base = (row.answeredAt ?? row.startedAt).getTime();
    // A summary alone never overwrites a real transcript we already hold.
    if (!ev.lines.length && (await prisma.telephonyTranscriptLine.count({ where: { callId: row.id } })) > 0) return { callId: row.id };
    // Kavkom's own summary alone (no lines) is kept as a single line: it still feeds our summary.
    const lines = ev.lines.length ? ev.lines : [{ speaker: "mixed" as const, text: ev.summary!.slice(0, 20_000), offsetSec: 0 }];
    // Kavkom's transcript replaces anything we had (live lines, or our own from the recording).
    await prisma.$transaction([
        prisma.telephonyTranscriptLine.deleteMany({ where: { callId: row.id } }),
        ...lines.map((l, i) =>
            prisma.telephonyTranscriptLine.create({
                data: {
                    callId: row.id,
                    speaker: l.speaker,
                    seq: i,
                    text: l.text,
                    at: new Date(base + Math.max(0, (l.offsetSec ?? i) * 1000)),
                },
            }),
        ),
    ]);
    // A summary made without this transcript (skipped, failed) is made again from it.
    if (row.aiSummaryStatus !== "done") {
        await prisma.telephonyCall.update({ where: { id: row.id }, data: { aiSummaryStatus: null, aiSummaryError: null } });
    }
    return { callId: row.id };
}

// ── Entry point ─────────────────────────────────────────────────────────────

export type KavkomApplyResult = {
    kind: KavkomEvent["kind"];
    callId: string | null;
    /** The AI summary should be (re)built now. */
    summarize: boolean;
};

export async function applyKavkomEvent(ev: KavkomEvent): Promise<KavkomApplyResult> {
    if (ev.kind === "transcription") {
        const r = await applyTranscription(ev);
        return { kind: ev.kind, callId: r.callId, summarize: Boolean(r.callId) };
    }
    if (ev.kind === "cdr") {
        const r = await applyCdr(ev);
        return { kind: ev.kind, callId: r.callId, summarize: r.answered };
    }
    const r = await applyLive(ev);
    return { kind: ev.kind, callId: r.callId, summarize: false };
}

export { kavkomAudioUrl } from "./audio";
