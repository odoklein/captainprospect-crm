/**
 * Matching and permission tests for the exclusion module.
 *
 * Everything under test is pure, so this runs without a database:
 *     npm run test:exclusions
 *
 * The cases that matter most are the ones where a rule must NOT fire: a
 * free-mail domain must never blacklist every Gmail prospect, a namesake at
 * another company must stay callable, and a client session must never reach
 * another client's data.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { UserRole } from "@prisma/client";

import {
    companyNameKey,
    contactNameKey,
    domainKey,
    emailKey,
    phoneKey,
    companyKeys,
    contactKeys,
    hasAnyKey,
    isRuleActive,
    ruleMatches,
    scopeCovers,
    EMPTY_KEYS,
} from "./matching";
import {
    allowedScopesFor,
    canActOnClient,
    canCreateExclusion,
    canLiftExclusion,
    canViewAllExclusions,
} from "./permissions";
import { resolveExpiry, EXCLUSION_DURATIONS } from "./constants";
import { createExclusionSchema, clientExclusionSchema, liftExclusionSchema } from "./schemas";

// ============================================
// COMPANY NAME KEY
// ============================================

test("company name key folds case, accents, punctuation and legal form", () => {
    const expected = "brand to design";
    assert.equal(companyNameKey("BRAND TO DESIGN"), expected);
    assert.equal(companyNameKey("Brand To Design SAS"), expected);
    assert.equal(companyNameKey("  brand-to-design  "), expected);
    assert.equal(companyNameKey("Brand To Design S.A.S."), expected);
});

test("company name key strips stacked legal forms but keeps the identity", () => {
    assert.equal(companyNameKey("Société Générale SA"), "societe generale");
    assert.equal(companyNameKey("Dupont SA SARL"), "dupont");
});

test("company name key refuses a name that is only a legal form", () => {
    // Otherwise a rule built from a badly imported row would match every SAS.
    assert.equal(companyNameKey("SAS"), null);
    assert.equal(companyNameKey("  "), null);
    assert.equal(companyNameKey(null), null);
});

// ============================================
// DOMAIN KEY
// ============================================

test("domain key normalizes urls and email addresses to the same host", () => {
    assert.equal(domainKey("https://www.brandtodesign.fr/contact?utm=x"), "brandtodesign.fr");
    assert.equal(domainKey("BrandToDesign.fr"), "brandtodesign.fr");
    assert.equal(domainKey("jean@brandtodesign.fr"), "brandtodesign.fr");
});

test("domain key refuses free mailbox providers", () => {
    // The guard that stops one Gmail contact from blacklisting every Gmail prospect.
    for (const address of ["jean@gmail.com", "marie@orange.fr", "paul@outlook.fr"]) {
        assert.equal(domainKey(address), null, `${address} must not yield a domain key`);
    }
});

test("domain key refuses values that are not hosts", () => {
    assert.equal(domainKey("n/a"), null);
    assert.equal(domainKey("localhost"), null);
    assert.equal(domainKey(""), null);
});

// ============================================
// PHONE KEY
// ============================================

test("phone key matches the same number across french formats", () => {
    const expected = "612345678";
    assert.equal(phoneKey("+33 6 12 34 56 78"), expected);
    assert.equal(phoneKey("06 12 34 56 78"), expected);
    assert.equal(phoneKey("0033612345678"), expected);
    assert.equal(phoneKey("06.12.34.56.78"), expected);
});

test("phone key refuses fragments too short to identify anyone", () => {
    assert.equal(phoneKey("1234"), null);
    assert.equal(phoneKey("n/a"), null);
    assert.equal(phoneKey(null), null);
});

// ============================================
// EMAIL AND CONTACT NAME
// ============================================

test("email key lowercases and validates", () => {
    assert.equal(emailKey("  Jean.Dupont@Example.FR "), "jean.dupont@example.fr");
    assert.equal(emailKey("not-an-email"), null);
});

test("contact name key folds accents and hyphens", () => {
    assert.equal(contactNameKey("Jean-Pierre", "Dupont"), "jean pierre dupont");
    assert.equal(contactNameKey("Éloïse", "Béart"), "eloise beart");
    assert.equal(contactNameKey(null, null), null);
});

// ============================================
// RULE MATCHING — COMPANY
// ============================================

const brandToDesign = {
    name: "BRAND TO DESIGN",
    website: "https://www.brandtodesign.fr",
    phone: "01 23 45 67 89",
};

const companyRule = {
    target: "COMPANY" as const,
    scope: "CLIENT" as const,
    scopeId: "client-1",
    liftedAt: null,
    expiresAt: null,
    ...companyKeys(brandToDesign),
};

test("a company rule survives a re-import that changed the label and dropped the website", () => {
    // The scenario the status-based workaround could never cover.
    const reimported = { name: "Brand To Design SAS", website: null, phone: null };
    assert.equal(ruleMatches(companyRule, companyKeys(reimported)), true);
});

test("a company rule matches on the website alone when the name was mangled", () => {
    const mangled = { name: "BTD Group", website: "brandtodesign.fr", phone: null };
    assert.equal(ruleMatches(companyRule, companyKeys(mangled)), true);
});

test("a company rule leaves an unrelated company alone", () => {
    const other = { name: "Brand New Design", website: "brandnewdesign.fr", phone: "0987654321" };
    assert.equal(ruleMatches(companyRule, companyKeys(other)), false);
});

test("a company rule with no usable key is refused before it is ever stored", () => {
    const junk = companyKeys({ name: "SAS", website: "n/a", phone: "12" });
    assert.equal(hasAnyKey(junk), false);
});

// ============================================
// RULE MATCHING — CONTACT
// ============================================

const jean = { firstName: "Jean", lastName: "Dupont", email: "j.dupont@brandtodesign.fr", phone: "+33 6 12 34 56 78" };

const contactRule = {
    target: "CONTACT" as const,
    scope: "CLIENT" as const,
    scopeId: "client-1",
    liftedAt: null,
    expiresAt: null,
    ...contactKeys(jean, brandToDesign),
};

test("a contact rule recognises the person after a re-import gives them a new row", () => {
    const reimported = { firstName: "Jean", lastName: "Dupont", email: null, phone: "06 12 34 56 78" };
    assert.equal(ruleMatches(contactRule, contactKeys(reimported, brandToDesign)), true);
});

test("a contact rule matches on the email even when the name is spelled differently", () => {
    const variant = { firstName: "J.", lastName: "Dupont", email: "J.Dupont@BrandToDesign.fr", phone: null };
    assert.equal(ruleMatches(contactRule, contactKeys(variant, brandToDesign)), true);
});

test("a namesake at another company stays callable", () => {
    const namesake = { firstName: "Jean", lastName: "Dupont", email: "jean@autre.fr", phone: null };
    const otherCompany = { name: "Autre Société", website: "autre.fr", phone: null };
    assert.equal(ruleMatches(contactRule, contactKeys(namesake, otherCompany)), false);
});

test("a contact rule does not take the whole company with it", () => {
    const colleague = { firstName: "Marie", lastName: "Martin", email: "m.martin@brandtodesign.fr", phone: "0611111111" };
    assert.equal(ruleMatches(contactRule, contactKeys(colleague, brandToDesign)), false);
});

// ============================================
// SCOPE AND LIFECYCLE
// ============================================

test("scope decides which work a rule reaches", () => {
    const client = { scope: "CLIENT" as const, scopeId: "client-1" };
    const mission = { scope: "MISSION" as const, scopeId: "mission-9" };
    const global = { scope: "GLOBAL" as const, scopeId: null };

    assert.equal(scopeCovers(client, { clientId: "client-1", missionId: "mission-9" }), true);
    assert.equal(scopeCovers(client, { clientId: "client-2", missionId: "mission-9" }), false);
    assert.equal(scopeCovers(mission, { clientId: "client-1", missionId: "mission-9" }), true);
    assert.equal(scopeCovers(mission, { clientId: "client-1", missionId: "mission-8" }), false);
    assert.equal(scopeCovers(global, { clientId: null, missionId: null }), true);
});

test("lifted and expired rules stop being enforced", () => {
    const now = new Date("2026-09-23T12:00:00Z");
    const base = { scope: "CLIENT" as const, scopeId: "client-1" };

    assert.equal(isRuleActive({ ...base, liftedAt: null, expiresAt: null }, now), true);
    assert.equal(isRuleActive({ ...base, liftedAt: now, expiresAt: null }, now), false);
    assert.equal(
        isRuleActive({ ...base, liftedAt: null, expiresAt: new Date("2026-09-22T12:00:00Z") }, now),
        false
    );
    assert.equal(
        isRuleActive({ ...base, liftedAt: null, expiresAt: new Date("2026-12-01T00:00:00Z") }, now),
        true
    );
});

test("permanent is the only duration without an expiry", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    assert.equal(resolveExpiry("permanent", from), null);

    for (const duration of EXCLUSION_DURATIONS.filter((d) => d.days)) {
        const expiry = resolveExpiry(duration.value, from);
        assert.ok(expiry instanceof Date, `${duration.value} must expire`);
        assert.ok(expiry!.getTime() > from.getTime());
    }
});

// ============================================
// PERMISSIONS
// ============================================

const MANAGER = { id: "m1", role: "MANAGER" as UserRole };
const SDR = { id: "s1", role: "SDR" as UserRole };
const CLIENT = { id: "c1", role: "CLIENT" as UserRole, clientId: "client-1" };
const OTHER_CLIENT = { id: "c2", role: "CLIENT" as UserRole, clientId: "client-2" };

test("only a manager may exclude globally", () => {
    assert.equal(canCreateExclusion(MANAGER, "GLOBAL"), true);
    assert.equal(canCreateExclusion(SDR, "GLOBAL"), false);
    assert.equal(canCreateExclusion(CLIENT, "GLOBAL"), false);
});

test("an sdr excludes at client and mission level, a client only at its own", () => {
    assert.equal(canCreateExclusion(SDR, "CLIENT"), true);
    assert.equal(canCreateExclusion(SDR, "MISSION"), true);
    assert.equal(canCreateExclusion(CLIENT, "CLIENT"), true);
    assert.equal(canCreateExclusion(CLIENT, "MISSION"), false);
    assert.deepEqual(allowedScopesFor(CLIENT), ["CLIENT"]);
    assert.deepEqual(allowedScopesFor(MANAGER), ["CLIENT", "MISSION", "GLOBAL"]);
});

test("a client session is confined to its own client", () => {
    assert.equal(canActOnClient(CLIENT, "client-1"), true);
    assert.equal(canActOnClient(CLIENT, "client-2"), false);
    assert.equal(canActOnClient(OTHER_CLIENT, "client-1"), false);
    assert.equal(canActOnClient(MANAGER, "client-2"), true);
});

test("lifting is a manager decision, except undoing your own rule", () => {
    const ownRule = { scope: "CLIENT" as const, scopeId: "client-1", createdById: "s1" };
    const otherRule = { scope: "CLIENT" as const, scopeId: "client-1", createdById: "s2" };
    const globalRule = { scope: "GLOBAL" as const, scopeId: null, createdById: "s1" };

    assert.equal(canLiftExclusion(SDR, ownRule), true);
    assert.equal(canLiftExclusion(SDR, otherRule), false);
    assert.equal(canLiftExclusion(SDR, globalRule), false);
    assert.equal(canLiftExclusion(MANAGER, otherRule), true);
});

test("a client cannot lift another client's rule even if they created one", () => {
    const foreignRule = { scope: "CLIENT" as const, scopeId: "client-2", createdById: "c1" };
    assert.equal(canLiftExclusion(CLIENT, foreignRule), false);
});

test("only a manager reads the full journal", () => {
    assert.equal(canViewAllExclusions(MANAGER), true);
    assert.equal(canViewAllExclusions(SDR), false);
    assert.equal(canViewAllExclusions(CLIENT), false);
});

// ============================================
// SCHEMAS
// ============================================

test("a contact-level exclusion requires a contact", () => {
    const bad = createExclusionSchema.safeParse({
        target: "CONTACT",
        scope: "CLIENT",
        scopeId: "client-1",
        companyId: "co-1",
        reason: "Demande client",
    });
    assert.equal(bad.success, false);
});

test("a scoped exclusion requires its scope id, global does not", () => {
    assert.equal(
        createExclusionSchema.safeParse({
            target: "COMPANY",
            scope: "CLIENT",
            companyId: "co-1",
            reason: "Demande client",
        }).success,
        false
    );
    assert.equal(
        createExclusionSchema.safeParse({
            target: "COMPANY",
            scope: "GLOBAL",
            companyId: "co-1",
            reason: "Demande RGPD",
        }).success,
        true
    );
});

test("a reason is always required, on creation and on lift", () => {
    assert.equal(
        clientExclusionSchema.safeParse({ target: "COMPANY", companyId: "co-1", reason: "" }).success,
        false
    );
    assert.equal(liftExclusionSchema.safeParse({ liftReason: "ok" }).success, false);
    assert.equal(liftExclusionSchema.safeParse({ liftReason: "Erreur de saisie" }).success, true);
});

test("duration defaults to permanent", () => {
    const parsed = clientExclusionSchema.parse({
        target: "COMPANY",
        companyId: "co-1",
        reason: "Ne plus contacter",
    });
    assert.equal(parsed.duration, "permanent");
});

// ============================================
// REGRESSION GUARD
// ============================================

test("empty keys never match anything", () => {
    const emptyRule = { target: "COMPANY" as const, scope: "GLOBAL" as const, scopeId: null, liftedAt: null, expiresAt: null, ...EMPTY_KEYS };
    assert.equal(ruleMatches(emptyRule, companyKeys(brandToDesign)), false);
});
