import { NextRequest } from "next/server";
import { auditSystem } from "@/lib/audit";
import { guardInstanceRequest, instanceError, instanceJson, parseJsonBody } from "@/lib/instance/respond";
import { validateLicenseInput } from "@/lib/license/resolve";
import { getLicense, getSeatUsage, isLicenseTableMissing, updateLicense } from "@/lib/license/server";

// Control-plane license of this instance. HMAC-signed (lib/instance/auth).
//   GET → { ok, license, seats: { used, limit } }
//   PUT { status?, plan?, seatLimit?, features?, aiMonthlyQuota?, suspendedReason? }
//       → { ok, changed, license, seats }
// A PUT is a partial update: omitted fields keep their value, `features` merges
// key by key, `null` clears seatLimit / aiMonthlyQuota (= unlimited).
export const dynamic = "force-dynamic";

const ACTOR = "instance-api";

function dbError(err: unknown) {
    if (isLicenseTableMissing(err)) {
        return instanceError(503, "license_table_missing", {
            message: "La table InstanceLicense n'existe pas encore : appliquez les migrations (prisma migrate deploy).",
        });
    }
    console.error("[instance-api] license", err);
    return instanceError(500, "database_error");
}

export async function GET(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "license");
    if (!guard.ok) return guard.response;
    return instanceJson({ ok: true, license: await getLicense(), seats: await getSeatUsage() });
}

export async function PUT(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "license");
    if (!guard.ok) return guard.response;

    const body = parseJsonBody(guard.rawBody);
    if (!body.ok) return instanceError(400, "invalid_json");
    const parsed = validateLicenseInput(body.value);
    if (!parsed.ok) return instanceError(422, "validation_failed", { errors: parsed.errors });

    try {
        const { before, after } = await updateLicense(parsed.value, ACTOR);
        const changed = (Object.keys(after) as (keyof typeof after)[]).filter(
            (k) => k !== "updatedAt" && JSON.stringify(before[k]) !== JSON.stringify(after[k]),
        );
        if (changed.length) {
            auditSystem(
                {
                    action: "LICENSE_UPDATE",
                    entityType: "InstanceLicense",
                    entityId: "default",
                    summary: `Licence de l'instance modifiée par le control plane (${changed.join(", ")})`,
                    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
                    after: Object.fromEntries(changed.map((k) => [k, after[k]])),
                    metadata: { source: ACTOR },
                },
                ACTOR,
            );
        }
        return instanceJson({ ok: true, changed, license: after, seats: await getSeatUsage() });
    } catch (err) {
        return dbError(err);
    }
}
