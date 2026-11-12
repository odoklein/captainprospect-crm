/**
 *     npx tsx --test lib/assistant/answer.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { linkCitations, readNdjson, splitFollowUps } from "./answer";
import type { StreamEvent } from "@/lib/ai/agent/protocol";

test("splitFollowUps: takes the block off the answer, keeps the rest", () => {
    const { body, followUps } = splitFollowUps(
        "**14 RDV** ce mois-ci [E1].\n\n:::suivi\n- Quels SDR ont le plus progressé ?\n- Compare avec le mois dernier\n:::\n",
    );
    assert.equal(body, "**14 RDV** ce mois-ci [E1].");
    assert.deepEqual(followUps, ["Quels SDR ont le plus progressé ?", "Compare avec le mois dernier"]);
});

test("splitFollowUps: a block still streaming is hidden already", () => {
    const { body, followUps } = splitFollowUps("Réponse.\n:::suivi\n- Quels SDR");
    assert.equal(body, "Réponse.");
    assert.deepEqual(followUps, ["Quels SDR"]);
    assert.deepEqual(splitFollowUps("Sans bloc.").followUps, []);
});

test("linkCitations: single, grouped and adjacent markers become source links", () => {
    assert.equal(linkCitations("14 RDV [E1]."), "14 RDV [E1](#source-E1).");
    assert.equal(linkCitations("vu [E1, E3]"), "vu [E1](#source-E1)[E3](#source-E3)");
    assert.equal(linkCitations("[E1][E2]"), "[E1](#source-E1)[E2](#source-E2)");
    assert.equal(linkCitations("[E1](https://x.fr)"), "[E1](https://x.fr)");
    assert.equal(linkCitations("[Etape 1]"), "[Etape 1]");
});

test("readNdjson: events split across chunks are reassembled", async () => {
    const encoder = new TextEncoder();
    const parts = ['{"type":"start","runId":"r","model":"m"}\n{"type":"del', 'ta","text":"Bon"}\n', '{"type":"reset"}'];
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const p of parts) controller.enqueue(encoder.encode(p));
            controller.close();
        },
    });
    const events: StreamEvent[] = [];
    await readNdjson(body, (e) => events.push(e));
    assert.deepEqual(events.map((e) => e.type), ["start", "delta", "reset"]);
});

import { splitVisualMarkers } from "./answer";

test("splitVisualMarkers: visuals land on their marker lines", () => {
    const segments = splitVisualMarkers("**114 RDV.**\n\n[[visuel 1]]\n\nLecture du graphique.\n\n[[visuel 2]]\n\nFin.", 2);
    assert.deepEqual(segments.map((s) => (s.type === "md" ? s.text : `#${s.index}`)), ["**114 RDV.**", "#1", "Lecture du graphique.", "#2", "Fin."]);
});

test("splitVisualMarkers: an unplaced visual follows the first paragraph; a stray or partial marker vanishes", () => {
    const segments = splitVisualMarkers("Ouverture.\n\nAnalyse.\n\n[[visuel 5]]\n[[visu", 1);
    assert.deepEqual(segments.map((s) => (s.type === "md" ? s.text : `#${s.index}`)), ["Ouverture.", "#1", "Analyse."]);
    assert.deepEqual(splitVisualMarkers("Texte seul.", 0), [{ type: "md", text: "Texte seul." }]);
});

test("splitVisualMarkers: unplaced visuals go last when others are placed", () => {
    const segments = splitVisualMarkers("A.\n\n[[visuel 2]]\n\nB.", 2);
    assert.deepEqual(segments.map((s) => (s.type === "md" ? s.text : `#${s.index}`)), ["A.", "#2", "B.", "#1"]);
});
