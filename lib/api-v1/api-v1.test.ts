/**
 * Public API (/api/v1) + MCP: authentication, scopes, tenant isolation, the
 * contact context and the MCP tools.
 *     npm run test:api-v1
 *
 * No database: the services run against a recording stand-in for Prisma, so the
 * tests assert on the exact queries a request would send — in particular that
 * every one of them carries the tenant taken from the API key.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { authenticateApiKey, requireScope, withUrlKey, type Principal } from "./auth";
import { redactApiKeys, scrubApiKeys } from "./redact";
import { ApiError } from "./errors";
import { READ_SCOPES, RESERVED_WRITE_SCOPES, allowedEndpointsForScopes, isReadScope, scopesFromAllowedEndpoints, type Scope } from "./scopes";
import { parseInput } from "./input";
import { decodeCursor } from "./pagination";
import { buildMcpServer, type AccessEntry } from "./mcp-server";
import { TOOLS } from "./mcp-tools";
import { searchContacts, searchContactsParams, getContact, getContactContext, contactContextParams } from "./services/contacts";
import { searchCompanies, getCompany, searchCompaniesParams } from "./services/companies";
import { searchLeads, getLead, searchLeadsParams } from "./services/leads";
import { searchCalls, getCall, searchActivities, searchAppointments, searchCallsParams, searchActivitiesParams, searchAppointmentsParams } from "./services/actions";
import { searchUsers, getUser, searchTeams, getTeam, searchUsersParams, searchTeamsParams } from "./services/team";
import { getSalesReport, salesReportParams } from "./services/reports";
import { getAccount, globalSearch, globalSearchParams } from "./services/account";
import { searchMissions, getMission, searchMissionsParams } from "./services/missions";
import { searchClients, searchCampaigns, getCampaign, searchClientsParams, searchCampaignsParams } from "./services/campaigns";
import { searchLists, getList, searchListsParams } from "./services/lists";
import { getRdvOverview, searchExclusions, getDailyReports, getDataQuality, rdvOverviewParams, searchExclusionsParams, dailyReportsParams, dataQualityParams } from "./services/insights";
import type { Ctx } from "./serializers";

// ============================================
// Test doubles
// ============================================

interface Recorded {
  model: string;
  method: string;
  args: any;
}

type Override = (args: any) => unknown;

/** Stand-in for PrismaClient: records every query, answers with overrides or empty results. */
function recordingDb(overrides: Record<string, Override> = {}) {
  const calls: Recorded[] = [];
  const empty: Record<string, unknown> = { findMany: [], findFirst: null, findUnique: null, groupBy: [], count: 0 };
  const db = new Proxy(
    {},
    {
      get: (_t, model: string) => {
        if (model === "$queryRaw") {
          return (sql: unknown) => {
            calls.push({ model: "$queryRaw", method: "queryRaw", args: sql });
            return Promise.resolve(overrides.$queryRaw ? overrides.$queryRaw(sql) : []);
          };
        }
        return new Proxy(
          {},
          {
            get: (_u, method: string) => (args: unknown) => {
              calls.push({ model, method, args });
              const o = overrides[`${model}.${method}`];
              return Promise.resolve(o ? o(args) : empty[method]);
            },
          },
        );
      },
    },
  ) as any;
  return { db, calls };
}

const principal = (clientId: string, scopes: readonly Scope[] = READ_SCOPES, missionId: string | null = null): Principal => ({
  keyId: `key-${clientId}`,
  keyName: "test",
  clientId,
  allClients: false,
  missionId,
  scopes: [...scopes],
  issuedById: "manager-1",
});

const A = principal("tenant-A");
const B = principal("tenant-B");
const ctx = (p: Principal, db: any): Ctx => ({ p, db });
const json = (v: unknown) => JSON.stringify(v);
const status = (s: number) => (e: unknown) => e instanceof ApiError && e.status === s;

// ============================================
// Authentication
// ============================================

const sha = (k: string) => createHash("sha256").update(k).digest("hex");
const KEY = "cp_live_" + "a".repeat(48) + "_lx1";
const baseKey = {
  id: "key-1",
  name: "ChatGPT",
  clientId: "tenant-A" as string | null,
  missionId: null,
  allowedEndpoints: allowedEndpointsForScopes(["contacts:read", "calls:read"]),
  isActive: true,
  expiresAt: null as Date | null,
  rateLimitPerMinute: 60,
  rateLimitPerHour: 1000,
  createdById: "manager-1",
  createdBy: { role: "MANAGER", isActive: true },
};

