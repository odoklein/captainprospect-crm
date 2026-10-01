import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    buildEnrichmentHash,
    buildEnrichmentInput,
    buildSuggestions,
    canonicalLinkedinCompany,
    collectPages,
    parseModelJson,
    reconcilePhone,
    type EnrichmentContext,
    type RetrievedPage,
} from "./company-ai-core";
import {
    companyPatchFor,
    missingCompanyFields,
    triggerGaps,
    type EnrichmentSuggestion,
} from "./company-fields";

const ctx = (overrides: Partial<EnrichmentContext> = {}): EnrichmentContext => ({
    name: "Atlas Logistique",
    website: "https://www.atlas-logistique.fr",
    country: "France",
    requested: ["phone", "industry", "country", "city", "linkedin", "website"],
    knownIndustries: ["Transport & Logistique", "Industrie"],
    ...overrides,
});

const page = (url: string, title: string, text: string): RetrievedPage => ({ url, title, text });

// libphonenumber-js cannot load its metadata under the tsx test runner (ESM/CJS JSON interop);
// the formatter is injected so these tests exercise the trust logic, not the phone library.
const fakeFormatPhone = (phone: string): string | null => {
    const digits = phone.replace(/\D/g, "");
    const national = (digits.startsWith("33") ? digits.slice(2) : digits).replace(/^0/, "");
    if (national.length !== 9) return null;
    return `+33 ${national[0]} ${national.slice(1, 3)} ${national.slice(3, 5)} ${national.slice(5, 7)} ${national.slice(7)}`;
};
const phoneDeps = { formatPhone: fakeFormatPhone };

describe("parseModelJson", () => {
    it("reads the fenced JSON the real API returns", () => {
        const raw = '```json\n{\n  "phone": "+33 1 42 68 53 00",\n  "city": "Roubaix",\n  "linkedin": null\n}\n```';
        assert.deepEqual(parseModelJson(raw), {
            phone: "+33 1 42 68 53 00",
            industry: null,
            country: null,
            city: "Roubaix",
            linkedin: null,
            website: null,
        });
    });

    it("finds the object inside surrounding prose and braces in strings", () => {
        const parsed = parseModelJson('Voici : {"industry": "Logistique {B2B}", "country": "France"} Bonne journée.');
        assert.equal(parsed?.industry, "Logistique {B2B}");
        assert.equal(parsed?.country, "France");
    });

    it("treats null-ish strings as missing and rejects non-JSON", () => {
        assert.equal(parseModelJson('{"phone": "null", "city": "N/A", "country": "  "}')?.phone, null);
        assert.equal(parseModelJson('{"phone": "null", "city": "N/A", "country": "  "}')?.city, null);
        assert.equal(parseModelJson("aucune information"), null);
        assert.equal(parseModelJson('{"phone": '), null);
    });
});

describe("collectPages", () => {
    const entry = (result: unknown) => ({ type: "tool.execution", info: { result: typeof result === "string" ? result : JSON.stringify(result) } });

    it("reads the search hits out of the JSON-string results, deduplicated and stripped of markup", () => {
        const pages = collectPages([
            entry({ a: { url: "https://x.fr/contact", title: "Contact", description: "Appelez le <strong>01 42 68 53 00</strong>", snippets: ["Paris"] } }),
            entry({ b: { url: "https://x.fr/contact", title: "Contact (doublon)", description: null, snippets: [] } }),
            { type: "message.output", content: "ignored" },
        ]);
        assert.equal(pages.length, 1);
        assert.match(pages[0].text, /01 42 68 53 00/);
        assert.doesNotMatch(pages[0].text, /<strong>/);
    });

    it("skips entries it cannot parse instead of failing the lookup", () => {
        assert.deepEqual(collectPages([entry("not json"), { type: "tool.execution" }, null]), []);
    });
});

