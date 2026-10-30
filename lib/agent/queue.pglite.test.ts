/**
 * The queue SQL executed for real on an in-process Postgres (PGlite): the
 * migration applied twice (idempotent), the single-statement claim with its
 * per-job and per-folder exclusions, heartbeat, the reaper and the scheduler.
 *     npm run test:agent
 *
 * What PGlite cannot prove: two sessions racing on FOR UPDATE SKIP LOCKED
 * through the Supabase transaction pooler (one manual check in production).
 */

// PGlite parses `timestamp` (no zone) columns in the process zone; Prisma reads
// them as UTC. Pin the zone so both agree and the assertions are exact.
process.env.TZ = "UTC";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Prisma } from "@prisma/client";

import { claimRun, enqueueRun, heartbeat, queueStats, reapStale, scheduleDueJobs, scheduledDedupeKey, type SqlDb } from "./queue";

let pg: PGlite;

/** Prisma.Sql → PGlite: $1 placeholders are shared, dates travel as naive UTC. */
const db: SqlDb = {
    async $queryRaw<T>(sql: Prisma.Sql): Promise<T> {
        const values = sql.values.map((v) => (v instanceof Date ? v.toISOString().replace("Z", "") : v));
        return (await pg.query(sql.text, values)).rows as T;
    },
};

const T0 = new Date("2026-10-29T10:00:00.000Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);

const MIGRATION = readFileSync(join(process.cwd(), "prisma/migrations/20261101120000_add_agent_jobs/migration.sql"), "utf8");

async function status(id: string) {
    const rows = (await pg.query<{ status: string; lockedBy: string | null; attempts: number; runAfter: Date }>(`SELECT "status", "lockedBy", "attempts", "runAfter" FROM "AgentRun" WHERE id = $1`, [id])).rows;
    return rows[0];
}

before(async () => {
    pg = new PGlite();
    await pg.exec(MIGRATION);
    await pg.exec(MIGRATION); // idempotent: a re-run must be harmless
    await pg.exec(`
        INSERT INTO "AgentJob" ("id","kind","playbook","name","schedule","timezone","createdById","createdAt","updatedAt")
        VALUES ('job1','WATCH','watch.client_at_risk','Clients à risque','0 11 * * 1-5','Europe/Paris','mgr1',now(),now()),
               ('job2','WATCH','watch.sdr_under_pace','Rythme SDR','0 11,15 * * 1-5','Europe/Paris',NULL,now(),now());
    `);
});

after(async () => {
    await pg.close();
});

test("enqueue dedupes on the key", async () => {
    const a = await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "mgr1", dedupeKey: "k1" }, T0, db);
    const b = await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "mgr1", dedupeKey: "k1" }, T0, db);
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(b.id, null);
    await pg.query(`DELETE FROM "AgentRun" WHERE id = $1`, [a.id]);
});

test("two claimers get different runs; the budget JSON round-trips", async () => {
    const r1 = await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "mgr1", budget: { maxCostEur: 0.25 } }, at(0), db);
    const r2 = await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "mgr1" }, at(1), db);
    const [c1, c2] = await Promise.all([claimRun("w1", at(5), {}, db), claimRun("w2", at(5), {}, db)]);
    assert.ok(c1 && c2);
    assert.notEqual(c1.id, c2.id);
    assert.deepEqual(new Set([c1.id, c2.id]), new Set([r1.id, r2.id]));
    const first = c1.id === r1.id ? c1 : c2;
    assert.equal(first.budget.maxCostEur, 0.25);
    assert.equal(first.budget.deadlineMs, 240_000);
    assert.equal(first.status, "RUNNING");
    assert.equal(first.attempts, 1);
    assert.equal(first.mode, "worker");
    assert.ok(first.startedAt instanceof Date);
    assert.equal(await claimRun("w3", at(6), {}, db), null);
    await pg.exec(`DELETE FROM "AgentRun"`);
});

test("FIFO by priority then runAfter; a run in the future is not claimable", async () => {
    const low = await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "m", runAfter: at(0) }, at(0), db);
    const high = await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "m", runAfter: at(1), priority: 5 }, at(0), db);
    await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "m", runAfter: at(3600) }, at(0), db);
    assert.equal((await claimRun("w", at(10), {}, db))?.id, high.id);
    assert.equal((await claimRun("w", at(10), {}, db))?.id, low.id);
    assert.equal(await claimRun("w", at(10), {}, db), null);
    await pg.exec(`DELETE FROM "AgentRun"`);
});