function authDb(key: Partial<typeof baseKey> | null, usage = { minute: 0, hour: 0 }) {
  return {
    apiKey: { findUnique: async ({ where }: any) => (key && where.keyHash === sha(KEY) ? { ...baseKey, ...key } : null) },
    apiKeyUsageLog: {
      count: async ({ where }: any) => (where.createdAt.gte.getTime() > Date.now() - 120_000 ? usage.minute : usage.hour),
    },
  } as any;
}
const bearer = (k: string) => new Headers({ authorization: `Bearer ${k}` });

test("auth: a valid key resolves tenant and scopes from the key itself", async () => {
  const p = await authenticateApiKey(authDb({}), bearer(KEY));
  assert.equal(p.clientId, "tenant-A");
  assert.deepEqual(p.scopes, ["contacts:read", "calls:read"]);
  assert.equal(p.keyId, "key-1");
});

test("auth: X-API-Key header is accepted too", async () => {
  const p = await authenticateApiKey(authDb({}), new Headers({ "x-api-key": KEY }));
  assert.equal(p.clientId, "tenant-A");
});

test("auth: missing, malformed and unknown keys are 401", async () => {
  await assert.rejects(authenticateApiKey(authDb({}), new Headers()), status(401));
  await assert.rejects(authenticateApiKey(authDb({}), bearer("not-a-key")), status(401));
  await assert.rejects(authenticateApiKey(authDb({}), bearer("cp_live_" + "b".repeat(48))), status(401));
  await assert.rejects(authenticateApiKey(authDb({}), bearer("cp_live_x'; DROP TABLE--")), status(401));
});

test("auth: a revoked key is rejected", async () => {
  await assert.rejects(authenticateApiKey(authDb({ isActive: false }), bearer(KEY)), (e: any) => e.status === 401 && e.code === "key_revoked");
});

test("auth: an expired key is rejected, a future expiry is fine", async () => {
  await assert.rejects(authenticateApiKey(authDb({ expiresAt: new Date(Date.now() - 1000) }), bearer(KEY)), (e: any) => e.status === 401 && e.code === "key_expired");
  await authenticateApiKey(authDb({ expiresAt: new Date(Date.now() + 86_400_000) }), bearer(KEY));
});

test("auth: legacy keys (no /api/v1 scopes) can never call the public API", async () => {
  await assert.rejects(authenticateApiKey(authDb({ allowedEndpoints: ["/api/stats"] as any }), bearer(KEY)), status(403));
});

test("auth: a key without a tenant is refused rather than reading every client", async () => {
  await assert.rejects(authenticateApiKey(authDb({ clientId: null }), bearer(KEY)), (e: any) => e.status === 403 && e.code === "no_tenant");
});

test("auth: rate limit per minute and per hour answer 429", async () => {
  await assert.rejects(authenticateApiKey(authDb({}, { minute: 60, hour: 60 }), bearer(KEY)), status(429));
  await assert.rejects(authenticateApiKey(authDb({}, { minute: 1, hour: 1000 }), bearer(KEY)), status(429));
});

test("auth: MCP accepts the key in the URL (?key=), a real header still wins, bad key is 401", async () => {
  const viaUrl = withUrlKey(new Headers(), new URL(`https://x.test/api/mcp?key=${KEY}`));
  assert.equal((await authenticateApiKey(authDb({}), viaUrl)).clientId, "tenant-A");
  const headerWins = withUrlKey(bearer(KEY), new URL("https://x.test/api/mcp?key=cp_live_other"));
  assert.equal((await authenticateApiKey(authDb({}), headerWins)).clientId, "tenant-A");
  await assert.rejects(authenticateApiKey(authDb({}), withUrlKey(new Headers(), new URL("https://x.test/api/mcp?key=cp_live_nope"))), status(401));
  await assert.rejects(authenticateApiKey(authDb({}), withUrlKey(new Headers(), new URL("https://x.test/api/mcp"))), status(401));
});

test("redact: a key in a URL, query string or nested event never survives scrubbing", () => {
  assert.equal(redactApiKeys(`GET /api/mcp?key=${KEY}&a=1`), "GET /api/mcp?key=cp_live_[redacted]&a=1");
  const event = { request: { url: `https://h/api/mcp?key=${KEY}`, query_string: `key=${KEY}` }, spans: [{ data: { "url.full": `https://h/api/mcp?key=${KEY}` } }], breadcrumbs: [{ message: KEY }] };
  const out = JSON.stringify(scrubApiKeys(event));
  assert.ok(!out.includes(KEY) && !out.includes("cp_live_a"), out);
  assert.deepEqual(scrubApiKeys({ ok: 1 }), { ok: 1 });
});

