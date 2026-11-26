import { test } from "node:test";
import assert from "node:assert/strict";
import { isReached, statusFamily } from "./status-family";
import { listStock, stockLabel } from "../lists/stock";
import { boardEntry, isLive, sortBoard, type MissionPulseRow } from "../missions/board";

test("status family: category first, then the built-in code, then a quiet default", () => {
    assert.equal(statusFamily("CUSTOM_RDV", "RDV_PRIS"), "positive");
    assert.equal(statusFamily("NOT_INTERESTED", null), "negative");
    assert.equal(statusFamily("NO_RESPONSE"), "noreach");
    assert.equal(statusFamily("CALLBACK_REQUESTED", "RAPPEL"), "pending");
    // A refusal is never an alert: red is kept for what someone must act on.
    assert.notEqual(statusFamily("NOT_INTERESTED", "REFUS"), "alert");
    assert.equal(statusFamily("SOMETHING_NEW"), "negative");
    assert.equal(isReached("NO_RESPONSE"), false);
    assert.equal(isReached("MEETING_BOOKED"), true);
});

test("list stock: treated, still reachable, dead, and days at the current pace", () => {
    const s = listStock({ contacts: 1000, actionable: 700, treated: 300, actions7d: 140 });
    assert.deepEqual([s.treated, s.reachable, s.dead], [300, 400, 300]);
    assert.equal(s.treatedPct, 30);
    assert.equal(s.daysLeft, 20); // 400 contacts at 20 calls a day
    assert.equal(stockLabel(s.daysLeft), "≈ 3 sem");

    const idle = listStock({ contacts: 50, actionable: 50, treated: 0, actions7d: 0 });
    assert.equal(idle.daysLeft, null);
    assert.equal(stockLabel(idle.daysLeft), "—");

    const done = listStock({ contacts: 80, actionable: 60, treated: 60, actions7d: 10 });
    assert.equal(done.reachable, 0);
    assert.equal(stockLabel(done.daysLeft), "Épuisée");

    // More treated than actionable (company phones): never negative.
    const odd = listStock({ contacts: 10, actionable: 2, treated: 6, actions7d: 3 });
    assert.deepEqual([odd.treated, odd.reachable, odd.dead], [6, 0, 4]);
    assert.equal(listStock({ contacts: 0, actionable: 0, treated: 0, actions7d: 0 }).treatedPct, null);
});

const NOW = Date.parse("2026-11-26T10:00:00Z");
const row = (over: Partial<MissionPulseRow>): MissionPulseRow => ({
    id: "m",
    name: "Mission",
    client: null,
    channels: ["CALL"],
    status: "ACTIVE",
    targetMeetings: 40,
    startDate: "2026-11-01T00:00:00Z",
    endDate: "2026-12-31T00:00:00Z",
    meetings: 17,
    today: { actions: 0, reached: 0, meetings: 0 },
    sdrs: [{ id: "s", name: "Camille", lastActionAt: null }],
    activeLists: 2,
    readyLists: 2,
    ...over,
});

test("mission board: the mission that needs the manager comes first", () => {
    const nobody = boardEntry(row({ id: "a", name: "A", sdrs: [] }), NOW);
    const behind = boardEntry(row({ id: "b", name: "B", meetings: 2 }), NOW);
    const onTrack = boardEntry(row({ id: "c", name: "C" }), NOW);
    const paused = boardEntry(row({ id: "d", name: "D", status: "PAUSED" }), NOW);
    assert.equal(nobody.verdict.label, "Personne dessus");
    assert.equal(behind.verdict.label, "En retard");
    assert.equal(paused.verdict.label, "En pause");
    assert.deepEqual(sortBoard([paused, onTrack, behind, nobody]).map((e) => e.row.id), ["a", "b", "c", "d"]);
    assert.equal(nobody.next.kind, "assign");
});

test("an SDR is « on it » for 15 minutes after their last action", () => {
    assert.equal(isLive({ id: "s", name: "C", lastActionAt: new Date(NOW - 5 * 60_000).toISOString() }, NOW), true);
    assert.equal(isLive({ id: "s", name: "C", lastActionAt: new Date(NOW - 20 * 60_000).toISOString() }, NOW), false);
    assert.equal(isLive({ id: "s", name: "C", lastActionAt: null }, NOW), false);
});
