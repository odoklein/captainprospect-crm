import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksSchema, MAX_BLOCK_TEXT, PAGE_TEMPLATE_IDS, PAGE_TEMPLATES, readBlocks } from "./blocks";

test("every template produces a valid document", () => {
    for (const id of PAGE_TEMPLATE_IDS) {
        const blocks = PAGE_TEMPLATES[id].blocks();
        assert.ok(blocks.length > 0, id);
        assert.equal(blocksSchema.safeParse(blocks).success, true, id);
        assert.equal(new Set(blocks.map((block) => block.id)).size, blocks.length, `${id}: unique ids`);
    }
});

test("stored documents keep valid blocks and drop broken ones", () => {
    const blocks = readBlocks([
        { id: "a", type: "h2", text: "Contexte" },
        { id: "b", type: "unknown", text: "?" },
        "not a block",
        { id: "c", type: "todo", text: "Valider", checked: true },
        { type: "paragraph", text: "sans id" },
    ]);
    assert.deepEqual(blocks.map((block) => block.id), ["a", "c"]);
    assert.equal(blocks[1].checked, true);
});

test("a stored value that is not a list reads as an empty page", () => {
    assert.deepEqual(readBlocks(null), []);
    assert.deepEqual(readBlocks({ blocks: [] }), []);
});

test("saves refuse oversized text", () => {
    const result = blocksSchema.safeParse([{ id: "a", type: "paragraph", text: "x".repeat(MAX_BLOCK_TEXT + 1) }]);
    assert.equal(result.success, false);
});
