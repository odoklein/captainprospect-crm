/**
 * Shared-phone warning: pure matching + number normalisation (no DB):
 *     npm run test:sdr-queue
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// shared-phone.ts imports the Prisma client; the matching helpers under test are pure.
import { matchSharedPhoneCalls, phoneKey, sharedPhoneRowKey, type SharedPhoneAction } from "./shared-phone";

const STANDARD = "04 72 00 11 22";

function call(overrides: Partial<SharedPhoneAction>): SharedPhoneAction {
    return {
        createdAt: new Date("2026-10-20T10:00:00Z"),
        contactId: "alice",
        companyId: "acme",
        dialedPhone: STANDARD,
        sdrId: "sdr-1",
        sdrName: "Sam",
        contactName: "Alice Martin",
        ...overrides,
    };
}

test("phoneKey folds French notations to the same key", () => {
    const key = phoneKey("04 72 00 11 22");
    assert.equal(key, "33472001122");
    assert.equal(phoneKey("+33 4 72 00 11 22"), key);
    assert.equal(phoneKey("+33 (0)4 72 00 11 22"), key);
    assert.equal(phoneKey("0033 4.72.00.11.22"), key);
    assert.equal(phoneKey("'04 72 00 11 22 (siège)"), key);
});

test("phoneKey keeps the first of several numbers and drops junk", () => {
    assert.equal(phoneKey("04 72 00 11 22 / 06 12 34 56 78"), "33472001122");
    assert.equal(phoneKey("44"), null);
    assert.equal(phoneKey("contact@acme.fr"), null);
    assert.equal(phoneKey(null), null);
});

test("a contact on the company standard is flagged when a sibling was called on it", () => {
    const rows = [{ contactId: "bob", companyId: "acme", phone: STANDARD }];
    const hits = matchSharedPhoneCalls(rows, [call({})]);
    const hit = hits.get(sharedPhoneRowKey("bob", "acme"));
    assert.equal(hit?.contactName, "Alice Martin");
    assert.equal(hit?.sdrName, "Sam");
});

test("different numbers never match", () => {
    const rows = [{ contactId: "bob", companyId: "acme", phone: "06 12 34 56 78" }];
    assert.equal(matchSharedPhoneCalls(rows, [call({})]).size, 0);
});

test("the row's own calls and other companies' calls are ignored", () => {
    const rows = [{ contactId: "alice", companyId: "acme", phone: STANDARD }];
    assert.equal(matchSharedPhoneCalls(rows, [call({})]).size, 0);
    assert.equal(matchSharedPhoneCalls(rows, [call({ contactId: "carl", companyId: "other" })]).size, 0);
});

test("a company-level call counts for a contact row, and the newest call wins", () => {
    const rows = [{ contactId: "bob", companyId: "acme", phone: STANDARD }];
    const hits = matchSharedPhoneCalls(rows, [
        call({ contactId: null, contactName: null, createdAt: new Date("2026-10-21T10:00:00Z") }),
        call({}),
    ]);
    const hit = hits.get(sharedPhoneRowKey("bob", "acme"));
    assert.equal(hit?.contactName, null);
    assert.equal(hit?.calledAt, "2026-10-21T10:00:00.000Z");
});

test("a company row (no contact) is flagged by a contact call on the standard", () => {
    const rows = [{ contactId: null, companyId: "acme", phone: STANDARD }];
    assert.equal(matchSharedPhoneCalls(rows, [call({})]).size, 1);
    assert.equal(matchSharedPhoneCalls(rows, [call({ contactId: null })]).size, 0);
});
