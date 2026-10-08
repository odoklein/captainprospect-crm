/**
 * The raw SQL of /leads and /reports, executed for real on an in-process
 * Postgres (PGlite) with a two-tenant fixture — the part the recording-fake
 * tests cannot prove (syntax, joins, DISTINCT ON, timezone bucketing, keyset
 * pagination, tenant isolation).
 *     npm run test:api-v1
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

import { READ_SCOPES } from "./scopes";
import { parseInput } from "./input";
import { searchLeads, getLead, searchLeadsParams } from "./services/leads";
import { getSalesReport, salesReportParams } from "./services/reports";
import { listStats } from "./services/lists";
import { getDataQuality, dataQualityParams } from "./services/insights";
import type { Ctx } from "./serializers";

let pg: PGlite;

/** db stand-in: raw SQL runs on PGlite, Prisma model calls return nothing. */
function db() {
  const empty: Record<string, unknown> = { findMany: [], findFirst: null, findUnique: null, groupBy: [], count: 0 };
  return new Proxy({}, {
    get: (_t, model: string) => {
      if (model === "$queryRaw") {
        return async (sql: { text: string; values: unknown[] }) => {
          const values = sql.values.map((v) => (v instanceof Date ? v.toISOString().replace("Z", "") : v));
          return (await pg.query(sql.text, values)).rows;
        };
      }
      return new Proxy({}, { get: (_u, method: string) => async () => empty[method] });
    },
  }) as any;
}

const ctx = (clientId: string, missionId: string | null = null): Ctx => ({
  p: { keyId: "k", keyName: "t", clientId, allClients: false, missionId, scopes: [...READ_SCOPES], issuedById: "m" },
  db: db(),
});

