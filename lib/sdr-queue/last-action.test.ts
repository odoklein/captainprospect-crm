/**
 * "Dernière action" resolution for the SDR queue, run on an in-process Postgres
 * (PGlite) so the real SQL shared by /api/sdr/action-queue and
 * /api/actions/next is what gets tested:
 *     npm run test:sdr-queue
 *
 * The case that matters: a company with several contacts. Each contact row must
 * show its own last action — result, note, SDR and callback from the same
 * Action — and never a sibling's comment. The company-wide last action is only
 * exposed separately, for the "Entreprise déjà contactée" warning.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

import { LAST_ACTION_CTES, contactedWarningContext } from "./last-action";

// ============================================
// FIXTURE — Acme has three contacts, Beta one, Gamma none
// ============================================

interface FixtureAction {
    id: string;
    contactId: string | null;
    companyId: string | null;
    result: string;
    note: string | null;
    createdAt: string;
    callbackDate: string | null;
    sdrId: string;
}

const USERS = [
    { id: "sdr-marie", name: "Marie" },
    { id: "sdr-julien", name: "Julien" },
];

const CONTACTS = [
    { id: "ct-alice", companyId: "co-acme" },
    { id: "ct-bob", companyId: "co-acme" },
    { id: "ct-chloe", companyId: "co-acme" }, // never contacted
    { id: "ct-dan", companyId: "co-beta" },
];

const ACTIONS: FixtureAction[] = [
    // Alice: an older call, then the most recent action of the whole company.
    { id: "a1", contactId: "ct-alice", companyId: "co-acme", result: "NO_RESPONSE", note: "Messagerie", createdAt: "2026-09-10T09:00:00Z", callbackDate: null, sdrId: "sdr-julien" },
    { id: "a2", contactId: "ct-alice", companyId: "co-acme", result: "CALLBACK_REQUESTED", note: "Rappeler jeudi, budget à valider", createdAt: "2026-09-18T14:00:00Z", callbackDate: "2026-09-24T09:00:00Z", sdrId: "sdr-marie" },
    // Bob: last action has no note, and predates companyId stamping on contact actions.
    { id: "b1", contactId: "ct-bob", companyId: null, result: "NO_RESPONSE", note: null, createdAt: "2026-09-15T11:00:00Z", callbackDate: null, sdrId: "sdr-julien" },
    // Dan, at another company, is more recent than anything at Acme.
    { id: "d1", contactId: "ct-dan", companyId: "co-beta", result: "INTERESTED", note: "Envoyer la plaquette", createdAt: "2026-09-19T10:00:00Z", callbackDate: null, sdrId: "sdr-marie" },
    // Gamma has no contacts: its row is the company itself.
    { id: "g1", contactId: null, companyId: "co-gamma", result: "BAD_CONTACT", note: "Standard injoignable", createdAt: "2026-09-17T16:00:00Z", callbackDate: null, sdrId: "sdr-julien" },
];

const TARGETS: Array<{ contact_id: string | null; company_id: string }> = [
    ...CONTACTS.map((c) => ({ contact_id: c.id, company_id: c.companyId })),
    { contact_id: null, company_id: "co-gamma" },
];

interface Row {
    contact_id: string | null;
    company_id: string;
    last_action_result: string | null;
    last_action_note: string | null;
    last_action_created: Date | null;
    last_action_callback_date: Date | null;
    last_action_sdr_id: string | null;
    last_action_sdr_name: string | null;
    last_action_scope: "CONTACT" | "COMPANY" | null;
    company_last_action_result: string | null;
    company_last_action_note: string | null;
    company_last_action_created: Date | null;
    company_last_action_sdr_id: string | null;
}

let db: PGlite;
let rows: Row[];

function rowFor(contactId: string | null, companyId?: string): Row {
    const row = rows.find((r) => r.contact_id === contactId && (companyId === undefined || r.company_id === companyId));
    assert.ok(row, `no queue row for ${contactId ?? companyId}`);
    return row;
}

function latest(actions: FixtureAction[]): FixtureAction | null {
    return [...actions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

function companyOf(action: FixtureAction): string | null {
    return action.companyId ?? CONTACTS.find((c) => c.id === action.contactId)?.companyId ?? null;
}

before(async () => {
    db = new PGlite();
    await db.exec(`
        CREATE TABLE "User" (id text PRIMARY KEY, name text);
        CREATE TABLE "Company" (id text PRIMARY KEY);
        CREATE TABLE "Contact" (id text PRIMARY KEY, "companyId" text NOT NULL REFERENCES "Company"(id));
        CREATE TABLE "Action" (
            id text PRIMARY KEY,
            "contactId" text REFERENCES "Contact"(id),
            "companyId" text REFERENCES "Company"(id),
            result text NOT NULL,
            note text,
            "createdAt" timestamptz NOT NULL,
            "callbackDate" timestamptz,
            "sdrId" text NOT NULL REFERENCES "User"(id)
        );
    `);
    for (const u of USERS) await db.query(`INSERT INTO "User" VALUES ($1, $2)`, [u.id, u.name]);
    for (const id of ["co-acme", "co-beta", "co-gamma"]) await db.query(`INSERT INTO "Company" VALUES ($1)`, [id]);
    for (const c of CONTACTS) await db.query(`INSERT INTO "Contact" VALUES ($1, $2)`, [c.id, c.companyId]);
    for (const a of ACTIONS) {
        await db.query(
            `INSERT INTO "Action" VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [a.id, a.contactId, a.companyId, a.result, a.note, a.createdAt, a.callbackDate, a.sdrId]
        );
    }

    const targetsSql = TARGETS
        .map((t) => `(${t.contact_id ? `'${t.contact_id}'` : "NULL"}::text, '${t.company_id}'::text)`)
        .join(", ");
    const res = await db.query<Row>(`
        WITH all_targets (contact_id, company_id) AS (VALUES ${targetsSql}),
        ${LAST_ACTION_CTES}
        SELECT * FROM targets_with_last_action
    `);
    rows = res.rows;
});

after(async () => {
    await db?.close();
});

// ============================================
// ONE ROW PER TARGET, EACH WITH ITS OWN HISTORY
// ============================================

test("returns exactly one row per queue target", () => {
    assert.equal(rows.length, TARGETS.length);
});

test("each contact of a multi-contact company shows its own last action, never a sibling's", () => {
    // Result, note, date, callback and SDR must all come from the contact's own latest Action.
    for (const contact of CONTACTS) {
        const own = latest(ACTIONS.filter((a) => a.contactId === contact.id));
        const row = rowFor(contact.id);
        assert.equal(row.last_action_result, own?.result ?? null, `${contact.id} result`);
        assert.equal(row.last_action_note, own?.note ?? null, `${contact.id} note`);
        assert.equal(row.last_action_created?.toISOString() ?? null, own ? new Date(own.createdAt).toISOString() : null, `${contact.id} date`);
        assert.equal(row.last_action_callback_date?.toISOString() ?? null, own?.callbackDate ? new Date(own.callbackDate).toISOString() : null, `${contact.id} callback`);
        assert.equal(row.last_action_sdr_id, own?.sdrId ?? null, `${contact.id} sdr`);
    }
});

test("a contact whose last action has no note does not borrow a sibling's note", () => {
    const bob = rowFor("ct-bob");
    assert.equal(bob.last_action_result, "NO_RESPONSE");
    assert.equal(bob.last_action_note, null);
    assert.equal(bob.last_action_sdr_name, "Julien");
    assert.equal(bob.last_action_callback_date, null);
});

test("a never-contacted contact has no last action of its own", () => {
    const chloe = rowFor("ct-chloe");
    assert.equal(chloe.last_action_result, null);
    assert.equal(chloe.last_action_note, null);
    assert.equal(chloe.last_action_created, null);
    assert.equal(chloe.last_action_callback_date, null);
    assert.equal(chloe.last_action_sdr_id, null);
    assert.equal(chloe.last_action_scope, null);
});

test("the latest of several actions on the same contact wins", () => {
    const alice = rowFor("ct-alice");
    assert.equal(alice.last_action_result, "CALLBACK_REQUESTED");
    assert.equal(alice.last_action_note, "Rappeler jeudi, budget à valider");
    assert.equal(alice.last_action_sdr_name, "Marie");
    assert.equal(alice.last_action_scope, "CONTACT");
});

test("no two contacts of the same company end up with the same comment", () => {
    const acmeNotes = rows
        .filter((r) => r.company_id === "co-acme" && r.last_action_note !== null)
        .map((r) => r.last_action_note);
    assert.deepEqual(acmeNotes.sort(), ["Rappeler jeudi, budget à valider"]);
});

// ============================================
// COMPANY-WIDE SIGNAL (WARNING ONLY)
// ============================================

test("every contact row carries the company's latest action separately, for the warning", () => {
    for (const contact of CONTACTS) {
        const companyLatest = latest(ACTIONS.filter((a) => companyOf(a) === contact.companyId));
        const row = rowFor(contact.id);
        assert.equal(row.company_last_action_result, companyLatest?.result ?? null, `${contact.id} company result`);
        assert.equal(row.company_last_action_note, companyLatest?.note ?? null, `${contact.id} company note`);
        assert.equal(row.company_last_action_sdr_id, companyLatest?.sdrId ?? null, `${contact.id} company sdr`);
    }
    // Chloé was never called, but Alice was: the warning still has something to show.
    assert.equal(rowFor("ct-chloe").company_last_action_note, "Rappeler jeudi, budget à valider");
});

test("an action logged without companyId still counts for its contact's company", () => {
    // Bob's action has companyId NULL; Beta's more recent action must not leak into Acme.
    const acmeLatest = rowFor("ct-bob").company_last_action_created?.toISOString();
    assert.equal(acmeLatest, new Date("2026-09-18T14:00:00Z").toISOString());
    assert.equal(rowFor("ct-dan").company_last_action_note, "Envoyer la plaquette");
});

test("a company without contacts shows its own company-level action", () => {
    const gamma = rowFor(null, "co-gamma");
    assert.equal(gamma.last_action_result, "BAD_CONTACT");
    assert.equal(gamma.last_action_note, "Standard injoignable");
    assert.equal(gamma.last_action_sdr_name, "Julien");
    assert.equal(gamma.last_action_scope, "COMPANY");
});

// ============================================
// WARNING CONTEXT
// ============================================

const companyAction = {
    result: "CALLBACK_REQUESTED",
    note: "Rappeler jeudi, budget à valider",
    createdAt: "2026-09-18T14:00:00.000Z",
    sdrId: "sdr-marie",
    sdrName: "Marie",
};

test("warning uses the contact's own action when it has one", () => {
    const own = { result: "NO_RESPONSE", note: null, createdAt: "2026-09-15T11:00:00.000Z", scope: "CONTACT" as const };
    const warning = contactedWarningContext({
        lastAction: own,
        lastActionBy: { id: "sdr-julien", name: "Julien" },
        companyLastAction: companyAction,
    });
    assert.equal(warning.lastAction, own);
    assert.deepEqual(warning.lastActionBy, { id: "sdr-julien", name: "Julien" });
});

test("warning falls back to the company's action, flagged COMPANY, for a never-contacted contact", () => {
    const warning = contactedWarningContext({ lastAction: null, lastActionBy: null, companyLastAction: companyAction });
    assert.deepEqual(warning.lastAction, {
        result: "CALLBACK_REQUESTED",
        note: "Rappeler jeudi, budget à valider",
        createdAt: "2026-09-18T14:00:00.000Z",
        scope: "COMPANY",
    });
    assert.deepEqual(warning.lastActionBy, { id: "sdr-marie", name: "Marie" });
});

test("warning never pairs the contact's action with the company action's SDR", () => {
    const own = { result: "NO_RESPONSE", note: null, createdAt: "2026-09-15T11:00:00.000Z" };
    const warning = contactedWarningContext({ lastAction: own, lastActionBy: null, companyLastAction: companyAction });
    assert.equal(warning.lastActionBy, null);
});

test("warning is empty when nobody at the company was contacted", () => {
    assert.deepEqual(contactedWarningContext({}), { lastAction: null, lastActionBy: null });
});
