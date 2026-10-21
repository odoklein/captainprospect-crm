import test from "node:test";
import assert from "node:assert/strict";
import {
    addResult, buildInsights, buildSeries, callsPerMeeting, conversionRate, emptyTally, heatValue,
    hourTotals, isJoinedResult, pct, pointChange, reachRate, relativeChange, yieldPer100,
} from "./metrics";
import type { StatsOverview, Tally } from "./types";

function tally(results: Record<string, number>, seconds = 0): Tally {
    const t = emptyTally();
    for (const [code, n] of Object.entries(results)) addResult(t, code, n);
    t.seconds = seconds;
    return t;
}

test("joined excludes no-answer, switchboard and bad numbers only", () => {
    for (const code of ["NO_RESPONSE", "BARRAGE_STANDARD", "BARRAGE_SECRETAIRE", "FAUX_NUMERO", "NUMERO_KO", "DOUBLON", "MAUVAIS_INTERLOCUTEUR"]) {
        assert.equal(isJoinedResult(code), false, code);
    }
    for (const code of ["MEETING_BOOKED", "RAPPEL", "RELANCE", "PROJET_A_SUIVRE", "REFUS", "HORS_CIBLE", "MAIL_UNIQUEMENT"]) {
        assert.equal(isJoinedResult(code), true, code);
    }
});

test("tally folds the real result codes teams log (RAPPEL/RELANCE/PROJET_A_SUIVRE are hot leads)", () => {
    const t = tally({ NO_RESPONSE: 50, FAUX_NUMERO: 10, RAPPEL: 8, RELANCE: 2, PROJET_A_SUIVRE: 5, REFUS: 15, MEETING_BOOKED: 10 });
    assert.equal(t.calls, 100);
    assert.equal(t.joined, 40);
    assert.equal(t.hot, 15);
    assert.equal(t.meetings, 10);
    assert.equal(reachRate(t), 40);
    assert.equal(conversionRate(t), 25);
    assert.equal(yieldPer100(t), 10);
    assert.equal(callsPerMeeting(t), 10);
});

test("rates are null, not 0, when there is nothing to divide by", () => {
    const t = emptyTally();
    assert.equal(reachRate(t), null);
    assert.equal(conversionRate(t), null);
    assert.equal(yieldPer100(t), null);
    assert.equal(callsPerMeeting(t), null);
    assert.equal(pct(1, 0), null);
});

test("changes: relative needs a base, points need both sides", () => {
    assert.equal(relativeChange(12, 10), 20);
    assert.equal(relativeChange(5, 0), null);
    assert.equal(pointChange(30.5, 25), 5.5);
    assert.equal(pointChange(null, 25), null);
});

test("series fills idle days and counts joints and RDV per Paris day", () => {
    const points = buildSeries(
        [
            { key: "2026-10-05", result: "NO_RESPONSE", n: 4 },
            { key: "2026-10-05", result: "MEETING_BOOKED", n: 1 },
            { key: "2026-10-07", result: "REFUS", n: 2 },
            { key: "2026-10-30", result: "REFUS", n: 9 }, // outside the range: ignored
        ],
        { start: "2026-10-05", end: "2026-10-07", granularity: "day" },
    );
    assert.deepEqual(points.map((p) => [p.key, p.calls, p.joined, p.meetings]), [
        ["2026-10-05", 5, 1, 1],
        ["2026-10-06", 0, 0, 0],
        ["2026-10-07", 2, 2, 0],
    ]);
});

test("weekly series is keyed on Mondays", () => {
    const points = buildSeries([{ key: "2026-10-05", result: "REFUS", n: 3 }], { start: "2026-10-07", end: "2026-10-20", granularity: "week" });
    assert.deepEqual(points.map((p) => p.key), ["2026-10-05", "2026-10-12", "2026-10-19"]);
    assert.equal(points[0].calls, 3);
});

test("heat values hide rates on thin cells", () => {
    assert.equal(heatValue({ dow: 1, hour: 9, calls: 5, joined: 5, meetings: 0 }, "reach"), null);
    assert.equal(heatValue({ dow: 1, hour: 9, calls: 20, joined: 5, meetings: 1 }, "reach"), 25);
    assert.equal(heatValue({ dow: 1, hour: 9, calls: 20, joined: 5, meetings: 1 }, "calls"), 20);
    assert.equal(heatValue(undefined, "calls"), null);
});

test("hourTotals folds weekdays", () => {
    const rows = hourTotals([
        { dow: 1, hour: 9, calls: 10, joined: 4, meetings: 1 },
        { dow: 2, hour: 9, calls: 5, joined: 1, meetings: 0 },
        { dow: 2, hour: 10, calls: 7, joined: 3, meetings: 1 },
    ]);
    assert.deepEqual(rows, [
        { hour: 9, calls: 15, joined: 5, meetings: 1 },
        { hour: 10, calls: 7, joined: 3, meetings: 1 },
    ]);
});