// ============================================
// Scopes
// ============================================

test("scopes: allowed scope passes, other scope is 403", () => {
  const p = principal("tenant-A", ["contacts:read"]);
  requireScope(p, "contacts:read");
  assert.throws(() => requireScope(p, "calls:read"), (e: any) => e.status === 403 && e.code === "insufficient_scope");
});

test("scopes: stored in allowedEndpoints, unknown and write scopes are ignored (read-only v1)", () => {
  assert.deepEqual(scopesFromAllowedEndpoints(["/api/v1", "scope:calls:read", "scope:contacts:write", "scope:nope"]), ["calls:read"]);
  assert.deepEqual(scopesFromAllowedEndpoints(["/api/stats"]), []);
  assert.deepEqual(scopesFromAllowedEndpoints(null), []);
  for (const w of RESERVED_WRITE_SCOPES) assert.equal(isReadScope(w), false);
  assert.ok(READ_SCOPES.every((s) => s.endsWith(":read")));
});

// ============================================
// Multi-tenancy (CRITICAL)
// ============================================

/** A query on tenant-owned data must carry the principal's tenant. */
const TENANT_MODELS = new Set(["action", "opportunity", "contact", "company", "mission"]);

/** Every service function, called with hostile input trying to reach tenant B. */
const HOSTILE = { clientId: "tenant-B", tenantId: "tenant-B", tenant_id: "tenant-B" };
const runAll: Array<[string, (c: Ctx) => Promise<unknown>]> = [
  ["searchContacts", (c) => searchContacts(c, parseInput(searchContactsParams, { ...HOSTILE, mission_id: "mission-of-B", company_id: "company-of-B", assigned_to: "user-of-B", query: "x" }))],
  ["getContact", (c) => getContact(c, "contact-of-B")],
  ["getContactContext", (c) => getContactContext(c, "contact-of-B", parseInput(contactContextParams, {}))],
  ["searchCompanies", (c) => searchCompanies(c, parseInput(searchCompaniesParams, { ...HOSTILE, mission_id: "mission-of-B" }))],
  ["getCompany", (c) => getCompany(c, "company-of-B")],
  ["searchLeads", (c) => searchLeads(c, parseInput(searchLeadsParams, { ...HOSTILE, mission_id: "mission-of-B", company_id: "company-of-B" }))],
  ["getLead", (c) => getLead(c, "contact-of-B")],
  ["searchCalls", (c) => searchCalls(c, parseInput(searchCallsParams, { ...HOSTILE, contact_id: "contact-of-B", user_id: "user-of-B" }))],
  ["getCall", (c) => getCall(c, "call-of-B")],
  ["searchActivities", (c) => searchActivities(c, parseInput(searchActivitiesParams, { ...HOSTILE, company_id: "company-of-B" }))],
  ["searchAppointments", (c) => searchAppointments(c, parseInput(searchAppointmentsParams, { ...HOSTILE, mission_id: "mission-of-B" }))],
  ["searchUsers", (c) => searchUsers(c, parseInput(searchUsersParams, { ...HOSTILE }))],
  ["getUser", (c) => getUser(c, "user-of-B")],
  ["searchTeams", (c) => searchTeams(c, parseInput(searchTeamsParams, { ...HOSTILE }))],
  ["getTeam", (c) => getTeam(c, "team-of-B")],
  ["getSalesReport", (c) => getSalesReport(c, parseInput(salesReportParams, { ...HOSTILE, mission_id: "mission-of-B", compare_previous: "true" }))],
  ["getAccount", (c) => getAccount(c)],
  ["searchClients", (c) => searchClients(c, parseInput(searchClientsParams, { ...HOSTILE, query: "x" }))],
  ["searchCampaigns", (c) => searchCampaigns(c, parseInput(searchCampaignsParams, { ...HOSTILE, mission_id: "mission-of-B" }))],
  ["getCampaign", (c) => getCampaign(c, "campaign-of-B")],
  ["searchMissions", (c) => searchMissions(c, parseInput(searchMissionsParams, { ...HOSTILE, query: "x" }))],
  ["getMission", (c) => getMission(c, "mission-of-B")],
  ["searchLists", (c) => searchLists(c, parseInput(searchListsParams, { ...HOSTILE, mission_id: "mission-of-B" }))],
  ["getList", (c) => getList(c, "list-of-B")],
  ["getRdvOverview", (c) => getRdvOverview(c, parseInput(rdvOverviewParams, { ...HOSTILE, period: "this_month" }))],
  ["searchExclusions", (c) => searchExclusions(c, parseInput(searchExclusionsParams, { ...HOSTILE }))],
  ["getDailyReports", (c) => getDailyReports(c, parseInput(dailyReportsParams, { ...HOSTILE, user_id: "user-of-B" }))],
  ["getDataQuality", (c) => getDataQuality(c, parseInput(dataQualityParams, { ...HOSTILE, mission_id: "mission-of-B" }))],
  ["globalSearch", (c) => globalSearch(c, parseInput(globalSearchParams, { ...HOSTILE, query: "talis" }))],
];

