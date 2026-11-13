/** The manager metrics SQL on a real Postgres (PGlite) with the actual migration. */
process.env.TZ = "UTC";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { Prisma } from "@prisma/client";
import { salesEngineMetrics, type SqlDb } from "./metrics";

let pg: PGlite;
const db: SqlDb = {
    async $queryRaw<T>(sql: Prisma.Sql): Promise<T> {
        const values = sql.values.map((v) => (v instanceof Date ? v.toISOString().replace("Z", "") : v));
        return (await pg.query(sql.text, values)).rows as T;
    },
};
const NOW = new Date("2026-11-12T15:00:00.000Z");

before(async () => {
    pg = new PGlite();
    await pg.exec(`
        CREATE TABLE "User" ("id" text PRIMARY KEY, "name" text);
        CREATE TABLE "Action" ("id" text PRIMARY KEY, "result" text);
        CREATE TABLE "TelephonyCall" ("id" text PRIMARY KEY, "contactId" text, "companyId" text, "startedAt" timestamp, "actionId" text, "aiSummaryStatus" text, "aiSummary" jsonb);
    `);
    await pg.exec(readFileSync(join(process.cwd(), "prisma/migrations/20261112100000_add_sales_execution_engine/migration.sql"), "utf8"));
    await pg.exec(`
        INSERT INTO "User" VALUES ('sdr1','Léa');
        INSERT INTO "DialerSession" ("id","sdrId","conferenceName","maxLines","status","updatedAt") VALUES ('s1','sdr1','c1',2,'ENDED',now());
        INSERT INTO "DialAttempt" ("id","sessionId","sdrId","toNumber","fromNumber","state","outcome","createdAt","answeredAt","bridgedAt") VALUES
          ('a1','s1','sdr1','+1','+331','ENDED','CONVERSATION','2026-11-12 10:00','2026-11-12 10:00:05','2026-11-12 10:00:07'),
          ('a2','s1','sdr1','+2','+331','ENDED','CONVERSATION','2026-11-12 10:05','2026-11-12 10:05:05','2026-11-12 10:05:09'),
          ('a3','s1','sdr1','+3','+331','ENDED','ABANDONED','2026-11-12 10:10','2026-11-12 10:10:05',NULL),
          ('a4','s1','sdr1','+4','+331','ENDED','VOICEMAIL','2026-11-12 10:15','2026-11-12 10:15:05',NULL),
          ('a5','s1','sdr1','+5','+331','ENDED','NO_ANSWER','2026-11-12 10:20',NULL,NULL),
          ('old','s1','sdr1','+6','+331','ENDED','CONVERSATION','2026-10-01 10:00',NULL,NULL);
        INSERT INTO "Action" VALUES ('act1','NO_RESPONSE'),('act2','INTERESTED');
        INSERT INTO "TelephonyCall" VALUES
          ('t1',NULL,NULL,'2026-11-12 09:00','act1','done','{"suggestedStatus":"NO_RESPONSE"}'),
          ('t2',NULL,NULL,'2026-11-12 09:30','act2','done','{"suggestedStatus":"CALLBACK_REQUESTED"}'),
          ('t3',NULL,NULL,'2026-11-12 09:40',NULL,'done','{"suggestedStatus":"INTERESTED"}');
        INSERT INTO "PostCallProposal" ("id","key","callId","sdrId","kind","status","mode","source","title","payload","evidence","decidedBy","updatedAt","createdAt") VALUES
          ('p1','k1','t1','sdr1','CREATE_TASK','APPLIED','auto','ai','x','{}','[]','auto',now(),'2026-11-12 09:00'),
          ('p2','k2','t1','sdr1','CREATE_TASK','APPLIED','suggest','ai','x','{}','[]','sdr1',now(),'2026-11-12 09:00'),
          ('p3','k3','t2','sdr1','CREATE_TASK','DISMISSED','suggest','ai','x','{}','[]','sdr1',now(),'2026-11-12 09:00');
        INSERT INTO "DialerEvent" ("id","dedupeKey","source","type","payload","tries","error","receivedAt") VALUES
          ('e1','d1','twilio','status','{}',2,'boom','2026-11-12 09:00'),
          ('e2','d2','twilio','status','{}',5,'boom','2026-11-12 09:00'),
          ('e3','d3','twilio','status','{}',1,NULL,'2026-11-12 09:00');
    `);
});
after(async () => { await pg.close(); });

test("dialing, AI accuracy, proposals and dead letters are counted from the source tables", async () => {
    const m = await salesEngineMetrics(7, db, NOW);
    assert.deepEqual(
        { ...m.dialing, medianBridgeSec: m.dialing.medianBridgeSec },
        { attempts: 5, humanAnswers: 3, conversations: 2, voicemails: 1, abandoned: 1, abandonRate: 1 / 3, medianBridgeSec: 3, p90BridgeSec: 3.8, failed: 0 },
    );
    assert.deepEqual(m.bySdr, [{ sdrId: "sdr1", name: "Léa", attempts: 5, conversations: 2, abandoned: 1 }]);
    assert.deepEqual(m.ai.judged, 2, "only calls the SDR qualified are judged");
    assert.equal(m.ai.kept, 1);
    assert.deepEqual(m.ai.proposals, [{ kind: "CREATE_TASK", applied: 1, auto: 1, dismissed: 1, failed: 0 }]);
    assert.deepEqual(m.events, { failing: 1, parked: 1 });
});
