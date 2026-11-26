// ============================================
// ONOFF HISTORY IMPORT — « Récupérer l'historique » (Paramètres → Téléphonie).
//
//   1. members   Onoff members → CRM users (same e-mail, else an Onoff number on the profile)
//   2. calls     every call of every member in the range → OnoffCall (upsert; a call the
//                webhook already stored is completed, never duplicated)
//   3. details   for calls with audio: notes, tags, recording / voicemail ids, and Onoff's
//                AI summary, transcript and coaching score
//   4. linking   the call actions of those SDRs in the range that still miss a summary or a
//                recording go through the normal call enrichment (Onoff is one of its sources)
//
// Runs inside the server process (like lib/call-enrichment/scheduler.ts); progress goes to
// OnoffImportRun so the page can follow it. A restart leaves heartbeatAt still: the run
// shows as interrupted and can be started again — every step is idempotent, and step 3
// resumes where it stopped (detailsAt).
// ============================================

import { DateTime } from "luxon";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/exclusions/matching";
import { integrationKey } from "@/lib/integrations/keys";
import { enrichActionShouldUseForce } from "@/lib/call-enrichment/enrich-action";
import { enrichCallActionsParallel } from "@/lib/call-enrichment/enrich-sync-parallel";
import {
    OnoffApiClient, OnoffApiError, addDays, daysBetween, isDay, isSameCall, mapCallDetails, mapCallLog, memberName, needsDetails, onoffApiErrorMessage,
    type OnoffApiMember,
} from "./api";
import { matchOnoffUser } from "./webhook";
import { isOnoffApiConfigured } from "./audio";

export const ONOFF_IMPORT_MAX_DAYS = 366;
/** Call actions sent to the enrichment per run (the rest: run again, or Prospection → Synchroniser). */
const MAX_LINK_ACTIONS = 1_500;
/** A running import whose heartbeat is older than this was cut by a restart. */
export const STALE_RUN_MS = 3 * 60_000;
const TZ = "Europe/Paris";

export { isOnoffApiConfigured };

function client(): OnoffApiClient {
    const key = integrationKey("ONOFF_API_KEY")?.trim();
    if (!key) throw new Error("ONOFF_API_KEY not set");
    return new OnoffApiClient(key);
}

// ── Members ─────────────────────────────────────────────────────────────────

type CrmUser = { id: string; name: string; email: string; onoffPhoneNumber: string | null };

async function crmUsers(): Promise<CrmUser[]> {
    return prisma.user.findMany({
        where: { isActive: true, role: { notIn: ["CLIENT", "COMMERCIAL"] } },
        select: { id: true, name: true, email: true, onoffPhoneNumber: true },
    });
}

/** The CRM user behind an Onoff member: e-mail first, then any of the member's numbers. */
export function matchMember(member: OnoffApiMember, users: CrmUser[]): string | null {
    const email = member.email?.trim().toLowerCase() || null;
    const byEmail = matchOnoffUser({ onoffUserEmail: email, onoffUserNumber: null }, users);
    if (byEmail) return byEmail;
    for (const n of member.numberIdRefs ?? []) {
        const id = matchOnoffUser({ onoffUserEmail: null, onoffUserNumber: n }, users);
        if (id) return id;
    }
    return null;
}

export interface OnoffMemberPreview {
    id: string;
    name: string;
    email: string | null;
    numbers: string[];
    user: { id: string; name: string } | null;
}

/** « Tester la clé » : the members Onoff returns, and who they are in the CRM. */
export async function previewOnoffMembers(): Promise<{ ok: true; members: OnoffMemberPreview[] } | { ok: false; message: string }> {
    if (!isOnoffApiConfigured()) return { ok: false, message: "Ajoutez d'abord la clé API Onoff." };
    try {
        const [members, users] = await Promise.all([client().listMembers(), crmUsers()]);
        const byId = new Map(users.map((u) => [u.id, u]));
        return {
            ok: true,
            members: members.map((m) => {
                const uid = matchMember(m, users);
                const u = uid ? byId.get(uid) : null;
                return { id: m.id, name: memberName(m), email: m.email ?? null, numbers: m.numberIdRefs ?? [], user: u ? { id: u.id, name: u.name } : null };
            }),
        };
    } catch (e) {
        return { ok: false, message: onoffApiErrorMessage(e) };
    }
}

// ── Runs ────────────────────────────────────────────────────────────────────

export type OnoffImportRunView = Awaited<ReturnType<typeof latestOnoffImportRuns>>[number];

export async function latestOnoffImportRuns(take = 5) {
    const runs = await prisma.onoffImportRun.findMany({ orderBy: { startedAt: "desc" }, take });
    const now = Date.now();
    return runs.map((r) => ({
        ...r,
        // A "running" row nobody updates any more was cut by a server restart.
        status: r.status === "running" && now - r.heartbeatAt.getTime() > STALE_RUN_MS ? "interrupted" : r.status,
        unmatched: (r.unmatched as { name: string; email: string | null }[] | null) ?? [],
    }));
}

const g = globalThis as typeof globalThis & { __onoffImportRunning?: string | null };

