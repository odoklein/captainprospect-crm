import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHeatmap, heatTone, median } from "./patterns";
import type { Tally } from "./dictionary";

const tally = (reached: number, positive: number, meetings: number, refusals: number): Tally => ({ calls: reached * 3, reached, positive, meetings, refusals });

test("heat tone: blue above the team, orange only where refusals push it down", () => {
    assert.equal(heatTone({ reached: 50, delta: 0.08, refusalShare: 0.3, refusalAverage: 0.4 }), "pos3");
    assert.equal(heatTone({ reached: 50, delta: 0.02, refusalShare: 0.3, refusalAverage: 0.4 }), "pos1");
    assert.equal(heatTone({ reached: 50, delta: 0.01, refusalShare: 0.6, refusalAverage: 0.4 }), "neutral");
    assert.equal(heatTone({ reached: 50, delta: -0.05, refusalShare: 0.6, refusalAverage: 0.4 }), "neg2");
    // Below average because of callbacks, not refusals: no orange.
    assert.equal(heatTone({ reached: 50, delta: -0.05, refusalShare: 0.3, refusalAverage: 0.4 }), "neutral");
    assert.equal(heatTone({ reached: 19, delta: 0.2, refusalShare: 0, refusalAverage: 0.4 }), "low");
});

test("heatmap: shares against the team, hatched under 20 joints, number from 3 RDV", () => {
    const map = buildHeatmap(
        [
            { id: "a", label: "Inès" },
            { id: "b", label: "Yanis" },
        ],
        [
            { row: "a", hour: 10, tally: tally(100, 25, 4, 30) }, // 25 %
            { row: "a", hour: 11, tally: tally(10, 5, 1, 2) }, // too few
            { row: "b", hour: 10, tally: tally(100, 5, 1, 70) }, // 5 %, refusals dominate
            { row: "b", hour: 16, tally: tally(100, 20, 2, 40) },
            { row: "b", hour: 20, tally: tally(100, 100, 100, 0) }, // outside 9h–17h: ignored
        ],
    );
    // Team: 55 positive on 310 joints (17.7 %).
    assert.ok(Math.abs(map.average! - 55 / 310) < 1e-9);
    const ines = map.rows.find((r) => r.id === "a")!;
    const c10 = ines.cells.find((c) => c.hour === 10)!;
    assert.equal(c10.tone, "pos3");
    assert.equal(c10.label, "4");
    assert.equal(c10.interested, 21);
    const c11 = ines.cells.find((c) => c.hour === 11)!;
    assert.equal(c11.tone, "low");
    assert.equal(c11.delta, null);
    const yanis10 = map.rows.find((r) => r.id === "b")!.cells.find((c) => c.hour === 10)!;
    assert.equal(yanis10.tone, "neg3");
    assert.equal(yanis10.label, null);
    // Slots with a verdict: 10h (30 / 200 = 15 %) and 16h (20 %): 16h is best.
    assert.equal(map.best!.hour, 16);
    assert.equal(map.worst!.hour, 10);
});

test("heatmap: rows without a joint in the slots are left out, busiest first", () => {
    const map = buildHeatmap(
        [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
            { id: "c", label: "C" },
        ],
        [
            { row: "a", hour: 9, tally: tally(10, 1, 0, 3) },
            { row: "b", hour: 9, tally: tally(30, 1, 0, 3) },
        ],
    );
    assert.deepEqual(map.rows.map((r) => r.id), ["b", "a"]);
    assert.equal(map.best, null); // one slot only: nothing to compare
});

test("median", () => {
    assert.equal(median([]), null);
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
});