test("tenant: hostile clientId/tenantId parameters are dropped before they reach a service", () => {
  const parsed = parseInput(searchContactsParams, { ...HOSTILE, query: "x" }) as Record<string, unknown>;
  for (const k of Object.keys(HOSTILE)) assert.equal(k in parsed, false, k);
});

for (const [name, run] of runAll) {
  test(`tenant: ${name} only ever queries with the key's tenant`, async () => {
    const { db, calls } = recordingDb();
    try {
      await run(ctx(A, db));
    } catch (e) {
      assert.ok(e instanceof ApiError && e.status === 404, `unexpected error: ${e}`);
    }
    assert.ok(calls.length > 0, "no query issued");

    const all = calls.map((c) => (c.model === "$queryRaw" ? json({ s: c.args.strings, v: c.args.values }) : json(c.args)));
    assert.ok(!all.some((q) => q.includes("tenant-B")), "tenant B leaked into a query");

    // Every query on tenant-owned data carries tenant A (raw SQL binds it as a parameter).
    for (const c of calls) {
      if (c.model === "$queryRaw") {
        const bound = c.args.values.filter((v: unknown) => v === "tenant-A").length;
        // /leads filters the actions AND the contact's own list; the report queries filter the actions.
        assert.ok(bound >= (name.includes("Lead") ? 2 : 1), "raw SQL must bind the tenant as a parameter");
      } else if (TENANT_MODELS.has(c.model) && c.method !== "groupBy") {
        const q = json(c.args.where);
        // Children of an already tenant-verified parent (contacts of a verified company) are the only exception.
        const verifiedParent = c.model === "contact" && name === "getCompany";
        assert.ok(verifiedParent || q.includes("tenant-A"), `${c.model}.${c.method} lacks the tenant: ${q}`);
      }
    }
  });
}

test("tenant: a contact of tenant A is a 404 for tenant B — the key, not the request, picks the tenant", async () => {
  const contactRow = { id: "ct1", firstName: "A", lastName: "B", title: null, email: null, phone: null, status: "ACTIONABLE", excludedAt: null, createdAt: new Date(), linkedin: null, additionalPhones: null, additionalEmails: null, unsubscribed: false, company: { id: "co1", name: "Acme" } };
  const { db } = recordingDb({
    "contact.findFirst": (a) => (json(a.where).includes('"clientId":"tenant-A"') ? contactRow : null),
  });
  assert.equal((await getContact(ctx(A, db), "ct1")).id, "ct1");
  await assert.rejects(getContact(ctx(B, db), "ct1"), status(404));
  await assert.rejects(getContactContext(ctx(B, db), "ct1", parseInput(contactContextParams, {})), status(404));
});

test("tenant: a key narrowed to one mission adds that mission to every filter", async () => {
  const { db, calls } = recordingDb();
  await searchCalls(ctx(principal("tenant-A", READ_SCOPES, "mission-1"), db), parseInput(searchCallsParams, {}));
  assert.ok(json(calls[0].args.where).includes('"id":"mission-1"'));
});

// ============================================
// Pagination
// ============================================

const contactRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `ct${i}`, firstName: "F", lastName: `L${i}`, title: null, email: null, phone: null, status: "ACTIONABLE",
    excludedAt: null, createdAt: new Date(), company: { id: "co", name: "Co" },
  }));

