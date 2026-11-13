/**
 * The dialer's SQL executed for real on an in-process Postgres (PGlite), with
 * the actual migration applied twice (idempotent).
 *     npm run test:dialer
 *
 * What PGlite cannot prove: true parallelism. It serialises statements on one
 * connection, so the races below prove the compare-and-set LOGIC (exactly one
 * conditional UPDATE matches) but not lock behaviour under the production pooler.
 * Postgres' documented READ COMMITTED semantics (the WHERE is re-checked after the
 * row lock) is what makes the same statements safe there; one manual check under
 * load is still on the validation list.
 */

process.env.TZ = "UTC";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Prisma } from "@prisma/client";
import {
    applyAttemptEvent, casAttempt, dialsFromNumberSince, getAttempt, insertAttempt, liveAttempts, orgLiveLines,
    recentStats, recordEvent, reserveAgent, setAgentState, getSession, type SqlDb,
} from "./store";

let pg: PGlite;
const db: SqlDb = {
    async $queryRaw<T>(sql: Prisma.Sql): Promise<T> {
        const values = sql.values.map((v) => (v instanceof Date ? v.toISOString().replace("Z", "") : v));
        return (await pg.query(sql.text, values)).rows as T;
    },
};

const MIGRATION = readFileSync(join(process.cwd(), "prisma/migrations/20261112100000_add_sales_execution_engine/migration.sql"), "utf8");
const T = (s: number) => new Date(Date.UTC(2026, 10, 12, 9, 0, s));

async function session(id: string, sdrId: string, agentState = "READY") {
    await pg.query(
        `INSERT INTO "DialerSession" ("id","sdrId","conferenceName","maxLines","agentState","updatedAt") VALUES ($1,$2,$3,2,$4::"DialerAgentState",now())`,
        [id, sdrId, `conf_${id}`, agentState],
    );
}

async function attempt(sessionId: string, toNumber: string, sdrId = "sdr1") {
    const id = await insertAttempt(db, { sessionId, sdrId, contactId: null, companyId: null, campaignId: null, toNumber, fromNumber: "+33100000000", selection: { score: 80 } });
    assert.ok(id, `attempt to ${toNumber} should insert`);
    return id!;
}

/** Brings an attempt to ANSWERED as Twilio would. */
async function answered(id: string, answeredBy = "human") {
    await applyAttemptEvent(db, id, { type: "PLACED", callSid: `CA${id.replace(/-/g, "").slice(0, 32)}`, at: T(0) });
    await applyAttemptEvent(db, id, { type: "PROVIDER_STATUS", status: "ringing", at: T(1) });
    await applyAttemptEvent(db, id, { type: "PROVIDER_STATUS", status: "in-progress", at: T(5) });
    await applyAttemptEvent(db, id, { type: "AMD", answeredBy, at: T(8) });
}

before(async () => {
    pg = new PGlite();
    // The migration also indexes TelephonyCall, created by an earlier migration.
    await pg.exec(`CREATE TABLE "TelephonyCall" ("id" text PRIMARY KEY, "contactId" text, "companyId" text, "startedAt" timestamp);`);
    await pg.exec(MIGRATION);
    await pg.exec(MIGRATION); // idempotent: a re-run must be harmless
});

after(async () => {
    await pg.close();
});

beforeEach(async () => {
    await pg.exec(`DELETE FROM "DialAttempt"; DELETE FROM "DialerSession"; DELETE FROM "DialerEvent";`);
});

// ── the reservation ────────────────────────────────────────────────────────

test("two prospects answer at once: exactly one reaches the SDR", async () => {
    await session("s1", "sdr1");
    const a = await attempt("s1", "+33611111111");
    const b = await attempt("s1", "+33622222222");
    const c = await attempt("s1", "+33633333333");
    const results = await Promise.all([reserveAgent(db, "s1", a), reserveAgent(db, "s1", b), reserveAgent(db, "s1", c)]);
    assert.equal(results.filter(Boolean).length, 1);
    const s = await getSession(db, "s1");
    assert.equal(s?.agentState, "RESERVED");
    assert.equal(s?.reservedAttemptId, [a, b, c][results.indexOf(true)]);
});

