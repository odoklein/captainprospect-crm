import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { buildN2fCompanies, normalizePhone, readSheetRows, splitName } from "./rows";

const HEADER = ["Compte", "Contact", "Fonction", "Ligne directe", "Mobile", "Statut"];

test("normalizePhone fixes what Excel did to the numbers", () => {
    assert.equal(normalizePhone("'+33 4 78 78 12 60")?.value, "+33 4 78 78 12 60");
    assert.equal(normalizePhone("'+33698336752'")?.value, "+33 6 98 33 67 52");
    assert.equal(normalizePhone("33 478 781 260")?.value, "+33 4 78 78 12 60"); // "+" lost
    assert.equal(normalizePhone("251660858")?.value, "+33 2 51 66 08 58"); // leading 0 lost
    assert.equal(normalizePhone("33 (0)6 65 95 09 95")?.value, "+33 6 65 95 09 95");
    assert.equal(normalizePhone("04 76 60 46 14 LD")?.value, "+33 4 76 60 46 14");
    assert.equal(normalizePhone("'+46 910 71 18 00")?.value, "+46 910 71 18 00");
    // Not a valid number: kept as written, flagged.
    assert.deepEqual(normalizePhone("04278611151"), { value: "04278611151", parsed: false });
    assert.equal(normalizePhone(null), null);
    assert.equal(normalizePhone("  '' "), null);
});

test("splitName: first word is the first name", () => {
    assert.deepEqual(splitName("Jean-Marc De La Tour"), { firstName: "Jean-Marc", lastName: "De La Tour" });
    assert.deepEqual(splitName("Cher"), { firstName: null, lastName: "Cher" });
});

test("buildN2fCompanies merges duplicate rows and prefers a French mobile", () => {
    const r = buildN2fCompanies([
        HEADER,
        ["Abrisud", "Bertrand Delcaillau", "DAF", null, "'+33 6 23 78 42 53", "À appeler"],
        ["abrisud ", "Bertrand  Delcaillau", "DAF", "'+33 4 72 52 48 00", "'+33 6 23 78 42 53", "À appeler"],
        ["Acoem", "Stéphane Maurisseau", "Group CFO", "'+33 4 72 52 48 00", "'+33 6 99 16 06 09", "À appeler"],
        [null, null, null, null, null, null],
    ]);
    assert.equal(r.rows, 3);
    assert.equal(r.duplicateRowsMerged, 1);
    assert.equal(r.companies.length, 2);
    const [abrisud, acoem] = r.companies;
    assert.equal(abrisud.name, "Abrisud");
    assert.equal(abrisud.contacts.length, 1);
    assert.equal(abrisud.contacts[0].phone, "+33 6 23 78 42 53");
    assert.deepEqual(abrisud.contacts[0].additionalPhones, ["+33 4 72 52 48 00"]);
    assert.equal(acoem.contacts[0].title, "Group CFO");
    assert.equal(acoem.contacts[0].phone, "+33 6 99 16 06 09");
    assert.equal(acoem.contacts[0].fileStatus, "À appeler");
});

test("buildN2fCompanies rejects an unexpected column layout", () => {
    assert.throws(() => buildN2fCompanies([["Société", "Contact"]]), /Colonne 1 inattendue/);
});

test("the committed N2F file parses to 371 companies / 392 contacts", async () => {
    const r = buildN2fCompanies(await readSheetRows(join(__dirname, "data", "n2f-daf-base.xlsx")));
    assert.equal(r.rows, 401);
    assert.equal(r.companies.length, 371);
    assert.equal(r.companies.reduce((n, c) => n + c.contacts.length, 0), 392);
    assert.equal(r.duplicateRowsMerged, 9);
});
