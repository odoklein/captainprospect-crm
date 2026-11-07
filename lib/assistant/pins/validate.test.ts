/**
 * Pin validation and mapping.
 *     npx tsx --test lib/assistant/pins/validate.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { parsePinSource, parseStoredVisual, pinTitle, refreshInstruction, toPinItem } from "./validate";

const spec = { kind: "kpi_row", title: "RDV de la semaine", tiles: [{ label: "RDV", value: 12 }] };

test("a stored visual is re-validated and keeps its source and question", () => {
    const parsed = parseStoredVisual(
        {
            id: "v1",
            spec,
            unverified: [3, "x"],
            source: { tool: "get_meetings_stats", args: { period: "week" }, label: "E1" },
            question: " Combien de RDV ? ",
            extra: "dropped",
        },
        () => "generated",
    );
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    assert.equal(parsed.visual.id, "v1");
    assert.deepEqual(parsed.visual.unverified, [3]);
    assert.deepEqual(parsed.visual.source, { tool: "get_meetings_stats", args: { period: "week" }, label: "E1" });
    assert.equal(parsed.visual.question, "Combien de RDV ?");
    assert.equal("extra" in parsed.visual, false);
});

test("an invalid visual is refused with the spec error; a missing id is generated", () => {
    assert.equal(parseStoredVisual(null, () => "g").ok, false);
    const bad = parseStoredVisual({ spec: { kind: "pie", title: "x" } }, () => "g");
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.match(bad.error, /Visuel invalide/);
    const noId = parseStoredVisual({ spec }, () => "generated");
    assert.ok(noId.ok && noId.visual.id === "generated" && noId.visual.source === null);
});

test("pin source: a tool name is required, args default to {}", () => {
    assert.equal(parsePinSource(null), null);
    assert.equal(parsePinSource({ tool: "drop table;" }), null);
    assert.deepEqual(parsePinSource({ tool: "get_stats", args: [1] }), { tool: "get_stats", args: {}, label: "get_stats" });
});

test("title defaults to the visual's; instruction names the tool, kind and title", () => {
    const parsed = parseStoredVisual({ spec }, () => "g");
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    assert.equal(pinTitle(null, parsed.visual), "RDV de la semaine");
    assert.equal(pinTitle("  Mon   KPI ", parsed.visual), "Mon KPI");
    const text = refreshInstruction({ tool: "get_stats", args: { from: "2026-10-01" }, label: "E1" }, parsed.visual);
    assert.match(text, /rappelle get_stats avec ces arguments/);
    assert.match(text, /kpi_row/);
    assert.match(text, /"from":"2026-10-01"/);
});

test("pin item maps dates to ISO", () => {
    const item = toPinItem({
        id: "p1",
        folderId: "f1",
        title: "t",
        visual: {},
        question: null,
        conversationId: null,
        messageId: null,
        position: 2,
        refreshedAt: null,
        refreshError: "x",
        createdAt: new Date(0),
    });
    assert.equal(item.createdAt, "1970-01-01T00:00:00.000Z");
    assert.equal(item.refreshedAt, null);
    assert.equal(item.refreshError, "x");
});
