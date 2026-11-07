/**
 * Call journal pure logic, no database:
 *     npm run test:calls-journal
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { activeFilterCount, callSource, journalQuery, parseJournalFilters, resolveStatus, todayParis, type StatusDef } from "./filters";

const NOW = new Date("2026-11-05T22:30:00Z"); // 23:30 in Paris, still the 5th

const parse = (qs: string) => {
    const r = parseJournalFilters(new URLSearchParams(qs), NOW);
    assert.equal(r.ok, true, qs);
    return r.ok ? r.filters : (undefined as never);
};

test("no period means today in Paris, not in UTC", () => {
    assert.equal(todayParis(new Date("2026-11-05T23:30:00Z")), "2026-11-06"); // 00:30 Paris
    const f = parse("");
    assert.equal(f.start, "2026-11-05");
    assert.equal(f.end, "2026-11-05");
    assert.equal(f.view, "journal");
});

test("invalid or oversized periods are refused", () => {
    for (const qs of ["start=nope", "start=2026-11-05&end=2026-11-01", "start=2024-01-01&end=2026-11-05"]) {
        assert.equal(parseJournalFilters(new URLSearchParams(qs), NOW).ok, false, qs);
    }
});

test("lists accept repeated and comma-separated values, drop junk and duplicates", () => {
    const f = parse("sdrId=a1&sdrId=b2,a1&result=MEETING_BOOKED&result=drop table;&missionId=m_1");
    assert.deepEqual(f.sdrIds, ["a1", "b2"]);
    assert.deepEqual(f.results, ["MEETING_BOOKED"]);
    assert.equal(f.missionId, "m_1");
    assert.equal(parse("missionId=a b").missionId, null);
});

test("page and limit are clamped", () => {
    const f = parse("page=-3&limit=100000");
    assert.equal(f.page, 1);
    assert.equal(f.limit, 100);
    assert.equal(parse("limit=1").limit, 10);
});

test("a filter set round-trips through its query string", () => {
    const f = parse("start=2026-11-01&end=2026-11-05&view=unqualified&sdrId=a1&result=NO_RESPONSE&recording=1&q=durand&page=3");
    const again = parse(journalQuery(f));
    assert.deepEqual(again, f);
    assert.equal(activeFilterCount(f), 4); // sdr, result, recording, q
    assert.equal(activeFilterCount(parse("")), 0);
});

test("status label and colour follow the CRM's configuration, with fallbacks", () => {
    const defs = new Map<string, StatusDef>([
        ["NO_RESPONSE", { label: "Injoignable", color: "#f59e0b", resultCategoryCode: "NO_ANSWER" }],
        ["INTERESTED", { label: null, color: "not-a-colour", resultCategoryCode: null }],
    ]);
    assert.deepEqual(resolveStatus("NO_RESPONSE", defs), { code: "NO_RESPONSE", label: "Injoignable", color: "#f59e0b", category: "NO_ANSWER" });
    const interested = resolveStatus("INTERESTED", defs);
    assert.equal(interested.label, "Intéressé"); // built-in label
    assert.equal(interested.color, null); // invalid colour rejected
    assert.equal(resolveStatus("SOME_NEW_STATUS", defs).label, "Some new status");
});

test("call source is only claimed when there is evidence", () => {
    assert.equal(callSource({ hasTelephonyCall: true, hasRecording: false, enriched: false }), "crm");
    assert.equal(callSource({ hasTelephonyCall: false, hasRecording: true, enriched: false }), "allo");
    assert.equal(callSource({ hasTelephonyCall: false, hasRecording: false, enriched: true }), "allo");
    assert.equal(callSource({ hasTelephonyCall: false, hasRecording: false, enriched: false }), null);
});
