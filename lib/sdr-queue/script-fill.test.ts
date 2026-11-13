import { test } from "node:test";
import assert from "node:assert/strict";
import { fillScript, placeholderKey, shortSectionTitle } from "./script-fill";

test("placeholderKey reads the usual spellings", () => {
    assert.equal(placeholderKey("prénom"), "firstName");
    assert.equal(placeholderKey("Prénom du prospect"), "firstName");
    assert.equal(placeholderKey("first_name"), "firstName");
    assert.equal(placeholderKey("Nom"), "lastName");
    assert.equal(placeholderKey("nom de la société"), "company");
    assert.equal(placeholderKey("Entreprise"), "company");
    assert.equal(placeholderKey("votre prénom"), "me");
    assert.equal(placeholderKey("pause"), null);
    assert.equal(placeholderKey("si oui"), null);
});

test("fillScript fills what is on file and flags the rest", () => {
    const pieces = fillScript("Bonjour {prénom}, je suis [votre prénom] de Captain Soft. Je vous appelle pour {{ société }} [pause] — {nom} ?", {
        firstName: "Sophie",
        company: "Proxi des Ternes",
        me: "Julie",
    });
    assert.deepEqual(pieces, [
        { kind: "text", text: "Bonjour " },
        { kind: "field", raw: "{prénom}", value: "Sophie" },
        { kind: "text", text: ", je suis " },
        { kind: "field", raw: "[votre prénom]", value: "Julie" },
        { kind: "text", text: " de Captain Soft. Je vous appelle pour " },
        { kind: "field", raw: "{{ société }}", value: "Proxi des Ternes" },
        { kind: "text", text: " [pause] — " },
        { kind: "field", raw: "{nom}", value: null },
        { kind: "text", text: " ?" },
    ]);
});

test("fillScript leaves a script without placeholders untouched", () => {
    assert.deepEqual(fillScript("Bonjour, c'est Julie.", {}), [{ kind: "text", text: "Bonjour, c'est Julie." }]);
});

test("shortSectionTitle", () => {
    assert.equal(shortSectionTitle("1. Introduction / Accroche"), "Introduction");
    assert.equal(shortSectionTitle("3. Réponses aux objections"), "Réponses aux objections");
    assert.equal(shortSectionTitle("Closing - Appel à l'action"), "Closing");
    assert.equal(shortSectionTitle("Une très longue section de script qui déborde"), "Une très longue section d…");
});
