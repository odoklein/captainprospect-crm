import { test } from "node:test";
import assert from "node:assert/strict";
import { HISTORY_MAX, selectHistoryRows } from "./history";

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `m${i + 1}` }));
const ids = (list: Array<{ id: string }>) => list.map((r) => r.id);

test("keeps every message after the summary cutoff, not just a fixed window", () => {
    // Summary covers m1..m10; 7 more messages arrived before the next summary.
    const all = rows(17);
    const picked = selectHistoryRows(all, "m10");
    assert.equal(picked[0].id, "m6", "the 12-message tail already reaches back past the cutoff");
    // Cutoff m3 with 17 rows: 14 messages are unsummarised, more than the 12 tail.
    const gap = selectHistoryRows(all, "m3");
    assert.equal(gap[0].id, "m4", "m4 is the first message the summary does not cover");
    assert.equal(gap.length, 14);
});

test("never sends fewer than the minimum tail", () => {
    const picked = selectHistoryRows(rows(30), "m29");
    assert.equal(picked.length, 12);
    assert.equal(picked[picked.length - 1].id, "m30");
});

test("caps the history even when the summary is far behind", () => {
    const picked = selectHistoryRows(rows(100), "m2");
    assert.equal(picked.length, HISTORY_MAX);
    assert.equal(picked[picked.length - 1].id, "m100");
});

test("without a cutoff, or with an unknown one, behaves like the plain window", () => {
    assert.equal(selectHistoryRows(rows(5), null).length, 5);
    assert.equal(selectHistoryRows(rows(30), null).length, 30);
    assert.equal(selectHistoryRows(rows(50), "gone").length, HISTORY_MAX);
    assert.deepEqual(ids(selectHistoryRows(rows(0), "m1")), []);
});
