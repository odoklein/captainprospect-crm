import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_DB_TOOLS, redactSensitive } from "./admin-db-tools";
import type { Principal } from "./auth";
import { ApiError } from "./errors";

const SUPER_ADMIN: Principal = {
  keyId: "key-super",
  keyName: "Super Admin Key",
  clientId: null,
  allClients: true,
  missionId: null,
  scopes: ["contacts:read", "calls:read", "reports:read"],
  issuedById: "manager-1",
};

const TENANT_BOUND: Principal = {
  keyId: "key-tenant",
  keyName: "Tenant Client Key",
  clientId: "client-123",
  allClients: false,
  missionId: null,
  scopes: ["contacts:read"],
  issuedById: "manager-1",
};

test("admin-db: tenant-bound key is strictly rejected (403 forbidden) on all admin tools", async () => {
  for (const t of ADMIN_DB_TOOLS) {
    const fakeDb: any = {};
    await assert.rejects(
      async () => {
        await t.run({ p: TENANT_BOUND, db: fakeDb }, { table: "User", id: "1", sql: "SELECT 1" });
      },
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 403);
        assert.equal(err.code, "forbidden");
        return true;
      },
    );
  }
});

test("admin-db: redactSensitive scrubs passwords, hashes and tokens recursively", () => {
  const dirty = {
    id: "usr_1",
    name: "John Doe",
    email: "john@example.com",
    password: "$2a$10$hashedpasswordhere",
    nested: {
      passwordHash: "secret_hash",
      keyHash: "another_hash",
      publicField: "visible",
    },
    list: [
      { token: "sensitive_token", keep: "ok" },
      { resetToken: "sensitive_reset", value: 42 },
    ],
  };

  const clean = redactSensitive(dirty);
  assert.equal(clean.id, "usr_1");
  assert.equal(clean.name, "John Doe");
  assert.equal(clean.email, "john@example.com");
  assert.equal(clean.password, "[REDACTED_SECRET]");
  assert.equal(clean.nested.passwordHash, "[REDACTED_SECRET]");
  assert.equal(clean.nested.keyHash, "[REDACTED_SECRET]");
  assert.equal(clean.nested.publicField, "visible");
  assert.equal(clean.list[0].token, "[REDACTED_SECRET]");
  assert.equal(clean.list[0].keep, "ok");
  assert.equal(clean.list[1].resetToken, "[REDACTED_SECRET]");
  assert.equal(clean.list[1].value, 42);
});

test("admin-db: admin_db_overview returns all categorized tables and counts", async () => {
  const tool = ADMIN_DB_TOOLS.find((t) => t.name === "admin_db_overview")!;
  assert.ok(tool);

  const fakeDb: any = new Proxy(
    {},
    {
      get: () => ({
        count: async () => 10,
      }),
    },
  );

  const result: any = await tool.run({ p: SUPER_ADMIN, db: fakeDb }, {});
  assert.equal(result.total_tables, 138);
  assert.ok(result.domains.core_crm);
  assert.ok(result.domains.billing_finance);
  assert.ok(result.domains.planning_hr);
  assert.ok(result.domains.ai_intelligence);
  assert.equal(result.domains.core_crm.User || result.domains.audit_security.User, 10);
});

test("admin-db: admin_db_inspect returns detailed schema for any table", async () => {
  const tool = ADMIN_DB_TOOLS.find((t) => t.name === "admin_db_inspect")!;
  assert.ok(tool);

  const result: any = await tool.run({ p: SUPER_ADMIN, db: {} as any }, { table: "User" });
  assert.equal(result.table, "User");
  assert.ok(Array.isArray(result.fields));
  const fieldNames = result.fields.map((f: any) => f.name);
  assert.ok(fieldNames.includes("id"));
  assert.ok(fieldNames.includes("email"));
  assert.ok(fieldNames.includes("name"));
  assert.ok(fieldNames.includes("role"));
  assert.ok(fieldNames.includes("password"));
});

