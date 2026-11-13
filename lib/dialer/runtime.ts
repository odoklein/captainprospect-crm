// ============================================
// DIALER RUNTIME — the orchestrator's real dependencies (server-only).
//
// Parallel mode runs only when ALL of these hold, checked on every request:
//   • container flag DIALER_PARALLEL=on          (rollback = unset it; nothing else to undo)
//   • organisation policy parallelEnabled=true    (Paramètres → Téléphonie → Numérotation)
//   • Twilio configured and a public app URL      (callbacks must reach us)
// ============================================

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runtimeAppUrl, runtimeEnv } from "@/lib/runtime-config/env";
import { getTwilioConfig, callerIdFor, type TwilioConfig } from "@/lib/telephony/config";
import { checkDialNumber } from "@/lib/telephony/phone";
import { applyLegStatus } from "@/lib/telephony/service";
import { getBrand } from "@/lib/brand/server";
import { loadActionQueue } from "@/lib/sdr-queue/load-action-queue";
import { recordUnansweredOutcome } from "@/lib/post-call/service";
import { DIALER_POLICY_KEY, parseDialerPolicy, type DialerPolicy } from "./policy";
import type { Candidate, DialerDeps } from "./orchestrator";
import { twilioCalls } from "./twilio-rest";
import type { AttemptRow, SessionRow } from "./store";

export function parallelFlagOn(): boolean {
    return runtimeEnv("DIALER_PARALLEL")?.toLowerCase() === "on";
}

export async function readDialerPolicy(): Promise<DialerPolicy> {
    const row = await prisma.systemConfig.findUnique({ where: { key: DIALER_POLICY_KEY } }).catch(() => null);
    const policy = parseDialerPolicy(row?.value);
    return parallelFlagOn() ? policy : { ...policy, parallelEnabled: false };
}

export type DialerAvailability = { ok: true; config: TwilioConfig; policy: DialerPolicy; base: string } | { ok: false; reason: string };

export async function dialerAvailability(): Promise<DialerAvailability> {
    if (!parallelFlagOn()) return { ok: false, reason: "Mode parallèle non activé sur cette instance" };
    const config = getTwilioConfig();
    if (!config) return { ok: false, reason: "Téléphone intégré non configuré" };
    const base = runtimeAppUrl();
    if (!base) return { ok: false, reason: "URL publique de l'application manquante (APP_URL)" };
    const policy = await readDialerPolicy();
    if (!policy.parallelEnabled) return { ok: false, reason: "Mode parallèle désactivé pour l'organisation" };
    return { ok: true, config, policy, base };
}

async function candidatesFor(config: TwilioConfig, session: SessionRow, limit: number, exclude: Set<string>, policy: DialerPolicy): Promise<Candidate[]> {
    const user = await prisma.user.findUnique({ where: { id: session.sdrId }, select: { role: true } });
    if (!user) return [];
    const { items } = await loadActionQueue({ sdrId: session.sdrId, role: user.role, missionId: session.missionId, maxAttempts: policy.maxAttemptsPerProspect });
    const out: Candidate[] = [];
    // Explained ranking; rows without a qualification are never auto-dialled.
    const ranked = items
        .filter((i) => i.qualification?.dialEligible && i.channel !== "EMAIL")
        .sort((a, b) => (b.qualification?.score ?? 0) - (a.qualification?.score ?? 0));
    for (const item of ranked) {
        if (out.length >= limit) break;
        const key = item.contactId ?? item.companyId;
        if (key && exclude.has(key)) continue;
        if (session.campaignId && item.campaignId !== session.campaignId) continue;
        const raw = item.contact?.phone || item.company.phone;
        if (!raw) continue;
        const check = checkDialNumber(raw, { allowedCountries: config.allowedCountries });
        if (!check.ok) continue;
        out.push({
            contactId: item.contactId,
            companyId: item.companyId,
            campaignId: item.campaignId,
            toNumber: check.e164,
            selection: { score: item.qualification!.score, headline: item.qualification!.headline },
        });
    }
    return out;
}

