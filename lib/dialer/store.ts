// ============================================
// DIALER STORE — every write of the dialer, as single SQL statements.
//
// Concurrency model: no in-process locks (the app runs on several instances).
// Each transition is ONE conditional UPDATE … WHERE <expected state> RETURNING.
// Postgres re-checks the WHERE after taking the row lock, so of two concurrent
// writers exactly one sees its row returned; the other gets nothing and must
// re-read. The invariants that must hold across rows live in the database as
// partial unique indexes (see the migration): one live session per SDR, one
// live attempt per phone number.
// ============================================

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { DialerAgentState } from "@prisma/client";
import { fold, type AttemptEvent, type AttemptFacts, type AttemptPatch, type DialAttemptState } from "./attempt-state";

export interface SqlDb {
    $queryRaw<T>(sql: Prisma.Sql): Promise<T>;
}

const PATCH_COLUMNS: Record<keyof AttemptPatch, string> = {
    state: '"state"',
    outcome: '"outcome"',
    callSid: '"callSid"',
    answeredBy: '"answeredBy"',
    placedAt: '"placedAt"',
    ringingAt: '"ringingAt"',
    answeredAt: '"answeredAt"',
    detectedAt: '"detectedAt"',
    reservedAt: '"reservedAt"',
    bridgedAt: '"bridgedAt"',
    endedAt: '"endedAt"',
    errorCode: '"errorCode"',
};

function setClauses(patch: AttemptPatch): Prisma.Sql[] {
    const out: Prisma.Sql[] = [];
    for (const [key, value] of Object.entries(patch) as [keyof AttemptPatch, unknown][]) {
        if (value === undefined) continue;
        const col = PATCH_COLUMNS[key];
        if (!col) throw new Error(`unknown attempt column ${String(key)}`);
        if (key === "state") out.push(Prisma.sql`"state" = ${value}::"DialAttemptState"`);
        else if (key === "outcome") out.push(Prisma.sql`"outcome" = ${value}::"DialOutcome"`);
        else out.push(Prisma.sql`${Prisma.raw(col)} = ${value}`);
    }
    return out;
}

/** Writes `patch` only if the attempt still holds `from`. True when this caller won. */
export async function casAttempt(db: SqlDb, id: string, from: DialAttemptState, patch: AttemptPatch): Promise<boolean> {
    const sets = setClauses(patch);
    if (sets.length === 0) return true;
    const rows = await db.$queryRaw<{ id: string }[]>(
        Prisma.sql`UPDATE "DialAttempt" SET ${Prisma.join(sets, ", ")} WHERE "id" = ${id} AND "state" = ${from}::"DialAttemptState" RETURNING "id"`,
    );
    return rows.length === 1;
}

export interface AttemptRow extends AttemptFacts {
    id: string;
    sessionId: string;
    sdrId: string;
    contactId: string | null;
    companyId: string | null;
    campaignId: string | null;
    toNumber: string;
    fromNumber: string;
    telephonyCallId: string | null;
    createdAt: Date;
}

export async function getAttempt(db: SqlDb, id: string): Promise<AttemptRow | null> {
    const rows = await db.$queryRaw<AttemptRow[]>(Prisma.sql`SELECT * FROM "DialAttempt" WHERE "id" = ${id}`);
    return rows[0] ? normalizeDates(rows[0]) : null;
}

export async function getAttemptBySid(db: SqlDb, callSid: string): Promise<AttemptRow | null> {
    const rows = await db.$queryRaw<AttemptRow[]>(Prisma.sql`SELECT * FROM "DialAttempt" WHERE "callSid" = ${callSid}`);
    return rows[0] ? normalizeDates(rows[0]) : null;
}

const DATE_KEYS = ["placedAt", "ringingAt", "answeredAt", "detectedAt", "reservedAt", "bridgedAt", "endedAt", "createdAt"] as const;
function normalizeDates<T extends object>(row: T): T {
    const out: Record<string, unknown> = { ...(row as Record<string, unknown>) };
    for (const k of DATE_KEYS) {
        const v = out[k];
        if (typeof v === "string") out[k] = new Date(v.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(v) ? v : `${v}Z`);
    }
    return out as T;
}

