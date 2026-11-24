import { test } from "node:test";
import assert from "node:assert/strict";
import {
    ALL_CODES, METRO_CODES, composeGeography, coveredCodes, departementFromPostcode, departementFromPrefix,
    departementsOf, normalizeCodes, regionCover, regionOf, searchPlaces, summarizeTerritory, toggleDepartement, toggleRegion,
} from "./territory";

test("postcode → département: mainland, leading zero lost by Excel, spaces", () => {
    assert.equal(departementFromPostcode("69003"), "69");
    assert.equal(departementFromPostcode("75008"), "75");
    assert.equal(departementFromPostcode("01000"), "01");
    assert.equal(departementFromPostcode("1000"), "01");
    assert.equal(departementFromPostcode(6000), "06");
    assert.equal(departementFromPostcode("75 008"), "75");
    assert.equal(departementFromPostcode("13 001"), "13");
    assert.equal(departementFromPostcode(" 33000 "), "33");
});

test("postcode → département: Corse splits at 20200", () => {
    assert.equal(departementFromPostcode("20000"), "2A");
    assert.equal(departementFromPostcode("20090"), "2A");
    assert.equal(departementFromPostcode("20199"), "2A");
    assert.equal(departementFromPostcode("20200"), "2B");
    assert.equal(departementFromPostcode("20600"), "2B");
});

test("postcode → département: overseas départements, not the other territories", () => {
    assert.equal(departementFromPostcode("97110"), "971");
    assert.equal(departementFromPostcode("97200"), "972");
    assert.equal(departementFromPostcode("97300"), "973");
    assert.equal(departementFromPostcode("97411"), "974");
    assert.equal(departementFromPostcode("97600"), "976");
    assert.equal(departementFromPostcode("97500"), undefined); // Saint-Pierre-et-Miquelon
    assert.equal(departementFromPostcode("98000"), undefined); // Monaco
    assert.equal(departementFromPostcode("98800"), undefined); // Nouvelle-Calédonie
});

test("postcode → département: anything else is not a postcode", () => {
    for (const raw of ["", "abc", "123", "750081", "00100", "96000", "7500A", null, undefined]) {
        assert.equal(departementFromPostcode(raw as string), undefined, String(raw));
    }
});

test("three-digit prefixes map like full postcodes", () => {
    assert.equal(departementFromPrefix("750"), "75");
    assert.equal(departementFromPrefix("010"), "01");
    assert.equal(departementFromPrefix("201"), "2A");
    assert.equal(departementFromPrefix("202"), "2B");
    assert.equal(departementFromPrefix("974"), "974");
    assert.equal(departementFromPrefix("975"), undefined);
    assert.equal(departementFromPrefix("98"), undefined);
    assert.equal(departementFromPrefix(null), undefined);
});

test("régions ↔ départements are a partition of every code", () => {
    assert.equal(ALL_CODES.length, 101);
    assert.equal(METRO_CODES.length, 96);
    assert.equal(regionOf("69"), "Auvergne-Rhône-Alpes");
    assert.equal(regionOf("2B"), "Corse");
    assert.equal(regionOf("974"), "Outre-mer");
    assert.deepEqual(departementsOf("Corse"), ["2A", "2B"]);
    assert.deepEqual(departementsOf("Bretagne"), ["22", "29", "35", "56"]);
    assert.deepEqual(departementsOf("Atlantide"), []);
    const seen = ALL_CODES.map((code) => regionOf(code));
    assert.ok(seen.every(Boolean), "every département has a région");
});

test("codes normalize to known, unique, ordered values", () => {
    assert.deepEqual(normalizeCodes(["75", "2a", "01", "75", "99", "x", "971", "30", "29"]), ["01", "29", "2A", "30", "75", "971"]);
});

test("region toggle completes a partial région and clears a full one", () => {
    let picked = toggleDepartement([], "35");
    assert.deepEqual(regionCover(picked, "Bretagne"), { state: "partial", picked: 1, total: 4 });
    picked = toggleRegion(picked, "Bretagne");
    assert.deepEqual(picked, ["22", "29", "35", "56"]);
    assert.equal(regionCover(picked, "Bretagne").state, "full");
    picked = toggleRegion([...picked, "75"], "Bretagne");
    assert.deepEqual(picked, ["75"]);
    assert.deepEqual(toggleDepartement(picked, "75"), []);
    assert.deepEqual(toggleDepartement(picked, "99"), ["75"]);
});

test("summary groups full régions and names the rest", () => {
    assert.equal(summarizeTerritory({ all: false, codes: [] }), "");
    assert.equal(summarizeTerritory({ all: true, codes: [] }), "France entière");
    assert.equal(summarizeTerritory({ all: false, codes: [...ALL_CODES] }), "France entière");
    assert.equal(summarizeTerritory({ all: false, codes: [...METRO_CODES] }), "France métropolitaine");
    assert.equal(summarizeTerritory({ all: false, codes: [...METRO_CODES, "974"] }), "France métropolitaine, La Réunion (974)");
    assert.equal(
        summarizeTerritory({ all: false, codes: [...departementsOf("Île-de-France"), "69", "38"] }),
        "Isère (38), Rhône (69), Île-de-France (région entière)",
    );
    assert.equal(summarizeTerritory({ all: false, codes: ["2A", "2B"] }), "Corse (région entière)");
    assert.equal(coveredCodes({ all: true, codes: [] }).length, 101);
});

test("geography text keeps the client's own words after the map summary", () => {
    assert.equal(composeGeography({ all: false, codes: ["33"], note: "  et Belgique francophone " }), "Gironde (33) — et Belgique francophone");
    assert.equal(composeGeography({ all: false, codes: [], note: "Benelux" }), "Benelux");
    assert.equal(composeGeography({ all: false, codes: [], note: "" }), "");
    assert.equal(composeGeography({ all: false, codes: [], note: "x".repeat(50) }, 10).length, 10);
});

test("place search is accent-insensitive and puts exact codes first", () => {
    assert.equal(searchPlaces("69")[0].label, "Rhône");
    assert.equal(searchPlaces("rhone")[0].label, "Rhône");
    assert.equal(searchPlaces("2a")[0].label, "Corse-du-Sud");
    const cote = searchPlaces("cote").map((o) => o.label);
    assert.ok(cote.includes("Côte-d'Or") && cote.includes("Côtes-d'Armor") && cote.includes("Provence-Alpes-Côte d'Azur"));
    assert.equal(searchPlaces("bretagne")[0].kind, "region");
    assert.equal(searchPlaces("").every((o) => o.kind === "region"), true);
    assert.deepEqual(searchPlaces("zzzz"), []);
});
