import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runtimeEnv } from "@/lib/runtime-config/env";
import { guardInstanceRequest, instanceJson } from "@/lib/instance/respond";
import { getLicense, getSeatUsage } from "@/lib/license/server";

// Control-plane health probe (HMAC-signed like the rest of /api/instance/*).
//   GET → { version, schemaVersion, brandUpdatedAt, dbOk, license: { status, plan, seatLimit, seatsUsed } }
// Never throws: a database problem is reported as dbOk:false with 200, so the
// control plane can tell "container up, DB down" from "container down".
export const dynamic = "force-dynamic";

async function latestMigration(): Promise<string | null> {
    try {
        const rows = await prisma.$queryRaw<{ migration_name: string }[]>`
            SELECT migration_name FROM "_prisma_migrations"
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
            ORDER BY migration_name DESC
            LIMIT 1`;
        return rows[0]?.migration_name ?? null;
    } catch {
        // Table absent (database managed by hand) or DB unreachable.
        return null;
    }
}

async function brandUpdatedAt(): Promise<string | null> {
    try {
        const row = await prisma.brandSettings.findUnique({ where: { id: "default" }, select: { updatedAt: true } });
        return row?.updatedAt.toISOString() ?? null;
    } catch {
        return null;
    }
}

async function dbOk(): Promise<boolean> {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
    } catch {
        return false;
    }
}

async function licenseSummary(dbUp: boolean) {
    const license = await getLicense();
    const seats = dbUp ? await getSeatUsage() : { used: null, limit: license.seatLimit };
    return { status: license.status, plan: license.plan, seatLimit: license.seatLimit, seatsUsed: seats.used };
}

export async function GET(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "health");
    if (!guard.ok) return guard.response;

    const ok = await dbOk();
    const [schemaVersion, brandUpdated] = ok ? await Promise.all([latestMigration(), brandUpdatedAt()]) : [null, null];
    return instanceJson({
        version: runtimeEnv("GIT_SHA") ?? "dev",
        schemaVersion,
        brandUpdatedAt: brandUpdated,
        dbOk: ok,
        license: await licenseSummary(ok),
    });
}
