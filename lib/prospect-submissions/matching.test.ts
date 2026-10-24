import { test } from "node:test";
import assert from "node:assert/strict";
import {
    companyCompleteness,
    contactCompleteness,
    decideOutcome,
    findBlacklistHit,
    findDuplicates,
    type ExclusionRuleRow,
    type MissionCompanyRow,
    type MissionContactRow,
} from "./matching";

const companies: MissionCompanyRow[] = [
    {
        id: "co_martin",
        name: "Cabinet Martin SAS",
        website: "https://www.cabinet-martin.fr/contact",
        phone: "04 72 11 22 33",
        additionalPhones: ["06 98 76 54 32"],
        listId: "l1",
        listName: "CGP Lyon",
    },
    { id: "co_other", name: "Patrimoine & Co", website: null, phone: null, listId: "l2", listName: "CGP Rhône" },
];

const contacts: MissionContactRow[] = [
    {
        id: "ct_julie",
        companyId: "co_other",
        companyName: "Patrimoine & Co",
        listName: "CGP Rhône",
        firstName: "Julie",
        lastName: "Durand",
        email: "julie@patrimoine-co.fr",
        phone: "+33 6 11 22 33 44",
    },
];

test("normalized company name matches across legal form, accents and punctuation", () => {
    const dups = findDuplicates({ company: { name: "cabinet-martin" }, contact: null }, companies, contacts);
    assert.equal(dups.length, 1);
    assert.equal(dups[0].kind, "COMPANY");
    assert.equal(dups[0].reason, "NAME");
    assert.equal(dups[0].companyId, "co_martin");
});

test("phone matches whatever the formatting, including additional phones", () => {
    const dups = findDuplicates({ company: { name: "Autre nom", phone: "+33 4 72 11 22 33" }, contact: null }, companies, contacts);
    assert.equal(dups[0]?.reason, "PHONE");

    const viaContact = findDuplicates(
        { company: { name: "Autre nom" }, contact: { firstName: "Paul", phone: "0698765432" } },
        companies,
        contacts,
    );
    assert.equal(viaContact[0]?.companyId, "co_martin");
});

test("domain from the website or a work email, never from a free mailbox", () => {
    const viaEmail = findDuplicates(
        { company: { name: "Nouveau" }, contact: { lastName: "X", email: "p.x@cabinet-martin.fr" } },
        companies,
        contacts,
    );
    assert.equal(viaEmail[0]?.reason, "DOMAIN");

    const gmail = findDuplicates(
        { company: { name: "Nouveau" }, contact: { lastName: "X", email: "someone@gmail.com" } },
        [{ ...companies[0], website: "gmail.com" }],
        [],
    );
    assert.equal(gmail.length, 0);
});

test("a contact already in the base blocks even under another company name", () => {
    const dups = findDuplicates(
        { company: { name: "Société inconnue" }, contact: { firstName: "J", email: "JULIE@patrimoine-co.fr" } },
        companies,
        contacts,
    );
    assert.equal(dups[0].kind, "CONTACT");
    assert.equal(dups[0].reason, "EMAIL");
    assert.equal(dups[0].contactId, "ct_julie");
});

test("adding a contact to an existing company skips the company checks", () => {
    const dups = findDuplicates(
        { company: { name: "Cabinet Martin" }, contact: { firstName: "Paul", phone: "07 00 00 00 01" }, existingCompanyId: "co_martin" },
        companies,
        contacts,
    );
    assert.equal(dups.length, 0);
});

test("a pending submission for the same company blocks a second one", () => {
    const dups = findDuplicates({ company: { name: "Cabinet Dupuis" }, contact: null }, [], [], [
        {
            id: "sub1",
            sdrName: "Léa",
            createdAt: "2026-10-22T10:00:00.000Z",
            company: { name: "CABINET DUPUIS SARL" },
            contact: null,
            existingCompanyId: null,
        },
    ]);
    assert.equal(dups.length, 1);
    assert.equal(dups[0].kind, "PENDING");
    assert.equal(dups[0].sdrName, "Léa");
});