test("pagination: default 20, hard max 100, next_cursor only when more rows exist", async () => {
  assert.equal(parseInput(searchContactsParams, {}).limit, 20);
  assert.throws(() => parseInput(searchContactsParams, { limit: "1000" }), status(400));
  assert.throws(() => parseInput(searchContactsParams, { limit: "0" }), status(400));

  const { db, calls } = recordingDb({ "contact.findMany": () => contactRows(21) });
  const page = await searchContacts(ctx(A, db), parseInput(searchContactsParams, {}));
  assert.equal(calls[0].args.take, 21, "fetches limit+1, never the whole table");
  assert.equal(page.items.length, 20);
  assert.deepEqual(decodeCursor(page.next_cursor!), { id: "ct19" });

  const { db: db2 } = recordingDb({ "contact.findMany": () => contactRows(5) });
  assert.equal((await searchContacts(ctx(A, db2), parseInput(searchContactsParams, {}))).next_cursor, null);
});

test("pagination: the cursor resumes after the last row; a garbage cursor is ignored, not trusted", async () => {
  const first = recordingDb({ "contact.findMany": () => contactRows(21) });
  const page = await searchContacts(ctx(A, first.db), parseInput(searchContactsParams, {}));
  const next = recordingDb();
  await searchContacts(ctx(A, next.db), parseInput(searchContactsParams, { cursor: page.next_cursor }));
  assert.deepEqual(next.calls[0].args.cursor, { id: "ct19" });
  assert.equal(next.calls[0].args.skip, 1);

  const bad = recordingDb();
  await searchContacts(ctx(A, bad.db), parseInput(searchContactsParams, { cursor: "%%%not-base64-json" }));
  assert.equal(bad.calls[0].args.cursor, undefined);
});

// ============================================
// Contact context
// ============================================

const NOW = Date.now();
const day = (n: number) => new Date(NOW - n * 86_400_000);
const contactRow = {
  id: "ct1", firstName: "Alice", lastName: "Martin", title: "DG", email: "alice@acme.fr", phone: "+33612345678",
  status: "ACTIONABLE", excludedAt: null, createdAt: day(90), linkedin: null, additionalPhones: null, additionalEmails: null,
  company: {
    id: "co1", name: "Acme", industry: "BTP", website: "acme.fr", size: "50", country: "FR", phone: null,
    list: { id: "l1", name: "Liste BTP", mission: { id: "m1", name: "Mission BTP", status: "ACTIVE" }, commercialInterlocuteur: null },
  },
};
const callRow = (id: string, result: string, daysAgo: number, note: string | null = "RAS") => ({
  id, createdAt: day(daysAgo), channel: "CALL", result, note, duration: 42, callbackDate: null, callSummary: null, callRecordingUrl: "https://rec/secret.mp3",
  sdr: { id: "u1", name: "Marie" }, contact: { id: "ct1", firstName: "Alice", lastName: "Martin", company: { id: "co1", name: "Acme" } }, company: null,
});

function contextDb(opts: { calls?: any[]; touches?: any[]; groups?: any[]; appointments?: any[]; callback?: any } = {}) {
  return recordingDb({
    "contact.findFirst": () => contactRow,
    "action.findMany": (a) => {
      const w = json(a.where);
      if (w.includes('"channel":"CALL"')) return opts.calls ?? [];
      if (w.includes('"channel":{"not":"CALL"}')) return opts.touches ?? [];
      if (w.includes("MEETING_BOOKED")) return opts.appointments ?? [];
      return (opts.calls ?? []).filter((c) => c.note);
    },
    "action.groupBy": (a) =>
      a.by.includes("sdrId")
        ? opts.groups?.length ? [{ sdrId: "u1", _count: { _all: 4 }, _max: { createdAt: day(1) } }] : []
        : opts.groups ?? [],
    "action.findFirst": () => opts.callback ?? null,
    "user.findMany": () => [{ id: "u1", name: "Marie", role: "SDR" }],
  });
}
const group = (channel: string, result: string, n: number, last: number, first = last) => ({
  channel, result, _count: { _all: n }, _max: { createdAt: day(last) }, _min: { createdAt: day(first) },
});

test("context: unknown contact → 404", async () => {
  const { db } = recordingDb();
  await assert.rejects(getContactContext(ctx(A, db), "nope", parseInput(contactContextParams, {})), status(404));
});

test("context: a contact with no activity still returns every section", async () => {
  const { db } = contextDb();
  const c: any = await getContactContext(ctx(A, db), "ct1", parseInput(contactContextParams, {}));
  for (const k of ["contact", "company", "lead", "recent_calls", "recent_activities", "appointments", "notes", "assigned_users", "status", "last_interaction", "sales_summary"]) {
    assert.ok(k in c, `missing ${k}`);
  }
  assert.equal(c.contact.name, "Alice Martin");
  assert.equal(c.company.mission.name, "Mission BTP");
  assert.deepEqual(c.recent_calls, []);
  assert.equal(c.status.stage, "never_contacted");
  assert.equal(c.last_interaction, null);
  assert.equal(c.sales_summary.total_actions, 0);
  assert.equal(c.sales_summary.called_without_appointment, false);
  assert.equal(c.sales_summary.days_since_last_contact, null);
});

