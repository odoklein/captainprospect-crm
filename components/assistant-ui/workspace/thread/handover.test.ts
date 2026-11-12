import { test } from "node:test";
import assert from "node:assert/strict";
import type { ThreadMessage } from "@/lib/assistant/api-contract";
import {
    RenderKeys,
    blockChange,
    carryRenderKeys,
    changedBlocks,
    liveItemVisible,
    nextTurnKey,
    splitMarkdownBlocks,
} from "./handover";

const msg = (id: string, role: ThreadMessage["role"], content = id): ThreadMessage => ({
    id,
    role,
    content,
    createdAt: "2026-10-29T10:00:00.000Z",
    trace: null,
    action: null,
    attachments: null,
    feedback: null,
});

const identity = (id: string) => id;

// ---- Render keys ------------------------------------------------------------------

test("the saved answer takes the live turn's key, so React updates in place", () => {
    const keys = new RenderKeys();
    const turn = nextTurnKey(0);
    keys.markStreamed(turn);
    keys.bind("srv-a2", turn);
    assert.equal(keys.keyOf("srv-a2"), turn);
    // Unbound ids key by themselves.
    assert.equal(keys.keyOf("srv-a1"), "srv-a1");
    // Binding an id to itself is a no-op.
    keys.bind("x", "x");
    assert.equal(keys.keyOf("x"), "x");
});

test("turn keys are unique even within the same millisecond", () => {
    assert.notEqual(nextTurnKey(5), nextTurnKey(5));
});

test("carryRenderKeys hands browser rows' keys to the server rows that replace them", () => {
    const keyOf = (id: string) => (id === "a-9" ? "turn-x" : id);
    const prev = [msg("u1", "USER"), msg("a1", "ASSISTANT"), msg("local-1", "USER", "Combien de RDV ?"), msg("a-9", "ASSISTANT", "12 RDV")];
    const next = [msg("u1", "USER"), msg("a1", "ASSISTANT"), msg("srv-u2", "USER", "Combien de RDV ?"), msg("srv-a2", "ASSISTANT", "12 RDV")];
    assert.deepEqual(carryRenderKeys(prev, next, keyOf), [
        ["srv-u2", "local-1"],
        ["srv-a2", "turn-x"],
    ]);
});

test("carryRenderKeys: the answer already had its server id, only the question moves", () => {
    const prev = [msg("local-1", "USER", "Salut"), msg("srv-a1", "ASSISTANT")];
    const next = [msg("srv-u1", "USER", "Salut"), msg("srv-a1", "ASSISTANT")];
    assert.deepEqual(carryRenderKeys(prev, next, identity), [["srv-u1", "local-1"]]);
});

test("carryRenderKeys never pairs a question with different text, nor server rows that stayed", () => {
    const prev = [msg("local-1", "USER", "Ma question")];
    const next = [msg("srv-other", "USER", "Autre onglet"), msg("srv-u1", "USER", "Ma question")];
    assert.deepEqual(carryRenderKeys(prev, next, identity), [["srv-u1", "local-1"]]);
    assert.deepEqual(carryRenderKeys([msg("u1", "USER")], [msg("u1", "USER"), msg("u2", "USER")], identity), []);
});

test("carryRenderKeys: a stopped answer hands its key to the saved cancelled answer", () => {
    const keyOf = (id: string) => (id === "stopped-1" ? "turn-s" : id);
    const prev = [msg("srv-u1", "USER"), msg("stopped-1", "ASSISTANT", "Début *(Réponse interrompue.)*")];
    const next = [msg("srv-u1", "USER"), msg("srv-a1", "ASSISTANT", "Début")];
    assert.deepEqual(carryRenderKeys(prev, next, keyOf), [["srv-a1", "turn-s"]]);
});

test("RenderKeys.carry chains through the registry", () => {
    const keys = new RenderKeys();
    keys.bind("a-1", "turn-1");
    keys.carry([msg("a-1", "ASSISTANT")], [msg("srv-1", "ASSISTANT")]);
    assert.equal(keys.keyOf("srv-1"), "turn-1");
});

