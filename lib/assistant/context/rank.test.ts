/**
 * Memory ranking edge cases.
 *     npx tsx --test lib/assistant/context/rank.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { contentTokens, jaccard, scoreMemory, selectMemories, type MemoryCandidate } from "./rank";

const NOW = new Date("2026-10-29T10:00:00Z");
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * 86_400_000);

function mem(over: Partial<MemoryCandidate> & { id: string }): MemoryCandidate {
    return {
        scope: "AGENCY",
        kind: "FACT",
        content: "Un souvenir quelconque",
        pinned: false,
        useCount: 0,
        updatedAt: NOW,
        missionId: null,
        ...over,
    };
}

const q = { question: "", missionId: null, now: NOW };

test("contentTokens normalises, drops short words and stopwords", () => {
    const toks = contentTokens("Combien de RDV pour Acme Énergie dans les 30 derniers jours ?");
    assert.ok(toks.has("acme"));
    assert.ok(toks.has("energie"));
    assert.ok(toks.has("derniers"));
    assert.ok(toks.has("jours"));
    assert.ok(!toks.has("combien"));
    assert.ok(!toks.has("pour"));
    assert.ok(!toks.has("dans"));
    assert.ok(!toks.has("rdv"));
});

test("jaccard is 0 on empty sets and 1 on identical sets", () => {
    assert.equal(jaccard(new Set(), new Set(["a"])), 0);
    assert.equal(jaccard(new Set(["acme", "energie"]), new Set(["acme", "energie"])), 1);
    assert.equal(jaccard(new Set(["acme", "energie"]), new Set(["acme", "solaire"])), 1 / 3);
});

test("a fresh unpinned FACT without overlap scores kind + full recency", () => {
    const s = scoreMemory(mem({ id: "a" }), q);
    assert.ok(Math.abs(s - (0.7 + 1.5)) < 1e-9, `score ${s}`);
});

test("pinned adds 3, mission adds 0.5, use caps at 4", () => {
    const base = scoreMemory(mem({ id: "a" }), q);
    assert.ok(Math.abs(scoreMemory(mem({ id: "a", pinned: true }), q) - base - 3) < 1e-9);
    assert.ok(Math.abs(scoreMemory(mem({ id: "a", missionId: "m1" }), { ...q, missionId: "m1" }) - base - 0.5) < 1e-9);
    assert.ok(Math.abs(scoreMemory(mem({ id: "a", missionId: "m1" }), { ...q, missionId: "m2" }) - base) < 1e-9);
    const use4 = scoreMemory(mem({ id: "a", useCount: 4 }), q);
    const use40 = scoreMemory(mem({ id: "a", useCount: 40 }), q);
    assert.ok(Math.abs(use4 - base - 0.25) < 1e-9);
    assert.equal(use4, use40);
});

test("recency decays with age and never goes negative in the future", () => {
    const fresh = scoreMemory(mem({ id: "a" }), q);
    const old = scoreMemory(mem({ id: "a", updatedAt: daysAgo(90) }), q);
    const ancient = scoreMemory(mem({ id: "a", updatedAt: daysAgo(900) }), q);
    const future = scoreMemory(mem({ id: "a", updatedAt: daysAgo(-5) }), q);
    assert.ok(fresh > old && old > ancient);
    assert.ok(Math.abs(fresh - old - 1.5 * (1 - Math.exp(-1))) < 1e-9);
    assert.equal(future, fresh);
});

test("kind weights order GOAL > DECISION > PREFERENCE > FACT > CONTACT > unknown", () => {
    const scores = ["GOAL", "DECISION", "PREFERENCE", "FACT", "CONTACT", "WHATEVER"].map((kind) => scoreMemory(mem({ id: "a", kind }), q));
    for (let i = 1; i < scores.length; i += 1) assert.ok(scores[i - 1] > scores[i], `${i}`);
});

test("selectMemories with a zero budget chooses nothing and counts every drop", () => {
    const r = selectMemories([mem({ id: "a" }), mem({ id: "b", scope: "USER" })], q, 0, () => 5);
    assert.deepEqual(r.chosen, []);
    assert.equal(r.dropped, 2);
});

test("selectMemories skips a big item but still takes smaller ones that fit", () => {
    const big = mem({ id: "big", pinned: true, content: "x".repeat(200) });
    const small1 = mem({ id: "s1", content: "petit un" });
    const small2 = mem({ id: "s2", content: "petit deux" });
    const r = selectMemories([big, small1, small2], q, 10, (m) => (m.id === "big" ? 50 : 4));
    assert.deepEqual(r.chosen.map((m) => m.id).sort(), ["s1", "s2"]);
    assert.equal(r.dropped, 1);
});

test("ties break by updatedAt desc then id asc", () => {
    const a = mem({ id: "b", updatedAt: daysAgo(1) });
    const b = mem({ id: "a", updatedAt: daysAgo(1) });
    const c = mem({ id: "c", updatedAt: NOW });
    const r = selectMemories([a, b, c], q, 1000, () => 1);
    assert.deepEqual(r.chosen.map((m) => m.id), ["c", "a", "b"]);
});