test("context: calls are summarised, newest first, recordings are never exposed", async () => {
  const calls = [callRow("c3", "RAPPEL", 1, "Rappeler jeudi"), callRow("c2", "NO_RESPONSE", 5), callRow("c1", "NO_RESPONSE", 9)];
  const { db } = contextDb({
    calls,
    groups: [group("CALL", "NO_RESPONSE", 2, 5, 9), group("CALL", "RAPPEL", 1, 1)],
    callback: { callbackDate: new Date(NOW + 86_400_000), result: "RAPPEL" },
  });
  const c: any = await getContactContext(ctx(A, db), "ct1", parseInput(contactContextParams, {}));
  assert.equal(c.recent_calls.length, 3);
  assert.equal(c.recent_calls[0].id, "c3");
  assert.equal(c.recent_calls[0].has_recording, true);
  assert.ok(!json(c).includes("secret.mp3"));
  assert.equal(c.sales_summary.call_count, 3);
  assert.deepEqual(c.sales_summary.calls_by_result, { NO_RESPONSE: 2, RAPPEL: 1 });
  assert.equal(c.sales_summary.called_without_appointment, true);
  assert.equal(c.sales_summary.days_since_last_contact, 1);
  assert.equal(c.status.stage, "to_follow_up");
  assert.ok(c.status.next_callback_at);
  assert.equal(c.last_interaction.result, "RAPPEL");
  assert.equal(c.assigned_users[0].name, "Marie");
  assert.equal(c.notes[0].text, "Rappeler jeudi");
});

test("context: email/LinkedIn touches are separate from calls", async () => {
  const touch = { ...callRow("e1", "MAIL_ENVOYE", 2), channel: "EMAIL" };
  const { db } = contextDb({ calls: [callRow("c1", "NO_RESPONSE", 3)], touches: [touch], groups: [group("CALL", "NO_RESPONSE", 1, 3), group("EMAIL", "MAIL_ENVOYE", 1, 2)] });
  const c: any = await getContactContext(ctx(A, db), "ct1", parseInput(contactContextParams, {}));
  assert.deepEqual(c.recent_calls.map((x: any) => x.id), ["c1"]);
  assert.deepEqual(c.recent_activities.map((x: any) => x.id), ["e1"]);
  assert.equal(c.sales_summary.total_actions, 2);
  assert.equal(c.sales_summary.call_count, 1);
});

test("context: appointments make the lead 'meeting_booked' and carry the client's outcome", async () => {
  const appointment = {
    id: "r1", createdAt: day(4), result: "MEETING_BOOKED", callbackDate: new Date(NOW + 5 * 86_400_000), meetingType: "VISIO", meetingCategory: "BESOIN",
    confirmationStatus: "CONFIRMED", cancellationReason: null, sdr: { id: "u1", name: "Marie" }, interlocuteur: { id: "i1", firstName: "Paul", lastName: "Durand" },
    meetingFeedback: { outcome: "POSITIVE", clientNote: "Très bon échange" },
  };
  const { db } = contextDb({ appointments: [appointment], groups: [group("CALL", "MEETING_BOOKED", 1, 4)] });
  const c: any = await getContactContext(ctx(A, db), "ct1", parseInput(contactContextParams, {}));
  assert.equal(c.status.stage, "meeting_booked");
  assert.equal(c.appointments.length, 1);
  assert.equal(c.appointments[0].status, "booked");
  assert.equal(c.appointments[0].outcome, "POSITIVE");
  assert.equal(c.appointments[0].commercial.name, "Paul Durand");
  assert.equal(c.sales_summary.appointments_booked, 1);
  assert.equal(c.sales_summary.called_without_appointment, false);
});

test("context: limits and include_* flags skip the queries entirely", async () => {
  const { db, calls } = contextDb({ calls: [callRow("c1", "NO_RESPONSE", 1)] });
  const c: any = await getContactContext(ctx(A, db), "ct1", parseInput(contactContextParams, { calls_limit: "0", activities_limit: "0", include_notes: "false", include_appointments: "false" }));
  assert.deepEqual([c.recent_calls, c.recent_activities, c.notes, c.appointments], [[], [], [], []]);
  assert.equal(calls.filter((x) => x.model === "action" && x.method === "findMany").length, 0);
  assert.throws(() => parseInput(contactContextParams, { calls_limit: "5000" }), status(400));
});

