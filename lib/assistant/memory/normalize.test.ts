/**
 * Memory normalisation, keys and the refusal list.
 *     npm run test:assistant-folders
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    forbiddenMemoryReason,
    isForbiddenMemory,
    memoryContentKey,
    memoryScopeKey,
    normalizeMemoryContent,
} from "./normalize";

test("normalizeMemoryContent lowercases, strips accents and punctuation, collapses spaces", () => {
    assert.equal(normalizeMemoryContent("  Préfère  les CR courts, sans   détour !"), "prefere les cr courts sans detour");
    assert.equal(normalizeMemoryContent("Cœur d'activité : l'Île-de-France"), "coeur d activite l ile de france");
    assert.equal(normalizeMemoryContent("Objectif Q4 = 12 RDV/semaine"), "objectif q4 12 rdv semaine");
});

test("memoryContentKey is stable across accents, case and punctuation", () => {
    const a = memoryContentKey("Préfère les CR courts.");
    const b = memoryContentKey("prefere les cr courts");
    const c = memoryContentKey("Préfère les CR longs.");
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(a, /^[0-9a-f]{40}$/);
});

test("memoryScopeKey follows SCOPE:folderId|userId| and checks the required id", () => {
    assert.equal(memoryScopeKey("AGENCY"), "AGENCY:||");
    assert.equal(memoryScopeKey("AGENCY", "f1", "u1"), "AGENCY:||");
    assert.equal(memoryScopeKey("FOLDER", "f1", "u1"), "FOLDER:f1||");
    assert.equal(memoryScopeKey("USER", "f1", "u1"), "USER:|u1|");
    assert.throws(() => memoryScopeKey("FOLDER", null, "u1"), /dossier/);
    assert.throws(() => memoryScopeKey("USER", "f1", null), /utilisateur/);
});

test("forbidden: passwords, credentials, IBAN, card numbers", () => {
    assert.equal(forbiddenMemoryReason("Le mot de passe du portail est Soleil2026"), "mot de passe");
    assert.equal(forbiddenMemoryReason("Password: hunter2"), "mot de passe");
    assert.equal(forbiddenMemoryReason("Leur api key Lemlist est dans Notion"), "clé d'API ou secret");
    assert.equal(forbiddenMemoryReason("token = eyJhbGciOi"), "identifiant secret");
    assert.equal(forbiddenMemoryReason("clé sk-live-ABCDEFGHIJKLMNOP1234"), "clé secrète");
    assert.equal(forbiddenMemoryReason("IBAN FR76 3000 6000 0112 3456 7890 189"), "IBAN");
    assert.equal(forbiddenMemoryReason("CB 4970 1234 5678 9012 exp 12/27"), "numéro de carte bancaire");
    assert.equal(isForbiddenMemory("mdp: azerty"), true);
});

test("forbidden: digit-heavy strings, but not a name with a phone number", () => {
    assert.equal(forbiddenMemoryReason("0612345678"), "suite de chiffres sans contexte");
    assert.equal(forbiddenMemoryReason("2026-10-30 14:00"), "suite de chiffres sans contexte");
    assert.equal(forbiddenMemoryReason("Jean Dupont, DG, joignable au 06 12 34 56 78"), null);
    assert.equal(forbiddenMemoryReason("Objectif : 12 RDV par semaine en Q4"), null);
});

test("ordinary memories pass", () => {
    assert.equal(isForbiddenMemory("Préfère les comptes rendus courts, en français, sans tableau."), false);
    assert.equal(isForbiddenMemory("Le secret de leur réussite : la relance à J+3."), false);
    assert.equal(isForbiddenMemory("Décision du 12/10 : on arrête les emails à froid sur la liste TALIS."), false);
});
