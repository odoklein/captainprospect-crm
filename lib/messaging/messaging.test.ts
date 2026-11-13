/**
 * SMS pure logic:
 *     npm run test:messaging
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isStopKeyword, smsLength, withSignature } from "./segments";

test("GSM-7: 160 in one part, 153 per part beyond; é and à stay GSM-7", () => {
    assert.deepEqual(smsLength("").segments, 0);
    const a = smsLength("Bonjour Sophie, c'est Julie de Captain Soft. Rappelez-moi à 14 h, merci !");
    assert.equal(a.encoding, "GSM-7");
    assert.equal(a.segments, 1);
    assert.equal(smsLength("x".repeat(160)).segments, 1);
    assert.equal(smsLength("x".repeat(161)).segments, 2);
    assert.equal(smsLength("x".repeat(306)).segments, 2);
    assert.equal(smsLength("x".repeat(307)).segments, 3);
    assert.equal(smsLength("€").units, 2, "extension characters count twice");
});

test("UCS-2: one ê, ç-free œ or emoji switches the whole message to 70 / 67", () => {
    const b = smsLength("Très bien, à bientôt");
    assert.equal(b.encoding, "UCS-2");
    assert.deepEqual(b.unicodeChars, ["ô"]);
    assert.equal(smsLength("ê".repeat(70)).segments, 1);
    assert.equal(smsLength("ê".repeat(71)).segments, 2);
    assert.equal(smsLength("👍").units, 2);
});

test("STOP keywords, case and punctuation tolerant, never inside a sentence", () => {
    assert.equal(isStopKeyword("stop"), "STOP");
    assert.equal(isStopKeyword(" Arrêt. "), "ARRÊT");
    assert.equal(isStopKeyword("STOP SMS"), "STOP SMS");
    assert.equal(isStopKeyword("Ne stoppez pas, rappelez-moi"), null);
});

test("signature appended once, on its own line", () => {
    assert.equal(withSignature("Bonjour", "Julie · Captain Soft"), "Bonjour\nJulie · Captain Soft");
    assert.equal(withSignature("Bonjour\nJulie · Captain Soft", "Julie · Captain Soft"), "Bonjour\nJulie · Captain Soft");
    assert.equal(withSignature("Bonjour  ", null), "Bonjour");
});
