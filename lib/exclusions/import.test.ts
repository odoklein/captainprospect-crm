/**
 * Bulk blacklist import — the pure half. Runs without a database:
 *     npm run test:exclusions
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
    buildCompanyRuleIndex,
    findRuleIdForCompany,
    guessColumns,
    prepareImportRows,
    ruleSignature,
    summarizeImport,
} from "./import";
import { companyKeys, ruleMatches } from "./matching";

test("a normal row becomes a rule, with the best label we have", () => {
    const [row] = prepareImportRows([{ companyName: "Brand To Design SAS", website: "https://www.brandtodesign.fr/", phone: "01 23 45 67 89" }]);
    assert.equal(row.status, "CREATED");
    assert.equal(row.label, "Brand To Design SAS");
    assert.equal(row.keys.companyNameKey, "brand to design");
    assert.equal(row.keys.domainKey, "brandtodesign.fr");
    assert.equal(row.keys.phoneKey, "123456789");
    assert.equal(row.line, 1);
});

test("a row with only a website or only a phone is still usable", () => {
    const rows = prepareImportRows([{ website: "acme.com" }, { phone: "+33 1 23 45 67 89" }]);
    assert.deepEqual(rows.map((r) => r.status), ["CREATED", "CREATED"]);
    assert.equal(rows[0].label, "acme.com");
    assert.equal(rows[1].label, "+33 1 23 45 67 89");
});

test("rows with nothing identifying are rejected, never turned into a match-everything rule", () => {
    const rows = prepareImportRows([
        {},
        { companyName: "   " },
        { companyName: "SAS" }, // a legal form alone is not a name
        { website: "n/a" },
        { website: "gmail.com" }, // a free-mail domain never becomes a key
        { phone: "123" }, // too short to identify a switchboard
    ]);
    assert.deepEqual(rows.map((r) => r.status), Array(6).fill("UNUSABLE"));
});

test("a repeated line is reported as a duplicate, whatever its spelling", () => {
    const rows = prepareImportRows([
        { companyName: "Cabinet Dupuis" },
        { companyName: "CABINET DUPUIS SARL" },
        { companyName: "Cabinet-Dupuis" },
    ]);
    assert.deepEqual(rows.map((r) => r.status), ["CREATED", "DUPLICATE_IN_FILE", "DUPLICATE_IN_FILE"]);
});

test("rows already covered by an active rule of the same scope are not written twice", () => {
    const existing = [companyKeys({ name: "Acme", website: "acme.com" })];
    const rows = prepareImportRows(
        [{ companyName: "ACME SAS", website: "www.acme.com" }, { companyName: "Acme", website: "acme.fr" }],
        existing
    );
    // Same three keys -> already there. A different website changes the rule, so it is kept.
    assert.deepEqual(rows.map((r) => r.status), ["ALREADY_EXCLUDED", "CREATED"]);
});

test("the summary adds up to the number of rows", () => {
    const rows = prepareImportRows([
        { companyName: "A Corp Paris" },
        { companyName: "A Corp Paris" },
        {},
        { companyName: "Zeta Conseil" },
    ]);
    const summary = summarizeImport(rows);
    assert.deepEqual(summary, { total: 4, created: 2, duplicates: 1, rejected: 1 });
    assert.equal(summary.created + summary.duplicates + summary.rejected, summary.total);
});

test("trimming and blanks: empty strings behave like missing values", () => {
    const [row] = prepareImportRows([{ companyName: "  Dupuis  ", website: "", phone: "  " }]);
    assert.equal(row.input.website, null);
    assert.equal(row.input.phone, null);
    assert.equal(row.label, "Dupuis");
});

// ============================================
// INDEXED MATCHING
// ============================================

const rules = [
    { id: "r-name", ...companyKeys({ name: "Brand To Design" }) },
    { id: "r-domain", ...companyKeys({ name: null, website: "acme.com" }) },
    { id: "r-phone", ...companyKeys({ name: null, phone: "01 23 45 67 89" }) },
];

test("the index recognises a company by name, domain or phone, in any formatting", () => {
    const index = buildCompanyRuleIndex(rules);
    assert.equal(findRuleIdForCompany(index, { name: "BRAND TO DESIGN SAS" }), "r-name");
    assert.equal(findRuleIdForCompany(index, { name: "Other", website: "https://www.acme.com/contact" }), "r-domain");
    assert.equal(findRuleIdForCompany(index, { name: "Other", phone: "+33 1 23 45 67 89" }), "r-phone");
});

test("the index leaves unrelated companies alone", () => {
    const index = buildCompanyRuleIndex(rules);
    assert.equal(findRuleIdForCompany(index, { name: "Brand To Build", website: "build.fr", phone: "04 11 22 33 44" }), null);
    assert.equal(findRuleIdForCompany(index, { name: null }), null);
});

test("the index agrees with ruleMatches for every rule and candidate", () => {
    const index = buildCompanyRuleIndex(rules);
    const candidates = [
        { name: "Brand To Design" },
        { name: "x", website: "acme.com" },
        { name: "x", phone: "0123456789" },
        { name: "nothing", website: "nothing.io", phone: "0499999999" },
    ];
    for (const candidate of candidates) {
        const indexed = findRuleIdForCompany(index, candidate) !== null;
        const scanned = rules.some((rule) =>
            ruleMatches(
                { ...rule, target: "COMPANY", scope: "GLOBAL", scopeId: null },
                companyKeys(candidate)
            )
        );
        assert.equal(indexed, scanned, JSON.stringify(candidate));
    }
});

test("when two rules both match, the earlier one is kept", () => {
    const index = buildCompanyRuleIndex([
        { id: "first", ...companyKeys({ name: "Dupuis" }) },
        { id: "second", ...companyKeys({ name: "Dupuis", website: "dupuis.fr" }) },
    ]);
    assert.equal(findRuleIdForCompany(index, { name: "Dupuis" }), "first");
});

test("a rule signature ignores keys that do not identify a company", () => {
    assert.equal(
        ruleSignature(companyKeys({ name: "Acme SAS", website: "www.acme.com" })),
        ruleSignature(companyKeys({ name: "acme", website: "acme.com" }))
    );
});

// ============================================
// COLUMN GUESSING
// ============================================

test("columns are guessed from French and English headers", () => {
    assert.deepEqual(guessColumns(["Société", "Site web", "Téléphone", "Commentaire"]), {
        companyName: "Société",
        website: "Site web",
        phone: "Téléphone",
    });
    assert.deepEqual(guessColumns(["Company name", "Website", "Phone"]), {
        companyName: "Company name",
        website: "Website",
        phone: "Phone",
    });
    assert.deepEqual(guessColumns(["raison_sociale", "url", "standard"]), {
        companyName: "raison_sociale",
        website: "url",
        phone: "standard",
    });
});

test("a BOM on the first header does not hide the column", () => {
    assert.equal(guessColumns(["﻿Entreprise", "Domaine"]).companyName, "﻿Entreprise");
});

test("unknown headers are left for the user to map", () => {
    assert.deepEqual(guessColumns(["A", "B", "C"]), {});
});

test("one column is never claimed for two fields", () => {
    const guess = guessColumns(["Nom"]);
    assert.equal(guess.companyName, "Nom");
    assert.equal(guess.website, undefined);
    assert.equal(guess.phone, undefined);
});
