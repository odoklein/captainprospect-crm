/**
 * Structured truncation keeps an oversized tool result valid JSON.
 *     npx tsx --test lib/ai/tools/truncate.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { truncateStructured, TRUNCATION_KEY, TRUNCATION_NOTE, type TruncationInfo } from "./truncate";
import { extractFacts, isEmptyPayload } from "@/lib/ai/agent/evidence/facts";

type Json = Record<string, unknown>;

function rows(count: number, prefix = "row"): Json[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `${prefix}-${i}`,
        name: `${prefix} ${i}`,
        calls: i % 7,
        note: "x".repeat(40),
    }));
}

function bigPayload(): Json {
    return {
        period: { label: "30 derniers jours", from: "2026-09-29", to: "2026-10-29", days: 30 },
        total: 2000,
        rdv: 57,
        next_cursor: "abc123",
        items: rows(2000),
    };
}

function roundTrip(value: unknown): Json {
    return JSON.parse(JSON.stringify(value)) as Json;
}

function marker(value: Json): TruncationInfo & { note: string } {
    return value[TRUNCATION_KEY] as TruncationInfo & { note: string };
}

test("a small result is returned as-is, untruncated", () => {
    const input = { total: 3, items: rows(3) };
    const result = truncateStructured(input, 40_000);
    assert.equal(result.value, input);
    assert.equal(result.truncated, null);
});

test("a 2000-row items array is sliced: valid JSON under the cap, siblings untouched", () => {
    const input = bigPayload();
    const result = truncateStructured(input, 40_000);
    const text = JSON.stringify(result.value);
    assert.ok(text.length <= 40_000, `length ${text.length}`);

    const value = roundTrip(result.value);
    assert.equal(value.total, 2000);
    assert.equal(value.rdv, 57);
    assert.equal(value.next_cursor, "abc123");
    assert.deepEqual(value.period, input.period);

    assert.ok(result.truncated);
    const [info] = result.truncated;
    assert.equal(info.path, "$.items");
    assert.equal(info.total, 2000);
    assert.ok(info.kept > 0 && info.kept < 2000, `kept ${info.kept}`);
    assert.equal((value.items as unknown[]).length, info.kept);

    const m = marker(value);
    assert.equal(m.path, "$.items");
    assert.equal(m.kept, info.kept);
    assert.equal(m.total, 2000);
    assert.equal(m.note, TRUNCATION_NOTE);
});

test("the slice is the largest prefix that fits: most of the budget is used", () => {
    const result = truncateStructured(bigPayload(), 40_000);
    const text = JSON.stringify(result.value);
    assert.ok(text.length > 38_000, `only ${text.length} chars used`);
});

test("a nested array gets its marker on the nearest object, with the full path", () => {
    const input = { meta: { source: "crm" }, data: { count: 1500, rows: rows(1500) } };
    const result = truncateStructured(input, 20_000);
    const value = roundTrip(result.value);
    const data = value.data as Json;
    assert.equal(data.count, 1500);
    assert.equal(marker(data).path, "$.data.rows");
    assert.equal((data.rows as unknown[]).length, marker(data).kept);
    assert.equal(value[TRUNCATION_KEY], undefined);
    assert.deepEqual(value.meta, { source: "crm" });
    assert.ok(JSON.stringify(result.value).length <= 20_000);
});

test("a root array is wrapped so the marker has somewhere to live", () => {
    const result = truncateStructured(rows(1500), 20_000);
    const value = roundTrip(result.value);
    assert.ok(Array.isArray(value.items));
    assert.equal(marker(value).path, "$");
    assert.equal(marker(value).total, 1500);
    assert.equal((value.items as unknown[]).length, marker(value).kept);
    assert.ok(JSON.stringify(result.value).length <= 20_000);
});

test("two oversized arrays under one parent: both cut, the marker becomes a list", () => {
    const input = { calls: rows(1200, "call"), meetings: rows(1200, "rdv"), total: 2400 };
    const result = truncateStructured(input, 30_000);
    const value = roundTrip(result.value);
    assert.ok(JSON.stringify(result.value).length <= 30_000);
    assert.equal(value.total, 2400);
    const markers = value[TRUNCATION_KEY] as Array<TruncationInfo>;
    assert.ok(Array.isArray(markers));
    assert.deepEqual(markers.map((m) => m.path).sort(), ["$.calls", "$.meetings"]);
    assert.equal(result.truncated?.length, 2);

    // Equal arrays share the budget: neither is emptied so the other keeps it all.
    const kept = Object.fromEntries(markers.map((m) => [m.path, m.kept]));
    assert.ok(kept["$.calls"] > 100, `calls kept ${kept["$.calls"]}`);
    assert.ok(kept["$.meetings"] > 100, `meetings kept ${kept["$.meetings"]}`);
    assert.ok(Math.abs(kept["$.calls"] - kept["$.meetings"]) <= 2, `unbalanced: ${JSON.stringify(kept)}`);
    assert.equal((value.calls as unknown[]).length, kept["$.calls"]);
    assert.equal((value.meetings as unknown[]).length, kept["$.meetings"]);
});

test("a large array next to a small one: the small one stays whole", () => {
    const input = { items: rows(2000), by_sdr: rows(5, "sdr"), total: 2000 };
    const result = truncateStructured(input, 30_000);
    const value = roundTrip(result.value);
    assert.ok(JSON.stringify(result.value).length <= 30_000);
    assert.equal(result.truncated?.length, 1);
    assert.equal(result.truncated?.[0].path, "$.items");
    assert.deepEqual(value.by_sdr, input.by_sdr);
    assert.ok(JSON.stringify(result.value).length > 28_000, "the budget is still used up");
});

test("an existing marker list is never itself sliced", () => {
    const input: Json = { rows: rows(1500), [TRUNCATION_KEY]: [{ path: "$.older", kept: 1, total: 9, note: "x" }] };
    const result = truncateStructured(input, 20_000);
    const value = roundTrip(result.value);
    const markers = value[TRUNCATION_KEY] as Array<TruncationInfo>;
    assert.equal(markers.length, 2);
    assert.equal(markers[0].path, "$.older");
    assert.equal(markers[1].path, "$.rows");
    assert.deepEqual(result.truncated?.map((m) => m.path), ["$.rows"]);
});

test("an oversized object with no array falls back to a partial_text that is still JSON", () => {
    const input = { transcript: "parole ".repeat(10_000), durationMs: 1234 };
    const result = truncateStructured(input, 10_000);
    const text = JSON.stringify(result.value);
    assert.ok(text.length <= 10_000, `length ${text.length}`);
    const value = roundTrip(result.value);
    assert.equal(typeof value.partial_text, "string");
    assert.ok((value.partial_text as string).startsWith("{\"transcript\":\"parole "));
    assert.deepEqual(result.truncated, [{ path: "$", kept: 0, total: 1 }]);
    assert.equal(marker(value).path, "$");
    assert.equal(marker(value).note, TRUNCATION_NOTE);
});

test("the partial_text fallback stays under the cap even when escaping inflates the head", () => {
    // Thousands of short quoted keys: every quote doubles once serialised inside partial_text.
    const fields: Record<string, string> = {};
    for (let i = 0; i < 5000; i += 1) fields[`k${i}`] = "v";
    const result = truncateStructured({ fields }, 10_000);
    const text = JSON.stringify(result.value);
    assert.ok(text.length <= 10_000, `length ${text.length}`);
    const value = roundTrip(result.value);
    assert.ok((value.partial_text as string).length > 5_000, "the head is not cut more than needed");
    assert.ok((value.partial_text as string).startsWith("{\"fields\":{\"k0\":\"v\""));
    assert.equal(marker(value).path, "$");
});

test("more arrays than passes: the fallback still respects the cap", () => {
    const input = { a: rows(500, "a"), b: rows(500, "b"), c: rows(500, "c"), d: rows(500, "d") };
    const result = truncateStructured(input, 20_000);
    assert.ok(JSON.stringify(result.value).length <= 20_000);
    assert.doesNotThrow(() => roundTrip(result.value));
});

test("a payload sliced down to nothing is not an empty payload", () => {
    assert.equal(isEmptyPayload({ items: [], [TRUNCATION_KEY]: { path: "$.items", kept: 0, total: 3, note: "x" } }), false);
    assert.equal(isEmptyPayload({ items: [] }), true);
});

test("the input is never mutated", () => {
    const input = bigPayload();
    const before = JSON.stringify(input);
    truncateStructured(input, 40_000);
    assert.equal(JSON.stringify(input), before);
    assert.equal((input.items as unknown[]).length, 2000);
    assert.equal(input[TRUNCATION_KEY], undefined);

    const nested = { data: { rows: rows(1500) } };
    const nestedBefore = JSON.stringify(nested);
    truncateStructured(nested, 20_000);
    assert.equal(JSON.stringify(nested), nestedBefore);
});

test("dates are kept as Date instances, not copied", () => {
    const when = new Date("2026-10-29T10:00:00Z");
    const result = truncateStructured({ at: when, items: rows(1500) }, 20_000);
    assert.equal((result.value as Json).at, when);
});

test("a cyclic input does not blow up", () => {
    const input: Json = { items: rows(1500) };
    input.self = input;
    const result = truncateStructured(input, 20_000);
    assert.doesNotThrow(() => JSON.stringify(result.value));
    assert.ok(JSON.stringify(result.value).length <= 20_000);
});

test("facts survive a truncated payload: totals and items.length = kept", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    const result = truncateStructured(bigPayload(), 40_000);
    const facts = extractFacts(result.value, now);

    const total = facts.find((f) => f.key === "total" && f.path === "total");
    assert.ok(total, "top-level total is a fact");
    assert.equal(total.value, 2000);
    assert.equal(facts.find((f) => f.key === "rdv")?.value, 57);

    const length = facts.find((f) => f.key === "items.length");
    assert.ok(length, "items.length is a fact");
    assert.equal(length.value, result.truncated?.[0].kept);
    assert.equal(length.derived, "length");

    assert.equal(facts.some((f) => f.path.startsWith(TRUNCATION_KEY) || f.path.includes(`.${TRUNCATION_KEY}`)), false);
    assert.equal(facts.some((f) => f.key === "kept"), false);
});
