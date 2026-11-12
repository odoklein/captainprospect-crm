/**
 * The qualification loaders' SQL executed for real on an in-process Postgres
 * (PGlite), with just the columns they read.
 *     npx tsx --test lib/qualification/queue.pglite.test.ts
 */

process.env.TZ = "UTC";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Prisma } from "@prisma/client";
import { applySmartOrder, attemptStats, loadAttempts, loadSignals, type SqlDb } from "./queue";
import type { QualificationView } from "./types";

let pg: PGlite;
const db: SqlDb = {
    async $queryRaw<T>(sql: Prisma.Sql): Promise<T> {
        const values = sql.values.map((v) => (v instanceof Date ? v.toISOString().replace("Z", "") : v));
        return (await pg.query(sql.text, values)).rows as T;
    },
};

const SUMMARY = {
    summary: "Le prospect cherche un nouveau CRM.",
    keyPoints: [], objections: [], nextSteps: [],
    qualification: { need: "Nouveau CRM", currentSolution: null, timing: null, decisionMaker: null, budget: null },
    suggestedStatus: null,
};

before(async () => {
    pg = new PGlite();
    await pg.exec(`
        CREATE TABLE "Action" ("id" text PRIMARY KEY, "contactId" text, "companyId" text, "channel" text, "result" text, "createdAt" timestamp);
        CREATE TABLE "TelephonyCall" ("id" text PRIMARY KEY, "contactId" text, "companyId" text, "startedAt" timestamp, "aiSummaryStatus" text, "aiSummary" jsonb);

        INSERT INTO "Action" VALUES
          ('a1','c1',NULL,'CALL','NO_RESPONSE','2026-11-01 10:00'),
          ('a2','c1',NULL,'CALL','NO_RESPONSE','2026-11-02 10:00'),
          ('a3','c1',NULL,'CALL','INTERESTED','2026-11-03 10:00'),
          ('a4','c1',NULL,'CALL','NO_RESPONSE','2026-11-04 10:00'),
          ('a5','c1',NULL,'CALL','BARRAGE_SECRETAIRE','2026-11-05 10:00'),
          ('a6','c1',NULL,'EMAIL','MAIL_ENVOYE','2026-11-06 10:00'),
          ('a7',NULL,'co1','CALL','NO_RESPONSE','2026-11-01 10:00'),
          ('a8','c2','co1','CALL','NO_RESPONSE','2026-11-01 10:00');

        INSERT INTO "TelephonyCall" VALUES
          ('t1','c1',NULL,'2026-11-01 09:00','done',  '${JSON.stringify({ ...SUMMARY, summary: "ancien" })}'),
          ('t2','c1',NULL,'2026-11-05 09:00','done',  '${JSON.stringify(SUMMARY)}'),
          ('t3','c1',NULL,'2026-11-07 09:00','failed',NULL),
          ('t4','c3',NULL,'2026-11-05 09:00','pending',NULL),
          ('t5',NULL,'co1','2026-11-05 09:00','done', '${JSON.stringify(SUMMARY)}');
    `);
});

after(async () => {
    await pg.close();
});

test("attempts: newest first, CALL only, contact rows never mix with company-only rows", async () => {
    const map = await loadAttempts(["c1", "c2"], ["co1"], db);
    assert.deepEqual(map.get("c1"), ["BARRAGE_SECRETAIRE", "NO_RESPONSE", "INTERESTED", "NO_RESPONSE", "NO_RESPONSE"]);
    // The company-only row sees the action logged on the company itself, not the one logged on contact c2.
    assert.deepEqual(map.get("co1"), ["NO_RESPONSE"]);
    assert.deepEqual(map.get("c2"), ["NO_RESPONSE"]);
});

test("attempts: no ids, no query", async () => {
    assert.equal((await loadAttempts([], [], db)).size, 0);
});

test("no-answer streak stops at the first real conversation", () => {
    assert.deepEqual(attemptStats(["BARRAGE_SECRETAIRE", "NO_RESPONSE", "INTERESTED", "NO_RESPONSE"]), { total: 4, consecutiveNoAnswer: 2 });
    assert.deepEqual(attemptStats([]), { total: 0, consecutiveNoAnswer: 0 });
    assert.deepEqual(attemptStats(["INTERESTED", "NO_RESPONSE"]), { total: 2, consecutiveNoAnswer: 0 });
});

test("signals: the latest DONE summary wins; failed and pending calls are ignored", async () => {
    const map = await loadSignals(["c1", "c3"], ["co1"], db);
    assert.equal(map.get("c1")?.callId, "t2");
    assert.equal(map.get("c1")?.need, "Nouveau CRM");
    assert.equal(map.has("c3"), false);
    assert.equal(map.get("co1")?.callId, "t5");
});

test("legacy summaries load with no confidence, so they can never weigh on a score", async () => {
    const s = (await loadSignals(["c1"], [], db)).get("c1");
    assert.equal(s?.confidence, null);
    assert.deepEqual(s?.evidence, []);
});

test("smart order: score desc, legacy order breaks ties, unscored rows last", () => {
    const rows = ["a", "b", "c", "d"] as const;
    const view = (score: number) => ({ score }) as QualificationView;
    const views = new Map<string, QualificationView>([["a", view(50)], ["b", view(80)], ["c", view(50)]]);
    assert.deepEqual(applySmartOrder([...rows], views), ["b", "a", "c", "d"]);
    assert.deepEqual(applySmartOrder([...rows], new Map()), [...rows], "no qualification = legacy order untouched");
});
