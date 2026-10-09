import test from "node:test";
import assert from "node:assert/strict";
import { fetchAlloMetricsForLine, fetchAlloDailyCallsForLine } from "./allo-metrics";

test("fetchAlloMetricsForLine: returns zeroes when phone number is missing", async () => {
    const res = await fetchAlloMetricsForLine(null, new Date(), new Date());
    assert.deepEqual(res, {
        calls: 0,
        connectedCalls: 0,
        talkTimeSeconds: 0,
        callsOver1Min: 0,
        answerRate: 0,
    });
});

test("fetchAlloMetricsForLine: returns zeroes when apiKey is missing", async () => {
    const prevKey = process.env.ALLO_API_KEY;
    delete process.env.ALLO_API_KEY;
    try {
        const res = await fetchAlloMetricsForLine("+33123456789", new Date(), new Date(), "");
        assert.equal(res.calls, 0);
        assert.equal(res.talkTimeSeconds, 0);
    } finally {
        if (prevKey) process.env.ALLO_API_KEY = prevKey;
    }
});
test("fetchAlloDailyCallsForLine: returns empty Map when phone number is missing", async () => {
    const res = await fetchAlloDailyCallsForLine(null, new Date(), new Date());
    assert.equal(res.size, 0);
});

test("fetchAlloDailyCallsForLine: returns empty Map when apiKey is missing", async () => {
    const prevKey = process.env.ALLO_API_KEY;
    delete process.env.ALLO_API_KEY;
    try {
        const res = await fetchAlloDailyCallsForLine("+33123456789", new Date(), new Date(), "");
        assert.equal(res.size, 0);
    } finally {
        if (prevKey) process.env.ALLO_API_KEY = prevKey;
    }
});
