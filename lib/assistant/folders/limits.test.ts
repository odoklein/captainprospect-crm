/**
 * Folder instruction limit, starter questions and folder cards.
 *     npx tsx --test lib/assistant/folders/limits.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    EMPTY_STATS,
    INSTRUCTIONS_MAX_TOKENS,
    checkInstructions,
    instructionsTokens,
    normalizeStarterQuestions,
    toFolderCard,
    type FolderCardRow,
    type FolderStats,
} from "./limits";

test("instructions: ceil(chars / 3.3) tokens, refused above 600", () => {
    assert.equal(INSTRUCTIONS_MAX_TOKENS, 600);
    assert.equal(instructionsTokens(null), 0);
    assert.equal(instructionsTokens("abcd"), 2);
    const atLimit = "x".repeat(1980); // 1980 / 3.3 = 600
    assert.deepEqual(checkInstructions(atLimit), { ok: true, value: atLimit, tokens: 600 });
    const over = checkInstructions("x".repeat(1981));
    assert.equal(over.ok, false);
    if (!over.ok) {
        assert.equal(over.tokens, 601);
        assert.match(over.reason, /601 tokens pour 600 maximum/);
    }
    assert.deepEqual(checkInstructions("   "), { ok: true, value: null, tokens: 0 });
    assert.deepEqual(checkInstructions(undefined), { ok: true, value: null, tokens: 0 });
});

test("starter questions: strings only, trimmed, deduplicated, at most 6", () => {
    assert.deepEqual(normalizeStarterQuestions(null), []);
    assert.deepEqual(normalizeStarterQuestions(["  Bilan  de la semaine ", "bilan de la semaine", 3, "", "RDV ?"]), [
        "Bilan de la semaine",
        "RDV ?",
    ]);
    assert.equal(normalizeStarterQuestions(Array.from({ length: 10 }, (_, i) => `q${i}`)).length, 6);
});

const general: FolderCardRow = { id: "g1", kind: "GENERAL", name: "Veille", color: null, icon: null, clientId: null, lastActivityAt: null };
const client: FolderCardRow = {
    id: "fa",
    kind: "CLIENT",
    name: "Client A",
    color: "rose",
    icon: null,
    clientId: "A",
    lastActivityAt: new Date("2026-10-29T08:00:00.000Z"),
};

test("folder card: general counts by folder, client counts by client (legacy unfiled threads included)", () => {
    const stats: FolderStats = {
        ...EMPTY_STATS,
        byFolder: new Map([["g1", 3], ["fa", 1]]),
        byClient: new Map([["A", 7]]),
        memories: new Map([["fa", 2]]),
        files: new Map([["fa", 5]]),
        pins: new Map([["g1", 1]]),
        agentFolderIds: new Set(),
        agentClientIds: new Set(["A"]),
    };
    const g = toFolderCard(general, stats);
    assert.deepEqual(g.counts, { conversations: 3, memories: 0, files: 0, pins: 1 });
    assert.equal(g.hasAgentActivity, false);
    assert.equal(g.lastActivityAt, null);
    const c = toFolderCard(client, stats);
    assert.deepEqual(c.counts, { conversations: 7, memories: 2, files: 5, pins: 0 });
    assert.equal(c.hasAgentActivity, true, "activity on the client lights its folder");
    assert.equal(c.lastActivityAt, "2026-10-29T08:00:00.000Z");
    assert.equal(toFolderCard(general, { ...stats, agentFolderIds: new Set(["g1"]) }).hasAgentActivity, true);
});