test("no match for a genuinely new company", () => {
    assert.equal(
        findDuplicates({ company: { name: "Cabinet Neuf", phone: "04 00 00 00 00" }, contact: null }, companies, contacts).length,
        0,
    );
});

const baseRule = {
    liftedAt: null,
    expiresAt: null,
    companyNameKey: null,
    domainKey: null,
    phoneKey: null,
    emailKey: null,
    contactNameKey: null,
};

test("company blacklist rule in scope refuses the prospect", () => {
    const rules: ExclusionRuleRow[] = [
        { ...baseRule, id: "r1", target: "COMPANY", scope: "CLIENT", scopeId: "client_a", companyNameKey: "cabinet dupuis" },
    ];
    const hit = findBlacklistHit(rules, { company: { name: "Cabinet Dupuis SAS" }, contact: null }, { clientId: "client_a", missionId: "m1" });
    assert.equal(hit?.id, "r1");
});

test("a CLIENT rule of another client does not apply", () => {
    const rules: ExclusionRuleRow[] = [
        { ...baseRule, id: "r1", target: "COMPANY", scope: "CLIENT", scopeId: "client_b", companyNameKey: "cabinet dupuis" },
    ];
    assert.equal(
        findBlacklistHit(rules, { company: { name: "Cabinet Dupuis" }, contact: null }, { clientId: "client_a", missionId: "m1" }),
        null,
    );
});

test("a CONTACT rule only matches the same person at the same company", () => {
    const rules: ExclusionRuleRow[] = [
        {
            ...baseRule,
            id: "r2",
            target: "CONTACT",
            scope: "GLOBAL",
            scopeId: null,
            companyNameKey: "cabinet dupuis",
            contactNameKey: "jean dupont",
        },
    ];
    const ctx = { clientId: "c", missionId: "m" };
    assert.equal(
        findBlacklistHit(rules, { company: { name: "Cabinet Dupuis" }, contact: { firstName: "Jean", lastName: "Dupont" } }, ctx)?.id,
        "r2",
    );
    assert.equal(
        findBlacklistHit(rules, { company: { name: "Autre Cabinet" }, contact: { firstName: "Jean", lastName: "Dupont" } }, ctx),
        null,
    );
});

test("lifted and expired rules are ignored", () => {
    const rules: ExclusionRuleRow[] = [
        { ...baseRule, id: "r3", target: "COMPANY", scope: "GLOBAL", scopeId: null, companyNameKey: "x corp", liftedAt: new Date() },
        {
            ...baseRule,
            id: "r4",
            target: "COMPANY",
            scope: "GLOBAL",
            scopeId: null,
            companyNameKey: "x corp",
            expiresAt: new Date("2020-01-01"),
        },
    ];
    assert.equal(findBlacklistHit(rules, { company: { name: "X Corp" }, contact: null }, { clientId: null, missionId: null }), null);
});

test("decideOutcome: blacklist and duplicates win over every mode", () => {
    const dup = [{ kind: "COMPANY", reason: "NAME", id: "x", companyId: "x", contactId: null, label: "X", listName: null }] as const;
    assert.equal(decideOutcome("OFF", [], null), "DISABLED");
    assert.equal(decideOutcome("DIRECT", [...dup], { id: "r" }), "BLACKLISTED");
    assert.equal(decideOutcome("VALIDATION", [...dup], null), "DUPLICATE");
    assert.equal(decideOutcome("DIRECT", [], null), "CREATE");
    assert.equal(decideOutcome("VALIDATION", [], null), "QUEUE");
});

test("completeness follows POST /api/contacts; a switchboard alone makes the company callable", () => {
    assert.equal(contactCompleteness({ firstName: "A", phone: "0600000000" }), "ACTIONABLE");
    assert.equal(contactCompleteness({ firstName: "A" }), "PARTIAL");
    assert.equal(contactCompleteness({}), "INCOMPLETE");
    assert.equal(companyCompleteness({ name: "X", phone: "04 72 00 00 00" }, []), "ACTIONABLE");
    assert.equal(companyCompleteness({ name: "X" }, ["PARTIAL"]), "PARTIAL");
    assert.equal(companyCompleteness({ name: "X" }, []), "INCOMPLETE");
});