describe("buildSuggestions — grounding", () => {
    it("trusts a phone found on the company's own site most", () => {
        const [s] = buildSuggestions(
            { phone: "01 42 68 53 00" },
            ctx({ requested: ["phone"] }),
            [page("https://www.atlas-logistique.fr/contact", "Contact", "Notre standard : 01 42 68 53 00 du lundi au vendredi")],
            phoneDeps,
        );
        assert.equal(s.field, "phone");
        assert.equal(s.trust, "own_site");
        assert.equal(s.confidence, 92);
        assert.match(s.value, /^\+33 1 42 68 53 00$/);
        assert.match(s.evidence ?? "", /01 42 68 53 00/);
    });

    it("drops a phone number that no retrieved page contains (hallucination)", () => {
        const out = buildSuggestions(
            { phone: "+33 1 42 68 53 00" },
            ctx({ requested: ["phone"] }),
            [page("https://annuaire.fr/atlas", "Atlas", "Atlas Logistique - 59000 Lille - tél 03 20 12 34 56")],
            phoneDeps,
        );
        assert.deepEqual(out, []);
    });

    it("scores a third-party number lower, and two concordant third parties in between", () => {
        const one = buildSuggestions({ phone: "01 42 68 53 00" }, ctx({ requested: ["phone"] }), [
            page("https://annuaire.fr/atlas", "Atlas", "tél 01 42 68 53 00"),
        ], phoneDeps);
        const two = buildSuggestions({ phone: "01 42 68 53 00" }, ctx({ requested: ["phone"] }), [
            page("https://annuaire.fr/atlas", "Atlas", "tél 01 42 68 53 00"),
            page("https://pro.example.com/atlas", "Atlas", "contact : 01.42.68.53.00"),
        ], phoneDeps);
        assert.equal(one[0].trust, "third_party");
        assert.equal(one[0].confidence, 68);
        assert.equal(two[0].trust, "multi_source");
        assert.equal(two[0].confidence, 80);
    });

    it("matches one number across +33 / 0 / separators", () => {
        const out = buildSuggestions({ phone: "+33 (0)1 42 68 53 00" }, ctx({ requested: ["phone"] }), [
            page("https://www.atlas-logistique.fr/", "Atlas", "Appelez-nous au 0142685300"),
        ], phoneDeps);
        assert.equal(out.length, 1);
    });

    it("accepts only company LinkedIn pages that the search really returned", () => {
        const pages = [page("https://fr.linkedin.com/company/atlas-logistique", "Atlas Logistique | LinkedIn", "")];
        const ok = buildSuggestions({ linkedin: "https://www.linkedin.com/company/atlas-logistique/" }, ctx({ requested: ["linkedin"] }), pages);
        assert.equal(ok[0].value, "https://www.linkedin.com/company/atlas-logistique");
        assert.equal(ok[0].confidence, 90);

        const person = buildSuggestions({ linkedin: "https://www.linkedin.com/in/jean-dupont" }, ctx({ requested: ["linkedin"] }), pages);
        const invented = buildSuggestions({ linkedin: "https://www.linkedin.com/company/autre-societe" }, ctx({ requested: ["linkedin"] }), pages);
        assert.deepEqual(person, []);
        assert.deepEqual(invented, []);
    });

    it("drops a LinkedIn page whose title does not look like the company", () => {
        const out = buildSuggestions(
            { linkedin: "https://www.linkedin.com/company/zzz" },
            ctx({ requested: ["linkedin"] }),
            [page("https://www.linkedin.com/company/zzz", "Quelqu'un d'autre | LinkedIn", "")],
        );
        assert.deepEqual(out, []);
    });

    it("rejects directories and social networks as the company website", () => {
        const pages = [
            page("https://www.societe.com/societe/atlas", "Atlas Logistique", ""),
            page("https://www.atlas-logistique.com/", "Atlas Logistique - Accueil", ""),
        ];
        assert.deepEqual(buildSuggestions({ website: "https://www.societe.com/societe/atlas" }, ctx({ requested: ["website"] }), pages), []);
        const good = buildSuggestions({ website: "atlas-logistique.com" }, ctx({ requested: ["website"] }), pages);
        assert.equal(good[0].value, "https://atlas-logistique.com");
        assert.equal(good[0].confidence, 82);
    });

    it("reuses the list's own industry label when it matches, flags a new one as less certain", () => {
        const known = buildSuggestions({ industry: "transport  &  logistique" }, ctx({ requested: ["industry"] }), []);
        const fresh = buildSuggestions({ industry: "Cybersécurité" }, ctx({ requested: ["industry"] }), []);
        assert.equal(known[0].value, "Transport & Logistique");
        assert.equal(known[0].confidence, 78);
        assert.equal(fresh[0].confidence, 62);
    });

    it("keeps a city only when a retrieved page mentions it", () => {
        const pages = [page("https://www.atlas-logistique.fr/", "Atlas", "Siège social : 12 rue du Port, 59100 Roubaix")];
        assert.equal(buildSuggestions({ city: "Roubaix" }, ctx({ requested: ["city"] }), pages)[0].value, "Roubaix");
        assert.deepEqual(buildSuggestions({ city: "Marseille" }, ctx({ requested: ["city"] }), pages), []);
    });

    it("turns an ISO country code into its French name and ignores fields that were not requested", () => {
        const out = buildSuggestions({ country: "BE", industry: "Industrie" }, ctx({ requested: ["country"] }), []);
        assert.equal(out.length, 1);
        assert.equal(out[0].field, "country");
        assert.equal(out[0].value, "Belgique");
    });
});