test("enter animation: once for history, never for a streamed message", () => {
    const keys = new RenderKeys();
    assert.equal(keys.shouldEnter("hist-1"), true);
    keys.markEntered("hist-1");
    assert.equal(keys.shouldEnter("hist-1"), false);
    keys.markStreamed("turn-1");
    assert.equal(keys.shouldEnter("turn-1"), false);
});

test("the live block hides once the settled answer is in the thread", () => {
    const messages = [msg("u1", "USER"), msg("srv-a1", "ASSISTANT")];
    assert.equal(liveItemVisible(null, messages), true);
    assert.equal(liveItemVisible("srv-a2", messages), true);
    assert.equal(liveItemVisible("srv-a1", messages), false);
});

// ---- Markdown blocks --------------------------------------------------------------

test("splitMarkdownBlocks cuts at blank lines", () => {
    assert.deepEqual(splitMarkdownBlocks("Un.\n\nDeux.\n\n\n### Titre\nTrois."), ["Un.", "Deux.", "### Titre\nTrois."]);
    assert.deepEqual(splitMarkdownBlocks(""), []);
    assert.deepEqual(splitMarkdownBlocks("\n\nSeul\n\n"), ["Seul"]);
});

test("splitMarkdownBlocks keeps fences, loose lists and continuations whole", () => {
    const fence = "```sql\nselect 1;\n\nselect 2;\n```";
    assert.deepEqual(splitMarkdownBlocks(`Avant\n\n${fence}\n\nAprès`), ["Avant", fence, "Après"]);
    assert.deepEqual(splitMarkdownBlocks("1. Un\n\n2. Deux\n\n3. Trois\n\nFin"), ["1. Un\n\n2. Deux\n\n3. Trois", "Fin"]);
    assert.deepEqual(splitMarkdownBlocks("- a\n\n  suite de a\n- b"), ["- a\n\n  suite de a\n- b"]);
    // An unclosed fence (still streaming) swallows the rest.
    assert.deepEqual(splitMarkdownBlocks("Texte\n\n```\ncode\n\nencore"), ["Texte", "```\ncode\n\nencore"]);
    // Tables have no blank lines: one block.
    assert.deepEqual(splitMarkdownBlocks("| a | b |\n|---|---|\n| 1 | 2 |"), ["| a | b |\n|---|---|\n| 1 | 2 |"]);
});

test("blockChange: same, grown by the stream, or rewritten", () => {
    assert.equal(blockChange("Ce mois-ci", "Ce mois-ci"), "same");
    assert.equal(blockChange("Ce mois-ci ", "Ce mois-ci"), "same");
    assert.equal(blockChange("Ce mois", "Ce mois-ci, 12 RDV"), "grow");
    assert.equal(blockChange("Para 1\n\nPara 2", "Para 1"), "grow");
    assert.equal(blockChange("12 RDV ce mois-ci", "11 RDV ce mois-ci"), "replace");
});

test("draft equals final: nothing to cross-fade", () => {
    const answer = "Ce mois-ci, **12 RDV** [E1].\n\n- Client A : 7\n- Client B : 5\n\nÀ suivre.";
    assert.deepEqual(changedBlocks(answer, answer), []);
    // Trailing whitespace from the stream does not count as a change.
    assert.deepEqual(changedBlocks(`${answer}\n`, answer), []);
});

test("verification repair: only the rewritten block cross-fades", () => {
    const draft = "Bilan.\n\nCe mois-ci, 14 RDV.\n\nÀ suivre.";
    const final = "Bilan.\n\nCe mois-ci, 12 RDV [E1].\n\nÀ suivre.";
    assert.deepEqual(changedBlocks(draft, final), [1]);
    // A block appended at the end is new, not rewritten.
    assert.deepEqual(changedBlocks("Bilan.", "Bilan.\n\n*Un chiffre n’a pas pu être vérifié.*"), []);
});
