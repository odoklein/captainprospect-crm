import { test } from "node:test";
import assert from "node:assert/strict";
import {
    DAY_MS,
    MAX_SERIES_DAYS,
    bucketRows,
    buildSeries,
    foldListCounts,
    parsePeriod,
    resolveWindow,
    sumBuckets,
} from "./insights";
import { benchmarkFromCounts, getAgencyBenchmark, resetAgencyBenchmarkCache, BENCHMARK_TTL_MS, type RawDb } from "./benchmark";

const now = new Date("2026-11-13T15:42:00Z");

test("parsePeriod: known values pass, anything else is 30 days", () => {
    assert.equal(parsePeriod("7"), "7");
    assert.equal(parsePeriod("90"), "90");
    assert.equal(parsePeriod("all"), "all");
    assert.equal(parsePeriod(null), "30");
    assert.equal(parsePeriod("365"), "30");
    assert.equal(parsePeriod(""), "30");
});

test("resolveWindow: 7 days ends today (UTC) and has a previous window of the same length", () => {
    const w = resolveWindow("7", { now });
    assert.equal(w.windowDays, 7);
    assert.equal(w.windowStart.toISOString(), "2026-11-07T00:00:00.000Z");
    assert.equal(w.windowEnd.toISOString(), "2026-11-14T00:00:00.000Z");
    assert.equal(w.previousStart?.toISOString(), "2026-10-31T00:00:00.000Z");
    assert.equal(w.countsFrom?.toISOString(), w.windowStart.toISOString());
});

test("resolveWindow: all starts at the earlier of mission start and first action", () => {
    const w = resolveWindow("all", { now, missionStart: "2026-10-01T09:00:00Z", firstActionAt: "2026-09-20T18:00:00Z" });
    assert.equal(w.windowStart.toISOString(), "2026-09-20T00:00:00.000Z");
    assert.equal(w.windowDays, 55);
    assert.equal(w.previousStart, null);
    assert.equal(w.countsFrom, null);
});

test("resolveWindow: all is capped to 365 days and never starts after today", () => {
    const old = resolveWindow("all", { now, missionStart: "2020-01-01T00:00:00Z" });
    assert.equal(old.windowDays, MAX_SERIES_DAYS);
    const future = resolveWindow("all", { now, missionStart: "2027-01-01T00:00:00Z" });
    assert.equal(future.windowDays, 1);
    assert.equal(future.windowStart.toISOString(), "2026-11-13T00:00:00.000Z");
    assert.equal(resolveWindow("all", { now }).windowDays, 1);
});

test("buildSeries: one zero-filled point per day; sumBuckets is half-open", () => {
    const buckets = bucketRows([
        { day: new Date("2026-11-08T00:00:00Z"), actions: 4, meetings: 1, reached: 2 },
        { day: new Date("2026-11-13T00:00:00Z"), actions: "3", meetings: 0, reached: 1 },
        { day: new Date("2026-11-01T00:00:00Z"), actions: 10, meetings: 2, reached: 5 },
    ]);
    const w = resolveWindow("7", { now });
    const series = buildSeries(buckets, w.windowStart, w.windowDays);
    assert.equal(series.length, 7);
    assert.deepEqual(series[0], { date: "2026-11-07", actions: 0, meetings: 0, reached: 0 });
    assert.deepEqual(series[1], { date: "2026-11-08", actions: 4, meetings: 1, reached: 2 });
    assert.equal(series[6].date, "2026-11-13");
    assert.equal(series[6].actions, 3);
    assert.deepEqual(sumBuckets(buckets, w.windowStart, w.windowEnd), { actions: 7, meetings: 1 });
    assert.deepEqual(sumBuckets(buckets, w.previousStart!, w.windowStart), { actions: 10, meetings: 2 });
    assert.equal(w.windowStart.getTime() - w.previousStart!.getTime(), 7 * DAY_MS);
});

test("foldListCounts: sums statuses per list, keeps empty lists at zero", () => {
    const folded = foldListCounts([
        { listId: "l1", status: "INCOMPLETE", companies: 3, contacts: 5 },
        { listId: "l1", status: "ACTIONABLE", companies: 2, contacts: 7 },
        { listId: "l2", status: null, companies: 0, contacts: 0 },
    ]);
    assert.deepEqual(folded.get("l1"), { companies: 5, contacts: 12, companyStatusCounts: { INCOMPLETE: 3, ACTIONABLE: 2 } });
    assert.deepEqual(folded.get("l2"), { companies: 0, contacts: 0, companyStatusCounts: {} });
});

test("benchmarkFromCounts: rates only above the minimum sample", () => {
    assert.deepEqual(benchmarkFromCounts({ called: 200, reached: 100, interested: 20, meetings: 5 }), {
        reach: 0.5,
        interest: 0.2,
        meeting: null,
    });
});

test("getAgencyBenchmark: memoised for the TTL, shared by concurrent callers", async () => {
    resetAgencyBenchmarkCache();
    let calls = 0;
    const db = {
        $queryRaw: async () => {
            calls++;
            return [{ called: 100, reached: 60, interested: 60, meetings: 30 }];
        },
    } as unknown as RawDb;
    const t0 = Date.parse("2026-11-13T10:00:00Z");
    const [a, b] = await Promise.all([getAgencyBenchmark(db, t0), getAgencyBenchmark(db, t0 + 1000)]);
    assert.equal(calls, 1);
    assert.deepEqual(a, b);
    assert.equal(a.reach, 0.6);
    await getAgencyBenchmark(db, t0 + BENCHMARK_TTL_MS - 1);
    assert.equal(calls, 1);
    await getAgencyBenchmark(db, t0 + BENCHMARK_TTL_MS);
    assert.equal(calls, 2);
    resetAgencyBenchmarkCache();
});

test("getAgencyBenchmark: a failed query is not cached", async () => {
    resetAgencyBenchmarkCache();
    let calls = 0;
    const db = {
        $queryRaw: async () => {
            calls++;
            if (calls === 1) throw new Error("db down");
            return [{ called: 0, reached: 0, interested: 0, meetings: 0 }];
        },
    } as unknown as RawDb;
    await assert.rejects(getAgencyBenchmark(db, 1));
    await new Promise((r) => setImmediate(r));
    const ok = await getAgencyBenchmark(db, 2);
    assert.equal(ok.reach, null);
    assert.equal(calls, 2);
    resetAgencyBenchmarkCache();
});
