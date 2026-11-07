/**
 * Visual specs: validation, normalisation, data view, CSV, source check.
 *     npm run test:assistant
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { extractFacts } from "@/lib/ai/agent/evidence/facts";
import { checkVisualNumbers } from "./check";
import { formatValue, parseVisualSpec, visualCsv, visualNumbers, visualTable } from "./spec";

const NOW = new Date("2026-10-25T09:00:00Z");

const LINE = {
    kind: "line",
    title: "Appels et RDV par semaine",
    series: [
        { key: "appels", label: "Appels" },
        { key: "rdv", label: "RDV" },
    ],
    rows: [
        { semaine: "S40", appels: 900, rdv: 20 },
        { semaine: "S41", appels: 1100, rdv: 31 },
    ],
};

test("a line spec is accepted and gets its x_key from the first non-series key", () => {
    const r = parseVisualSpec(LINE);
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.spec.x_key, "semaine");
});

test("errors tell the model what to fix", () => {
    const empty = parseVisualSpec({ kind: "bar", title: "T", series: [{ key: "a", label: "A" }], rows: [] });
    assert.ok(!empty.ok && /rows/.test(empty.error));

    const noSeries = parseVisualSpec({ kind: "bar", title: "T", rows: [{ x: "a", v: 1 }] });
    assert.ok(!noSeries.ok && /series/.test(noSeries.error));

    const wrongKey = parseVisualSpec({ kind: "bar", title: "T", series: [{ key: "zzz", label: "Z" }], rows: [{ x: "a", v: 1 }] });
    assert.ok(!wrongKey.ok && /zzz/.test(wrongKey.error));

    const oneSlice = parseVisualSpec({ kind: "donut", title: "T", items: [{ label: "A", value: 1 }] });
    assert.ok(!oneSlice.ok && /donut/.test(oneSlice.error));

    assert.ok(!parseVisualSpec({ kind: "pie", title: "T" }).ok);
    assert.ok(!parseVisualSpec({ kind: "line", title: "T", series: LINE.series, rows: [{ x: "a", appels: 1 }] }).ok, "one point is not a curve");
});

test("unknown properties are ignored, strings are not accepted as numbers", () => {
    const r = parseVisualSpec({ ...LINE, colour: "red" });
    assert.ok(r.ok && !("colour" in r.spec));
    assert.ok(!parseVisualSpec({ kind: "leaderboard", title: "T", items: [{ label: "A", value: "12" }] }).ok);
});

test("a table without columns derives them from the first row", () => {
    const r = parseVisualSpec({ kind: "table", title: "T", rows: [{ sdr: "Armel", rdv: 52 }] });
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.spec.columns?.map((c) => c.key), ["sdr", "rdv"]);
});

test("data view and CSV follow the visual's own shape", () => {
    const r = parseVisualSpec(LINE);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(visualTable(r.spec), { header: ["semaine", "Appels", "RDV"], rows: [["S40", 900, 20], ["S41", 1100, 31]] });
    const csv = visualCsv({ ...r.spec, rows: [{ semaine: "S;40", appels: 12.5, rdv: null }] });
    assert.ok(csv.startsWith("﻿semaine;Appels;RDV\r\n"));
    assert.match(csv, /"S;40";12,5;\r\n/);
});

test("formatValue: French number, percent and duration", () => {
    assert.equal(formatValue(1240), "1 240");
    assert.equal(formatValue(12.6, "percent"), "12,6 %");
    assert.equal(formatValue(3725, "duration"), "1 h 02");
    assert.equal(formatValue(null), "—");
    assert.equal(formatValue(18400, "number", true), "18,4 k");
});

test("check: values found in the sources pass, an invented one is reported", () => {
    const facts = extractFacts({ serie: [{ date: "S40", appels: 900, rdv: 20 }, { date: "S41", appels: 1100, rdv: 31 }] }, NOW);
    const r = parseVisualSpec(LINE);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(checkVisualNumbers(r.spec, [{ facts }]).unverified, []);

    const tampered = { ...r.spec, rows: [{ semaine: "S40", appels: 900, rdv: 20 }, { semaine: "S41", appels: 1100, rdv: 77 }] };
    const check = checkVisualNumbers(tampered, [{ facts }]);
    assert.deepEqual(check.unverified, [77]);
    assert.equal(check.checked, new Set(visualNumbers(tampered)).size, "duplicates counted once");
});

test("check: a ratio in % of two sourced counts is a derivation, not an invention", () => {
    const facts = extractFacts({ total: { appels: 420, rdv: 14 } }, NOW);
    const r = parseVisualSpec({ kind: "kpi_row", title: "T", tiles: [{ label: "Transformation", value: 3.3, format: "percent" }, { label: "RDV", value: 14 }] });
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(checkVisualNumbers(r.spec, [{ facts }]).unverified, []);
});

test("check: no source at all means everything is unverified", () => {
    const r = parseVisualSpec({ kind: "kpi_row", title: "T", tiles: [{ label: "RDV", value: 14 }, { label: "Appels", value: 420 }] });
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(checkVisualNumbers(r.spec, []).unverified, [14, 420]);
});