test("admin-db: admin_db_query fetches records, counts, and redacts passwords", async () => {
  const tool = ADMIN_DB_TOOLS.find((t) => t.name === "admin_db_query")!;
  assert.ok(tool);

  let capturedArgs: any = null;
  const fakeDb: any = {
    user: {
      findMany: async (args: any) => {
        capturedArgs = args;
        return [
          { id: "u1", name: "Alice", email: "alice@test.com", password: "$2a$10$xyz", role: "SDR" },
          { id: "u2", name: "Bob", email: "bob@test.com", password: "$2a$10$abc", role: "MANAGER" },
        ];
      },
      count: async () => 2,
    },
  };

  const result: any = await tool.run(
    { p: SUPER_ADMIN, db: fakeDb },
    { table: "User", where: { role: "SDR" }, limit: 10, offset: 0 },
  );

  assert.equal(result.table, "User");
  assert.equal(result.total_matching, 2);
  assert.equal(result.returned, 2);
  assert.equal(capturedArgs.take, 10);
  assert.deepEqual(capturedArgs.where, { role: "SDR" });

  assert.equal(result.data[0].password, "[REDACTED_SECRET]");
  assert.equal(result.data[0].name, "Alice");
  assert.equal(result.data[1].password, "[REDACTED_SECRET]");
  assert.equal(result.data[1].name, "Bob");
});

test("admin-db: admin_db_sql enforces read-only (rejects mutations) and redacts outputs", async () => {
  const tool = ADMIN_DB_TOOLS.find((t) => t.name === "admin_db_sql")!;
  assert.ok(tool);

  const fakeDb: any = {
    $queryRawUnsafe: async (sql: string) => {
      return [{ id: "1", email: "admin@test.com", password: "$2a$10$hash", count: 42 }];
    },
  };

  // Safe SELECT executes and redacts
  const safeRes: any = await tool.run({ p: SUPER_ADMIN, db: fakeDb }, { sql: "SELECT * FROM \"User\" LIMIT 1" });
  assert.equal(safeRes.row_count, 1);
  assert.equal(safeRes.data[0].password, "[REDACTED_SECRET]");
  assert.equal(safeRes.data[0].email, "admin@test.com");

  // Destructive statements rejected
  await assert.rejects(
    async () => {
      await tool.run({ p: SUPER_ADMIN, db: fakeDb }, { sql: "DROP TABLE \"User\"" });
    },
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 400);
      return true;
    },
  );

  await assert.rejects(
    async () => {
      await tool.run({ p: SUPER_ADMIN, db: fakeDb }, { sql: "DELETE FROM \"User\" WHERE id = '1'" });
    },
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 400);
      return true;
    },
  );
});

test("admin-db: admin_db_get_record fetches single record and redacts secrets", async () => {
  const tool = ADMIN_DB_TOOLS.find((t) => t.name === "admin_db_get_record")!;
  assert.ok(tool);

  const fakeDb: any = {
    user: {
      findUnique: async ({ where }: any) => {
        if (where.id === "u1") {
          return { id: "u1", name: "Alice", email: "alice@test.com", password: "$2a$10$hashed" };
        }
        return null;
      },
    },
  };

  const res: any = await tool.run({ p: SUPER_ADMIN, db: fakeDb }, { table: "User", id: "u1" });
  assert.equal(res.table, "User");
  assert.equal(res.id, "u1");
  assert.equal(res.record.password, "[REDACTED_SECRET]");
  assert.equal(res.record.name, "Alice");

  // Not found throws 404
  await assert.rejects(
    async () => {
      await tool.run({ p: SUPER_ADMIN, db: fakeDb }, { table: "User", id: "u-unknown" });
    },
    (err: unknown) => {
      assert.ok(err instanceof ApiError && err.status === 404);
      return true;
    },
  );
});

test("admin-db: admin_db_aggregate computes metrics and groupBy", async () => {
  const tool = ADMIN_DB_TOOLS.find((t) => t.name === "admin_db_aggregate")!;
  assert.ok(tool);

  const fakeDb: any = {
    action: {
      aggregate: async () => ({ _count: { _all: 150 }, _sum: { duration: 3600 } }),
      groupBy: async () => [
        { channel: "CALL", _count: { _all: 100 } },
        { channel: "EMAIL", _count: { _all: 50 } },
      ],
    },
  };

  // Aggregate metrics
  const aggRes: any = await tool.run({ p: SUPER_ADMIN, db: fakeDb }, { table: "Action", count: true, sum: { duration: true } });
  assert.equal(aggRes.table, "Action");
  assert.equal(aggRes.metrics._count._all, 150);

  // GroupBy metrics
  const grpRes: any = await tool.run({ p: SUPER_ADMIN, db: fakeDb }, { table: "Action", group_by: ["channel"] });
  assert.equal(grpRes.table, "Action");
  assert.equal(grpRes.groups_count, 2);
  assert.equal(grpRes.data[0].channel, "CALL");
});