test("context: each section is gated by the scope that guards it elsewhere", async () => {
  const { db, calls } = contextDb({ calls: [callRow("c1", "NO_RESPONSE", 1)], groups: [group("CALL", "NO_RESPONSE", 1, 1)] });
  const c: any = await getContactContext(ctx(principal("tenant-A", ["contacts:read"]), db), "ct1", parseInput(contactContextParams, {}));
  assert.deepEqual(c.recent_calls, []);
  assert.deepEqual(c.appointments, []);
  assert.deepEqual(c.assigned_users, []);
  assert.equal(c.contact.name, "Alice Martin");
  assert.equal(c.limits.omitted_sections.length, 5);
  assert.ok(c.limits.omitted_sections.some((s: string) => s.includes("calls:read")));
  assert.equal(calls.filter((x) => x.model === "action" && x.method === "findMany").length, 0);
  assert.equal(calls.filter((x) => x.model === "opportunity").length, 0);
  assert.equal(calls.filter((x) => x.model === "user").length, 0);
});

// ============================================
// Leads, sales report
// ============================================

test("leads: stage filters become bound SQL parameters, never string concatenation", async () => {
  const { db, calls } = recordingDb();
  await searchLeads(
    ctx(A, db),
    parseInput(searchLeadsParams, { status: "to_follow_up", min_calls: "3", no_appointment: "true", callback_due_before: "2026-10-08", query: "x'; DROP TABLE \"Action\";--" }),
  );
  const sql = calls[0].args;
  assert.ok(!sql.strings.join("").includes("DROP TABLE"), "user text must be a parameter");
  assert.ok(sql.values.includes("to_follow_up"));
  assert.ok(sql.values.includes(3));
  assert.ok(sql.values.includes(21), "fetches limit+1");
  assert.ok(sql.values.some((v: unknown) => v instanceof Date && v.getUTCHours() === 23), "bare date is inclusive of the whole day");
});

test("leads: rows map to a compact lead and paginate with a keyset cursor", async () => {
  const row = (i: number) => ({
    contact_id: `ct${i}`, first_name: "A", last_name: `L${i}`, title: null, excluded_at: null, company_id: "co", company_name: "Acme", mission_id: "m", mission_name: "M",
    action_count: 5, call_count: 4, meeting_count: 0, last_action_at: day(i), last_call_at: day(i), last_result: "RAPPEL", next_callback_at: day(-1), last_sdr_id: "u1", last_sdr_name: "Marie", stage: "to_follow_up",
  });
  const { db } = recordingDb({ $queryRaw: () => Array.from({ length: 21 }, (_, i) => row(i)) });
  const page: any = await searchLeads(ctx(A, db), parseInput(searchLeadsParams, {}));
  assert.equal(page.items.length, 20);
  assert.equal(page.items[0].stage, "to_follow_up");
  assert.equal(page.items[0].call_count, 4);
  const cur: any = decodeCursor(page.next_cursor);
  assert.equal(cur.id, "ct19");
  assert.ok(cur.at);
  await assert.rejects(getLead(ctx(A, recordingDb().db), "nope"), status(404));
});

test("report: period is bounded and totals fold the grouped counts", async () => {
  await assert.rejects(getSalesReport(ctx(A, recordingDb().db), parseInput(salesReportParams, { date_from: "2020-01-01", date_to: "2026-01-01" })), status(400));
  await assert.rejects(getSalesReport(ctx(A, recordingDb().db), parseInput(salesReportParams, { date_from: "2026-02-01", date_to: "2026-01-01" })), status(400));

  const { db } = recordingDb({
    "action.groupBy": (a) =>
      a.by.includes("confirmationStatus")
        ? [{ confirmationStatus: "CONFIRMED", _count: { _all: 1 } }]
        : [
            { campaignId: "cp1", sdrId: "u1", channel: "CALL", result: "NO_RESPONSE", _count: { _all: 40 } },
            { campaignId: "cp1", sdrId: "u1", channel: "CALL", result: "MEETING_BOOKED", _count: { _all: 2 } },
            { campaignId: "cp1", sdrId: "u1", channel: "EMAIL", result: "MAIL_ENVOYE", _count: { _all: 8 } },
          ],
    "campaign.findMany": () => [{ id: "cp1", mission: { id: "m1", name: "Mission BTP", client: { id: "tenant-A", name: "Client A" } } }],
    "user.findMany": () => [{ id: "u1", name: "Marie" }],
  });
  const r: any = await getSalesReport(ctx(A, db), parseInput(salesReportParams, {}));
  assert.equal(r.totals.calls, 42);
  assert.equal(r.totals.emails, 8);
  assert.equal(r.totals.appointments_booked, 2);
  assert.equal(r.totals.appointments_confirmed, 1);
  assert.equal(r.totals.appointments_per_100_calls, 4.8);
  assert.equal(r.by_user[0].name, "Marie");
  assert.equal(r.by_mission[0].name, "Mission BTP");
});