function overview(over: Partial<StatsOverview>): StatsOverview {
    const zero = { ...emptyTally(), byResult: {}, prospects: 0 };
    return {
        range: { start: "2026-10-01", end: "2026-10-07", days: 7, prevStart: "2026-09-24", prevEnd: "2026-09-30", granularity: "day" },
        current: zero, previous: zero, series: [], prevSeries: [], sdrs: [], missions: [], heatmap: [],
        rdv: { total: 0, confirmed: 0, pending: 0, rejected: 0 },
        ...over,
    };
}

test("no insight is produced on an empty period", () => {
    assert.deepEqual(buildInsights(overview({})), []);
});

test("insights only speak when the volume allows it", () => {
    const cur = { ...tally({ NO_RESPONSE: 40, MEETING_BOOKED: 6, REFUS: 4 }), byResult: { NO_RESPONSE: 40, MEETING_BOOKED: 6, REFUS: 4 }, prospects: 50 };
    const prev = { ...tally({ NO_RESPONSE: 40, MEETING_BOOKED: 3, REFUS: 7 }), byResult: {}, prospects: 50 };
    const ids = buildInsights(overview({ current: cur, previous: prev })).map((i) => i.id);
    assert.deepEqual(ids, ["rdv-momentum"]); // a single SDR can't be "best"; thin hours aren't a "best slot"
});

test("data-quality and dry-SDR warnings fire with their numbers", () => {
    const byResult = { FAUX_NUMERO: 30, NO_RESPONSE: 60, REFUS: 10 };
    const cur = { ...tally(byResult), byResult, prospects: 90 };
    const dry = { id: "s1", name: "Anaïs Martin", role: "SDR", current: tally({ NO_RESPONSE: 70, REFUS: 20 }), previous: emptyTally() };
    const insights = buildInsights(overview({ current: cur, previous: { ...emptyTally(), byResult: {}, prospects: 0 }, sdrs: [dry] }));
    const data = insights.find((i) => i.id === "data-quality");
    assert.ok(data);
    assert.equal(data!.tone, "danger"); // 30 % ≥ 20 %
    assert.match(data!.title, /30 %/);
    const dryInsight = insights.find((i) => i.id === "dry-sdr");
    assert.ok(dryInsight);
    assert.match(dryInsight!.title, /Anaïs/);
});

import { parseState, resolvePreset, serializeState, stateRange } from "./period";

// 2026-10-21 12:00 Paris
const NOW = new Date("2026-10-21T10:00:00Z");

test("presets resolve to inclusive Paris days", () => {
    assert.deepEqual(resolvePreset("today", NOW), { start: "2026-10-21", end: "2026-10-21" });
    assert.deepEqual(resolvePreset("7d", NOW), { start: "2026-10-15", end: "2026-10-21" });
    assert.deepEqual(resolvePreset("30d", NOW), { start: "2026-09-22", end: "2026-10-21" });
    assert.deepEqual(resolvePreset("month", NOW), { start: "2026-10-01", end: "2026-10-21" });
    assert.deepEqual(resolvePreset("lastMonth", NOW), { start: "2026-09-01", end: "2026-09-30" });
});

test("today follows the Paris clock, not UTC", () => {
    // 23:30 Paris on the 21st = 21:30 UTC: still the 21st.
    assert.deepEqual(resolvePreset("today", new Date("2026-10-21T21:30:00Z")), { start: "2026-10-21", end: "2026-10-21" });
    // 00:30 Paris on the 22nd = 22:30 UTC on the 21st: already the 22nd in Paris.
    assert.deepEqual(resolvePreset("today", new Date("2026-10-21T22:30:00Z")), { start: "2026-10-22", end: "2026-10-22" });
});

test("state round-trips through the URL and keeps defaults out of it", () => {
    const state = parseState(new URLSearchParams(), "30d", NOW);
    assert.equal(serializeState(state), "");
    const custom = parseState(new URLSearchParams("p=custom&from=2026-10-01&to=2026-10-05&sdr=a,b&tab=equipe"), "30d", NOW);
    assert.deepEqual(stateRange(custom, NOW), { start: "2026-10-01", end: "2026-10-05" });
    assert.deepEqual(custom.sdrIds, ["a", "b"]);
    assert.equal(serializeState(custom), "tab=equipe&p=custom&from=2026-10-01&to=2026-10-05&sdr=a%2Cb");
});

test("malformed URL state falls back instead of throwing", () => {
    const s = parseState(new URLSearchParams("p=bogus&tab=nope&from=x&to=y"), "30d", NOW);
    assert.equal(s.preset, "30d");
    assert.equal(s.tab, "apercu");
    assert.equal(parseState(new URLSearchParams("p=custom&from=x&to=y"), "30d", NOW).preset, "30d");
});

test("an inverted custom range is swapped", () => {
    assert.deepEqual(stateRange({ preset: "custom", from: "2026-10-09", to: "2026-10-02" }, NOW), { start: "2026-10-02", end: "2026-10-09" });
});
