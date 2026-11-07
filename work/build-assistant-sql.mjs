/**
 * Builds `supabase-assistant-v4.sql` from the four real migrations, in the
 * order they must run. Idempotent throughout: every statement is guarded.
 *
 *     node work/build-assistant-sql.mjs
 */
import fs from "node:fs";
import path from "node:path";

const order = [
    "20261025220000_add_assistant_runs_evidence",
    "20261030100000_add_assistant_folders_memory_files",
    "20261030120000_add_ai_usage",
    "20261101120000_add_agent_jobs",
];

const header = `-- Captain AI v4 — assistant schema for the instance database (Supabase).
--
-- Why: the instance database stopped at 2026-09-24, so the conversation table
-- lacks folder / kind / visibility / pin / rolling-summary columns, and the
-- run + evidence tables were never created. Creating a conversation then fails
-- with a 500 (Prisma writes the kind/visibility defaults into a missing column).
--
-- Safe to run more than once: every type, table, column, index and constraint
-- is guarded. Run it in the Supabase SQL editor, or with:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase-assistant-v4.sql
--
-- Order matters: run tables (run + evidence) first, then the columns that
-- depend on them, then the usage ledger and the agent job tables.
`;

const parts = [header];
for (const name of order) {
    const file = path.join(process.cwd(), "prisma", "migrations", name, "migration.sql");
    const sql = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n").trimEnd();
    parts.push(`\n-- ============================================================\n-- ${name}\n-- ============================================================\n\n${sql}\n`);
}

const out = path.join(process.cwd(), "supabase-assistant-v4.sql");
fs.writeFileSync(out, parts.join(""), "utf8");
const stat = fs.statSync(out);
console.log("wrote", out, stat.size, "bytes");
