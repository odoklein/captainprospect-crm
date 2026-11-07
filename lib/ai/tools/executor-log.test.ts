import { test } from "node:test";
import assert from "node:assert/strict";
import { compactLogArgs } from "./executor";

test("the action log keeps ids and flags, cuts long bodies", () => {
    const body = "x".repeat(60_000);
    const out = compactLogArgs({ title: "Bilan", content_markdown: body, include_visuals: [1, 2], dry: true }) as Record<string, unknown>;
    assert.equal(out.title, "Bilan");
    assert.deepEqual(out.include_visuals, [1, 2]);
    assert.equal(out.dry, true);
    assert.ok(String(out.content_markdown).length < 600);
    assert.match(String(out.content_markdown), /60000 caractères/);
});

test("nested values and arrays are bounded too", () => {
    const out = compactLogArgs({ a: { b: ["y".repeat(900)] }, list: Array.from({ length: 80 }, (_, i) => i) }) as { a: { b: string[] }; list: number[] };
    assert.ok(out.a.b[0].length < 600);
    assert.equal(out.list.length, 50);
});
