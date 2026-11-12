/**
 * Search query cleaning, LIKE escaping and snippets.
 *     npx tsx --test lib/assistant/search/snippet.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanQuery, escapeLike, fold, snippetAround } from "./snippet";

test("query: trimmed, collapsed, at least 2 characters", () => {
    assert.equal(cleanQuery(" a "), null);
    assert.equal(cleanQuery(null), null);
    assert.equal(cleanQuery("  rdv   semaine "), "rdv semaine");
});

test("LIKE wildcards are escaped", () => {
    assert.equal(escapeLike("50%_a\\b"), "50\\%\\_a\\\\b");
});

test("fold keeps indexes aligned while removing accents and case", () => {
    const text = "Équipe Élan";
    assert.equal(fold(text).length, text.length);
    assert.equal(fold(text), "equipe elan");
});

test("snippet: ~120 chars around the match, with ellipses where cut", () => {
    const text = `${"début ".repeat(40)}le taux de joignabilité est de 31 % ${"fin ".repeat(40)}`;
    const s = snippetAround(text, "JOIGNABILITE")!;
    assert.ok(s.length <= 124, `${s.length}`);
    assert.ok(s.startsWith("…") && s.endsWith("…"));
    assert.match(s, /joignabilité/);
    assert.equal(snippetAround("court", "x"), "court");
    assert.equal(snippetAround("", "x"), null);
    const noMatch = snippetAround("mot ".repeat(60), "absent")!;
    assert.ok(noMatch.endsWith("…") && !noMatch.startsWith("…"));
});
