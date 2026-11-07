import { NextRequest } from "next/server";
import { auditSystem } from "@/lib/audit";
import { resolveBrand } from "@/lib/brand/resolve";
import {
    BRAND_TABLE_MISSING_MESSAGE,
    diffBrandSettings,
    isBrandTableMissing,
    readBrandSettings,
    updateBrandSettings,
    validateBrandInput,
} from "@/lib/brand/write";
import { guardInstanceRequest, instanceError, instanceJson, parseJsonBody } from "@/lib/instance/respond";

// Control-plane provisioning of this instance's brand. HMAC-signed (lib/instance/auth).
//   GET  → { ok, settings, brand }
//   PUT  { name?, primaryColor?, … } → { ok, changed, settings, brand }
export const dynamic = "force-dynamic";

const ACTOR = "instance-api";

function dbError(err: unknown) {
    if (isBrandTableMissing(err)) return instanceError(503, "brand_table_missing", { message: BRAND_TABLE_MISSING_MESSAGE });
    console.error("[instance-api] brand", err);
    return instanceError(500, "database_error");
}

export async function GET(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "brand");
    if (!guard.ok) return guard.response;
    try {
        const settings = await readBrandSettings();
        return instanceJson({ ok: true, settings, brand: resolveBrand(settings) });
    } catch (err) {
        return dbError(err);
    }
}

export async function PUT(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "brand");
    if (!guard.ok) return guard.response;

    const body = parseJsonBody(guard.rawBody);
    if (!body.ok) return instanceError(400, "invalid_json");
    const parsed = validateBrandInput(body.value);
    if (!parsed.ok) return instanceError(422, "validation_failed", { errors: parsed.errors });

    try {
        const { before, after } = await updateBrandSettings(parsed.value, ACTOR);
        const diff = diffBrandSettings(before, after);
        if (diff.changed.length) {
            auditSystem(
                {
                    action: "BRAND_UPDATE",
                    entityType: "BrandSettings",
                    entityId: "default",
                    summary: `Identité de l'instance modifiée par le control plane (${diff.changed.join(", ")})`,
                    before: diff.before,
                    after: diff.after,
                    metadata: { source: ACTOR },
                },
                ACTOR,
            );
        }
        return instanceJson({ ok: true, changed: diff.changed, settings: after, brand: resolveBrand(after) });
    } catch (err) {
        return dbError(err);
    }
}
