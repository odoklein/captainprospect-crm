import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { companyHistorySql, findWorkedCompanyIds } from "./company-history";
import { DEFAULT_QUEUE_FILTERS, matchesQueueFilters } from "./queue-filters";

let pg: PGlite;
const db = {
    async $queryRaw<T>(sql: Prisma.Sql): Promise<T> {
        return (await pg.query(sql.text, sql.values)).rows as T;
    },
};

before(async () => {
    pg = new PGlite();
    await pg.exec(`
        CREATE TABLE "List" (id text PRIMARY KEY, "missionId" text, "isActive" boolean);
        CREATE TABLE "Company" (id text PRIMARY KEY, name text, "listId" text, "linkedFromId" text);
        CREATE TABLE "Contact" (id text PRIMARY KEY, "companyId" text);
        CREATE TABLE "Action" (id text PRIMARY KEY, "companyId" text, "contactId" text, "sdrId" text, channel text);
        CREATE INDEX company_list_history ON "Company" ("listId");
        CREATE INDEX company_link_history ON "Company" ("linkedFromId");
        CREATE INDEX contact_company_history ON "Contact" ("companyId");
        CREATE INDEX action_company_history ON "Action" ("companyId");
        CREATE INDEX action_contact_history ON "Action" ("contactId");
        INSERT INTO "List" VALUES ('list-a','mission-a',true), ('list-b','mission-a',false), ('list-other','mission-other',true);
        INSERT INTO "Company" VALUES
            ('fresh-copy','Shared Co','list-a',NULL),
            ('called-copy','  shared   CO  ','list-b',NULL),
            ('same-name-other-mission','Shared Co','list-other',NULL),
            ('untouched','Never worked','list-a',NULL),
            ('direct','Direct Co','list-a',NULL),
            ('direct-copy','DIRECT CO','list-b',NULL),
            ('root','Root name','list-a',NULL),
            ('linked-a','Renamed A','list-a','root'),
            ('linked-b','Renamed B','list-other','root'),
            ('moved','Current company','list-a',NULL),
            ('old-stamp','Previous company','list-a',NULL),
            ('blank-a','  ','list-a',NULL), ('blank-b',E'\\t','list-b',NULL);
        INSERT INTO "Contact" VALUES ('called-sibling','called-copy'), ('new-contact','fresh-copy'), ('moved-contact','moved');
        INSERT INTO "Action" VALUES
            ('sibling-action',NULL,'called-sibling','another-sdr','EMAIL'),
            ('direct-action','direct',NULL,'another-sdr','CALL'),
            ('linked-action','linked-b',NULL,'another-sdr','CALL'),
            ('moved-action','old-stamp','moved-contact','another-sdr','CALL'),
            ('blank-action','blank-a',NULL,'another-sdr','CALL');
    `);
});
after(async () => { await pg?.close(); });

test("a fresh row is excluded when another contact on an imported company copy has any action", async () => {
    // Only fresh-copy is in the queue. The called contact lives in another,
    // disabled list and its legacy action has no stamped companyId.
    const worked = await findWorkedCompanyIds(["fresh-copy"], db);
    assert.ok(worked.has("fresh-copy"));
    assert.equal(matchesQueueFilters({
        contactId: "new-contact", company: { name: "Shared Co" }, priority: "NEW", channel: "CALL",
        lastAction: null, companyLastAction: null, hasCompanyHistory: worked.has("fresh-copy"),
    }, { ...DEFAULT_QUEUE_FILTERS, type: "", result: "UNTOUCHED" }, null), false);
});

test("same-name twins and direct company actions are checked in both directions", async () => {
    const worked = await findWorkedCompanyIds(["fresh-copy", "called-copy", "direct", "direct-copy"], db);
    assert.deepEqual([...worked].sort(), ["called-copy", "direct", "direct-copy", "fresh-copy"]);
});

test("renamed linked parents, children and sibling copies share history", async () => {
    assert.deepEqual([...(await findWorkedCompanyIds(["root", "linked-a", "linked-b"], db))].sort(), ["linked-a", "linked-b", "root"]);
});

test("a contact action counts even if its stamped company differs from its current company", async () => {
    const worked = await findWorkedCompanyIds(["moved", "old-stamp"], db);
    assert.ok(worked.has("moved")); assert.ok(worked.has("old-stamp"));
});

test("equal names in an unrelated mission and blank names do not merge histories", async () => {
    assert.deepEqual([...(await findWorkedCompanyIds(["untouched", "same-name-other-mission", "blank-b"], db))], []);
});

test("an empty queue does not query; a failed history query is never treated as untouched", async () => {
    let calls = 0;
    const failedDb = { async $queryRaw<T>(): Promise<T> { calls++; throw new Error("Database unavailable"); } };
    assert.equal((await findWorkedCompanyIds([], failedDb)).size, 0);
    assert.equal(calls, 0);
    await assert.rejects(findWorkedCompanyIds(["fresh-copy"], failedDb), /Database unavailable/);
});

test("large-table history lookup retains indexed Action probes", async (t) => {
    await pg.exec(`
        INSERT INTO "Company" SELECT 'bulk-' || n, 'Unrelated ' || n, 'list-a', NULL FROM generate_series(1, 10000) n;
        INSERT INTO "Contact" SELECT 'bulk-contact-' || n, 'bulk-' || n FROM generate_series(1, 10000) n;
        INSERT INTO "Action" SELECT 'bulk-action-' || n, 'bulk-' || ((n % 10000) + 1),
            'bulk-contact-' || ((n % 10000) + 1), 'other-sdr', 'CALL' FROM generate_series(1, 80000) n;
        ANALYZE;
    `);
    const sql = companyHistorySql(["fresh-copy", "untouched"]);
    const plan = (await pg.query<{ "QUERY PLAN": string }>(`EXPLAIN ${sql.text}`, sql.values)).rows.map((row) => row["QUERY PLAN"]).join("\n");
    assert.match(plan, /action_company_history/);
    assert.match(plan, /action_contact_history/);
    assert.doesNotMatch(plan, /Seq Scan on "Action"/);
    const start = performance.now();
    assert.deepEqual([...(await findWorkedCompanyIds(["fresh-copy", "untouched"], db))], ["fresh-copy"]);
    t.diagnostic(`10,013 companies / 80,005 actions: ${(performance.now() - start).toFixed(1)} ms`);
});
