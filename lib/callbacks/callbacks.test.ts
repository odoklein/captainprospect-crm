/**
 * Pending-callback rules: npm run test:callbacks
 *  - which actions are still live (real SQL on PGlite),
 *  - orphan detection,
 *  - reading a date from a note (Europe/Paris, whatever the machine timezone),
 *  - the "(Rappel programmé: …)" note suffix,
 *  - the queue gate (not before its day, author first).
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

import { supersededSql, orphanSql, buildLiveCallbacksQuery, type CallbackScope } from "./sql";
import { callbackCodesFromStatuses, callbackCodesForUi, isCallbackStatus } from "./codes";
import { withScheduledText, stripScheduledText } from "./note";
import { parseDateFromNote, defaultCallbackDate, formatParisDateTime } from "../utils/parseDateFromNote";
import { callbackGate } from "../sdr-queue/callback-gate";

// ============================================
// SQL — superseded / orphan
// ============================================

let db: PGlite;

async function exec(sql: { text: string; values: unknown[] }) {
    // .text = Postgres $1 placeholders (.sql is the "?" flavour).
    return db.query<{ id: string }>(sql.text, sql.values as unknown[]);
}

before(async () => {
    db = new PGlite();
    await db.exec(`
        CREATE TABLE "User" (id text PRIMARY KEY, name text, role text NOT NULL, "isActive" boolean NOT NULL DEFAULT true);
        CREATE TABLE "Campaign" (id text PRIMARY KEY, "missionId" text NOT NULL);
        CREATE TABLE "Company" (id text PRIMARY KEY, "linkedFromId" text, "listId" text);
        CREATE TABLE "Contact" (id text PRIMARY KEY, "companyId" text);
        CREATE TABLE "SDRAssignment" ("sdrId" text, "missionId" text);
        CREATE TABLE "Action" (id text PRIMARY KEY, "contactId" text, "companyId" text, "sdrId" text,
            "campaignId" text, result text, "createdAt" timestamptz, "callbackDate" timestamptz);

        INSERT INTO "User" VALUES ('anais','Anaïs','SDR',true), ('tom','Tom','SDR',true),
            ('gone','Ex-SDR','SDR',false), ('moved','Moved','SDR',true), ('booker','B','BOOKER',true);
        INSERT INTO "Campaign" VALUES ('camp-m1','m1'), ('camp-m2','m2');
        INSERT INTO "Company" VALUES ('acme',NULL), ('acme-copy','acme'), ('beta',NULL);
        INSERT INTO "SDRAssignment" VALUES ('anais','m1'), ('tom','m1'), ('gone','m1'), ('anais','m2');

        -- 1. Contact callback; later a colleague calls ANOTHER contact of the same company: still live.
        INSERT INTO "Action" VALUES ('cb-contact','ct-dg','acme','anais','camp-m1','CALLBACK_REQUESTED','2026-11-20T10:00Z','2026-11-26T09:00Z');
        INSERT INTO "Action" VALUES ('other-contact','ct-standard','acme','tom','camp-m1','NO_RESPONSE','2026-11-21T10:00Z',NULL);
        -- 2. Same contact called again in ANOTHER mission: still live in m1.
        INSERT INTO "Action" VALUES ('other-mission','ct-dg','acme','anais','camp-m2','NO_RESPONSE','2026-11-22T10:00Z',NULL);
        -- 3. Contact callback then the same contact called again in the same mission: superseded.
        INSERT INTO "Action" VALUES ('cb-done','ct-x','beta','anais','camp-m1','RAPPEL','2026-11-20T10:00Z','2026-11-21T09:00Z');
        INSERT INTO "Action" VALUES ('done-by','ct-x','beta','tom','camp-m1','INTERESTED','2026-11-21T09:05Z',NULL);
        -- 4. Company-only callback, then a call on the imported copy of the company: superseded.
        INSERT INTO "Action" VALUES ('cb-company',NULL,'acme','anais','camp-m1','RELANCE','2026-11-20T10:00Z','2026-11-25T09:00Z');
        INSERT INTO "Action" VALUES ('on-copy',NULL,'acme-copy','tom','camp-m1','NO_RESPONSE','2026-11-20T11:00Z',NULL);
        -- 5. CSV import: two statuses with the same timestamp; only the last (higher id) stays.
        INSERT INTO "Action" VALUES ('imp-a','ct-imp','beta','anais','camp-m1','CALLBACK_REQUESTED','2026-10-01T00:00Z','2026-11-24T09:00Z');
        INSERT INTO "Action" VALUES ('imp-b','ct-imp','beta','anais','camp-m1','CALLBACK_REQUESTED','2026-10-01T00:00Z','2026-11-24T09:00Z');
        -- Orphans
        INSERT INTO "Action" VALUES ('cb-gone','ct-g','beta','gone','camp-m1','CALLBACK_REQUESTED','2026-11-01T00:00Z','2026-11-24T09:00Z');
        INSERT INTO "Action" VALUES ('cb-moved','ct-m','beta','moved','camp-m1','CALLBACK_REQUESTED','2026-11-01T00:00Z','2026-11-24T09:00Z');
        INSERT INTO "Action" VALUES ('cb-booker','ct-b','beta','booker','camp-m1','CALLBACK_REQUESTED','2026-11-01T00:00Z','2026-11-24T09:00Z');
    `);
});

after(async () => {
    await db.close();
});

async function supersededIds(): Promise<Set<string>> {
    const frag = supersededSql();
    const rows = await db.query<{ id: string }>(
        `SELECT a.id FROM "Action" a JOIN "Campaign" c ON c.id = a."campaignId" WHERE ${frag.text}`,
        frag.values as unknown[],
    );
    return new Set(rows.rows.map((r) => r.id));
}

test("a call to a colleague at the same company does not close a contact callback", async () => {
    assert.equal((await supersededIds()).has("cb-contact"), false);
});

test("a call in another mission does not close the callback", async () => {
    assert.equal((await supersededIds()).has("cb-contact"), false);
    assert.equal((await supersededIds()).has("other-mission"), false);
});

test("a newer action on the same contact in the same mission closes it", async () => {
    assert.equal((await supersededIds()).has("cb-done"), true);
});

test("a company callback is closed by a call on the company's imported copy", async () => {
    assert.equal((await supersededIds()).has("cb-company"), true);
});

test("same-timestamp import rows: only the last one stays live", async () => {
    const s = await supersededIds();
    assert.equal(s.has("imp-a"), true);
    assert.equal(s.has("imp-b"), false);
});

test("orphan: disabled author or author no longer assigned; never a booker's", async () => {
    const frag = orphanSql();
    const rows = await db.query<{ id: string }>(
        `SELECT a.id FROM "Action" a JOIN "Campaign" c ON c.id = a."campaignId" JOIN "User" u ON u.id = a."sdrId" WHERE ${frag.text}`,
        frag.values as unknown[],
    );
    const ids = new Set(rows.rows.map((r) => r.id));
    assert.ok(ids.has("cb-gone"));
    assert.ok(ids.has("cb-moved"));
    assert.ok(!ids.has("cb-booker"));
    assert.ok(!ids.has("cb-contact"));
});

const CODES = ["CALLBACK_REQUESTED", "RELANCE", "RAPPEL"];
async function live(scope: CallbackScope): Promise<string[]> {
    const q = buildLiveCallbacksQuery(scope, CODES);
    return (await exec(q)).rows.map((r) => r.id);
}

test("full query — Anaïs's default view: hers + orphans of her missions, in date order", async () => {
    const ids = await live({ sdrIds: ["anais"], orphanMissionIds: ["m1", "m2"] });
    assert.deepEqual(ids, ["cb-gone", "cb-moved", "imp-b", "cb-contact"]);
});

test("full query — urgent view keeps only assigned authors' callbacks + orphans, due before a cutoff", async () => {
    const ids = await live({
        sdrIds: ["anais"], requireAuthorAssigned: true, orphanMissionIds: ["m1"],
        dueBefore: new Date("2026-11-25T00:00:00Z"),
    });
    assert.deepEqual(ids.sort(), ["cb-gone", "cb-moved", "imp-b"]);
});

test("full query — team view flags orphans", async () => {
    const rows = (await db.query<{ id: string; orphan: boolean }>(
        buildLiveCallbacksQuery({ missionIds: ["m1"] }, CODES).text,
        buildLiveCallbacksQuery({ missionIds: ["m1"] }, CODES).values as unknown[],
    )).rows;
    const orphans = rows.filter((r) => r.orphan).map((r) => r.id).sort();
    assert.deepEqual(orphans, ["cb-gone", "cb-moved"]);
    assert.ok(rows.some((r) => r.id === "cb-booker" && !r.orphan));
});

// ============================================
// SQL — equivalence with the previous superseded rule
// ============================================

// The rule before the split into index-friendly EXISTS (one EXISTS with an OR;
// 60 s+ in production at ~87k actions). Kept verbatim as the reference.
const LEGACY_SUPERSEDED = `EXISTS (
        SELECT 1 FROM "Action" b
        JOIN "Campaign" cb ON cb.id = b."campaignId"
        WHERE cb."missionId" = c."missionId"
          AND b.id <> a.id
          AND (b."createdAt" > a."createdAt" OR (b."createdAt" = a."createdAt" AND b.id > a.id))
          AND (
            (a."contactId" IS NOT NULL AND b."contactId" = a."contactId")
            OR (
              a."contactId" IS NULL AND a."companyId" IS NOT NULL AND b."companyId" IN (
                SELECT co.id FROM "Company" co
                WHERE co.id = a."companyId"
                   OR co."linkedFromId" = a."companyId"
                   OR co.id = (SELECT "linkedFromId" FROM "Company" WHERE id = a."companyId")
              )
            )
          )
    )`;

function legacyLiveQuery(scope: CallbackScope, codes: string[]) {
    const q = buildLiveCallbacksQuery(scope, codes);
    const current = supersededSql().text;
    assert.ok(q.text.includes(current));
    return { text: q.text.replace(current, LEGACY_SUPERSEDED), values: q.values as unknown[] };
}

async function supersededPair(target: PGlite): Promise<{ legacy: string[]; current: string[] }> {
    const from = `SELECT a.id FROM "Action" a JOIN "Campaign" c ON c.id = a."campaignId" WHERE`;
    const legacy = await target.query<{ id: string }>(`${from} ${LEGACY_SUPERSEDED} ORDER BY a.id`);
    const current = await target.query<{ id: string }>(`${from} ${supersededSql().text} ORDER BY a.id`);
    return { legacy: legacy.rows.map((r) => r.id), current: current.rows.map((r) => r.id) };
}

test("equivalence — fixture above: same superseded actions as the previous rule", async () => {
    const { legacy, current } = await supersededPair(db);
    assert.deepEqual(current, legacy);
});

// Small deterministic PRNG so a failure is reproducible.
function prng(seed: number) {
    return () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };
}

test("equivalence — dense random history (shared contacts, linked companies, tied timestamps)", async () => {
    const rnd = prng(20261126);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
    const r = new PGlite();
    try {
        await r.exec(`
            CREATE TABLE "User" (id text PRIMARY KEY, name text, role text NOT NULL, "isActive" boolean NOT NULL DEFAULT true);
            CREATE TABLE "Campaign" (id text PRIMARY KEY, "missionId" text NOT NULL);
            CREATE TABLE "Company" (id text PRIMARY KEY, "linkedFromId" text, "listId" text);
            CREATE TABLE "Contact" (id text PRIMARY KEY, "companyId" text);
            CREATE TABLE "SDRAssignment" ("sdrId" text, "missionId" text);
            CREATE TABLE "Action" (id text PRIMARY KEY, "contactId" text, "companyId" text, "sdrId" text,
                "campaignId" text, result text, "createdAt" timestamptz, "callbackDate" timestamptz);
            CREATE INDEX ON "Action" ("contactId", "createdAt");
            CREATE INDEX ON "Action" ("companyId", "createdAt");
            CREATE INDEX ON "Company" ("linkedFromId");
        `);
        const users = ["u1", "u2", "u3", "u4", "u5"];
        const missions = ["m1", "m2", "m3"];
        const campaigns = ["k1", "k2", "k3", "k4", "k5"]; // k1,k4 → m1; k2,k5 → m2; k3 → m3
        const companies = Array.from({ length: 24 }, (_, i) => `co${i}`);
        const contacts = Array.from({ length: 40 }, (_, i) => `ct${i}`);
        const sql: string[] = [];
        sql.push(`INSERT INTO "User" VALUES ('u1','A','SDR',true),('u2','B','SDR',true),('u3','C','SDR',false),('u4','D','BOOKER',true),('u5','E','SDR',true);`);
        sql.push(`INSERT INTO "Campaign" VALUES ('k1','m1'),('k2','m2'),('k3','m3'),('k4','m1'),('k5','m2');`);
        sql.push(`INSERT INTO "SDRAssignment" VALUES ('u1','m1'),('u1','m2'),('u2','m1'),('u3','m1'),('u5','m3');`);
        // Copies (linkedFromId → original), copies of copies, two copies of one original,
        // and a 2-cycle: every shape the company rule can meet.
        const linked: Record<string, string | null> = {};
        companies.forEach((c) => (linked[c] = null));
        Object.assign(linked, { co1: "co0", co2: "co0", co3: "co1", co5: "co4", co7: "co6", co6: "co7", co9: "co8", co11: "co10", co12: "co11" });
        sql.push(`INSERT INTO "Company" VALUES ${companies.map((c) => `('${c}',${linked[c] ? `'${linked[c]}'` : "NULL"},'l${c.length % 2}')`).join(",")};`);
        const contactCompany: Record<string, string> = {};
        contacts.forEach((ct, i) => (contactCompany[ct] = companies[i % 14]));
        sql.push(`INSERT INTO "Contact" VALUES ${contacts.map((ct) => `('${ct}','${contactCompany[ct]}')`).join(",")};`);
        const results = ["CALLBACK_REQUESTED", "RELANCE", "RAPPEL", "NO_RESPONSE", "INTERESTED", "MEETING_BOOKED"];
        const rows: string[] = [];
        for (let n = 0; n < 1500; n++) {
            const companyOnly = rnd() < 0.35;
            const contact = companyOnly ? null : pick(contacts);
            // Contact actions usually carry their company; some don't, some point elsewhere.
            const company = companyOnly ? pick(companies) : rnd() < 0.8 ? contactCompany[contact!] : rnd() < 0.5 ? null : pick(companies);
            // Few distinct timestamps: many ties, broken by id.
            const createdAt = new Date(Date.UTC(2026, 9, 1) + Math.floor(rnd() * 120) * 3_600_000).toISOString();
            const callbackDate = rnd() < 0.8 ? new Date(Date.UTC(2026, 10, 1) + Math.floor(rnd() * 60) * 86_400_000).toISOString() : null;
            const q = (v: string | null) => (v === null ? "NULL" : `'${v}'`);
            rows.push(`('x${(n * 7919) % 1500}-${n}',${q(contact)},${q(company)},'${pick(users)}','${pick(campaigns)}','${pick(results)}','${createdAt}',${q(callbackDate)})`);
        }
        sql.push(`INSERT INTO "Action" VALUES ${rows.join(",")};`);
        await r.exec(sql.join("\n") + "\nANALYZE;");

        const { legacy, current } = await supersededPair(r);
        assert.ok(legacy.length > 300 && legacy.length < 1400, `superseded: ${legacy.length}`);
        assert.deepEqual(current, legacy);

        const scopes: CallbackScope[] = [
            {},
            { missionIds: ["m1", "m3"] },
            { sdrIds: ["u1"], orphanMissionIds: ["m1", "m2"] },
            { sdrIds: ["u1", "u2"], requireAuthorAssigned: true, orphanMissionIds: ["m1"], dueBefore: new Date("2026-12-01T00:00:00Z") },
            { listId: "l1", dateFrom: new Date("2026-11-10T00:00:00Z"), dateTo: new Date("2026-12-20T00:00:00Z") },
        ];
        for (const scope of scopes) {
            const now = buildLiveCallbacksQuery(scope, CODES);
            const before = legacyLiveQuery(scope, CODES);
            const a = (await r.query(now.text, now.values as unknown[])).rows;
            const b = (await r.query(before.text, before.values)).rows;
            assert.ok(b.length > 0, `scope ${JSON.stringify(scope)} returns rows`);
            // Same rows, same order (the ORDER BY ends on a.id, so it is total).
            assert.deepEqual(a, b, `scope ${JSON.stringify(scope)}`);
        }
    } finally {
        await r.close();
    }
});

// ============================================
// Codes
// ============================================

test("callback codes: flag or default code, never guessed from the name", () => {
    const statuses = [
        { code: "A_RAPPELER", label: "À rappeler", triggersCallback: true },
        { code: "NE_PAS_RAPPELER", label: "Ne pas rappeler", triggersCallback: false },
        { code: "PROJET_A_SUIVRE", label: "Projet à suivre", triggersCallback: true },
    ];
    const stored = callbackCodesFromStatuses(statuses);
    assert.ok(stored.has("CALLBACK_REQUESTED"));
    assert.ok(stored.has("PROJET_A_SUIVRE"));
    assert.ok(!stored.has("NE_PAS_RAPPELER"));
    const ui = callbackCodesForUi(statuses);
    assert.ok(ui.has("A_RAPPELER"));
    assert.ok(!ui.has("NE_PAS_RAPPELER"));
    assert.equal(isCallbackStatus({ code: "RELANCE", label: "Relance", triggersCallback: false }), true);
});

// ============================================
// Dates from notes — Europe/Paris
// ============================================

// Monday 23 Nov 2026, 15:00 Paris (14:00 UTC).
const NOW = new Date("2026-11-23T14:00:00Z");

test("demain = tomorrow 09:00 Paris (08:00 UTC in winter)", () => {
    assert.equal(parseDateFromNote("rappeler demain", NOW)?.toISOString(), "2026-11-24T08:00:00.000Z");
});

test("negated mention is skipped: 'pas demain, rappeler lundi'", () => {
    assert.equal(parseDateFromNote("pas demain, rappeler lundi", NOW)?.toISOString(), "2026-11-30T08:00:00.000Z");
});

test("explicit date with time, in Paris time", () => {
    assert.equal(parseDateFromNote("Rappeler le 30/01/2027 à 14h30", NOW)?.toISOString(), "2027-01-30T13:30:00.000Z");
});

test("summer time: 09:00 Paris is 07:00 UTC", () => {
    assert.equal(parseDateFromNote("rappel le 15/06/2027", NOW)?.toISOString(), "2027-06-15T07:00:00.000Z");
});

test("date without a year: next occurrence", () => {
    assert.equal(parseDateFromNote("rappeler le 05/01", NOW)?.toISOString(), "2027-01-05T08:00:00.000Z");
});

test("dans 2 semaines / après-demain", () => {
    assert.equal(parseDateFromNote("dans 2 semaines", NOW)?.toISOString(), "2026-12-07T08:00:00.000Z");
    assert.equal(parseDateFromNote("après-demain", NOW)?.toISOString(), "2026-11-25T08:00:00.000Z");
});

test("phone numbers and impossible dates are not dates", () => {
    assert.equal(parseDateFromNote("son portable 06.12.34.56.78", NOW), null);
    assert.equal(parseDateFromNote("le 31/02/2027", NOW), null);
});

test("past date is ignored", () => {
    assert.equal(parseDateFromNote("rappelé le 01/11/2026", NOW), null);
});

test("default date: next working day 09:00 Paris", () => {
    // Friday 27 Nov 2026 → Monday 30 Nov.
    assert.equal(defaultCallbackDate(new Date("2026-11-27T16:00:00Z")).toISOString(), "2026-11-30T08:00:00.000Z");
});

// ============================================
// Note suffix
// ============================================

test("note suffix is written in Paris time and replaced, not stacked", () => {
    const first = withScheduledText("Veut une démo", new Date("2026-11-24T08:00:00Z"));
    assert.equal(first, "Veut une démo (Rappel programmé: 24/11/2026 09:00)");
    const moved = withScheduledText(first, new Date("2026-11-26T13:00:00Z"));
    assert.equal(moved, "Veut une démo (Rappel programmé: 26/11/2026 14:00)");
    // Legacy suffix written by the old server code is replaced too.
    assert.equal(stripScheduledText("Note (Rappel programmé: 24/11/2026 08:00)"), "Note");
    assert.equal(formatParisDateTime(new Date("2026-07-01T07:00:00Z")), "01/07/2026 09:00");
    assert.ok(withScheduledText("x".repeat(600), NOW).length <= 500);
});

// ============================================
// Queue gate
// ============================================

test("queue gate: not before its day, author first, team after a day late", () => {
    const codes = new Set(["CALLBACK_REQUESTED"]);
    const row = (date: string, sdr = "anais") => ({ last_action_result: "CALLBACK_REQUESTED", last_action_callback_date: date, last_action_sdr_id: sdr });
    assert.equal(callbackGate(row("2027-01-10T08:00:00Z"), "anais", codes, NOW), "scheduled");
    assert.equal(callbackGate(row("2026-11-23T20:00:00Z"), "anais", codes, NOW), "open"); // later today
    assert.equal(callbackGate(row("2026-11-23T08:00:00Z"), "tom", codes, NOW), "owned_by_other");
    assert.equal(callbackGate(row("2026-11-21T08:00:00Z"), "tom", codes, NOW), "open");
    assert.equal(callbackGate({ ...row("x"), last_action_result: "NO_RESPONSE" }, "tom", codes, NOW), "not_callback");
});
