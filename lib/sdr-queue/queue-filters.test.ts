/**
 * Client-side filters of the SDR action table:
 *     npx tsx --test lib/sdr-queue/queue-filters.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    DEFAULT_QUEUE_FILTERS,
    lineKind,
    matchesQueueFilters,
    nationalDigits,
    prepareSearch,
    type QueueFilters,
    type QueueRowLike,
} from "./queue-filters";

const row = (over: Partial<QueueRowLike> = {}): QueueRowLike => ({
    contactId: "c1",
    contact: { firstName: "Benoît", lastName: "Robin", phone: "06 19 45 69 24", email: "b.robin@prime.fr" },
    company: { name: "PRIME ENGINEERING", phone: "+33 2 51 05 85 85" },
    priority: "CALLBACK",
    channel: "CALL",
    lastAction: { result: "RAPPEL", note: "Rappeler après réunion" },
    ...over,
});

const f = (over: Partial<QueueFilters> = {}): QueueFilters => ({ ...DEFAULT_QUEUE_FILTERS, ...over });
const match = (r: QueueRowLike, over: Partial<QueueFilters> = {}) => {
    const filters = f(over);
    return matchesQueueFilters(r, filters, prepareSearch(filters.search));
};

test("nationalDigits folds +33 / 0033 / leading 0", () => {
    assert.equal(nationalDigits("06 19 45 69 24"), "619456924");
    assert.equal(nationalDigits("+33 6 19 45 69 24"), "619456924");
    assert.equal(nationalDigits("0033619456924"), "619456924");
    assert.equal(nationalDigits("'+33611777641"), "611777641");
});

test("lineKind: only +33 6 / +33 7 are mobile, the rest is fixe", () => {
    assert.equal(lineKind("06 19 45 69 24"), "mobile");
    assert.equal(lineKind("+33 7 11 22 33 44"), "mobile");
    assert.equal(lineKind("'+33673957761"), "mobile");
    assert.equal(lineKind("+33 (0)6 73 95 77 61"), "mobile");
    assert.equal(lineKind("02 51 05 85 85"), "landline");
    assert.equal(lineKind("0 800 123 456"), "landline");
    assert.equal(lineKind("+32 470 12 34 56"), "landline");
    assert.equal(lineKind("04 78 64 02 02 (siège)"), "landline");
    assert.equal(lineKind("04 84 35 05 06 / 06 40 64 17 66"), "mobile");
    assert.equal(lineKind("123"), null);
});

test("search matches names accent-insensitively and phones in any format", () => {
    assert.ok(match(row(), { search: "benoit" }));
    assert.ok(match(row(), { search: "robin prime" }));
    assert.ok(match(row(), { search: "+33 6 19 45" }));
    assert.ok(match(row(), { search: "0251" }));
    assert.ok(match(row(), { search: "réunion" }));
    assert.ok(!match(row(), { search: "dupont" }));
});

test("phone field respects its scope", () => {
    assert.ok(match(row(), { phone: "0619", phoneScope: "contact" }));
    assert.ok(!match(row(), { phone: "0619", phoneScope: "company" }));
    assert.ok(match(row(), { phone: "02 51", phoneScope: "company" }));
});

test("line type judges the displayed number, not any number of the row", () => {
    assert.ok(match(row(), { lineType: "mobile" }));
    assert.ok(!match(row(), { lineType: "landline" }));
    assert.ok(match(row(), { lineType: "landline", phoneScope: "company" }));
    // Fixed contact line + mobile standard: shown number is fixed → not "Mobile".
    const fixedContact = row({ contact: { phone: "02 40 11 22 33" }, company: { name: "X", phone: "06 11 22 33 44" } });
    assert.ok(!match(fixedContact, { lineType: "mobile" }));
    assert.ok(match(fixedContact, { lineType: "landline" }));
    // No contact phone → the standard is what's shown.
    const standardOnly = row({ contact: { phone: null }, company: { name: "X", phone: "02 51 05 85 85" } });
    assert.ok(!match(standardOnly, { lineType: "mobile" }));
    assert.ok(match(standardOnly, { lineType: "landline" }));
});

test("phone availability", () => {
    const companyOnly = row({ contact: { firstName: "A", phone: null } });
    assert.ok(match(companyOnly, { phoneAvailability: "companyOnly" }));
    assert.ok(!match(row(), { phoneAvailability: "companyOnly" }));
    assert.ok(match(row(), { phoneAvailability: "both" }));
    const none = row({ contact: { phone: "" }, company: { name: "X", phone: null } });
    assert.ok(match(none, { phoneAvailability: "none" }));
});

test("type, priority and never-contacted", () => {
    assert.ok(!match(row({ contactId: null }), { type: "contact" }));
    assert.ok(match(row({ contactId: null }), { type: "company" }));
    assert.ok(!match(row(), { priority: "NEW" }));
    assert.ok(match(row({ lastAction: null }), { result: "NONE" }));
    assert.ok(!match(row(), { result: "NONE" }));
});
