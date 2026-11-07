/**
 * Company facets of the SDR action table (#118):
 *     npx tsx --test lib/sdr-queue/company-facets.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    companyHeadcountText,
    companyRevenueText,
    headcountOf,
    revenueBucketOf,
    revenueOf,
    sectorKey,
    sectorOptions,
    sizeBucketOf,
} from "./company-facets";
import { DEFAULT_QUEUE_FILTERS, matchesQueueFilters, type QueueFilters, type QueueRowLike } from "./queue-filters";

test("headcount reads every format seen in the base", () => {
    assert.equal(headcountOf("01"), 1); // INSEE tranche 1-2
    assert.equal(headcountOf("03"), 6); // INSEE tranche 6-9
    assert.equal(headcountOf("55"), 55);
    assert.equal(headcountOf("150-499"), 150);
    assert.equal(headcountOf("1 ou 2 salariés"), 1);
    assert.equal(headcountOf("1 200"), 1200);
    assert.equal(headcountOf(""), null);
    assert.equal(headcountOf("inconnu"), null);
    assert.equal(sizeBucketOf("02"), "1-9");
    assert.equal(sizeBucketOf("12"), "10-49");
    assert.equal(sizeBucketOf("51-100"), "50-249");
    assert.equal(sizeBucketOf("500"), "250-999");
    assert.equal(sizeBucketOf("10000+"), "1000+");
});

test("revenue reads units, French decimals and thousands separators", () => {
    assert.equal(revenueOf("12 M€"), 12e6);
    assert.equal(revenueOf("5,4M"), 5.4e6);
    assert.equal(revenueOf("850 k€"), 850e3);
    assert.equal(revenueOf("1 200 000 €"), 1.2e6);
    assert.equal(revenueOf("1.200.000"), 1.2e6);
    assert.equal(revenueOf("2 milliards"), 2e9);
    assert.equal(revenueOf("n/c"), null);
    assert.equal(revenueBucketOf("750 000"), "<1M");
    assert.equal(revenueBucketOf("3 M€"), "1-5M");
    assert.equal(revenueBucketOf("20 M€"), "20-100M");
    assert.equal(revenueBucketOf("150M"), "100M+");
});

test("sectors are matched whatever the case and accents, most frequent first", () => {
    assert.equal(sectorKey(" Énergie "), "energie");
    const opts = sectorOptions([
        { company: { industry: "BTP" } },
        { company: { industry: "Industrie" } },
        { company: { industry: "industrie" } },
        { company: { industry: null } },
    ]);
    assert.deepEqual(opts.map((o) => [o.value, o.count]), [["industrie", 2], ["btp", 1]]);
});

test("the drawer reads imported Taille / CA columns", () => {
    assert.equal(companyHeadcountText(null, { TAILLE: "55", TAILLE_2: "1 ou 2 salariés" }), "55");
    assert.equal(companyHeadcountText("10-19", { TAILLE: "55" }), "10-19");
    assert.equal(companyRevenueText({ "Chiffre d'affaires": "12 M€", Catégorie: "Barbier" }), "12 M€");
    assert.equal(companyRevenueText({ CA_2024: "4M" }), "4M");
    assert.equal(companyRevenueText({ Catégorie: "Barbier" }), null);
    assert.equal(companyRevenueText(["x"]), null);
});

const row = (company: Partial<QueueRowLike["company"]>, phone = "06 12 34 56 78"): QueueRowLike => ({
    contactId: "c1",
    contact: { firstName: "A", lastName: "B", phone },
    company: { name: "ACME", ...company },
    priority: "NEW",
    channel: "CALL",
    lastAction: null,
});
const f = (over: Partial<QueueFilters>): QueueFilters => ({ ...DEFAULT_QUEUE_FILTERS, ...over });
const match = (r: QueueRowLike, over: Partial<QueueFilters>) => matchesQueueFilters(r, f(over), null);

test("CA + secteur + mobile combine (the ticket's example)", () => {
    const filters = { sectors: ["industrie"], revenues: ["5-20M" as const], lineType: "mobile" as const };
    assert.equal(match(row({ industry: "Industrie", revenue: "12 M€" }), filters), true);
    assert.equal(match(row({ industry: "Industrie", revenue: "12 M€" }, "01 23 45 67 89"), filters), false);
    assert.equal(match(row({ industry: "BTP", revenue: "12 M€" }), filters), false);
    assert.equal(match(row({ industry: "Industrie", revenue: "500 k€" }), filters), false);
    // Unknown revenue is excluded only while the CA filter is on.
    assert.equal(match(row({ industry: "Industrie" }), filters), false);
    assert.equal(match(row({ industry: "Industrie" }), { sectors: ["industrie"] }), true);
});

test("several values of one facet are an OR", () => {
    assert.equal(match(row({ size: "02" }), { sizes: ["1-9", "10-49"] }), true);
    assert.equal(match(row({ size: "300" }), { sizes: ["1-9", "10-49"] }), false);
});

test("filters saved before the facets existed still work", () => {
    const legacy = { ...DEFAULT_QUEUE_FILTERS } as Partial<QueueFilters>;
    delete legacy.sectors;
    delete legacy.sizes;
    delete legacy.revenues;
    assert.equal(matchesQueueFilters(row({}), legacy as QueueFilters, null), true);
});
