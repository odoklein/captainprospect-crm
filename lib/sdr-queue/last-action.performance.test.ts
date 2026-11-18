import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { LAST_ACTION_CTES } from "./last-action";

// The previous production predicate, retained to compare results and plans.
const legacyCompanyHistory = `
    SELECT DISTINCT ON (COALESCE(a."companyId", c."companyId"))
        COALESCE(a."companyId", c."companyId") AS company_id_resolved,
        a.id, a.result, a.note, a."createdAt", a."callbackDate", a."sdrId", u.name AS sdr_name
    FROM "Action" a
    LEFT JOIN "Contact" c ON a."contactId" = c.id
    INNER JOIN "User" u ON u.id = a."sdrId"
    WHERE COALESCE(a."companyId", c."companyId") IN (SELECT company_id FROM all_targets)
    ORDER BY COALESCE(a."companyId", c."companyId"), a."createdAt" DESC`;

test("company history uses indexes on a large action table and preserves legacy resolution", async (t) => {
    const db = new PGlite();
    try {
        await db.exec(`
            CREATE TABLE "User" (id text PRIMARY KEY, name text);
            CREATE TABLE "Contact" (id text PRIMARY KEY, "companyId" text);
            CREATE INDEX contact_company ON "Contact" ("companyId");
            CREATE TABLE "Action" (id text PRIMARY KEY, "contactId" text, "companyId" text,
                result text, note text, "createdAt" timestamptz, "callbackDate" timestamptz, "sdrId" text);
            CREATE INDEX action_company_created ON "Action" ("companyId", "createdAt");
            CREATE INDEX action_contact_created ON "Action" ("contactId", "createdAt");
            INSERT INTO "User" VALUES ('sdr', 'Marie');
            INSERT INTO "Contact" SELECT 'ct-' || n, 'co-' || ((n - 1) / 2) FROM generate_series(1, 8000) n;
            INSERT INTO "Action"
                SELECT 'a-' || n, 'ct-' || ((n % 8000) + 1),
                    CASE WHEN n % 3 = 0 THEN NULL ELSE 'co-' || ((n % 8000) / 2) END,
                    'NO_RESPONSE', 'History ' || n, '2026-01-01'::timestamptz + n * interval '1 minute', NULL, 'sdr'
                FROM generate_series(1, 80000) n;
            -- The newest action is legacy (companyId NULL). Another has an explicit
            -- company differing from its contact: explicit company must win.
            INSERT INTO "Action" VALUES
                ('legacy', 'ct-1', NULL, 'INTERESTED', 'Legacy winner', '2026-11-01', NULL, 'sdr'),
                ('stamped', 'ct-1', 'co-1', 'CALLBACK_REQUESTED', 'Explicit company wins', '2026-11-02', NULL, 'sdr');
            ANALYZE;
        `);
        for (const targets of [1, 200]) {
            const targetCte = `WITH all_targets AS (SELECT id AS contact_id, "companyId" AS company_id FROM "Contact" WHERE "companyId" IN (SELECT 'co-' || n FROM generate_series(0, ${targets - 1}) n)),`;
            const oldSql = `${targetCte} legacy AS (${legacyCompanyHistory}) SELECT company_id_resolved, result, note, "createdAt", "callbackDate", "sdrId", sdr_name FROM legacy ORDER BY company_id_resolved`;
            const newSql = `${targetCte} ${LAST_ACTION_CTES} SELECT company_id_resolved, result, note, "createdAt", "callbackDate", "sdrId", sdr_name FROM last_actions_companies ORDER BY company_id_resolved`;
            // Warm both queries before timing. Timings are diagnostic, never flaky assertions.
            await db.query(oldSql); await db.query(newSql);
            const oldStart = performance.now();
            const oldRows = await db.query(oldSql);
            const oldMs = performance.now() - oldStart;
            const newStart = performance.now();
            const newRows = await db.query(newSql);
            const newMs = performance.now() - newStart;
            assert.deepEqual(newRows.rows, oldRows.rows);
            assert.equal((newRows.rows[0] as { note: string }).note, "Legacy winner");
            t.diagnostic(`${targets} companies / 80,002 actions: previous ${oldMs.toFixed(1)} ms; indexed ${newMs.toFixed(1)} ms`);
            if (targets === 1) {
                const explain = await db.query<{ "QUERY PLAN": string }>(`EXPLAIN ${newSql}`);
                const plan = explain.rows.map((row) => row["QUERY PLAN"]).join("\n");
                assert.match(plan, /action_company_created/);
                assert.match(plan, /action_contact_created/);
                assert.doesNotMatch(plan, /Seq Scan on "Action"/);
            }
        }
    } finally { await db.close(); }
});