export type StartResult = { ok: true; runId: string } | { ok: false; message: string };

export async function startOnoffImport(input: { from: string; to: string; userId: string }): Promise<StartResult> {
    if (!isOnoffApiConfigured()) return { ok: false, message: "Ajoutez d'abord la clé API Onoff (plan MAX)." };
    const { from, to } = input;
    if (!isDay(from) || !isDay(to)) return { ok: false, message: "Dates invalides (AAAA-MM-JJ)." };
    if (daysBetween(from, to) < 0) return { ok: false, message: "La date de début est après la date de fin." };
    if (daysBetween(from, to) >= ONOFF_IMPORT_MAX_DAYS) return { ok: false, message: "Un an maximum par import : découpez la période." };
    const today = DateTime.now().setZone(TZ).toISODate()!;
    if (daysBetween(today, from) > 0) return { ok: false, message: "La période commence dans le futur." };

    const running = await prisma.onoffImportRun.findFirst({
        where: { status: "running", heartbeatAt: { gt: new Date(Date.now() - STALE_RUN_MS) } },
        select: { id: true },
    });
    if (running || g.__onoffImportRunning) return { ok: false, message: "Un import est déjà en cours : il apparaît ci-dessous." };

    const run = await prisma.onoffImportRun.create({ data: { fromDate: from, toDate: daysBetween(to, today) > 0 ? today : to, startedById: input.userId } });
    g.__onoffImportRunning = run.id;
    void runOnoffImport(run.id)
        .catch(async (e) => {
            console.error("[onoff-import] run failed", run.id, e);
            await prisma.onoffImportRun
                .update({ where: { id: run.id }, data: { status: "failed", error: onoffApiErrorMessage(e), finishedAt: new Date(), heartbeatAt: new Date() } })
                .catch(() => undefined);
        })
        .finally(() => {
            if (g.__onoffImportRunning === run.id) g.__onoffImportRunning = null;
        });
    return { ok: true, runId: run.id };
}

type Counters = {
    phase?: string;
    membersTotal?: number;
    membersDone?: number;
    callsFound?: number;
    callsNew?: number;
    detailsTotal?: number;
    detailsDone?: number;
    recordings?: number;
    summaries?: number;
    actionsLinked?: number;
    unmatched?: Prisma.InputJsonValue;
};

