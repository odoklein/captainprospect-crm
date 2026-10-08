/**
 * The "smart" layer of the public API / MCP: Paris-time period presets, the
 * result-code glossary, whoami, global search and the richer sales report.
 *     npm run test:api-v1
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "./errors";
import { READ_SCOPES, type Scope } from "./scopes";
import { parseInput } from "./input";
import { parisMidnight, periodRange } from "./dates";
import { RESULT_META, resultCategory, resultLabel } from "./glossary";
import { INSTRUCTIONS } from "./mcp-server";
import { getAccount, globalSearch, globalSearchParams } from "./services/account";
import { getSalesReport, salesReportParams } from "./services/reports";
import { searchCalls, searchCallsParams } from "./services/actions";
import type { Ctx } from "./serializers";
import type { Principal } from "./auth";

function recordingDb(overrides: Record<string, (args: any) => unknown> = {}) {
  const calls: Array<{ model: string; method: string; args: any }> = [];
  const empty: Record<string, unknown> = { findMany: [], findFirst: null, findUnique: null, groupBy: [], count: 0 };
  const db = new Proxy({}, {
    get: (_t, model: string) => {
      if (model === "$queryRaw") {
        return (sql: unknown) => {
          calls.push({ model: "$queryRaw", method: "queryRaw", args: sql });
          return Promise.resolve(overrides.$queryRaw ? overrides.$queryRaw(sql) : []);
        };
      }
      return new Proxy({}, {
        get: (_u, method: string) => (args: unknown) => {
          calls.push({ model, method, args });
          const o = overrides[`${model}.${method}`];
          return Promise.resolve(o ? o(args) : empty[method]);
        },
      });
    },
  }) as any;
  return { db, calls };
}

const principal = (scopes: readonly Scope[] = READ_SCOPES): Principal => ({
  keyId: "k", keyName: "t", clientId: "tenant-A", allClients: false, missionId: null, scopes: [...scopes], issuedById: "m",
});
const ctx = (db: any, scopes?: readonly Scope[]): Ctx => ({ p: principal(scopes), db });
const status = (s: number) => (e: unknown) => e instanceof ApiError && e.status === s;

test("dates: presets resolve in Paris time, DST included", () => {
  const now = new Date("2026-10-08T15:00:00Z"); // CEST, UTC+2
  assert.equal(periodRange("this_month", now).from.toISOString(), "2026-09-30T22:00:00.000Z");
  assert.equal(periodRange("last_month", now).from.toISOString(), "2026-08-31T22:00:00.000Z");
  assert.equal(periodRange("last_month", now).to.toISOString(), "2026-09-30T21:59:59.999Z");
  assert.equal(periodRange("this_week", now).from.toISOString(), "2026-10-04T22:00:00.000Z"); // Monday 5 Oct
  assert.equal(periodRange("yesterday", now).from.toISOString(), "2026-10-06T22:00:00.000Z");
  assert.equal(periodRange("last_7_days", now).from.toISOString(), "2026-10-01T22:00:00.000Z");
  // winter time, and the day the clocks go back (25 Oct 2026)
  assert.equal(parisMidnight(2026, 1, 1).toISOString(), "2025-12-31T23:00:00.000Z");
  assert.equal(parisMidnight(2026, 10, 25).toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal(parisMidnight(2026, 10, 26).toISOString(), "2026-10-25T23:00:00.000Z");
});

test("period: the preset becomes the date window, an explicit date wins, an unknown preset is 400", async () => {
  const a = recordingDb();
  await searchCalls(ctx(a.db), parseInput(searchCallsParams, { period: "this_month" }));
  assert.ok(JSON.stringify(a.calls[0].args.where).includes('"createdAt":{"gte"'));
  const b = recordingDb();
  await searchCalls(ctx(b.db), parseInput(searchCallsParams, { period: "this_month", date_from: "2026-01-01" }));
  assert.ok(JSON.stringify(b.calls[0].args.where).includes("2026-01-01"));
  assert.throws(() => parseInput(searchCallsParams, { period: "next_century" }), status(400));
});

test("glossary: result codes carry a French label and a business category", () => {
  assert.equal(resultLabel("FAUX_NUMERO"), "Faux numéro");
  assert.equal(resultCategory("DOUBLON"), "bad_data");
  assert.equal(resultCategory("RELANCE"), "follow_up");
  assert.equal(resultCategory("MEETING_BOOKED"), "rdv");
  assert.equal(resultCategory("SOMETHING_NEW"), "other");
  assert.ok(Object.keys(RESULT_META).length >= 30);
});

test("whoami: states the scope is ONE client, gives the date, permissions and glossary", async () => {
  const { db } = recordingDb({
    "client.findUnique": () => ({ id: "tenant-A", name: "Arthurimmo.com", status: "ACTIVE" }),
    "mission.findMany": () => [{ id: "m1", name: "Mission A", startDate: new Date("2026-03-03"), endDate: new Date("2026-12-04"), client: { name: "Arthurimmo.com" }, teamLeadSdr: { name: "Anais" }, _count: { sdrAssignments: 6 } }],
  });
  const a: any = await getAccount(ctx(db, ["contacts:read", "reports:read"]));
  assert.equal(a.visible_scope.client.name, "Arthurimmo.com");
  assert.match(a.visible_scope.statement, /NOT the whole CRM/);
  assert.deepEqual(a.permissions, ["contacts:read", "reports:read"]);
  assert.equal(a.active_missions[0].sdr_count, 6);
  assert.equal(a.now.timezone, "Europe/Paris");
  assert.ok(a.glossary.result_categories.bad_data.codes.includes("DOUBLON"));
  assert.ok(a.period_presets.includes("this_month"));
  assert.match(a.glossary.call, /unique_called/);
});

test("global_search: each section is gated by its scope; an empty result explains why", async () => {
  const none: any = await globalSearch(ctx(recordingDb().db), parseInput(globalSearchParams, { query: "talis" }));
  assert.match(none.note, /another client/);
  const { db, calls } = recordingDb();
  const limited: any = await globalSearch(ctx(db, ["contacts:read"]), parseInput(globalSearchParams, { query: "talis" }));
  assert.equal(limited.omitted_sections.length, 2);
  assert.ok(!calls.some((c) => c.model === "company" || c.model === "mission"));
  assert.throws(() => parseInput(globalSearchParams, { query: "x" }), status(400));
});

test("report: unique contacts/companies, labelled categories, series, reach rate, comparison", async () => {
  const { db, calls } = recordingDb({
    "action.groupBy": (a) =>
      a.by.includes("confirmationStatus")
        ? []
        : [
            { campaignId: "cp1", sdrId: "u1", channel: "CALL", result: "NO_RESPONSE", _count: { _all: 60 } },
            { campaignId: "cp1", sdrId: "u1", channel: "CALL", result: "RAPPEL", _count: { _all: 20 } },
            { campaignId: "cp1", sdrId: "u1", channel: "CALL", result: "REFUS", _count: { _all: 10 } },
            { campaignId: "cp1", sdrId: "u1", channel: "CALL", result: "DOUBLON", _count: { _all: 8 } },
            { campaignId: "cp1", sdrId: "u1", channel: "CALL", result: "MEETING_BOOKED", _count: { _all: 2 } },
          ],
    "campaign.findMany": () => [{ id: "cp1", mission: { id: "m1", name: "M", client: { id: "tenant-A", name: "Client A" } } }],
    $queryRaw: (sql: any) =>
      sql.strings.join("").includes("GROUP BY 1")
        ? [{ bucket: "2026-10-01", calls: 50, appointments: 1, contacts: 40 }, { bucket: "2026-10-02", calls: 50, appointments: 1, contacts: 45 }]
        : [{ contacts: 70, companies: 66 }],
  });
  const r: any = await getSalesReport(ctx(db), parseInput(salesReportParams, { period: "this_month", compare_previous: "true" }));
  assert.equal(r.unique_called.contacts, 70);
  assert.equal(r.unique_called.companies, 66);
  assert.equal(r.unique_called.calls_per_contact, 1.4);
  assert.equal(r.totals.calls, 100);
  assert.equal(r.reach.reached_calls, 32); // rdv 2 + follow_up 20 + refus 10
  assert.equal(r.reach.reach_rate_pct, 32);
  assert.equal(r.by_category.find((c: any) => c.category === "bad_data").count, 8);
  assert.equal(r.by_result.find((x: any) => x.result === "DOUBLON").label, "Doublon");
  assert.equal(r.series.unit, "day");
  assert.equal(r.series.points.length, 2);
  assert.equal(r.period.label, "ce mois-ci");
  assert.equal(r.comparison.calls.before, 100);
  for (const c of calls.filter((x) => x.model === "$queryRaw")) assert.ok(c.args.values.includes("tenant-A"), "raw SQL binds the key's tenant");
});

test("mcp instructions warn about scope, unique counts and invented numbers", () => {
  assert.match(INSTRUCTIONS, /whoami/);
  assert.match(INSTRUCTIONS, /unique_called/);
  assert.match(INSTRUCTIONS, /ONE client/);
  assert.match(INSTRUCTIONS, /Never invent/);
});

// ============================================
// Internal all-clients key
// ============================================

import { authenticateApiKey } from "./auth";
import { allowedEndpointsForScopes } from "./scopes";
import { clientScope, missionScope, userScope } from "./tenant";
import { createHash } from "node:crypto";
import { searchCampaigns, searchCampaignsParams, getCampaign } from "./services/campaigns";

const KEY = "cp_live_" + "c".repeat(48) + "_x1";
const keyRow = (over: Record<string, unknown>) => ({
  id: "k-int", name: "internal", clientId: null, missionId: null, isActive: true, expiresAt: null,
  allowedEndpoints: allowedEndpointsForScopes(["missions:read", "reports:read"], { allClients: true }),
  rateLimitPerMinute: 60, rateLimitPerHour: 1000, createdById: "m1", createdBy: { role: "MANAGER", isActive: true }, ...over,
});
const authDb = (row: Record<string, unknown>) => ({
  apiKey: { findUnique: async ({ where }: any) => (where.keyHash === createHash("sha256").update(KEY).digest("hex") ? row : null) },
  apiKeyUsageLog: { count: async () => 0 },
}) as any;
const bearer = new Headers({ authorization: `Bearer ${KEY}` });

test("all-clients key: valid only when flagged, unbound AND issued by an active manager", async () => {
  const p = await authenticateApiKey(authDb(keyRow({})), bearer);
  assert.equal(p.allClients, true);
  assert.equal(p.clientId, null);
  // flagged but also bound to a client: contradictory, refused
  await assert.rejects(authenticateApiKey(authDb(keyRow({ clientId: "tenant-A" })), bearer), (e: any) => e.status === 403 && e.code === "invalid_key");
  // issuer demoted or deactivated: the key dies with the manager
  await assert.rejects(authenticateApiKey(authDb(keyRow({ createdBy: { role: "SDR", isActive: true } })), bearer), (e: any) => e.code === "issuer_not_manager");
  await assert.rejects(authenticateApiKey(authDb(keyRow({ createdBy: { role: "MANAGER", isActive: false } })), bearer), (e: any) => e.code === "issuer_not_manager");
  // unbound but NOT flagged: still refused (the old guarantee)
  await assert.rejects(authenticateApiKey(authDb(keyRow({ allowedEndpoints: allowedEndpointsForScopes(["missions:read"]) })), bearer), (e: any) => e.code === "no_tenant");
  // a client-bound key is never all-clients
  const bound = await authenticateApiKey(authDb(keyRow({ clientId: "tenant-A", allowedEndpoints: allowedEndpointsForScopes(["missions:read"]) })), bearer);
  assert.equal(bound.allClients, false);
});

test("tenant filters: client-bound = its client; all-clients = no client filter; client_id only ever NARROWS", () => {
  const bound = { ...principal(), clientId: "tenant-A", allClients: false } as Principal;
  const all = { ...principal(), clientId: null, allClients: true } as Principal;
  const j = (x: unknown) => JSON.stringify(x);
  assert.equal(j(missionScope(all)), '{"AND":[]}', "no client constraint at all");
  assert.equal(j(missionScope(all, "tenant-B")), '{"AND":[{"clientId":"tenant-B"}]}');
  // a client-bound key asking for another client gets BOTH constraints: the intersection is empty, never tenant B
  assert.equal(j(missionScope(bound, "tenant-B")), '{"AND":[{"clientId":"tenant-A"},{"clientId":"tenant-B"}]}');
  assert.equal(j(clientScope(bound, "tenant-B")), '{"AND":[{"id":"tenant-A"},{"id":"tenant-B"}]}');
  assert.equal(j(clientScope(all)), '{"AND":[]}');
  assert.equal(j(userScope(all)), "{}");
  assert.ok(j(userScope(bound)).includes("tenant-A"));
});

test("whoami (all-clients): says it sees every client and names the client of each mission", async () => {
  const { db } = recordingDb({
    "client.count": () => 36,
    "mission.findMany": () => [{ id: "m1", name: "Mission A", startDate: new Date("2026-03-03"), endDate: new Date("2026-12-04"), client: { name: "Arthurimmo.com" }, teamLeadSdr: null, _count: { sdrAssignments: 2 } }],
  });
  const a: any = await getAccount({ p: { ...principal(), clientId: null, allClients: true }, db });
  assert.equal(a.visible_scope.all_clients, true);
  assert.equal(a.visible_scope.clients_visible, 36);
  assert.match(a.visible_scope.statement, /INTERNAL all-clients key/);
  assert.equal(a.active_missions[0].client, "Arthurimmo.com");
});

test("campaigns: all-clients key searches scripts across clients and no query carries a client filter", async () => {
  const all: Ctx = { p: { ...principal(), clientId: null, allClients: true }, db: null as any };
  const { db, calls } = recordingDb({
    "campaign.findMany": () => [{ id: "cp1", name: "Prospection DG", isActive: true, icp: "DG de PME", pitch: "Bonjour...", script: "x".repeat(900), createdAt: new Date(), mission: { id: "m1", name: "M", status: "ACTIVE", client: { id: "c1", name: "Client 1" } } }],
  });
  all.db = db;
  const page: any = await searchCampaigns(all, parseInput(searchCampaignsParams, { query: "bonjour" }));
  assert.equal(page.items[0].client.name, "Client 1");
  assert.equal(page.items[0].script_length, 900);
  assert.equal(page.items[0].script_preview.length, 501);
  assert.ok(!JSON.stringify(calls[0].args.where).includes("clientId"));
  // narrowing works
  const n = recordingDb();
  await searchCampaigns({ ...all, db: n.db }, parseInput(searchCampaignsParams, { client_id: "c1" }));
  assert.ok(JSON.stringify(n.calls[0].args.where).includes('"clientId":"c1"'));
  await assert.rejects(getCampaign({ ...all, db: recordingDb().db }, "nope"), status(404));
});
