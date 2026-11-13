/**
 * The raw SQL of lib/missions/insights.server.ts on an in-process Postgres
 * (PGlite): per-list counts (D1) must match what the old Prisma include
 * counted in JS, and the insights windows must bucket and filter correctly.
 *     npx tsx --test lib/missions/insights.pglite.test.ts
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

import {
    fetchListCounts,
    fetchListPerformance,
    getLegacyMissionInsights,
    getMissionInsights,
} from "./insights.server";
import { resetAgencyBenchmarkCache, type RawDb } from "./benchmark";

let pg: PGlite;

const db = {
    $queryRaw: async (sql: { text: string; values: unknown[] }) => {
        const values = sql.values.map((v) => (v instanceof Date ? v.toISOString().replace("Z", "") : v));
        return (await pg.query(sql.text, values)).rows;
    },
} as unknown as RawDb;

const now = new Date("2026-11-13T12:00:00Z");

// Fixture, also used to recount « the old way » (Prisma include + JS reduce).
const companies = [
    { id: "co1", listId: "l1", status: "ACTIONABLE" },
    { id: "co2", listId: "l1", status: "INCOMPLETE" },
    { id: "co3", listId: "l1", status: "ACTIONABLE" },
    { id: "co4", listId: "l2", status: "PARTIAL" },
    { id: "coX", listId: "lX", status: "ACTIONABLE" },
];
const contacts = [
    { id: "c1", companyId: "co1" },
    { id: "c2", companyId: "co1" },
    { id: "c3", companyId: "co2" },
    { id: "c4", companyId: "co4" },
    { id: "cX", companyId: "coX" },
];

before(async () => {
    resetAgencyBenchmarkCache();
    pg = new PGlite();
    await pg.exec(`
        CREATE TABLE "Mission"  (id text PRIMARY KEY);
        CREATE TABLE "Campaign" (id text PRIMARY KEY, "missionId" text);
        CREATE TABLE "List"     (id text PRIMARY KEY, "missionId" text, name text, "isActive" boolean, "isArchived" boolean);
        CREATE TABLE "Company"  (id text PRIMARY KEY, "listId" text, status text);
        CREATE TABLE "Contact"  (id text PRIMARY KEY, "companyId" text);
        CREATE TABLE "User"     (id text PRIMARY KEY, name text);
        CREATE TABLE "Action"   (id text PRIMARY KEY, "contactId" text, "companyId" text, "campaignId" text, "sdrId" text,
                                 result text, "createdAt" timestamp);
        CREATE TABLE "Opportunity" (id text PRIMARY KEY, "contactId" text, "companyId" text, "createdAt" timestamp);
        INSERT INTO "Mission" VALUES ('m1'), ('mX');
        INSERT INTO "Campaign" VALUES ('cp1','m1'), ('cpX','mX');
        INSERT INTO "List" VALUES ('l1','m1','Base A',true,false), ('l2','m1','Base B',false,false),
                                  ('l3','m1','Base vide',true,false), ('lX','mX','Autre',true,false);
        INSERT INTO "User" VALUES ('u1','Marie'), ('u2','Julien');
    `);
    for (const c of companies) await pg.query(`INSERT INTO "Company" VALUES ($1,$2,$3)`, [c.id, c.listId, c.status]);
    for (const c of contacts) await pg.query(`INSERT INTO "Contact" VALUES ($1,$2)`, [c.id, c.companyId]);
    await pg.exec(`
        INSERT INTO "Action" VALUES
          -- c1 (co1, l1): no answer 20 days ago, then a meeting 2 days ago
          ('a1','c1',NULL,'cp1','u1','NO_RESPONSE','2026-10-24 09:00'),
          ('a2','c1',NULL,'cp1','u1','MEETING_BOOKED','2026-11-11 10:00'),
          -- c3 (co2, l1): refusal today
          ('a3','c3','co2','cp1','u2','NOT_INTERESTED','2026-11-13 08:00'),
          -- co4 called directly (l2), 40 days ago
          ('a4',NULL,'co4','cp1','u2','NO_RESPONSE','2026-10-04 08:00'),
          -- another mission: must never count
          ('aX','cX',NULL,'cpX','u1','MEETING_BOOKED','2026-11-12 08:00');
        INSERT INTO "Opportunity" VALUES ('o1','c1','co1','2026-11-12 08:00'), ('o2','c3','co2','2026-10-01 08:00'),
                                         ('oX','cX','coX','2026-11-12 08:00');
    `);
});

after(async () => {
    resetAgencyBenchmarkCache();
    await pg?.close();
});

test("fetchListCounts matches the old include + JS reduce, in one grouped query", async () => {
    const counts = await fetchListCounts(db, "m1");
    for (const listId of ["l1", "l2", "l3"]) {
        const listCompanies = companies.filter((c) => c.listId === listId);
        const old = {
            companies: listCompanies.length,
            contacts: listCompanies.reduce((acc, co) => acc + contacts.filter((ct) => ct.companyId === co.id).length, 0),
        };
        const got = counts.get(listId)!;
        assert.equal(got.companies, old.companies, `${listId} companies`);
        assert.equal(got.contacts, old.contacts, `${listId} contacts`);
    }
    assert.deepEqual(counts.get("l1")!.companyStatusCounts, { ACTIONABLE: 2, INCOMPLETE: 1 });
    assert.deepEqual(counts.get("l3")!.companyStatusCounts, {});
    assert.equal(counts.has("lX"), false);
});

test("fetchListPerformance: called / reached / meetings / worked per list", async () => {
    const rows = await fetchListPerformance(db, "m1");
    const byId = Object.fromEntries(rows.map((r) => [r.listId, r]));
    assert.deepEqual(byId.l1, { listId: "l1", name: "Base A", called: 2, reached: 2, meetings: 1, companies: 3, contacts: 3, workedCompanies: 2 });
    assert.deepEqual(byId.l2, { listId: "l2", name: "Base B", called: 1, reached: 0, meetings: 0, companies: 1, contacts: 1, workedCompanies: 1 });
    assert.equal(byId.l3.workedCompanies, 0);
    assert.equal(byId.l3.companies, 0);
});

test("getMissionInsights period=7: window counts, previous window, whole-mission funnel", async () => {
    const r = await getMissionInsights(db, { missionId: "m1", period: "7", missionStart: "2026-10-01T00:00:00Z", now });
    assert.equal(r.windowDays, 7);
    assert.equal(r.windowStart, "2026-11-07T00:00:00.000Z");
    assert.equal(r.series.length, 7);
    assert.deepEqual(r.series.find((p) => p.date === "2026-11-11"), { date: "2026-11-11", actions: 1, meetings: 1, reached: 1 });
    assert.deepEqual(r.series.find((p) => p.date === "2026-11-13"), { date: "2026-11-13", actions: 1, meetings: 0, reached: 1 });
    assert.deepEqual(r.current, { actions: 2, meetings: 1, opportunities: 1 });
    assert.deepEqual(r.previous, { actions: 0, meetings: 0, opportunities: 0 });
    // Whole mission: prospects = contacts of active lists (l1: 3, l3: 0).
    assert.deepEqual(r.pulse.funnel, { prospects: 3, called: 3, reached: 2, interested: 1, meetings: 1 });
    assert.deepEqual(r.pulse.periodFunnel, { prospects: 3, called: 2, reached: 2, interested: 1, meetings: 1 });
    const marie = r.teamStats.find((t) => t.sdrId === "u1")!;
    assert.deepEqual(marie, { sdrId: "u1", name: "Marie", actions: 1, meetings: 1, recentActions: 1 });
    assert.equal(r.lists.length, 3);
});

test("getMissionInsights period=all: series from the first action, totals over the whole mission", async () => {
    const r = await getMissionInsights(db, { missionId: "m1", period: "all", missionStart: "2026-10-10T00:00:00Z", now });
    assert.equal(r.windowStart, "2026-10-04T00:00:00.000Z");
    assert.equal(r.windowDays, 41);
    assert.equal(r.series.reduce((s, p) => s + p.actions, 0), 4);
    assert.deepEqual(r.current, { actions: 4, meetings: 1, opportunities: 2 });
    assert.equal(r.previous, null);
    assert.deepEqual(r.pulse.periodFunnel, r.pulse.funnel);
});

test("getLegacyMissionInsights keeps the historical shape and team meaning", async () => {
    const r = await getLegacyMissionInsights(db, "m1", now);
    assert.equal(r.insights.windowDays, 30);
    assert.equal(r.insights.series.length, 30);
    assert.deepEqual(r.insights.current, { actions: 3, meetings: 1, opportunities: 1 });
    assert.deepEqual(r.insights.previous, { actions: 1, meetings: 0, opportunities: 1 });
    const julien = r.teamStats.find((t) => t.sdrId === "u2")!;
    // Whole-mission actions, 30-day recentActions.
    assert.deepEqual(julien, { sdrId: "u2", name: "Julien", actions: 2, meetings: 0, recentActions: 1 });
    assert.ok("benchmark" in r.pulse);
});