test("never two running runs of the same job, nor on the same folder", async () => {
    const a = await enqueueRun({ jobId: "job1", kind: "WATCH", playbook: "p", trigger: "SCHEDULE", actorId: "m", runAfter: at(0) }, at(0), db);
    const b = await enqueueRun({ jobId: "job1", kind: "WATCH", playbook: "p", trigger: "SCHEDULE", actorId: "m", runAfter: at(1) }, at(0), db);
    const f1 = await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "m", folderId: "fold", runAfter: at(2) }, at(0), db);
    const f2 = await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "m", folderId: "fold", runAfter: at(3) }, at(0), db);
    const free = await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "m", runAfter: at(4) }, at(0), db);

    assert.equal((await claimRun("w1", at(10), {}, db))?.id, a.id);
    assert.equal((await claimRun("w2", at(10), {}, db))?.id, f1.id); // b skipped: job1 is running
    assert.equal((await claimRun("w3", at(10), {}, db))?.id, free.id); // f2 skipped: folder busy
    assert.equal(await claimRun("w4", at(10), {}, db), null);

    // the job's run finishes → its sibling becomes claimable
    await pg.query(`UPDATE "AgentRun" SET "status" = 'DONE' WHERE id = $1`, [a.id]);
    assert.equal((await claimRun("w4", at(11), {}, db))?.id, b.id);
    await pg.query(`UPDATE "AgentRun" SET "status" = 'DONE' WHERE id = $1`, [f1.id]);
    assert.equal((await claimRun("w5", at(12), {}, db))?.id, f2.id);
    await pg.exec(`DELETE FROM "AgentRun"`);
});

test("kind filter (lite mode) and cancel request", async () => {
    const report = await enqueueRun({ kind: "REPORT", playbook: "r", trigger: "MANUAL", actorId: "m", runAfter: at(0) }, at(0), db);
    const watch = await enqueueRun({ kind: "WATCH", playbook: "w", trigger: "MANUAL", actorId: "m", runAfter: at(1) }, at(0), db);
    const cancelled = await enqueueRun({ kind: "WATCH", playbook: "w", trigger: "MANUAL", actorId: "m", runAfter: at(0) }, at(0), db);
    await pg.query(`UPDATE "AgentRun" SET "cancelRequestedAt" = now() WHERE id = $1`, [cancelled.id]);
    const c = await claimRun("lite", at(10), { kinds: ["WATCH"], mode: "lite" }, db);
    assert.equal(c?.id, watch.id);
    assert.equal(c?.mode, "lite");
    assert.equal((await claimRun("w", at(10), {}, db))?.id, report.id);
    assert.equal(await claimRun("w", at(10), {}, db), null);
    await pg.exec(`DELETE FROM "AgentRun"`);
});

test("heartbeat only for the owner of a running run", async () => {
    const r = await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "m" }, at(0), db);
    await claimRun("w1", at(1), {}, db);
    assert.equal(await heartbeat(r.id!, "w1", at(20), db), true);
    assert.equal(await heartbeat(r.id!, "w2", at(20), db), false);
    await pg.query(`UPDATE "AgentRun" SET "status" = 'DONE' WHERE id = $1`, [r.id]);
    assert.equal(await heartbeat(r.id!, "w1", at(21), db), false);
    await pg.exec(`DELETE FROM "AgentRun"`);
});

test("reaper: stale heartbeat → requeued with backoff while attempts remain, then FAILED", async () => {
    const r = await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "m", maxAttempts: 2 }, at(0), db);
    const fresh = await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "m" }, at(0), db);
    await claimRun("w1", at(1), {}, db); // r (older runAfter)
    await claimRun("w2", at(1), {}, db); // fresh

    // 1 minute later: nothing is stale
    await heartbeat(fresh.id!, "w2", at(60), db);
    let reaped = await reapStale(at(61), 120_000, db);
    assert.deepEqual(reaped, { requeued: [], failed: [] });

    // 3 minutes later: r is stale (attempt 1 of 2) → QUEUED, runAfter = now + 60 s
    await heartbeat(fresh.id!, "w2", at(180), db);
    reaped = await reapStale(at(181), 120_000, db);
    assert.deepEqual(reaped, { requeued: [r.id], failed: [] });
    let s = await status(r.id!);
    assert.equal(s.status, "QUEUED");
    assert.equal(s.lockedBy, null);
    assert.equal(new Date(s.runAfter).getTime(), at(181 + 60).getTime());

    // not claimable before the backoff, claimable after
    assert.equal(await claimRun("w3", at(200), {}, db), null);
    const again = await claimRun("w3", at(242), {}, db);
    assert.equal(again?.id, r.id);
    assert.equal(again?.attempts, 2);

    // stale again: attempts == maxAttempts → FAILED
    await heartbeat(fresh.id!, "w2", at(400), db);
    reaped = await reapStale(at(401), 120_000, db);
    assert.deepEqual(reaped, { requeued: [], failed: [r.id] });
    s = await status(r.id!);
    assert.equal(s.status, "FAILED");
    assert.equal((await status(fresh.id!)).status, "RUNNING");
    await pg.exec(`DELETE FROM "AgentRun"`);
});