async function runOnoffImport(runId: string): Promise<void> {
    const run = await prisma.onoffImportRun.findUniqueOrThrow({ where: { id: runId } });
    const api = client();
    const c: Required<Omit<Counters, "unmatched" | "phase">> = {
        membersTotal: 0, membersDone: 0, callsFound: 0, callsNew: 0, detailsTotal: 0, detailsDone: 0, recordings: 0, summaries: 0, actionsLinked: 0,
    };
    let lastWrite = 0;
    const save = async (extra: Counters = {}, force = false) => {
        if (!force && Date.now() - lastWrite < 2_000) return;
        lastWrite = Date.now();
        await prisma.onoffImportRun.update({ where: { id: runId }, data: { ...c, ...extra, heartbeatAt: new Date() } });
    };

    // 1. Members
    await save({ phase: "members" }, true);
    const [members, users] = await Promise.all([api.listMembers(), crmUsers()]);
    const sdrByMember = new Map(members.map((m) => [m.id, matchMember(m, users)]));
    const unmatched = members.filter((m) => !sdrByMember.get(m.id)).map((m) => ({ name: memberName(m), email: m.email ?? null }));
    c.membersTotal = members.length;
    await save({ phase: "calls", unmatched }, true);

    // 2. Calls
    for (const member of members) {
        const sdrId = sdrByMember.get(member.id) ?? null;
        for await (const page of api.listCalls(member.id, run.fromDate, run.toDate)) {
            for (const log of page) {
                const base = mapCallLog(log, member);
                if (!base) continue;
                c.callsFound++;
                if (await upsertImportedCall(base, sdrId)) c.callsNew++;
            }
            await save();
        }
        c.membersDone++;
        await save({}, true);
    }

    // 3. Details (resumable: only rows never read)
    await save({ phase: "details" }, true);
    const rangeStart = new Date(`${addDays(run.fromDate, -1)}T00:00:00Z`);
    const rangeEnd = new Date(`${addDays(run.toDate, 2)}T00:00:00Z`);
    const pending = await prisma.onoffCall.findMany({
        where: { apiCallId: { not: null }, detailsAt: null, startedAt: { gte: rangeStart, lt: rangeEnd } },
        select: { id: true, apiCallId: true, durationSec: true, status: true },
        orderBy: { startedAt: "desc" },
    });
    c.detailsTotal = pending.filter((r) => needsDetails({ durationSec: r.durationSec, status: r.status as never })).length;
    await save({}, true);
    for (const row of pending) {
        if (!needsDetails({ durationSec: row.durationSec, status: row.status as never })) {
            await prisma.onoffCall.update({ where: { id: row.id }, data: { detailsAt: new Date() } });
            continue;
        }
        c.detailsDone++;
        try {
            const d = mapCallDetails(await api.callDetails(row.apiCallId!));
            await prisma.onoffCall.update({
                where: { id: row.id },
                data: {
                    ...(d.notes ? { notes: d.notes } : {}),
                    ...(d.tags ? { tags: d.tags as Prisma.InputJsonValue } : {}),
                    recordingId: d.recordingId,
                    voicemailId: d.voicemailId,
                    summary: d.summary,
                    transcription: d.transcription,
                    evaluationScore: d.evaluationScore,
                    evaluation: (d.evaluation ?? undefined) as Prisma.InputJsonValue | undefined,
                    detailsAt: new Date(),
                },
            });
        } catch (e) {
            // A key refused mid-run stops everything; one call Onoff cannot find is skipped for good.
            if (e instanceof OnoffApiError && (e.status === 401 || e.status === 403)) throw e;
            if (e instanceof OnoffApiError && e.status >= 400 && e.status < 500 && e.status !== 429) {
                await prisma.onoffCall.update({ where: { id: row.id }, data: { detailsAt: new Date() } });
            } else {
                console.warn("[onoff-import] details failed, will retry on the next run", row.apiCallId, e);
            }
        }
        await save();
    }
    const inRange = { startedAt: { gte: rangeStart, lt: rangeEnd } };
    [c.recordings, c.summaries] = await Promise.all([
        prisma.onoffCall.count({ where: { ...inRange, OR: [{ recordingId: { not: null } }, { recordingUrl: { not: null } }] } }),
        prisma.onoffCall.count({ where: { ...inRange, summary: { not: null } } }),
    ]);

    // 4. Linking: the SDRs' call actions of the period that still miss a summary or a recording.
    await save({ phase: "linking" }, true);
    const sdrIds = [...new Set([...sdrByMember.values()].filter((x): x is string => !!x))];
    if (sdrIds.length) {
        const actions = await prisma.action.findMany({
            where: {
                sdrId: { in: sdrIds },
                channel: "CALL",
                createdAt: {
                    gte: DateTime.fromISO(run.fromDate, { zone: TZ }).startOf("day").toJSDate(),
                    lte: DateTime.fromISO(run.toDate, { zone: TZ }).endOf("day").plus({ hours: 1 }).toJSDate(),
                },
                OR: [{ callSummary: null }, { callRecordingUrl: null }],
            },
            select: { id: true, callEnrichmentAt: true, callSummary: true, callRecordingUrl: true },
            orderBy: { createdAt: "desc" },
            take: MAX_LINK_ACTIONS,
        });
        // Never enriched, or enriched with half the data (enrichActionShouldUseForce): the rest is complete.
        const todo = actions.filter((a) => !a.callEnrichmentAt || enrichActionShouldUseForce(a));
        for (let i = 0; i < todo.length; i += 25) {
            const results = await enrichCallActionsParallel(todo.slice(i, i + 25), "[onoff-import:link]");
            c.actionsLinked += results.filter((r) => r.status === "enriched").length;
            await save({}, true);
        }
    }

    await prisma.onoffImportRun.update({
        where: { id: runId },
        data: { ...c, phase: "done", status: "done", finishedAt: new Date(), heartbeatAt: new Date() },
    });
}

/** Writes one listed call. True when it is a call the CRM did not have. */
async function upsertImportedCall(base: NonNullable<ReturnType<typeof mapCallLog>>, sdrId: string | null): Promise<boolean> {
    const fields = {
        apiCallId: base.apiCallId,
        memberId: base.memberId,
    };
    const known = await prisma.onoffCall.findFirst({
        where: { OR: [{ id: base.apiCallId }, { apiCallId: base.apiCallId }] },
        select: { id: true, sdrId: true },
    });
    if (known) {
        await prisma.onoffCall.update({ where: { id: known.id }, data: { ...fields, ...(known.sdrId ? {} : { sdrId }) } });
        return false;
    }

    // Already received by the webhook, under its own event id?
    if (base.externalKey) {
        const near = await prisma.onoffCall.findMany({
            where: {
                apiCallId: null,
                externalKey: base.externalKey,
                startedAt: { gte: new Date(base.startedAt.getTime() - 90_000), lte: new Date(base.startedAt.getTime() + 90_000) },
            },
            select: { id: true, sdrId: true, externalKey: true, startedAt: true, onoffUserEmail: true, onoffUserNumber: true },
        });
        const twin = near.find((w) => isSameCall(w, base));
        if (twin) {
            await prisma.onoffCall.update({ where: { id: twin.id }, data: { ...fields, ...(twin.sdrId ? {} : { sdrId }) } });
            return false;
        }
    }

    await prisma.onoffCall.create({
        data: {
            id: base.apiCallId,
            event: base.status === "VMS" ? "VM" : "CDR",
            source: "api",
            sdrId,
            onoffUserEmail: base.onoffUserEmail,
            onoffUserNumber: base.onoffUserNumber,
            externalNumber: base.externalNumber,
            externalKey: base.externalKey ?? phoneKey(base.externalNumber),
            direction: base.direction,
            status: base.status,
            startedAt: base.startedAt,
            endedAt: base.endedAt,
            durationSec: base.durationSec,
            ...fields,
        },
    });
    return true;
}