/** Postgres advisory lock held for the duration of `fn`, so two pumps of one session never overlap across instances. */
async function withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T | null> {
    return prisma.$transaction(
        async (tx) => {
            const [row] = await tx.$queryRaw<{ locked: boolean }[]>(Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtext(${`dialer:${sessionId}`})) AS locked`);
            if (!row?.locked) return null;
            return fn();
        },
        { timeout: 20_000, maxWait: 5_000 },
    );
}

async function openTelephonyCall(a: AttemptRow): Promise<string | null> {
    if (!a.callSid) return null;
    const existing = await prisma.telephonyCall.findUnique({ where: { childCallSid: a.callSid }, select: { id: true } });
    if (existing) return existing.id;
    const call = await prisma.telephonyCall.create({
        data: {
            sdrId: a.sdrId,
            toNumber: a.toNumber,
            fromNumber: a.fromNumber,
            contactId: a.contactId,
            companyId: a.companyId,
            campaignId: a.campaignId,
            status: "IN_PROGRESS",
            // A conference-bridged call has no browser leg of its own: the parent sid is
            // synthetic (unique, non-null), so linkCallToAction treats it as a placed call.
            parentCallSid: `dial:${a.id}`,
            childCallSid: a.callSid,
            startedAt: a.placedAt ?? a.createdAt,
            answeredAt: a.answeredAt ?? a.bridgedAt ?? new Date(),
        },
    });
    return call.id;
}

async function closeTelephonyCall(a: AttemptRow): Promise<void> {
    if (a.telephonyCallId) {
        const talk = a.bridgedAt && a.endedAt ? Math.max(0, Math.round((a.endedAt.getTime() - a.bridgedAt.getTime()) / 1000)) : 0;
        await applyLegStatus(a.telephonyCallId, { CallStatus: "completed", CallDuration: String(talk), CallSid: a.callSid ?? "" });
        return;
    }
    await recordUnansweredOutcome(a);
}

export async function buildDialerDeps(): Promise<{ ok: true; deps: DialerDeps } | { ok: false; reason: string }> {
    const availability = await dialerAvailability();
    if (!availability.ok) return availability;
    const { config, policy, base } = availability;
    const brand = await getBrand().catch(() => null);
    const q = (id: string) => `attemptId=${encodeURIComponent(id)}`;
    return {
        ok: true,
        deps: {
            db: prisma,
            twilio: twilioCalls(config),
            policy,
            now: () => new Date(),
            urls: {
                answer: (id) => `${base}/api/webhooks/twilio/dialer/answer?${q(id)}`,
                status: (id) => `${base}/api/webhooks/twilio/dialer/status?${q(id)}`,
                amd: (id) => `${base}/api/webhooks/twilio/dialer/amd?${q(id)}`,
                recording: (callId) => `${base}/api/webhooks/twilio/recording?callId=${encodeURIComponent(callId)}`,
            },
            callerId: async (sdrId) => {
                const u = await prisma.user.findUnique({ where: { id: sdrId }, select: { twilioCallerId: true, isActive: true } });
                return u?.isActive ? callerIdFor(config, u.twilioCallerId) : null;
            },
            candidates: (session, limit, exclude) => candidatesFor(config, session, limit, exclude, policy),
            lock: withSessionLock,
            onConnected: openTelephonyCall,
            onEnded: closeTelephonyCall,
            record: config.record,
            notice: config.record || Boolean(config.transcription),
            brand: brand?.companyShortName || brand?.name || "Notre équipe",
            log: (event, data) => console.info(JSON.stringify({ event, ...data })),
        },
    };
}

export function conferenceCallbackUrl(base: string, sessionId: string): string {
    return `${base}/api/webhooks/twilio/dialer/conference?sessionId=${encodeURIComponent(sessionId)}`;
}
