import { test } from "node:test";
import assert from "node:assert/strict";
import { JOB_TITLE_GROUPS } from "@/lib/client-onboarding/questionnaire";
import { foldText, isFranceOrUnknown, roleFamiliesFor, roleFamilyOf, sectionOfNaf, sectorOf, sizeKeyOf } from "./market-classify";

test("folding drops accents and case, one character for one", () => {
    assert.equal(foldText("Directeur Général Délégué"), "directeur general delegue");
    assert.equal(foldText("ÉLECTRICITÉ"), "electricite");
    assert.equal(foldText("Systèmes d’information"), "systemes d'information");
    assert.equal(foldText(null), "");
});

test("every one-click job title of the questionnaire lands in a role family", () => {
    const expected: Record<string, string> = {
        "Dirigeant / CEO": "direction", "Gérant": "direction", "Directeur général": "direction", "Directeur d'agence": "direction",
        "Directeur de site / usine": "operations", "Directeur des opérations": "operations",
        "Directeur commercial": "commercial", "Directeur des achats": "achats", "DAF": "finance", "DRH": "rh", "DSI / CTO": "it",
        "Directeur marketing": "marketing", "Directeur supply chain": "operations", "Directeur technique": "operations",
        "Responsable commercial": "commercial", "Responsable des achats": "achats", "Responsable RH": "rh",
        "Responsable administratif et financier": "finance", "Responsable informatique": "it", "Responsable marketing": "marketing",
        "Responsable logistique": "operations", "Responsable maintenance": "operations", "Responsable qualité / QHSE": "operations",
        "Responsable RSE": "operations", "Responsable des services généraux": "admin", "Responsable de production": "operations",
        "Office manager": "admin", "Acheteur": "achats", "Chef de projet": "projet", "Comptable": "finance", "Assistant(e) de direction": "admin",
    };
    for (const group of JOB_TITLE_GROUPS) {
        for (const title of group.titles) assert.equal(roleFamilyOf(title), expected[title], title);
    }
});

test("real-world titles, English and French, and juniors left out", () => {
    assert.equal(roleFamilyOf("CEO & Co-founder"), "direction");
    assert.equal(roleFamilyOf("Président Directeur Général"), "direction");
    assert.equal(roleFamilyOf("Head of Sales EMEA"), "commercial");
    assert.equal(roleFamilyOf("Chief Financial Officer"), "finance");
    assert.equal(roleFamilyOf("Head of IT"), "it");
    assert.equal(roleFamilyOf("Talent Acquisition Manager"), "rh");
    assert.equal(roleFamilyOf("Procurement lead"), "achats");
    assert.equal(roleFamilyOf("Stagiaire commercial"), null);
    assert.equal(roleFamilyOf("Alternante RH"), null);
    assert.equal(roleFamilyOf("Sales intern"), null);
    assert.equal(roleFamilyOf("Chargé de clientèle"), null);
    assert.equal(roleFamilyOf(""), null);
    assert.equal(roleFamilyOf("Digital"), "it");
    assert.deepEqual(roleFamiliesFor(["DAF", "Directeur commercial", "Inconnu", "Comptable"]), ["commercial", "finance"]);
});

test("NAF code wins over the industry text", () => {
    assert.equal(sectionOfNaf("62.01Z"), "J");
    assert.equal(sectionOfNaf("6201Z"), "J");
    assert.equal(sectionOfNaf("41.20A"), "F");
    assert.equal(sectionOfNaf("01.11Z"), "A");
    assert.equal(sectionOfNaf("99.00Z"), "U");
    assert.equal(sectionOfNaf("04"), null);
    assert.equal(sectionOfNaf("Z"), null);
    assert.equal(sectorOf({ naf: "86.10Z", industry: "Software" }), "Q");
});

test("industry text from CSV, Apollo and Google Maps maps to sections", () => {
    const cases: [string, string | null][] = [
        ["Information Technology & Services", "J"], ["Computer Software", "J"], ["Édition de logiciels", "J"], ["ESN", "J"],
        ["Hospital & Health Care", "Q"], ["Hospitality", "I"], ["Biotechnology", "Q"], ["Fintech", "K"], ["Banque", "K"],
        ["Agence immobilière", "L"], ["Real Estate", "L"], ["Organisme de formation", "P"], ["Information Services", "J"],
        ["Restaurant", "I"], ["Transport routier de marchandises", "H"], ["Logistics & Supply Chain", "H"], ["Expédition de colis", "H"],
        ["Énergies renouvelables", "D"], ["Oil & Energy", "D"], ["Traitement des déchets", "E"], ["Bureau d'études", "M"],
        ["Grande distribution alimentaire", "G"], ["Industrie agroalimentaire", "A"], ["Wine & Spirits", "A"], ["Agriculture", "A"],
        ["Construction", "F"], ["Plombier", "F"], ["Conseil en management", "M"], ["Management Consulting", "M"], ["Expert-comptable", "M"],
        ["Marketing & Advertising", "M"], ["Nettoyage industriel", "N"], ["Staffing & Recruiting", "N"], ["Sports", "R"],
        ["Industrie mécanique", "C"], ["Automotive", "C"], ["Machinery", "C"], ["Salon de coiffure", "S"], ["Non-profit organization", "S"],
        ["Bureau", null], ["", null], ["???", null],
    ];
    for (const [industry, section] of cases) assert.equal(sectorOf({ industry }), section, industry);
});

test("headcount text maps to the questionnaire's size groups", () => {
    const cases: [string | null, string | null][] = [
        ["1-10", "1-9"], ["2-10", "1-9"], ["11-50", "10-49"], ["20 à 49 salariés", "10-49"], ["51-200", "50-249"],
        ["201-500", "250-999"], ["501-1000", "250-999"], ["1 001-5 000", "1000+"], ["10 000+", "1000+"], ["10.000+", "1000+"],
        ["5", "1-9"], ["250", "250-999"], ["PME", null], ["", null], [null, null],
    ];
    for (const [raw, key] of cases) assert.equal(sizeKeyOf(raw), key, String(raw));
});

test("only French (or unknown-country) companies go on the map", () => {
    for (const c of [null, "", "France", "FRANCE", "fr", "France métropolitaine"]) assert.equal(isFranceOrUnknown(c), true, String(c));
    for (const c of ["Belgique", "Belgium", "Suisse", "BE"]) assert.equal(isFranceOrUnknown(c), false, c);
});
