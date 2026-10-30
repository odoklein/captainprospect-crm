import { test } from "node:test";
import assert from "node:assert/strict";
import {
    SLASH_COMMANDS,
    filterMentionFiles,
    filterSlashCommands,
    insertMention,
    keptMentions,
    mentionAt,
    mentionToken,
    slashQuery,
} from "./composer-logic";

test("slashQuery only fires on a lone slash word", () => {
    assert.equal(slashQuery("/"), "");
    assert.equal(slashQuery("/Rés"), "res");
    assert.equal(slashQuery("/pdf "), null);
    assert.equal(slashQuery("Fais /pdf"), null);
    assert.equal(slashQuery(""), null);
});

test("filterSlashCommands: name prefix first, then label", () => {
    assert.equal(filterSlashCommands("").length, SLASH_COMMANDS.length);
    assert.deepEqual(filterSlashCommands("p").map((c) => c.id), ["pdf"]);
    assert.deepEqual(filterSlashCommands("mem").map((c) => c.id), ["memoire"]);
    assert.deepEqual(filterSlashCommands("graph").map((c) => c.id), []);
    assert.deepEqual(filterSlashCommands("resu").map((c) => c.id), ["resume"]);
    assert.equal(SLASH_COMMANDS.find((c) => c.id === "pdf")?.template, "Fais-en un PDF");
});

test("mentionAt finds the @word under the caret", () => {
    assert.deepEqual(mentionAt("@", 1), { start: 0, query: "" });
    assert.deepEqual(mentionAt("Lis @devi", 9), { start: 4, query: "devi" });
    assert.equal(mentionAt("mail@exemple", 12), null);
    assert.equal(mentionAt("@devis puis", 11), null);
    assert.equal(mentionAt("sans arobase", 5), null);
    // Caret before the end: the query stops at the caret.
    assert.deepEqual(mentionAt("Lis @devis", 7), { start: 4, query: "de" });
});

test("insertMention swaps the @word for the file token", () => {
    const out = insertMention("Lis @dev et résume", { start: 4, query: "dev" }, 8, "Devis 2026.pdf");
    assert.equal(out.text, `Lis ${mentionToken("Devis 2026.pdf")} et résume`);
    assert.equal(out.text.slice(0, out.caret), `Lis ${mentionToken("Devis 2026.pdf")} `);
    assert.equal(insertMention("@", { start: 0, query: "" }, 1, "a.pdf").text, "[fichier: a.pdf] ");
});

test("keptMentions drops files whose token was erased, and duplicates", () => {
    const a = { fileId: "f1", name: "a.pdf" };
    const b = { fileId: "f2", name: "b.pdf" };
    assert.deepEqual(keptMentions("Lis [fichier: a.pdf]", [a, b, a]), [a]);
    assert.deepEqual(keptMentions("rien", [a]), []);
});

test("filterMentionFiles: accent-insensitive, starts-with first, capped", () => {
    const files = [{ name: "Compte rendu.docx" }, { name: "Échéancier.xlsx" }, { name: "Devis échelle.pdf" }];
    assert.deepEqual(filterMentionFiles(files, "eche").map((f) => f.name), ["Échéancier.xlsx", "Devis échelle.pdf"]);
    assert.equal(filterMentionFiles(files, "").length, 3);
    assert.equal(filterMentionFiles(files, "", 2).length, 2);
});
