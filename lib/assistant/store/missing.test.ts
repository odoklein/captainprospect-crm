/**
 * Degrade-when-missing: which errors count as "schema not applied", and that
 * optional() swaps them for the fallback and warns once per label.
 *     npm run test:assistant-folders
 */

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

import { isMissingSchemaError, optional, resetMissingSchemaWarnings } from "./missing";

let pg: PGlite;
before(async () => {
    pg = new PGlite();
});
after(async () => {
    await pg.close();
});

test("isMissingSchemaError: Prisma table/column codes and raw Postgres codes", () => {
    assert.equal(isMissingSchemaError({ code: "P2021", message: "table does not exist" }), true);
    assert.equal(isMissingSchemaError({ code: "P2022", message: "column does not exist" }), true);
    assert.equal(isMissingSchemaError({ code: "P2010", meta: { code: "42P01", message: "relation missing" }, message: "Raw query failed" }), true);
    assert.equal(isMissingSchemaError({ code: "P2010", message: "Raw query failed. Code: `42703`. Message: column x does not exist" }), true);
    assert.equal(isMissingSchemaError(new Error("wrapped", { cause: { code: "42P01" } })), true);
});

test("isMissingSchemaError: other failures are not schema gaps", () => {
    assert.equal(isMissingSchemaError({ code: "P2002", message: "unique constraint" }), false);
    assert.equal(isMissingSchemaError(new Error("network down")), false);
    assert.equal(isMissingSchemaError(null), false);
    assert.equal(isMissingSchemaError("42P01"), false);
});

test("isMissingSchemaError: a real Postgres undefined_table / undefined_column error", async () => {
    await assert.rejects(pg.query(`SELECT 1 FROM "AssistantProjetFolder"`), (err: unknown) => isMissingSchemaError(err));
    await pg.exec(`CREATE TABLE t_missing (id text)`);
    await assert.rejects(pg.query(`SELECT nope FROM t_missing`), (err: unknown) => isMissingSchemaError(err));
    await assert.rejects(pg.query(`SELECT 1/0`), (err: unknown) => !isMissingSchemaError(err));
});

test("optional returns the fallback on a schema gap and warns once per label", async () => {
    resetMissingSchemaWarnings();
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => void warnings.push(args.map(String).join(" "));
    try {
        const missing = async () => {
            throw { code: "P2021", message: "The table `public.AssistantProjetFolder` does not exist" };
        };
        assert.deepEqual(await optional("t.list", missing, []), []);
        assert.deepEqual(await optional("t.list", missing, () => ({ virtual: true })), { virtual: true });
        assert.equal(await optional("t.list", missing, async () => "lazy"), "lazy");
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /t\.list/);
        assert.match(warnings[0], /20261030100000/);
        assert.equal(await optional("t.other", missing, 0), 0);
        assert.equal(warnings.length, 2);
    } finally {
        console.warn = original;
    }
});

test("optional passes results through and rethrows other errors", async () => {
    assert.equal(await optional("t.ok", async () => 42, 0), 42);
    await assert.rejects(
        optional("t.boom", async () => {
            throw new Error("boom");
        }, 0),
        /boom/,
    );
});
