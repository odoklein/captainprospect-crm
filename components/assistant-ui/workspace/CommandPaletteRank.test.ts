/**
 * Command palette ranking.
 *     npx tsx --test components/assistant-ui/workspace/CommandPaletteRank.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { fuzzyMatch, normalizeText, parseRecent, pushRecent, rankItems, splitHighlight, type RecentItem } from "./CommandPaletteRank";

test("normalizeText strips accents and case", () => {
    assert.equal(normalizeText("Évènement Été"), "evenement ete");
    assert.equal(normalizeText("Société Générale"), "societe generale");
});

test("accent-insensitive match maps ranges back to the original text", () => {
    const hit = fuzzyMatch("societe", "La Société Générale");
    assert.ok(hit);
    assert.deepEqual(hit.ranges, [[3, 10]]);
    assert.equal("La Société Générale".slice(3, 10), "Société");
});

test("prefix beats word start beats substring beats subsequence", () => {
    const prefix = fuzzyMatch("bou", "Bouygues")!;
    const word = fuzzyMatch("bou", "Groupe Bouygues")!;
    const sub = fuzzyMatch("bou", "Caribou")!;
    const seq = fuzzyMatch("bgs", "Bouygues")!;
    assert.ok(prefix.score > word.score);
    assert.ok(word.score > sub.score);
    assert.ok(sub.score > seq.score);
});

test("multi-word queries match words in any order", () => {
    const hit = fuzzyMatch("generale soc", "Société Générale");
    assert.ok(hit);
    assert.equal(hit.ranges.length, 2);
});

test("scattered subsequences are rejected", () => {
    assert.equal(fuzzyMatch("aeiou", "a b c d e f g h i j k l m n o p q r s t u"), null);
    assert.equal(fuzzyMatch("xyz", "Bouygues"), null);
});

test("empty query matches everything with no ranges", () => {
    assert.deepEqual(fuzzyMatch("  ", "Anything"), { score: 0, ranges: [] });
});

test("rankItems orders by score and keeps ties stable", () => {
    const items = ["Caribou", "Bouygues Telecom", "Bouygues", "Autre"];
    const ranked = rankItems("bouygues", items, (s) => s).map((r) => r.item);
    assert.deepEqual(ranked, ["Bouygues", "Bouygues Telecom"]);
});

test("splitHighlight produces alternating parts", () => {
    assert.deepEqual(splitHighlight("Société Générale", [[0, 3], [8, 11]]), [
        { text: "Soc", match: true },
        { text: "iété ", match: false },
        { text: "Gén", match: true },
        { text: "érale", match: false },
    ]);
    assert.deepEqual(splitHighlight("abc", []), [{ text: "abc", match: false }]);
});

test("recent list dedupes, caps and survives bad storage", () => {
    const a: RecentItem = { kind: "folder", id: "f1", label: "A", folderId: "f1" };
    const b: RecentItem = { kind: "conversation", id: "c1", label: "B", folderId: null };
    let list = pushRecent([], a);
    list = pushRecent(list, b);
    list = pushRecent(list, a);
    assert.deepEqual(list.map((r) => r.id), ["f1", "c1"]);
    const many = Array.from({ length: 10 }, (_, i) => ({ kind: "file" as const, id: `x${i}`, label: "x", folderId: null }));
    assert.equal(many.reduce((l, r) => pushRecent(l, r), [] as RecentItem[]).length, 6);
    assert.deepEqual(parseRecent("not json"), []);
    assert.deepEqual(parseRecent(JSON.stringify([{ kind: "nope", id: "1", label: "x" }, b])), [b]);
});
