// ============================================
// MIGRATE INSTANCE — bring one instance database up to the schema of this image.
//
//   tsx prisma/migrate-instance.ts      (DATABASE_URL and DIRECT_URL in the env)
//
// Why not just `prisma migrate deploy`: the migration history cannot build a database
// from nothing (the first migration alters "User", which no migration creates: the schema
// was originally created outside Prisma Migrate). The rules are in ./migrate-plan.ts:
//
//   - EMPTY database (no "User" table): create everything from schema.prisma with
//     `prisma db push`, then record every migration in prisma/migrations as applied
//     (`prisma migrate resolve --applied`). From then on it behaves like any managed database.
//   - Managed database (has _prisma_migrations): `prisma migrate deploy`, which applies only
//     the migrations newer than what the database already has.
//   - Has tables but no _prisma_migrations (a database kept by hand, like the original
//     Captain Prospect one): refuses. Baseline it deliberately, never by accident.
//
// Idempotent: an interrupted baseline is completed on the next run. Used by the migrate image
// (Dockerfile CMD) and by scripts/provision-agency. One partial unique index of the history
// (Invoice.invoiceNumber WHERE NOT NULL) is not expressible in schema.prisma; Postgres allows many
// NULLs in a plain unique index, so the pushed schema enforces the same rule.
// ============================================

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { planMigration } from "./migrate-plan";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

function prismaCli(args: string[]): string {
    const r = spawnSync("npx", ["prisma", ...args], { encoding: "utf8", shell: process.platform === "win32", env: process.env });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    if (r.status !== 0) {
        console.error(out);
        throw new Error(`prisma ${args[0]} failed (exit ${r.status})`);
    }
    return out;
}

function migrationNames(): string[] {
    return readdirSync(MIGRATIONS_DIR)
        .filter((d) => statSync(path.join(MIGRATIONS_DIR, d)).isDirectory())
        .sort();
}

async function readState() {
    const db = new PrismaClient();
    try {
        const rows = await db.$queryRawUnsafe<{ u: string | null; h: string | null }[]>(
            `SELECT to_regclass('public."User"')::text AS u, to_regclass('public._prisma_migrations')::text AS h`,
        );
        const hasUser = rows[0].u !== null;
        const hasHistory = rows[0].h !== null;
        let applied = new Set<string>();
        if (hasHistory) {
            const done = await db.$queryRawUnsafe<{ migration_name: string }[]>(
                `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
            );
            applied = new Set(done.map((r) => r.migration_name));
        }
        return { hasUser, hasHistory, applied, all: migrationNames() };
    } finally {
        await db.$disconnect();
    }
}

async function main() {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
    const plan = planMigration(await readState());

    if (plan.action === "refuse") throw new Error(plan.reason);

    if (plan.action === "baseline") {
        if (plan.recordFirst) prismaCli(["migrate", "resolve", "--applied", plan.recordFirst]);
        if (plan.push) {
            console.log("Empty database: creating the schema from schema.prisma (prisma db push)...");
            prismaCli(["db", "push", "--skip-generate"]);
        }
        for (const name of plan.record) prismaCli(["migrate", "resolve", "--applied", name]);
        console.log(`Baseline done: ${plan.record.length + (plan.recordFirst ? 1 : 0)} migrations recorded as applied.`);
        return;
    }

    console.log("Managed database: prisma migrate deploy");
    const out = prismaCli(["migrate", "deploy"]);
    // Prisma appends a version banner; keep the lines that say what happened.
    console.log(out.split("\n").filter((l) => /migration|applied|up to date|No pending/i.test(l) && !/│|found in/.test(l)).join("\n") || "done");
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