export interface Applied {
    changed: boolean;
    before: AttemptRow;
    after: AttemptRow;
}

/**
 * Folds an event into an attempt with compare-and-set, retrying on contention.
 * `changed` is true for exactly one caller per real transition: side effects
 * (reserving the SDR, cancelling siblings, freeing the SDR) belong to that caller.
 */
export async function applyAttemptEvent(db: SqlDb, id: string, event: AttemptEvent, maxTries = 5): Promise<Applied | null> {
    for (let i = 0; i < maxTries; i++) {
        const before = await getAttempt(db, id);
        if (!before) return null;
        const patch = fold(before, event);
        if (!patch) return { changed: false, before, after: before };
        if (await casAttempt(db, id, before.state, patch)) {
            const facts: AttemptPatch = { ...patch };
            delete facts.errorCode;
            return { changed: true, before, after: { ...before, ...facts } as AttemptRow };
        }
    }
    throw new Error(`attempt ${id}: too much contention`);
}

/**
 * Inserts an attempt unless the number already has a live one anywhere (partial
 * unique index). Returns the new id, or null when the number is already ringing.
 */
export async function insertAttempt(
    db: SqlDb,
    a: { sessionId: string; sdrId: string; contactId: string | null; companyId: string | null; campaignId: string | null; toNumber: string; fromNumber: string; selection: unknown },
): Promise<string | null> {
    const id = randomUUID();
    const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO "DialAttempt" ("id", "sessionId", "sdrId", "contactId", "companyId", "campaignId", "toNumber", "fromNumber", "selection")
        VALUES (${id}, ${a.sessionId}, ${a.sdrId}, ${a.contactId}, ${a.companyId}, ${a.campaignId}, ${a.toNumber}, ${a.fromNumber}, ${JSON.stringify(a.selection ?? null)}::jsonb)
        ON CONFLICT ("toNumber") WHERE "state" <> 'ENDED' DO NOTHING
        RETURNING "id"`);
    return rows[0]?.id ?? null;
}

export async function liveAttempts(db: SqlDb, sessionId: string): Promise<AttemptRow[]> {
    const rows = await db.$queryRaw<AttemptRow[]>(Prisma.sql`SELECT * FROM "DialAttempt" WHERE "sessionId" = ${sessionId} AND "state" <> 'ENDED' ORDER BY "createdAt"`);
    return rows.map(normalizeDates);
}

// ── agent (session) ─────────────────────────────────────────────────────────

export interface SessionRow {
    id: string;
    sdrId: string;
    missionId: string | null;
    campaignId: string | null;
    status: "OPEN" | "PAUSED" | "ENDED";
    agentState: DialerAgentState;
    reservedAttemptId: string | null;
    conferenceName: string;
    agentCallSid: string | null;
    maxLines: number;
    lastHeartbeatAt: Date;
}

export async function getSession(db: SqlDb, id: string): Promise<SessionRow | null> {
    const rows = await db.$queryRaw<SessionRow[]>(Prisma.sql`SELECT * FROM "DialerSession" WHERE "id" = ${id}`);
    return rows[0] ? normalizeDates(rows[0]) : null;
}

/**
 * THE reservation: the SDR goes READY → RESERVED for one attempt, atomically.
 * Of N answered lines racing for the same SDR, exactly one gets true. The others
 * must release their call (ABANDONED) — they never reach the SDR.
 */
export async function reserveAgent(db: SqlDb, sessionId: string, attemptId: string): Promise<boolean> {
    const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        UPDATE "DialerSession"
           SET "agentState" = 'RESERVED', "reservedAttemptId" = ${attemptId}, "updatedAt" = now()
         WHERE "id" = ${sessionId}
           AND "status" IN ('OPEN', 'PAUSED')
           AND "agentState" = 'READY'
           AND "reservedAttemptId" IS NULL
     RETURNING "id"`);
    return rows.length === 1;
}