test("an SDR who is talking, qualifying, joining or offline can never be reserved", async () => {
    for (const st of ["RESERVED", "ON_CALL", "WRAP_UP", "JOINING", "OFFLINE"]) {
        await pg.exec(`DELETE FROM "DialAttempt"; DELETE FROM "DialerSession";`);
        await session("s1", "sdr1", st);
        const a = await attempt("s1", "+33611111111");
        assert.equal(await reserveAgent(db, "s1", a), false, st);
    }
});

test("an ended session can never be reserved", async () => {
    await session("s1", "sdr1");
    await pg.exec(`UPDATE "DialerSession" SET "status" = 'ENDED'`);
    const a = await attempt("s1", "+33611111111");
    assert.equal(await reserveAgent(db, "s1", a), false);
});

test("releasing the SDR only works for the attempt that holds them", async () => {
    await session("s1", "sdr1");
    const a = await attempt("s1", "+33611111111");
    const b = await attempt("s1", "+33622222222");
    assert.equal(await reserveAgent(db, "s1", a), true);
    assert.equal(await setAgentState(db, "s1", ["RESERVED", "ON_CALL"], "READY", { attemptId: b }), false, "a late handler of B cannot free A's SDR");
    assert.equal(await setAgentState(db, "s1", ["RESERVED"], "ON_CALL", { attemptId: a }), true);
    assert.equal((await getSession(db, "s1"))?.reservedAttemptId, a, "ON_CALL keeps the reservation");
    assert.equal(await setAgentState(db, "s1", ["ON_CALL"], "WRAP_UP", { attemptId: a }), true);
    const s = await getSession(db, "s1");
    assert.equal(s?.agentState, "WRAP_UP");
    assert.equal(s?.reservedAttemptId, null);
    assert.equal(await reserveAgent(db, "s1", b), false, "no reservation while qualifying");
});

// ── database invariants ────────────────────────────────────────────────────

test("a number is never rung twice at once, even from two SDRs", async () => {
    await session("s1", "sdr1");
    await session("s2", "sdr2");
    const a = await attempt("s1", "+33611111111");
    const dup = await insertAttempt(db, { sessionId: "s2", sdrId: "sdr2", contactId: null, companyId: null, campaignId: null, toNumber: "+33611111111", fromNumber: "+33100000001", selection: null });
    assert.equal(dup, null);
    // Once the first attempt ended, the number may be dialled again.
    await applyAttemptEvent(db, a, { type: "PROVIDER_STATUS", status: "no-answer", at: T(30) });
    assert.ok(await insertAttempt(db, { sessionId: "s2", sdrId: "sdr2", contactId: null, companyId: null, campaignId: null, toNumber: "+33611111111", fromNumber: "+33100000001", selection: null }));
});

test("one live session per SDR, enforced by the database", async () => {
    await session("s1", "sdr1");
    await assert.rejects(() => session("s2", "sdr1"), /DialerSession_one_live_per_sdr|duplicate key/);
    await pg.exec(`UPDATE "DialerSession" SET "status" = 'ENDED' WHERE "id" = 's1'`);
    await session("s2", "sdr1"); // a new session after the old one ended is fine
});

// ── provider events ────────────────────────────────────────────────────────

test("duplicate webhook deliveries are recorded once", async () => {
    const first = await recordEvent(db, { dedupeKey: "twilio:CA1:status:3", source: "twilio", type: "status", payload: { CallStatus: "ringing" } });
    const again = await recordEvent(db, { dedupeKey: "twilio:CA1:status:3", source: "twilio", type: "status", payload: { CallStatus: "ringing" } });
    assert.ok(first);
    assert.equal(again, null);
});

