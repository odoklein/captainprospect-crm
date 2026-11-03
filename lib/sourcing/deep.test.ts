import { test } from "node:test";
import assert from "node:assert/strict";
import { planMaps, runMaps } from "./deep.server";
import type { GmapsEvent, SourcingQuery } from "./types";

const query: SourcingQuery = {
    activities: [{ label: "Supermarché" }], locations: ["Lyon (69)"],
    perSearch: 60, activeOnly: true, depth: "deep", creditBudget: 300,
};

test("a commune without geometry still gets a text search", async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json([
        { nom: "Paris", code: "75056", codeDepartement: "75", codesPostaux: ["75001"], population: 2000000 },
    ]));
    const plan = await planMaps(query);
    assert.equal(plan.searches, 1);
    assert.equal(plan.zones[0].tiles, 1);
    assert.equal(plan.maxCredits, 6);
});

test("maximum estimate includes all recursive tile splits", async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json([
        { nom: "Paris", code: "75056", codesPostaux: ["75001"], population: 1,
            bbox: { coordinates: [[[2.3, 48.8], [2.31, 48.8], [2.31, 48.81], [2.3, 48.81]]] } },
    ]));
    const plan = await planMaps({ ...query, depth: "max", creditBudget: 15000 });
    assert.equal(plan.searches, 1);
    assert.equal(plan.maxCredits, (1 + 4 + 16 + 64) * 3 * 3);
});

test("parallel text searches share a strict call budget", async (t) => {
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
        if (String(input).includes("geo.api.gouv.fr")) return Response.json([]);
        return Response.json({ places: Array.from({ length: 20 }, (_, i) => ({ title: `Store ${i}`, placeId: String(i), latitude: 48.85, longitude: 2.35 })) });
    });
    const oldKey = process.env.SERPER_API_KEY;
    process.env.SERPER_API_KEY = "test-key";
    t.after(() => { if (oldKey === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = oldKey; });
    const events: GmapsEvent[] = [];
    await runMaps({ ...query, locations: ["Unknown A", "Unknown B", "Unknown C"], creditBudget: 6 }, (e) => events.push(e), new AbortController().signal);
    const done = events.find((e) => e.t === "done");
    assert.ok(done?.t === "done");
    assert.equal(done.calls, 2);
    assert.equal(done.credits, 6);
    assert.equal(done.budgetHit, true);
});