/** Moves the agent between states only from the expected ones. Clears the reservation when leaving RESERVED/ON_CALL. */
export async function setAgentState(
    db: SqlDb,
    sessionId: string,
    from: DialerAgentState[],
    to: DialerAgentState,
    opts: { attemptId?: string | null } = {},
): Promise<boolean> {
    const keepReservation = to === "RESERVED" || to === "ON_CALL";
    const attemptGuard = opts.attemptId ? Prisma.sql`AND "reservedAttemptId" = ${opts.attemptId}` : Prisma.empty;
    const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        UPDATE "DialerSession"
           SET "agentState" = ${to}::"DialerAgentState",
               ${keepReservation ? Prisma.sql`"reservedAttemptId" = "reservedAttemptId"` : Prisma.sql`"reservedAttemptId" = NULL`},
               "updatedAt" = now()
         WHERE "id" = ${sessionId}
           AND "agentState" IN (${Prisma.join(from.map((s) => Prisma.sql`${s}::"DialerAgentState"`))})
           ${attemptGuard}
     RETURNING "id"`);
    return rows.length === 1;
}

// ── provider events (dedupe + dead letters) ─────────────────────────────────

/** Records an event once. Null when that dedupeKey was already seen (duplicate delivery). */
export async function recordEvent(
    db: SqlDb,
    e: { dedupeKey: string; source: string; type: string; sessionId?: string | null; attemptId?: string | null; payload: unknown },
): Promise<string | null> {
    const id = randomUUID();
    const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO "DialerEvent" ("id", "dedupeKey", "source", "type", "sessionId", "attemptId", "payload")
        VALUES (${id}, ${e.dedupeKey}, ${e.source}, ${e.type}, ${e.sessionId ?? null}, ${e.attemptId ?? null}, ${JSON.stringify(e.payload ?? {})}::jsonb)
        ON CONFLICT ("dedupeKey") DO NOTHING
        RETURNING "id"`);
    return rows[0]?.id ?? null;
}

export async function markEvent(db: SqlDb, id: string, error: string | null): Promise<void> {
    await db.$queryRaw(Prisma.sql`
        UPDATE "DialerEvent"
           SET "tries" = "tries" + 1,
               "processedAt" = ${error ? null : new Date()},
               "error" = ${error ? error.slice(0, 500) : null}
         WHERE "id" = ${id}
     RETURNING "id"`);
}

// ── counters for the line decision and number reputation ────────────────────

export async function orgLiveLines(db: SqlDb): Promise<number> {
    const rows = await db.$queryRaw<{ n: number | bigint }[]>(Prisma.sql`SELECT count(*)::int AS n FROM "DialAttempt" WHERE "state" <> 'ENDED'`);
    return Number(rows[0]?.n ?? 0);
}

/** Over the SDR's last `sample` ended attempts: how many reached a person, and how many of those were abandoned. */
export async function recentStats(db: SqlDb, sdrId: string, sample: number): Promise<{ attempts: number; humanAnswers: number; abandoned: number }> {
    const rows = await db.$queryRaw<{ attempts: number; human: number; abandoned: number }[]>(Prisma.sql`
        SELECT count(*)::int AS attempts,
               count(*) FILTER (WHERE "outcome" IN ('CONVERSATION', 'ABANDONED'))::int AS human,
               count(*) FILTER (WHERE "outcome" = 'ABANDONED')::int AS abandoned
          FROM (SELECT "outcome" FROM "DialAttempt" WHERE "sdrId" = ${sdrId} AND "state" = 'ENDED' ORDER BY "createdAt" DESC LIMIT ${sample}) recent`);
    const r = rows[0];
    return { attempts: Number(r?.attempts ?? 0), humanAnswers: Number(r?.human ?? 0), abandoned: Number(r?.abandoned ?? 0) };
}