describe("reconcilePhone", () => {
    const ai: EnrichmentSuggestion = {
        field: "phone", value: "+33 1 42 68 53 00", confidence: 68, trust: "third_party",
        sourceUrl: "https://annuaire.fr/atlas", sourceLabel: "annuaire.fr", evidence: "tél 01 42 68 53 00", status: "PENDING",
    };
    const places = { phone: "+33 1 42 68 53 00", confidence: 80, sourceUrl: "https://maps.example/atlas", sourceLabel: "Google Places" };

    it("raises confidence when both sources agree", () => {
        const merged = reconcilePhone(ai, places);
        assert.equal(merged?.trust, "multi_source");
        assert.equal(merged?.confidence, 85);
    });

    it("keeps the stronger source when they disagree and mentions the other number", () => {
        const merged = reconcilePhone(ai, { ...places, phone: "+33 3 20 12 34 56" });
        assert.equal(merged?.value, "+33 3 20 12 34 56");
        assert.match(merged?.evidence ?? "", /Autre numéro trouvé : \+33 1 42 68 53 00/);
    });

    it("falls back to whichever source answered", () => {
        assert.equal(reconcilePhone(ai, null)?.value, ai.value);
        assert.equal(reconcilePhone(null, places)?.sourceLabel, "Google Places");
        assert.equal(reconcilePhone(null, null), null);
    });
});

describe("incomplete sheet detection", () => {
    it("lists every missing field but only some of them trigger the panel", () => {
        const company = { phone: null, industry: "Industrie", country: "France", website: "https://a.fr", customData: { city: "Lille" } };
        assert.deepEqual(missingCompanyFields(company), ["phone", "linkedin"]);
        assert.deepEqual(triggerGaps(company), ["phone", "linkedin"]);
    });

    it("does not nag when only city / website are missing", () => {
        const company = { phone: "+33 1 42 68 53 00", industry: "Industrie", country: "France", website: null, customData: { linkedin: "https://www.linkedin.com/company/a" } };
        assert.deepEqual(triggerGaps(company), []);
        assert.deepEqual(missingCompanyFields(company), ["website", "city"]);
    });

    it("counts an additional phone from the import and a differently named LinkedIn key", () => {
        const company = { phone: null, industry: "x", country: "x", website: "x", customData: { additionalPhones: ["+33 1 42 68 53 00"], "LinkedIn URL": "https://www.linkedin.com/company/a", Ville: "Lille" } };
        assert.deepEqual(missingCompanyFields(company), []);
    });
});

describe("applying a suggestion", () => {
    it("writes column fields straight onto the column", () => {
        assert.deepEqual(companyPatchFor({}, "industry", "Industrie"), { column: { industry: "Industrie" } });
    });

    it("merges LinkedIn / city into customData without losing the import's fields", () => {
        const patch = companyPatchFor({ customData: { siret: "123", additionalPhones: ["+33 1"] } }, "linkedin", "https://www.linkedin.com/company/a");
        assert.deepEqual(patch.customData, { siret: "123", additionalPhones: ["+33 1"], linkedin: "https://www.linkedin.com/company/a" });
    });

    it("reuses an existing empty key instead of creating a duplicate", () => {
        const patch = companyPatchFor({ customData: { Ville: "" } }, "city", "Lille");
        assert.deepEqual(patch.customData, { Ville: "Lille" });
    });
});

describe("cache key and prompt", () => {
    it("is stable across casing, accents and field order", () => {
        const a = buildEnrichmentHash({ name: "Atlas Logistique", website: "https://www.atlas.fr/", country: "France", requested: ["phone", "city"] });
        const b = buildEnrichmentHash({ name: "ATLAS  logistique", website: "atlas.fr", country: "france", requested: ["city", "phone"] });
        const c = buildEnrichmentHash({ name: "Atlas Logistique", website: "atlas.fr", country: "France", requested: ["phone"] });
        assert.equal(a, b);
        assert.notEqual(a, c);
    });

    it("hands the model the email domains as a hint to find the website, and only the requested fields", () => {
        const input = buildEnrichmentInput({ ...ctx({ website: null, requested: ["website", "phone"] }), emailDomains: ["atlas-logistique.fr"] });
        assert.match(input, /atlas-logistique\.fr/);
        assert.match(input, /website \(site web officiel\), phone/);
        assert.doesNotMatch(input, /linkedin/);
    });

    it("normalises LinkedIn company URLs", () => {
        assert.equal(canonicalLinkedinCompany("https://fr.linkedin.com/company/ovhgroup/?x=1"), "https://www.linkedin.com/company/ovhgroup");
        assert.equal(canonicalLinkedinCompany("https://www.linkedin.com/in/someone"), null);
    });
});