// ============================================
// MCP
// ============================================

const REQUIRED_TOOLS = [
  "search_contacts", "get_contact", "get_contact_context", "search_companies", "get_company", "search_leads", "get_lead",
  "search_calls", "get_call", "search_activities", "search_appointments", "get_team", "get_user", "get_sales_report",
  "whoami", "global_search",
  "list_clients", "list_campaigns", "get_campaign", "list_missions", "get_mission", "list_lists", "get_list", "get_rdv_overview", "list_exclusions", "get_daily_reports", "get_data_quality",
];

test("mcp: the required tools exist, are unique, read-only and map to a read scope", () => {
  const names = TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const n of REQUIRED_TOOLS) assert.ok(names.includes(n), n);
  for (const t of TOOLS) {
    assert.ok(t.scope === null || isReadScope(t.scope), `${t.name} scope`);
    assert.ok(t.description.length > 20, `${t.name} description`);
    assert.ok(!("clientId" in t.shape) && !("tenantId" in t.shape), `${t.name} must not take a tenant`);
  }
});

test("mcp: every tool runs against the service layer and is scoped to the key's tenant", async () => {
  for (const t of TOOLS) {
    const { db, calls } = recordingDb();
    const args = t.idArg ? { [t.idArg]: "some-id" } : {};
    try {
      await t.run(ctx(A, db), { ...args, query: "abc", clientId: "tenant-B" });
    } catch (e) {
      assert.ok(e instanceof ApiError && e.status === 404, `${t.name}: ${e}`);
    }
    assert.ok(calls.length > 0, `${t.name} issued no query`);
    assert.ok(!calls.some((c) => json(c.args?.where ?? c.args?.values).includes("tenant-B")), `${t.name} leaked tenant B`);
  }
});

async function connect(p: Principal, db: any) {
  const records: AccessEntry[] = [];
  const server = buildMcpServer(p, db, (e) => records.push(e));
  const client = new Client({ name: "test", version: "1" });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(s), client.connect(c)]);
  return { client, records };
}

test("mcp protocol: tools/list exposes JSON-schema'd tools, filtered by the key's scopes", async () => {
  const full = await connect(A, recordingDb().db);
  const { tools } = await full.client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS.map((t) => t.name).sort());
  const ctxTool = tools.find((t) => t.name === "get_contact_context")!;
  assert.ok((ctxTool.inputSchema.properties as any).contact_id);
  assert.ok((ctxTool.inputSchema.properties as any).calls_limit);
  assert.equal(ctxTool.annotations?.readOnlyHint, true);

  const limited = await connect(principal("tenant-A", ["calls:read"]), recordingDb().db);
  assert.deepEqual((await limited.client.listTools()).tools.map((t) => t.name).sort(), ["get_call", "global_search", "search_calls", "whoami"]);
});

test("mcp protocol: tool calls return compact JSON, errors are isError, and the audit trail has ids but no search text", async () => {
  const { db } = recordingDb({ "contact.findMany": () => contactRows(2) });
  const { client, records } = await connect(A, db);

  const ok: any = await client.callTool({ name: "search_contacts", arguments: { query: "confidential-term", limit: 5 } });
  assert.ok(!ok.isError);
  const body = JSON.parse(ok.content[0].text);
  assert.equal(body.items.length, 2);

  const missing: any = await client.callTool({ name: "get_contact", arguments: { contact_id: "ghost" } });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /not_found/);

  const bad: any = await client.callTool({ name: "search_contacts", arguments: { limit: 9999 } });
  assert.equal(bad.isError, true);

  const endpoints = records.map((r) => r.endpoint);
  assert.ok(endpoints.includes("/mcp/get_contact/ghost"));
  assert.ok(endpoints.some((e) => e.startsWith("/mcp/search_contacts?params=")));
  assert.ok(!endpoints.join(" ").includes("confidential-term"));
  assert.equal(records.find((r) => r.endpoint === "/mcp/get_contact/ghost")!.status, 404);
});
