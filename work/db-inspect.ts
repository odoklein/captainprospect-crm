/**
 * Read-only inspection of the assistant conversation table.
 * Prints the host only (never the credentials), then the columns.
 *
 *     npx tsx work/db-inspect.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const raw = process.env.DATABASE_URL ?? "";
try {
    const url = new URL(raw);
    console.log("host:", url.hostname, "db:", url.pathname.slice(1));
} catch {
    console.log("DATABASE_URL missing or unparseable");
}

const prisma = new PrismaClient();

type Column = {
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
};

async function main() {
    const exists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'AssistantProjetConversation'
        ) AS exists`,
    );
    console.log("table AssistantProjetConversation:", exists[0]?.exists);

    const columns = await prisma.$queryRawUnsafe<Column[]>(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'AssistantProjetConversation'
         ORDER BY ordinal_position`,
    );
    for (const c of columns) {
        console.log(`${c.column_name}\t${c.data_type}\tnullable=${c.is_nullable}\tdefault=${c.column_default ?? "-"}`);
    }

    const migrations = await prisma.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date | null }>>(
        `SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 8`,
    ).catch(() => []);
    console.log("\nlast migrations:");
    for (const m of migrations) console.log(`${m.migration_name}\t${m.finished_at ? "ok" : "INCOMPLETE"}`);
}

main()
    .catch((error) => {
        console.error("inspection failed:", error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
