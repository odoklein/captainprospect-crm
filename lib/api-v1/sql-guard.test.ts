/**
 * Read-only SQL guard: the text checks, JSON safety, redaction, and — on an
 * in-process Postgres (PGlite) — the READ ONLY transaction and the row cap.
 *     npm run test:api-v1
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

import {
    checkReadOnlySql,
    redactSecretColumns,
    runReadOnlySql,
    SqlGuardError,
    toJsonSafe,
    type ReadOnlySqlDb,
} from "./sql-guard";

const rejects = (sql: string, code: SqlGuardError["code"]) =>
    assert.throws(() => checkReadOnlySql(sql), (e: unknown) => e instanceof SqlGuardError && e.code === code, sql);

test("sql-guard: accepts SELECT, WITH, quoted identifiers that look like keywords, literals with keywords", () => {
    assert.equal(checkReadOnlySql(`SELECT count(*) FROM "Action";`), `SELECT count(*) FROM "Action"`);
    checkReadOnlySql(`WITH a AS (SELECT 1 AS n) SELECT n FROM a`);
    checkReadOnlySql(`(SELECT 1)`);
    checkReadOnlySql(`SELECT "createdAt", "updatedAt" FROM "Contact" c WHERE c.note ILIKE '%delete me; drop it%'`);
    checkReadOnlySql(`SELECT a.comment, a.load, call.id FROM "Action" call JOIN "Note" a ON true -- update later`);
    checkReadOnlySql(`SELECT "totalTokens" FROM "AssistantProjetRun"`);
});

test("sql-guard: rejects writes, several statements, dangerous functions and credential catalogs", () => {
    rejects(`DELETE FROM "User"`, "invalid_query");
    rejects(`UPDATE "User" SET role = 'MANAGER'`, "invalid_query");
    rejects(`SELECT 1; DROP TABLE "User"`, "multiple_statements");
    rejects(`WITH gone AS (DELETE FROM "User" RETURNING *) SELECT * FROM gone`, "forbidden_keyword");
    rejects(`SELECT * INTO backup FROM "User"`, "forbidden_keyword");
    rejects(`SELECT pg_sleep(30)`, "forbidden_function");
    rejects(`SELECT pg_read_file('/etc/passwd')`, "forbidden_function");
    rejects(`SELECT query_to_xml('delete from "User"', true, true, '')`, "forbidden_function");
    rejects(`SELECT set_config('statement_timeout', '0', false)`, "forbidden_function");
    rejects(`SELECT * FROM dblink('host=x', 'select 1') AS t(a int)`, "forbidden_function");
    rejects(`SELECT rolpassword FROM pg_authid`, "forbidden_object");
    rejects(`SELECT * FROM auth.users`, "forbidden_object");
    rejects(`SELECT * FROM "auth"."users"`, "forbidden_object");
    rejects(`SELECT * FROM vault.decrypted_secrets`, "forbidden_object");
});

test("sql-guard: BigInt, Decimal-like and Date become JSON; secrets are redacted by column name", () => {
    const decimal = { toFixed: () => "12.50", isNaN: () => false, toString: () => "12.5" };
    const safe = toJsonSafe([{ n: BigInt(42), big: BigInt("9007199254740993"), at: new Date("2026-10-01T00:00:00Z"), amount: decimal }]);
    assert.deepEqual(safe, [{ n: 42, big: "9007199254740993", at: "2026-10-01T00:00:00.000Z", amount: 12.5 }]);
    assert.doesNotThrow(() => JSON.stringify(safe));

    const redacted = redactSecretColumns([
        { passwordHash: "$2a$", resetToken: "t", api_key: "k", vaultCredential: "v", totalTokens: 1200, tokenExpiresAt: "x", meta: { secretEncrypted: "s" } },
    ]) as Array<Record<string, unknown>>;
    assert.equal(redacted[0].passwordHash, "[REDACTED_SECRET]");
    assert.equal(redacted[0].resetToken, "[REDACTED_SECRET]");
    assert.equal(redacted[0].api_key, "[REDACTED_SECRET]");
    assert.equal(redacted[0].vaultCredential, "[REDACTED_SECRET]");
    assert.equal(redacted[0].totalTokens, 1200);
    assert.equal(redacted[0].tokenExpiresAt, "x");
    assert.equal((redacted[0].meta as Record<string, unknown>).secretEncrypted, "[REDACTED_SECRET]");
});

// -- On a real Postgres ------------------------------------------------------

let pg: PGlite;

/** Prisma's $transaction shape over PGlite. */
function pgliteDb(): ReadOnlySqlDb {
    return {
        $transaction: (fn) =>
            pg.transaction((tx) =>
                fn({
                    $executeRawUnsafe: (query: string) => tx.exec(query),
                    $queryRawUnsafe: async (query: string, ...values: unknown[]) => (await tx.query(query, values)).rows as never,
                }),
            ),
    };
}

before(async () => {
    pg = new PGlite();
    await pg.exec(`
        CREATE TABLE "User" (id text PRIMARY KEY, name text, "passwordHash" text);
        INSERT INTO "User" SELECT 'u' || g, 'User ' || g, 'hash' || g FROM generate_series(1, 30) AS g;
    `);
});
after(async () => pg.close());

test("sql-guard: runs a real query, caps rows, flags truncation, redacts, counts as numbers", async () => {
    const result = await runReadOnlySql(pgliteDb(), `SELECT id, name, "passwordHash" FROM "User" ORDER BY id`, [], { maxRows: 10 });
    assert.equal(result.rowCount, 10);
    assert.equal(result.truncated, true);
    assert.deepEqual(result.columns, ["id", "name", "passwordHash"]);
    assert.equal(result.rows[0].passwordHash, "[REDACTED_SECRET]");

    const count = await runReadOnlySql(pgliteDb(), `SELECT count(*) AS n FROM "User" WHERE name LIKE $1`, ["User 1%"]);
    assert.equal(count.truncated, false);
    assert.equal(count.rows[0].n, 11, "bigint count comes back as a JSON number");
});

test("sql-guard: the transaction is READ ONLY even if a write slips past the text checks", async () => {
    // Call the transaction body directly with a write the regexes would catch,
    // to prove the database refuses it on its own.
    await assert.rejects(
        pg.transaction(async (tx) => {
            await tx.exec("SET TRANSACTION READ ONLY");
            await tx.exec(`UPDATE "User" SET name = 'pwned'`);
        }),
        /read-only transaction/,
    );
    const { rows } = await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM "User" WHERE name = 'pwned'`);
    assert.equal(rows[0].n, 0);
});