test("the same event processed twice concurrently changes the attempt once", async () => {
    await session("s1", "sdr1");
    const a = await attempt("s1", "+33611111111");
    await applyAttemptEvent(db, a, { type: "PLACED", callSid: "CA00000000000000000000000000000001", at: T(0) });
    const e = { type: "PROVIDER_STATUS" as const, status: "ringing" as const, at: T(2) };
    const [x, y] = await Promise.all([applyAttemptEvent(db, a, e), applyAttemptEvent(db, a, e)]);
    assert.equal([x?.changed, y?.changed].filter(Boolean).length, 1);
    assert.equal((await getAttempt(db, a))?.state, "RINGING");
});

test("a late 'ringing' after the call ended changes nothing", async () => {
    await session("s1", "sdr1");
    const a = await attempt("s1", "+33611111111");
    await applyAttemptEvent(db, a, { type: "PROVIDER_STATUS", status: "busy", at: T(3) });
    const late = await applyAttemptEvent(db, a, { type: "PROVIDER_STATUS", status: "ringing", at: T(1) });
    assert.equal(late?.changed, false);
    const row = await getAttempt(db, a);
    assert.equal(row?.state, "ENDED");
    assert.equal(row?.outcome, "BUSY");
});

test("compare-and-set refuses a write computed from a stale state", async () => {
    await session("s1", "sdr1");
    const a = await attempt("s1", "+33611111111");
    assert.equal(await casAttempt(db, a, "RINGING", { state: "ANSWERED" }), false, "row is PENDING, not RINGING");
    assert.equal(await casAttempt(db, a, "PENDING", { state: "DIALING", placedAt: T(0) }), true);
});

test("full happy path: answered → reserved → bridged → hung up is one conversation", async () => {
    await session("s1", "sdr1");
    const a = await attempt("s1", "+33611111111");
    await answered(a, "human");
    assert.equal(await reserveAgent(db, "s1", a), true);
    assert.equal((await applyAttemptEvent(db, a, { type: "RESERVED", at: T(9) }))?.changed, true);
    assert.equal((await applyAttemptEvent(db, a, { type: "BRIDGE_CONFIRMED", at: T(10) }))?.changed, true);
    await applyAttemptEvent(db, a, { type: "PROVIDER_STATUS", status: "completed", at: T(120) });
    const row = await getAttempt(db, a);
    assert.equal(row?.state, "ENDED");
    assert.equal(row?.outcome, "CONVERSATION");
    assert.ok(row?.bridgedAt && row.answeredAt && row.bridgedAt.getTime() - row.answeredAt.getTime() === 5000, "answer-to-bridge latency is measurable");
});

// ── counters ───────────────────────────────────────────────────────────────

test("org live lines, recent abandon stats and per-number volume", async () => {
    await session("s1", "sdr1");
    const live = await attempt("s1", "+33611111111");
    const conv = await attempt("s1", "+33622222222");
    const aband = await attempt("s1", "+33633333333");
    const nra = await attempt("s1", "+33644444444");
    await answered(conv);
    await applyAttemptEvent(db, conv, { type: "RESERVED", at: T(9) });
    await applyAttemptEvent(db, conv, { type: "BRIDGE_CONFIRMED", at: T(10) });
    await applyAttemptEvent(db, conv, { type: "PROVIDER_STATUS", status: "completed", at: T(60) });
    await answered(aband);
    await applyAttemptEvent(db, aband, { type: "RELEASE", outcome: "ABANDONED", at: T(9) });
    await applyAttemptEvent(db, nra, { type: "PROVIDER_STATUS", status: "no-answer", at: T(30) });

    assert.equal(await orgLiveLines(db), 1);
    assert.deepEqual(await recentStats(db, "sdr1", 50), { attempts: 3, humanAnswers: 2, abandoned: 1 });
    assert.equal(await dialsFromNumberSince(db, "+33100000000", new Date(Date.now() - 3600_000)), 4);
    assert.equal((await liveAttempts(db, "s1")).map((r) => r.id).join(), live);
});
