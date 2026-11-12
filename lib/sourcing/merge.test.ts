/**
 * Sourcing merge rules.
 *     npx tsx --test lib/sourcing/merge.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeLeads } from "./merge";
import type { SourcedLead } from "./types";

const lead = (id: string, extra: Partial<SourcedLead>): SourcedLead => ({
    id,
    sources: [id.split(":")[0] as SourcedLead["sources"][number]],
    name: "X",
    contacts: [],
    ...extra,
});

test("two stores of one chain on Maps stay two rows", () => {
    const out = mergeLeads([], [
        lead("gmaps:a", { name: "Franprix", website: "franprix.fr", phone: "+33142718778", postalCode: "75004" }),
        lead("gmaps:b", { name: "Franprix", website: "franprix.fr", phone: "+33145555524", postalCode: "75011" }),
    ]);
    assert.equal(out.length, 2);
});

test("the same Maps place found by two tiles is one row", () => {
    const a = lead("gmaps:a", { name: "Monoprix", phone: "+33142333615" });
    assert.equal(mergeLeads([a], [{ ...a }]).length, 1);
});

test("Maps and the registry still merge on phone, domain or name", () => {
    const maps = lead("gmaps:a", { name: "Plomberie Martin", phone: "+33478000000", postalCode: "69003" });
    const reg = lead("annuaire:123", { name: "Plomberie Martin", siren: "123456789", postalCode: "69003" });
    const out = mergeLeads([maps], [reg]);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].sources, ["gmaps", "annuaire"]);
    assert.equal(out[0].siren, "123456789");
    // Re-running the registry finds the merged row again instead of adding a twin.
    assert.equal(mergeLeads(out, [reg]).length, 1);
});