before(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE "Client"   (id text PRIMARY KEY, name text);
    CREATE TABLE "Mission"  (id text PRIMARY KEY, "clientId" text, name text);
    CREATE TABLE "Campaign" (id text PRIMARY KEY, "missionId" text);
    CREATE TABLE "List"     (id text PRIMARY KEY, "missionId" text);
    CREATE TABLE "Company"  (id text PRIMARY KEY, "listId" text, name text);
    CREATE TABLE "Contact"  (id text PRIMARY KEY, "companyId" text, "firstName" text, "lastName" text, title text, "excludedAt" timestamp);
    CREATE TABLE "User"     (id text PRIMARY KEY, name text);
    CREATE TABLE "Action"   (id text PRIMARY KEY, "contactId" text, "companyId" text, "campaignId" text, "sdrId" text,
                             channel text, result text, "callbackDate" timestamp, "createdAt" timestamp);
    INSERT INTO "Client" VALUES ('tenant-A','Client A'), ('tenant-B','Client B');
    INSERT INTO "Mission" VALUES ('mA','tenant-A','Mission A'), ('mA2','tenant-A','Mission A2'), ('mB','tenant-B','Mission B');
    INSERT INTO "Campaign" VALUES ('cpA','mA'), ('cpA2','mA2'), ('cpB','mB');
    INSERT INTO "List" VALUES ('lA','mA'), ('lA2','mA2'), ('lB','mB');
    INSERT INTO "Company" VALUES ('coA1','lA','Acme'), ('coA2','lA','Beta'), ('coA3','lA2','Gamma'), ('coB1','lB','Secret Corp');
    INSERT INTO "Contact" VALUES
      ('c1','coA1','Alice','Martin','DG',NULL), ('c2','coA2','Bob','Durand',NULL,NULL), ('c3','coA3','Chloe','Petit',NULL,NULL),
      ('c4','coA1','Dan','Noir',NULL,'2026-09-01'), ('cB','coB1','Eve','Foreign',NULL,NULL);
    INSERT INTO "Company" VALUES ('coA4','lA',' ACME  ');
    ALTER TABLE "Contact" ADD COLUMN email text;
    UPDATE "Contact" SET email = 'a@x.fr' WHERE id IN ('c1','c4');
    UPDATE "Contact" SET email = 'b@x.fr' WHERE id = 'c2';
    INSERT INTO "User" VALUES ('u1','Marie'), ('u2','Julien');
    INSERT INTO "Action" VALUES
      -- c1: 3 unanswered calls (no meeting)
      ('a1','c1','coA1','cpA','u1','CALL','NO_RESPONSE',NULL,'2026-10-01 08:00'),
      ('a2','c1','coA1','cpA','u1','CALL','NO_RESPONSE',NULL,'2026-10-02 08:00'),
      ('a3','c1','coA1','cpA','u2','CALL','NO_RESPONSE',NULL,'2026-10-03 08:00'),
      -- c2: one call, to follow up, callback due 5 Oct
      ('a4','c2','coA2','cpA','u1','CALL','RAPPEL','2026-10-05 09:00','2026-10-04 10:00'),
      -- c3: meeting booked (other mission of the same tenant); call at 23:30 UTC on 30 Sep = 1 Oct 01:30 Paris
      ('a5','c3',NULL,'cpA2','u2','CALL','MEETING_BOOKED','2026-10-12 10:00','2026-09-30 23:30'),
      -- c4: excluded contact, one call
      ('a6','c4','coA1','cpA','u1','CALL','FAUX_NUMERO',NULL,'2026-10-06 10:00'),
      -- an email touch on c2 (not a call)
      ('a7','c2','coA2','cpA','u1','EMAIL','MAIL_ENVOYE',NULL,'2026-10-04 11:00'),
      -- the other tenant: must never appear
      ('b1','cB','coB1','cpB','u1','CALL','MEETING_BOOKED','2026-10-10 10:00','2026-10-02 08:00'),
      ('b2','cB','coB1','cpB','u1','CALL','NO_RESPONSE',NULL,'2026-10-03 08:00');
  `);
});

after(async () => { await pg.close(); });

test("sql /leads: only the tenant's worked contacts, with stage, counts and the right last action", async () => {
  const page = await searchLeads(ctx("tenant-A"), parseInput(searchLeadsParams, {}));
  const ids = page.items.map((l) => l.id).sort();
  assert.deepEqual(ids, ["c1", "c2", "c3", "c4"]);
  assert.ok(!JSON.stringify(page).includes("Secret Corp") && !ids.includes("cB"), "tenant B leaked");

  const byId = Object.fromEntries(page.items.map((l) => [l.id, l]));
  assert.equal(byId.c1.call_count, 3);
  assert.equal(byId.c1.stage, "contacted");
  assert.equal(byId.c1.last_worked_by?.name, "Julien");
  assert.equal(byId.c2.stage, "to_follow_up");
  assert.equal(byId.c2.call_count, 1, "the email touch is not a call");
  assert.equal(byId.c2.action_count, 2);
  assert.ok(byId.c2.next_callback_at?.startsWith("2026-10-05"));
  assert.equal(byId.c3.stage, "meeting_booked");
  assert.equal(byId.c3.appointment_count, 1);
  assert.equal(byId.c4.do_not_contact, true);
});

test("sql /leads: filters — called 2+ times without RDV, callbacks due, stage, search, mission", async () => {
  const run = async (q: Record<string, string>, ctxArg = ctx("tenant-A")) => (await searchLeads(ctxArg, parseInput(searchLeadsParams, q))).items.map((l) => l.id).sort();
  assert.deepEqual(await run({ min_calls: "2", no_appointment: "true" }), ["c1"]);
  assert.deepEqual(await run({ status: "to_follow_up", callback_due_before: "2026-10-05" }), ["c2"]);
  assert.deepEqual(await run({ status: "to_follow_up", callback_due_before: "2026-10-04" }), []);
  assert.deepEqual(await run({ status: "meeting_booked" }), ["c3"]);
  assert.deepEqual(await run({ query: "acme" }), ["c1", "c4"]);
  assert.deepEqual(await run({ query: "100%" }), [], "LIKE wildcards are escaped");
  assert.deepEqual(await run({ mission_id: "mA2" }), ["c3"]);
  assert.deepEqual(await run({ date_from: "2026-10-05" }), ["c4"]);
  assert.deepEqual(await run({ assigned_to: "u2" }), ["c1", "c3"]);
  // a key narrowed to one mission only sees that mission
  assert.deepEqual(await run({}, ctx("tenant-A", "mA2")), ["c3"]);
  // asking for the other tenant's mission yields nothing, not their data
  assert.deepEqual(await run({ mission_id: "mB" }), []);
});

test("sql /leads: keyset pagination walks the whole set without gaps or repeats", async () => {
  const seen: string[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 6; i++) {
    const page = await searchLeads(ctx("tenant-A"), parseInput(searchLeadsParams, { limit: "1", ...(cursor ? { cursor } : {}) }));
    seen.push(...page.items.map((l) => l.id));
    if (!page.next_cursor) break;
    cursor = page.next_cursor;
  }
  assert.equal(seen.length, 4);
  assert.equal(new Set(seen).size, 4);
});

test("sql /leads/:id: one lead, 404 for a foreign or unknown contact", async () => {
  assert.equal((await getLead(ctx("tenant-A"), "c1")).call_count, 3);
  await assert.rejects(getLead(ctx("tenant-A"), "cB"), (e: any) => e.status === 404);
  await assert.rejects(getLead(ctx("tenant-B"), "c1"), (e: any) => e.status === 404);
  assert.equal((await getLead(ctx("tenant-B"), "cB")).company.name, "Secret Corp");
});

test("sql /reports: distinct contacts and companies phoned, per-day series in Paris time, tenant isolated", async () => {
  const r: any = await getSalesReport(ctx("tenant-A"), parseInput(salesReportParams, { date_from: "2026-09-30T00:00:00Z", date_to: "2026-10-31" }));
  // calls on c1 (x3), c2, c3 (companyId NULL -> via contact), c4 = 4 contacts / 4 companies (coA1 shared by c1+c4 => 3)
  assert.equal(r.unique_called.contacts, 4);
  assert.equal(r.unique_called.companies, 3);
  const days = Object.fromEntries(r.series.points.map((p: any) => [p.bucket, p]));
  // 30 Sep 23:30 UTC is 1 Oct 01:30 in Paris: it belongs to 1 Oct, not 30 Sep
  assert.equal(days["2026-10-01"].calls, 2);
  assert.equal(days["2026-09-30"], undefined);
  assert.equal(days["2026-10-01"].appointments, 1);
  assert.equal(days["2026-10-03"].contacts, 1);
});

test("sql /reports: the other tenant's activity never counts", async () => {
  const a: any = await getSalesReport(ctx("tenant-A"), parseInput(salesReportParams, { date_from: "2026-10-01", date_to: "2026-10-31" }));
  const b: any = await getSalesReport(ctx("tenant-B"), parseInput(salesReportParams, { date_from: "2026-10-01", date_to: "2026-10-31" }));
  assert.equal(b.unique_called.contacts, 1);
  assert.equal(b.unique_called.companies, 1);
  assert.ok(a.unique_called.contacts >= 3 && !JSON.stringify(a).includes('"cB"'));
  const mission: any = await getSalesReport(ctx("tenant-A", "mA2"), parseInput(salesReportParams, { date_from: "2026-09-01", date_to: "2026-10-31" }));
  assert.equal(mission.unique_called.contacts, 1);
  const filtered: any = await getSalesReport(ctx("tenant-A"), parseInput(salesReportParams, { date_from: "2026-09-01", date_to: "2026-10-31", mission_id: "mB" }));
  assert.equal(filtered.unique_called.contacts, 0, "asking for tenant B's mission returns nothing");
});

test("sql lists: size, coverage, calls and meetings per list, tenant isolated", async () => {
  const stats = await listStats(ctx("tenant-A"), ["lA", "lA2", "lB"]);
  const lA = stats.get("lA")!;
  assert.equal(lA.companies, 3); // Acme, Beta and the ' ACME ' duplicate
  assert.equal(lA.contacts, 3); // c1, c2, c4
  assert.equal(lA.contacts_worked, 3);
  assert.equal(lA.calls, 5); // a1-a4 + a6 (the email a7 is not a call)
  assert.equal(lA.meetings, 0);
  assert.equal(stats.get("lA2")!.meetings, 1);
  assert.equal(stats.has("lB"), false, "another tenant's list is invisible");
  assert.equal((await listStats(ctx("tenant-A", "mA2"), ["lA", "lA2"])).has("lA"), false, "a key narrowed to one mission only sees its lists");
});

test("sql data quality: same-name duplicate companies and duplicate emails, per tenant", async () => {
  const q: any = await getDataQuality(ctx("tenant-A"), parseInput(dataQualityParams, {}));
  assert.deepEqual([q.companies.duplicates_same_name_same_mission.groups, q.companies.duplicates_same_name_same_mission.extra_rows], [1, 1]);
  assert.deepEqual([q.contacts.duplicates_same_email.groups, q.contacts.duplicates_same_email.extra_rows], [1, 1]);
  const b: any = await getDataQuality(ctx("tenant-B"), parseInput(dataQualityParams, {}));
  assert.equal(b.companies.duplicates_same_name_same_mission.extra_rows, 0);
  const narrowed: any = await getDataQuality(ctx("tenant-A"), parseInput(dataQualityParams, { mission_id: "mA2" }));
  assert.equal(narrowed.companies.duplicates_same_name_same_mission.extra_rows, 0);
});

const all = (): Ctx => ({ p: { keyId: "k", keyName: "t", clientId: null, allClients: true, missionId: null, scopes: [...READ_SCOPES], issuedById: "m" }, db: db() });

test("sql all-clients key: leads and reports span every client, name the client, and client_id narrows", async () => {
  const leads = await searchLeads(all(), parseInput(searchLeadsParams, {}));
  assert.deepEqual(leads.items.map((l) => l.id).sort(), ["c1", "c2", "c3", "c4", "cB"]);
  assert.equal(leads.items.find((l) => l.id === "cB")!.client.name, "Client B");
  assert.equal(leads.items.find((l) => l.id === "c1")!.client.name, "Client A");

  const onlyB = await searchLeads(all(), parseInput(searchLeadsParams, { client_id: "tenant-B" }));
  assert.deepEqual(onlyB.items.map((l) => l.id), ["cB"]);

  const lead = await getLead(all(), "cB");
  assert.equal(lead.company.name, "Secret Corp");

  const r: any = await getSalesReport(all(), parseInput(salesReportParams, { date_from: "2026-09-01", date_to: "2026-10-31" }));
  assert.equal(r.unique_called.contacts, 5);
  const narrowed: any = await getSalesReport(all(), parseInput(salesReportParams, { date_from: "2026-09-01", date_to: "2026-10-31", client_id: "tenant-B" }));
  assert.equal(narrowed.unique_called.contacts, 1);
});

test("sql client-bound key: a client_id for ANOTHER client returns nothing, never that client's data", async () => {
  const leads = await searchLeads(ctx("tenant-A"), parseInput(searchLeadsParams, { client_id: "tenant-B" }));
  assert.deepEqual(leads.items, []);
  const r: any = await getSalesReport(ctx("tenant-A"), parseInput(salesReportParams, { date_from: "2026-09-01", date_to: "2026-10-31", client_id: "tenant-B" }));
  assert.equal(r.unique_called.contacts, 0);
  assert.equal(r.totals.calls, 0);
});

test("sql all-clients key: list stats and data quality cover every client", async () => {
  const stats = await listStats(all(), ["lA", "lB"]);
  assert.equal(stats.has("lB"), true);
  assert.equal(stats.get("lB")!.contacts, 1);
  const q: any = await getDataQuality(all(), parseInput(dataQualityParams, {}));
  assert.equal(q.companies.duplicates_same_name_same_mission.extra_rows, 1);
});
