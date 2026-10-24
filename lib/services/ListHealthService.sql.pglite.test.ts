/**
 * The health SQL (bulkHealthSql) executed for real on an in-process Postgres
 * (PGlite): member-driven scan, per-list attribution, and the pace fix —
 * "new contacts" are contacts whose FIRST action is in the window.
 *     npm run test:list-health
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

import { bulkHealthSql } from "./ListHealthService";

const NOW = new Date("2026-10-24T12:00:00Z");

let pg: PGlite;

async function run(listIds: string[], sdrIds: string[] = []) {
  const sql = bulkHealthSql(listIds, sdrIds, NOW);
  const values = sql.values.map((v) => (v instanceof Date ? v.toISOString().replace("Z", "") : v));
  const rows = (await pg.query<Record<string, unknown>>(sql.text, values)).rows;
  return new Map(rows.map((r) => [r.list_id as string, r]));
}

const n = (v: unknown) => Number(v);

before(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE "List"    (id text PRIMARY KEY);
    CREATE TABLE "Company" (id text PRIMARY KEY, "listId" text);
    CREATE TABLE "Contact" (id text PRIMARY KEY, "companyId" text);
    CREATE TABLE "Action"  (id text PRIMARY KEY, "contactId" text, "companyId" text, "sdrId" text,
                            result text, "createdAt" timestamp);
    INSERT INTO "List" VALUES ('L1'), ('L2'), ('L3'), ('L4');
    INSERT INTO "Company" VALUES ('co1','L1'), ('co2','L1'), ('co3','L2'), ('co4','L4');
    INSERT INTO "Contact" VALUES ('k1','co1'), ('k2','co1'), ('k3','co2'), ('k4','co3'), ('k5','co4');
    INSERT INTO "Action" VALUES
      -- k1: first reached 20 days ago, then called 3 times this week
      ('a1','k1','co1','u1','NO_RESPONSE',   '2026-10-04 10:00'),
      ('a2','k1','co1','u1','NO_RESPONSE',   '2026-10-21 10:00'),
      ('a3','k1','co1','u2','RAPPEL',        '2026-10-22 10:00'),
      ('a4','k1', NULL,'u2','MEETING_BOOKED','2026-10-23 10:00'),
      -- k2: first ever call 3 days ago
      ('a5','k2','co1','u1','NUMERO_KO',     '2026-10-21 15:00'),
      -- co2: company-level action, no contact, 40 days ago
      ('a6', NULL,'co2','u1','REFUS',        '2026-09-14 10:00'),
      -- k4 belongs to L2 even though the action names co1 (L1)
      ('a7','k4','co1','u3','INTERESTED',    '2026-10-19 10:00'),
      -- L4 is not requested: must never show up
      ('a8','k5','co4','u1','MEETING_BOOKED','2026-10-23 10:00');
  `);
});

after(async () => { await pg.close(); });

test("sql health: a contact re-called this week but first reached 20 days ago is not a new contact", async () => {
  const l1 = (await run(["L1", "L2", "L3"])).get("L1")!;
  assert.equal(n(l1.new_contacts_7d), 1, "only k2 was reached for the first time this week");
  assert.equal(n(l1.new_contacts_30d), 2, "k1 and k2 were both first reached within 30 days");
  assert.equal(n(l1.actions_7d), 4, "activity still counts every call");
  assert.equal(n(l1.actions_30d), 5);
});

test("sql health: totals, coverage and result families for a list", async () => {
  const l1 = (await run(["L1", "L2", "L3"])).get("L1")!;
  assert.equal(n(l1.total_contacts), 3);
  assert.equal(n(l1.total_companies), 2);
  assert.equal(n(l1.total_actions), 6, "a1-a6: contact actions plus the company-only one");
  assert.equal(n(l1.contacted_contacts), 2);
  assert.equal(n(l1.contacted_companies), 2, "co1 via its contacts, co2 via the company-only action");
  assert.equal(n(l1.unique_sdrs), 2);
  assert.equal(n(l1.positive_count), 2);
  assert.equal(n(l1.meetings_count), 1);
  assert.equal(n(l1.bad_contact_count), 1);
  assert.equal(n(l1.negative_count), 1);
  assert.equal(n(l1.neutral_count), 2);
  assert.equal(new Date(l1.last_action_at as string).toISOString().slice(0, 10), "2026-10-23");
});

test("sql health: an action on a contact of another list counts for the contact's list only", async () => {
  const rows = await run(["L1", "L2", "L3"]);
  const l2 = rows.get("L2")!;
  assert.equal(n(l2.total_actions), 1);
  assert.equal(n(l2.contacted_contacts), 1);
  assert.equal(n(l2.contacted_companies), 1, "the contact's own company (co3), not co1");
  assert.equal(n(l2.positive_count), 1);
  assert.equal(n(rows.get("L1")!.total_actions), 6, "a7 does not leak into L1");
});

test("sql health: an empty list still gets a zero row; unrequested lists are absent", async () => {
  const rows = await run(["L1", "L2", "L3"]);
  assert.deepEqual([...rows.keys()].sort(), ["L1", "L2", "L3"]);
  const l3 = rows.get("L3")!;
  assert.equal(n(l3.total_contacts), 0);
  assert.equal(n(l3.total_actions), 0);
  assert.equal(n(l3.new_contacts_7d), 0);
  assert.equal(l3.last_action_at, null);
});

test("sql health: every count column is int8, so Prisma hands back bigint (not Decimal)", async () => {
  const sql = bulkHealthSql(["L1"], [], NOW);
  const values = sql.values.map((v) => (v instanceof Date ? v.toISOString().replace("Z", "") : v));
  const { fields } = await pg.query(sql.text, values);
  const INT8 = 20;
  for (const f of fields) {
    if (f.name === "list_id" || f.name === "last_action_at") continue;
    assert.equal(f.dataTypeID, INT8, `${f.name} must be bigint`);
  }
});

test("sql health: sdrIds scopes the actions", async () => {
  const l1 = (await run(["L1"], ["u2"])).get("L1")!;
  assert.equal(n(l1.total_actions), 2);
  assert.equal(n(l1.unique_sdrs), 1);
  assert.equal(n(l1.contacted_contacts), 1);
  assert.equal(n(l1.total_contacts), 3, "list size is not scoped by SDR");
});
