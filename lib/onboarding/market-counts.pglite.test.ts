/**
 * The market counter's SQL, executed for real on an in-process Postgres
 * (PGlite): postcode extraction from customData, 4-digit Excel postcodes,
 * Corse and overseas prefixes, foreign companies kept off the map, excluded
 * rows and dedup copies left out — and the SQL classification checked
 * against the TypeScript one on the same inputs, so the two cannot drift.
 *     npx tsx --test lib/onboarding/market-counts.pglite.test.ts
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@prisma/client";
import { companyBucketsSql, cubeFromRows, countsFor, marketCubeSql, parseCriteria, type CubeRow } from "./market-counts";
import { roleFamilyOf, sectorOf, sizeKeyOf } from "./market-classify";

let pg: PGlite;
let rows: CubeRow[];

async function run(): Promise<CubeRow[]> {
    const sql = marketCubeSql();
    return (await pg.query<CubeRow>(sql.text, sql.values)).rows;
}

let seq = 0;
async function company(fields: { country?: string | null; industry?: string | null; size?: string | null; customData?: unknown; excluded?: boolean; linked?: boolean }, titles: string[] = []) {
    const id = `co${++seq}`;
    await pg.query(
        `INSERT INTO "Company" (id, country, industry, size, "customData", "excludedAt", "linkedFromId") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, fields.country ?? null, fields.industry ?? null, fields.size ?? null, fields.customData === undefined ? null : JSON.stringify(fields.customData),
            fields.excluded ? new Date().toISOString() : null, fields.linked ? "co1" : null],
    );
    for (const title of titles) {
        await pg.query(`INSERT INTO "Contact" (id, "companyId", title) VALUES ($1, $2, $3)`, [`ct${++seq}`, id, title]);
    }
    return id;
}

before(async () => {
    pg = new PGlite();
    await pg.exec(`
        CREATE TABLE "Company" (id text PRIMARY KEY, country text, industry text, size text, "customData" jsonb,
            "excludedAt" timestamp, "linkedFromId" text);
        CREATE TABLE "Contact" (id text PRIMARY KEY, "companyId" text NOT NULL, title text, "excludedAt" timestamp);
    `);
    // Lyon, tech, 11-50: two decision-makers and a junior.
    await company({ country: "France", industry: "Computer Software", size: "11-50", customData: { codePostal: "69003", ville: "Lyon" } },
        ["Directeur commercial", "DAF", "Stagiaire marketing"]);
    // Same département through a CSV "Code postal" column with a space, NAF code from the registry.
    await company({ industry: "Conseil", customData: { "Code postal": "69 007", codeNaf: "62.02A" } }, ["CEO"]);
    // Ain with the leading zero lost by Excel, health, from the size column in customData.
    await company({ country: "FR", industry: "Clinique privée", customData: { CP: 1000, effectif: "50 à 99 salariés" } }, ["DRH"]);
    // Postcode only inside the address.
    await company({ industry: "BTP", customData: { adresse: "12 rue des Lilas, 33000 Bordeaux" } });
    // Corse and overseas.
    await company({ industry: "Hôtellerie", customData: { codePostal: "20090" } });
    await company({ industry: "Hôtellerie", customData: { codePostal: "20200" } });
    await company({ industry: "Banque", customData: { zip: "97411" } }, ["Directeur général"]);
    // Off the map: Belgian 4-digit postcode, Monaco, no postcode at all.
    await company({ country: "Belgique", industry: "Software", customData: { codePostal: "1000" } });
    await company({ industry: "Software", customData: { codePostal: "98000" } });
    await company({ industry: "Software" }, ["CTO"]);
    // Never counted: excluded, and a dedup copy of another company.
    await company({ industry: "Software", excluded: true, customData: { codePostal: "75001" } }, ["CEO"]);
    await company({ industry: "Software", linked: true, customData: { codePostal: "75001" } }, ["CEO"]);
    // Excluded contact on a counted company.
    const paris = await company({ industry: "Software", customData: { codePostal: "75008" } });
    await pg.query(`INSERT INTO "Contact" (id, "companyId", title, "excludedAt") VALUES ('ctx', $1, 'CEO', now())`, [paris]);
    rows = await run();
});

after(async () => { await pg?.close(); });

test("companies land in their département, foreign and postcode-less ones stay off the map", () => {
    const all = countsFor(cubeFromRows(rows), { sectors: [], sizes: [], roles: [] });
    assert.deepEqual(all.departements["69"], [2, 3]);
    assert.deepEqual(all.departements["01"], [1, 1]);
    assert.deepEqual(all.departements["33"], [1, 0]);
    assert.deepEqual(all.departements["2A"], [1, 0]);
    assert.deepEqual(all.departements["2B"], [1, 0]);
    assert.deepEqual(all.departements["974"], [1, 1]);
    assert.deepEqual(all.departements["75"], [1, 0], "excluded rows, dedup copies and excluded contacts are left out");
    assert.equal(all.departements["98"], undefined);
    assert.deepEqual(all.unlocated, [3, 1], "Belgium, Monaco and the company without postcode");
});

test("criteria fold the cube: sector, size and role families", () => {
    const cube = cubeFromRows(rows);
    const tech = countsFor(cube, { sectors: ["J"], sizes: [], roles: [] });
    assert.deepEqual(tech.departements["69"], [2, 3], "Computer Software by text, 62.02A by NAF code");
    assert.equal(tech.departements["01"], undefined);
    const sized = countsFor(cube, { sectors: [], sizes: ["10-49"], roles: [] });
    assert.deepEqual(sized.departements["69"], [1, 2], "the company without a size no longer counts");
    assert.equal(countsFor(cube, { sectors: [], sizes: ["50-249"], roles: [] }).departements["01"]?.[0], 1, "size read from customData.effectif");
    const finance = countsFor(cube, { sectors: [], sizes: [], roles: ["finance"] });
    assert.deepEqual(finance.departements["69"], [2, 1]);
    assert.deepEqual(finance.departements["974"], [1, 0]);
});

test("SQL classification matches the TypeScript one", async () => {
    const industries = ["Information Technology & Services", "Hospital & Health Care", "Hospitality", "Expédition de colis",
        "Grande distribution alimentaire", "Industrie agroalimentaire", "Oil & Energy", "Bureau d'études", "Staffing & Recruiting",
        "Salon de coiffure", "Wine & Spirits", "ÉNERGIES RENOUVELABLES", "Bureau"];
    const sizes = ["11-50", "1 001-5 000", "10.000+", "20 à 49 salariés", "PME", "201-500"];
    const titles = ["Directeur Général", "Head of IT", "Responsable qualité / QHSE", "Alternante RH", "Office manager",
        "Systèmes d’information", "Chargé de clientèle", "P-DG"];
    await pg.exec(`TRUNCATE "Company"; TRUNCATE "Contact";`);
    for (const [i, industry] of industries.entries()) {
        await company({ industry, size: sizes[i % sizes.length], customData: { codePostal: String(10000 + i * 1000).padStart(5, "0") } }, [titles[i % titles.length]]);
    }
    const sql = Prisma.sql`SELECT c.industry, c.size, x.sector, x.size AS bucket FROM "Company" c JOIN (${companyBucketsSql()}) x ON x.id = c.id`;
    const result = await pg.query<{ industry: string; size: string; sector: string | null; bucket: string | null }>(sql.text, sql.values);
    assert.equal(result.rows.length, industries.length);
    for (const row of result.rows) {
        assert.equal(row.sector, sectorOf({ industry: row.industry }), `sector of ${row.industry}`);
        assert.equal(row.bucket, sizeKeyOf(row.size), `size of ${row.size}`);
    }
    const contacts = await run();
    const roles = new Map<string, number>();
    for (const r of contacts) if (r.kind === "ct") roles.set(r.role!, (roles.get(r.role!) ?? 0) + r.n);
    const expected = new Map<string, number>();
    for (const [i] of industries.entries()) {
        const role = roleFamilyOf(titles[i % titles.length]);
        if (role) expected.set(role, (expected.get(role) ?? 0) + 1);
    }
    assert.deepEqual(Object.fromEntries([...roles].sort()), Object.fromEntries([...expected].sort()));
});

test("criteria from the query string keep known keys only", () => {
    const params = new URLSearchParams({ sectors: "J,M,ZZ,J", sizes: "10-49,huge", roles: "finance,'; DROP TABLE x;--" });
    assert.deepEqual(parseCriteria(params), { sectors: ["J", "M"], sizes: ["10-49"], roles: ["finance"] });
    assert.deepEqual(parseCriteria(new URLSearchParams()), { sectors: [], sizes: [], roles: [] });
});