test("scheduler: first pass initialises nextRunAt, due jobs get one deduped run, missed ticks do not pile up", async () => {
    // Thursday 29 Oct 2026 10:00Z = 11:00 Paris (CET). job1 fires 11:00 weekdays, job2 11:00 and 15:00.
    const first = await scheduleDueJobs({ now: at(-3600), defaultActorId: "mgr0" }, db);
    assert.deepEqual(first.initialised.sort(), ["job1", "job2"]);
    assert.equal(first.scheduled.length, 0);
    const jobs = (await pg.query<{ id: string; nextRunAt: Date }>(`SELECT id, "nextRunAt" FROM "AgentJob" ORDER BY id`)).rows;
    assert.equal(new Date(jobs[0].nextRunAt).toISOString(), "2026-10-29T10:00:00.000Z");

    // before 11:00: nothing due
    const early = await scheduleDueJobs({ now: at(-1), defaultActorId: "mgr0" }, db);
    assert.equal(early.scheduled.length, 0);

    // 11:00:30 (and again at 11:05:30: the same run, not a second one)
    const due = await scheduleDueJobs({ now: at(30), defaultActorId: "mgr0" }, db);
    assert.equal(due.scheduled.length, 2);
    assert.ok(due.scheduled.every((s) => s.created));
    const runs = (await pg.query<{ jobId: string; actorId: string; dedupeKey: string; status: string }>(`SELECT "jobId", "actorId", "dedupeKey", "status" FROM "AgentRun" ORDER BY "jobId"`)).rows;
    assert.equal(runs.length, 2);
    assert.equal(runs[0].actorId, "mgr1"); // the job's creator
    assert.equal(runs[1].actorId, "mgr0"); // default actor when the job has none
    assert.equal(runs[0].dedupeKey, scheduledDedupeKey("job1", new Date("2026-10-29T10:00:00.000Z")));

    const after2 = (await pg.query<{ id: string; nextRunAt: Date }>(`SELECT id, "nextRunAt" FROM "AgentJob" ORDER BY id`)).rows;
    assert.equal(new Date(after2[0].nextRunAt).toISOString(), "2026-10-30T10:00:00.000Z"); // Friday 11:00
    assert.equal(new Date(after2[1].nextRunAt).toISOString(), "2026-10-29T14:00:00.000Z"); // today 15:00

    const same = await scheduleDueJobs({ now: at(330), defaultActorId: "mgr0" }, db);
    assert.equal(same.scheduled.length, 0);

    // the worker was down for a week: one catch-up run per job, nextRunAt in the future
    const late = await scheduleDueJobs({ now: new Date("2026-11-05T09:00:00.000Z"), defaultActorId: "mgr0" }, db);
    assert.equal(late.scheduled.length, 2);
    const count = Number((await pg.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM "AgentRun"`)).rows[0].n);
    assert.equal(count, 4);
    const after3 = (await pg.query<{ nextRunAt: Date }>(`SELECT "nextRunAt" FROM "AgentJob" WHERE id = 'job1'`)).rows;
    assert.equal(new Date(after3[0].nextRunAt).toISOString(), "2026-11-05T10:00:00.000Z");

    // a job without creator and no default actor: skipped, not crashed; a bad schedule is reported
    await pg.exec(`INSERT INTO "AgentJob" ("id","kind","playbook","name","schedule","nextRunAt","createdAt","updatedAt") VALUES ('job3','WATCH','p','x','not a cron',now() - interval '1 hour',now(),now())`);
    await pg.query(`UPDATE "AgentJob" SET "nextRunAt" = $1 WHERE id = 'job2'`, ["2026-11-05 09:30:00"]);
    const res = await scheduleDueJobs({ now: new Date("2026-11-05T09:31:00.000Z"), defaultActorId: null }, db);
    assert.deepEqual(res.invalid, ["job3"]);
    assert.deepEqual(res.scheduled, [{ jobId: "job2", runId: null, created: false }]);
    await pg.exec(`DELETE FROM "AgentRun"; DELETE FROM "AgentJob" WHERE id = 'job3'`);
});

test("queue stats", async () => {
    await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "m", runAfter: at(-100) }, at(-100), db);
    const r = await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "m", runAfter: at(-50) }, at(-50), db);
    await claimRun("w", at(0), {}, db);
    await pg.query(`UPDATE "AgentRun" SET "status" = 'FAILED', "finishedAt" = $1 WHERE id = $2`, [at(-10).toISOString().replace("Z", ""), r.id]);
    const s = await queueStats(at(0), db);
    assert.equal(s.queued, 0);
    assert.equal(s.running, 1);
    assert.equal(s.failed24h, 1);
    assert.equal(s.oldestQueuedAgeS, null);
    await enqueueRun({ kind: "WATCH", playbook: "p", trigger: "MANUAL", actorId: "m", runAfter: at(-30) }, at(-30), db);
    const s2 = await queueStats(at(0), db);
    assert.equal(s2.queued, 1);
    assert.equal(s2.oldestQueuedAgeS, 30);
    await pg.exec(`DELETE FROM "AgentRun"`);
});
