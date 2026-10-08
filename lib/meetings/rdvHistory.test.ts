import { test } from "node:test";
import assert from "node:assert/strict";
import { foldReplacedRdvs, sortHistory, type ChainRow, type Successor } from "./rdvHistory";

const d = (s: string) => new Date(s);

function row(patch: Partial<ChainRow>): ChainRow {
    return {
        id: "a1",
        contactId: "c1",
        result: "MEETING_BOOKED",
        createdAt: d("2026-10-01T09:00:00Z"),
        cancellationReason: null,
        callbackDate: d("2026-10-03T10:00:00Z"),
        note: null,
        confirmationUpdatedAt: null,
        meetingFeedback: null,
        ...patch,
    };
}

const oldReplaced = row({
    id: "old",
    result: "MEETING_CANCELLED",
    cancellationReason: "replaced",
    note: "RDV pris, très intéressé",
    confirmationUpdatedAt: d("2026-10-05T08:00:00Z"),
    meetingFeedback: { outcome: "NO_SHOW", clientNote: "Il n'est pas venu", createdAt: d("2026-10-03T12:00:00Z") },
});
const successor: Successor = { id: "new", contactId: "c1", createdAt: d("2026-10-05T09:00:00Z"), callbackDate: d("2026-10-12T10:00:00Z") };

test("a replaced RDV with a live successor is hidden and folded into the new one", () => {
    const fresh = row({ id: "new", createdAt: successor.createdAt, callbackDate: successor.callbackDate });
    const { visible, historyByHead } = foldReplacedRdvs([oldReplaced, fresh], [successor]);
    assert.deepEqual(visible.map((m) => m.id), ["new"]);
    const entries = historyByHead.get("new")!;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].clientNote, "Il n'est pas venu");
    assert.equal(entries[0].bookingNote, "RDV pris, très intéressé");
    assert.equal(entries[0].rdvDate, "2026-10-03T10:00:00.000Z");
    assert.equal(entries[0].reportedAt, "2026-10-03T12:00:00.000Z");
    assert.equal(entries[0].replacedAt, "2026-10-05T08:00:00.000Z");
    assert.equal(entries[0].newDate, "2026-10-12T10:00:00.000Z");
});

test("a replaced RDV with no successor stays visible", () => {
    const { visible, historyByHead } = foldReplacedRdvs([oldReplaced], []);
    assert.deepEqual(visible.map((m) => m.id), ["old"]);
    assert.equal(historyByHead.size, 0);
});

test("a successor booked BEFORE the replaced RDV is not its replacement", () => {
    const earlier: Successor = { id: "x", contactId: "c1", createdAt: d("2026-09-01T09:00:00Z"), callbackDate: null };
    const { visible } = foldReplacedRdvs([oldReplaced], [earlier]);
    assert.deepEqual(visible.map((m) => m.id), ["old"]);
});

test("another contact's booking never swallows the RDV", () => {
    const other: Successor = { ...successor, contactId: "c2" };
    const { visible } = foldReplacedRdvs([oldReplaced], [other]);
    assert.deepEqual(visible.map((m) => m.id), ["old"]);
});

test("cancelled for another reason stays visible", () => {
    const cancelled = { ...oldReplaced, cancellationReason: "client_cancelled" };
    const { visible } = foldReplacedRdvs([cancelled], [successor]);
    assert.deepEqual(visible.map((m) => m.id), ["old"]);
});

test("a chain A -> B -> C folds both into the latest booking", () => {
    const b = row({ id: "b", result: "MEETING_CANCELLED", cancellationReason: "replaced", createdAt: d("2026-10-05T09:00:00Z") });
    const c: Successor = { id: "c", contactId: "c1", createdAt: d("2026-10-08T09:00:00Z"), callbackDate: d("2026-10-20T10:00:00Z") };
    const { visible, historyByHead } = foldReplacedRdvs([oldReplaced, b], [successor, c]);
    assert.equal(visible.length, 0);
    assert.equal(historyByHead.get("c")!.length, 2);
});

test("history reads oldest first", () => {
    const sorted = sortHistory([
        { id: "2", kind: "replaced", rdvDate: "2026-10-10T10:00:00Z", bookingNote: null, clientNote: null, reportedAt: null, replacedAt: null, newDate: null },
        { id: "1", kind: "replaced", rdvDate: "2026-10-03T10:00:00Z", bookingNote: null, clientNote: null, reportedAt: null, replacedAt: null, newDate: null },
    ]);
    assert.deepEqual(sorted.map((e) => e.id), ["1", "2"]);
});
