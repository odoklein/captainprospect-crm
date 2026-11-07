/**
 * Chunk boundaries, overlap, page/heading tracking and caps:
 *     npx tsx --test lib/assistant/files/chunk.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { chunkSections, chunkTokens } from "./chunk";

/** Distinct, recognisable words so a mid-word cut or a lost word is visible. */
function words(n: number, prefix = "mot"): string[] {
    return Array.from({ length: n }, (_, i) => `${prefix}${i}`);
}

function sentences(n: number, prefix = "phrase"): string {
    return Array.from({ length: n }, (_, i) => `Voici la ${prefix} numéro ${i} du document.`).join(" ");
}

test("tokens are ceil(chars / 3.3)", () => {
    assert.equal(chunkTokens(""), 0);
    assert.equal(chunkTokens("abc"), 1);
    assert.equal(chunkTokens("a".repeat(33)), 10);
    assert.equal(chunkTokens("a".repeat(34)), 11);
});

test("a short document is one chunk with its page and heading", () => {
    const { chunks, truncated } = chunkSections([{ heading: "Offre", page: 2, text: "Un paragraphe.\n\nUn autre." }]);
    assert.equal(truncated, false);
    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0], {
        index: 0,
        content: "Un paragraphe.\n\nUn autre.",
        tokens: chunkTokens("Un paragraphe.\n\nUn autre."),
        page: 2,
        heading: "Offre",
    });
});

test("chunks respect the target (plus overlap) and never cut a word", () => {
    const all = words(3000);
    const text = all.join(" ");
    const { chunks } = chunkSections([{ text }], { targetTokens: 100, overlapTokens: 20 });
    assert.ok(chunks.length > 5);
    const targetChars = Math.floor(100 * 3.3);
    const overlapChars = Math.floor(20 * 3.3);
    const vocabulary = new Set(all);
    for (const c of chunks) {
        assert.ok(c.content.length <= targetChars + overlapChars + 1, `chunk ${c.index}: ${c.content.length}`);
        for (const w of c.content.split(/\s+/)) assert.ok(vocabulary.has(w), `cut word « ${w} » in chunk ${c.index}`);
    }
    // Nothing lost: every word appears in some chunk, in order.
    const seen = new Set(chunks.flatMap((c) => c.content.split(/\s+/)));
    for (const w of all) assert.ok(seen.has(w), `${w} lost`);
});

test("consecutive chunks overlap by about overlapTokens", () => {
    const text = sentences(200);
    const { chunks } = chunkSections([{ text }], { targetTokens: 120, overlapTokens: 30 });
    assert.ok(chunks.length > 3);
    for (let i = 1; i < chunks.length; i++) {
        const prev = chunks[i - 1].content;
        const cur = chunks[i].content;
        // The start of a chunk repeats the end of the previous one.
        const head = cur.slice(0, 40);
        assert.ok(prev.includes(head), `chunk ${i} does not start with an overlap`);
        // Overlap is bounded: whole sentences up to ~30 tokens.
        let shared = 0;
        while (shared < cur.length && prev.endsWith(cur.slice(0, shared + 1))) shared++;
        assert.ok(shared <= Math.floor(30 * 3.3), `overlap ${shared} chars`);
    }
});

test("no overlap when overlapTokens is 0", () => {
    const { chunks } = chunkSections([{ text: sentences(100) }], { targetTokens: 80, overlapTokens: 0 });
    const joined = chunks.map((c) => c.content).join(" ");
    assert.equal(joined, sentences(100));
});

test("splits on blank lines first, then sentences", () => {
    const para1 = sentences(6, "alpha");
    const para2 = sentences(6, "beta");
    const { chunks } = chunkSections([{ text: `${para1}\n\n${para2}` }], { targetTokens: 80, overlapTokens: 0 });
    // Each paragraph alone exceeds 80 tokens (264 chars), so they are split on
    // sentences, and no chunk mixes the end of alpha with the start of beta mid-sentence.
    for (const c of chunks) {
        assert.ok(/^Voici/.test(c.content), `chunk starts mid-sentence: ${c.content.slice(0, 30)}`);
        assert.ok(/\.$/.test(c.content), `chunk ends mid-sentence: ${c.content.slice(-30)}`);
    }
    // A paragraph that fits is never split.
    const small = chunkSections([{ text: "Court.\n\nAussi court." }], { targetTokens: 80 });
    assert.equal(small.chunks.length, 1);
});

test("page follows where the chunk's new content starts", () => {
    const pages = [1, 2, 3, 4].map((page) => ({ page, text: sentences(12, `p${page}`) }));
    const { chunks } = chunkSections(pages, { targetTokens: 100, overlapTokens: 20 });
    assert.equal(chunks[0].page, 1);
    const pagesSeen = chunks.map((c) => c.page);
    assert.deepEqual([...pagesSeen].sort(), pagesSeen, "pages are monotonic");
    assert.deepEqual([...new Set(pagesSeen)], [1, 2, 3, 4]);
    for (const c of chunks) {
        // The first sentence that is not overlap belongs to the chunk's page.
        assert.ok(c.content.includes(`p${c.page}`), `chunk ${c.index} labelled p.${c.page}`);
    }
});

test("a heading change starts a new chunk, with no overlap from the previous section", () => {
    const { chunks } = chunkSections(
        [
            { heading: "Contexte", text: "Le client vend des logiciels." },
            { heading: "Contexte", text: "Il cible les DAF." },
            { heading: "Tarifs", text: "Le forfait est de 4500 euros." },
        ],
        { targetTokens: 800, overlapTokens: 120 },
    );
    assert.deepEqual(
        chunks.map((c) => [c.heading, c.content]),
        [
            ["Contexte", "Le client vend des logiciels.\n\nIl cible les DAF."],
            ["Tarifs", "Le forfait est de 4500 euros."],
        ],
    );
});

test("rows of a table split on lines, not on words", () => {
    const rows = Array.from({ length: 400 }, (_, i) => `Société ${i} | Lyon | ${i * 10} €`);
    const { chunks } = chunkSections([{ heading: "Feuille A", text: rows.join("\n") }], { targetTokens: 100, overlapTokens: 0 });
    assert.ok(chunks.length > 5);
    for (const c of chunks) {
        for (const line of c.content.split("\n")) assert.match(line, /^Société \d+ \| Lyon \| \d+ €$/);
    }
});

test("an over-long single word is hard-split instead of looping", () => {
    const blob = "x".repeat(5000);
    const { chunks } = chunkSections([{ text: `avant ${blob} après` }], { targetTokens: 100, overlapTokens: 10 });
    assert.ok(chunks.length >= 15);
    assert.ok(chunks.every((c) => c.content.length <= 330 + 33 + 1));
});

test("maxChunks caps the output and reports truncation", () => {
    const { chunks, truncated } = chunkSections([{ text: sentences(500) }], { targetTokens: 60, overlapTokens: 10, maxChunks: 4 });
    assert.equal(chunks.length, 4);
    assert.equal(truncated, true);
    assert.deepEqual(chunks.map((c) => c.index), [0, 1, 2, 3]);
});

test("empty and blank sections produce nothing", () => {
    assert.deepEqual(chunkSections([{ text: "" }, { text: "   \n\n  " }]), { chunks: [], truncated: false });
});