export async function dialsFromNumberSince(db: SqlDb, fromNumber: string, since: Date): Promise<number> {
    const rows = await db.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT count(*)::int AS n FROM "DialAttempt" WHERE "fromNumber" = ${fromNumber} AND "createdAt" >= ${since}`);
    return Number(rows[0]?.n ?? 0);
}

// ── session lifecycle ───────────────────────────────────────────────────────

export async function setSessionStatus(
    db: SqlDb,
    id: string,
    from: ("OPEN" | "PAUSED" | "ENDED")[],
    to: "OPEN" | "PAUSED" | "ENDED",
    reason: string | null = null,
): Promise<boolean> {
    const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        UPDATE "DialerSession"
           SET "status" = ${to}::"DialerSessionStatus",
               "endedAt" = ${to === "ENDED" ? new Date() : null},
               "endReason" = ${to === "ENDED" ? reason : null},
               "agentState" = ${to === "ENDED" ? Prisma.sql`'OFFLINE'::"DialerAgentState"` : Prisma.sql`"agentState"`},
               "reservedAttemptId" = ${to === "ENDED" ? Prisma.sql`NULL` : Prisma.sql`"reservedAttemptId"`},
               "updatedAt" = now()
         WHERE "id" = ${id}
           AND "status" IN (${Prisma.join(from.map((s) => Prisma.sql`${s}::"DialerSessionStatus"`))})
     RETURNING "id"`);
    return rows.length === 1;
}

/** The browser leg that joined the conference; first writer wins (a second tab cannot take over). */
export async function claimAgentLeg(db: SqlDb, sessionId: string, agentCallSid: string): Promise<boolean> {
    const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        UPDATE "DialerSession" SET "agentCallSid" = ${agentCallSid}, "updatedAt" = now()
         WHERE "id" = ${sessionId} AND "status" <> 'ENDED' AND ("agentCallSid" IS NULL OR "agentCallSid" = ${agentCallSid})
     RETURNING "id"`);
    return rows.length === 1;
}

export async function touchHeartbeat(db: SqlDb, sessionId: string, sdrId: string): Promise<boolean> {
    const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        UPDATE "DialerSession" SET "lastHeartbeatAt" = now()
         WHERE "id" = ${sessionId} AND "sdrId" = ${sdrId} AND "status" <> 'ENDED'
     RETURNING "id"`);
    return rows.length === 1;
}

export async function setAttemptTelephonyCall(db: SqlDb, attemptId: string, telephonyCallId: string): Promise<void> {
    await db.$queryRaw(Prisma.sql`UPDATE "DialAttempt" SET "telephonyCallId" = ${telephonyCallId} WHERE "id" = ${attemptId} AND "telephonyCallId" IS NULL RETURNING "id"`);
}

export async function allLiveAttempts(db: SqlDb): Promise<AttemptRow[]> {
    const rows = await db.$queryRaw<AttemptRow[]>(Prisma.sql`SELECT * FROM "DialAttempt" WHERE "state" <> 'ENDED' ORDER BY "createdAt" LIMIT 1000`);
    return rows.map(normalizeDates);
}

export async function staleSessions(db: SqlDb, heartbeatBefore: Date): Promise<string[]> {
    const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT "id" FROM "DialerSession" WHERE "status" <> 'ENDED' AND "lastHeartbeatAt" < ${heartbeatBefore} LIMIT 200`);
    return rows.map((r) => r.id);
}

/** Sessions whose SDR is still marked reserved for an attempt that has already ended (a lost callback). */
export async function orphanReservations(db: SqlDb): Promise<{ sessionId: string; attemptId: string; outcome: string | null }[]> {
    return db.$queryRaw(Prisma.sql`
        SELECT s."id" AS "sessionId", a."id" AS "attemptId", a."outcome"::text AS "outcome"
          FROM "DialerSession" s JOIN "DialAttempt" a ON a."id" = s."reservedAttemptId"
         WHERE s."agentState" IN ('RESERVED', 'ON_CALL') AND a."state" = 'ENDED'
         LIMIT 200`);
}

/** Contacts / companies this session already rang today: never re-dialled in a loop by the pump. */
export async function attemptedTargets(db: SqlDb, sdrId: string, since: Date): Promise<Set<string>> {
    const rows = await db.$queryRaw<{ key: string }[]>(Prisma.sql`
        SELECT DISTINCT COALESCE("contactId", "companyId") AS key FROM "DialAttempt"
         WHERE "sdrId" = ${sdrId} AND "createdAt" >= ${since} AND COALESCE("contactId", "companyId") IS NOT NULL`);
    return new Set(rows.map((r) => r.key));
}
