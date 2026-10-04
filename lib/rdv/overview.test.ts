import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRdvOverview, classifyRdv, RDV_BUCKETS, type OverviewRow } from "./overview";

const now = new Date("2026-10-04T12:00:00Z");
const past = new Date("2026-10-01T10:00:00Z");
const future = new Date("2026-10-10T10:00:00Z");

function row(patch: Partial<OverviewRow>): OverviewRow {
  return {
    result: "MEETING_BOOKED",
    confirmationStatus: "CONFIRMED",
    callbackDate: past,
    cancellationReason: null,
    sdr: { id: "s1", name: "Yanis" },
    client: { id: "c1", name: "Lemaire" },
    feedback: null,
    ...patch,
  };
}

test("rejected at SAS never reads as upcoming, even with a future date", () => {
  assert.equal(classifyRdv(row({ confirmationStatus: "CANCELLED", callbackDate: future }), now), "rejected");
});

test("cancelled vs replaced", () => {
  assert.equal(classifyRdv(row({ result: "MEETING_CANCELLED" }), now), "cancelled");
  assert.equal(classifyRdv(row({ result: "MEETING_CANCELLED", cancellationReason: "replaced" }), now), "replaced");
});

test("upcoming split by SAS state", () => {
  assert.equal(classifyRdv(row({ callbackDate: future }), now), "upcoming_confirmed");
  assert.equal(classifyRdv(row({ callbackDate: future, confirmationStatus: "PENDING" }), now), "upcoming_pending");
});

test("past RDVs by outcome; no date counts as past", () => {
  const fb = (outcome: string) => ({ outcome, standByAt: null, outOfScopeAt: null });
  assert.equal(classifyRdv(row({ feedback: fb("POSITIVE") }), now), "positive");
  assert.equal(classifyRdv(row({ feedback: fb("NEGATIVE") }), now), "negative");
  assert.equal(classifyRdv(row({ feedback: fb("NO_SHOW") }), now), "no_show");
  assert.equal(classifyRdv(row({ callbackDate: null }), now), "no_feedback");
});

test("buckets add up to the total and rates follow the definitions", () => {
  const fb = (outcome: string, standByAt: Date | null = null) => ({ outcome, standByAt, outOfScopeAt: null });
  const rows = [
    row({ feedback: fb("POSITIVE") }),
    row({ feedback: fb("POSITIVE") }),
    row({ feedback: fb("NEGATIVE") }),
    row({ feedback: fb("NO_SHOW") }),
    row({ feedback: fb("NO_SHOW", past) }),
    row({}),
    row({ callbackDate: future }),
    row({ result: "MEETING_CANCELLED", client: { id: "c2", name: "Arno" } }),
  ];
  const o = buildRdvOverview(rows, now);
  const sum = RDV_BUCKETS.reduce((s, b) => s + o.buckets[b], 0);
  assert.equal(sum, o.total);
  assert.equal(o.total, 8);
  assert.deepEqual(o.noShow, { open: 1, standBy: 1, outOfScope: 0 });
  // held 3, reported 5 → 60 %; positive 2/3 → 67 %; coverage 5/6 → 83 %; loss 1/8 → 13 %
  assert.equal(o.rates.showRate, 60);
  assert.equal(o.rates.positiveRate, 67);
  assert.equal(o.rates.feedbackCoverage, 83);
  assert.equal(o.rates.lossRate, 13);
  assert.equal(o.byClient[0].id, "c1");
  assert.equal(o.byClient[0].total, 7);
  assert.equal(o.byClient[1].lost, 1);
});

test("empty population has null rates, not NaN", () => {
  const o = buildRdvOverview([], now);
  assert.equal(o.total, 0);
  assert.equal(o.rates.showRate, null);
  assert.equal(o.rates.lossRate, null);
});
