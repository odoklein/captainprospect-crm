import { NextRequest } from "next/server";
import { auditSystem } from "@/lib/audit";
import { guardInstanceRequest, instanceError, instanceJson, parseJsonBody } from "@/lib/instance/respond";
import { listIntegrationKeys, setIntegrationKeys } from "@/lib/integrations/store";

// Changeable integration keys of this instance (lib/integrations). HMAC-signed.
//   GET → { ok, keys: IntegrationKeyStatus[] }        status only, never a value
//   PUT { values: { OPENAI_API_KEY: "sk-…", ALLO_API_KEY: null } }
//       → { ok, changed, keys }                       null = remove the stored value
// Live within a second, no redeploy: the container env is only the creation-time fallback.
export const dynamic = "force-dynamic";

const ACTOR = "instance-api";

export async function GET(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "integrations");
    if (!guard.ok) return guard.response;
    try {
        return instanceJson({ ok: true, keys: await listIntegrationKeys() });
    } catch (err) {
        console.error("[instance-api] integrations", err);
        return instanceError(500, "database_error");
    }
}

export async function PUT(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "integrations");
    if (!guard.ok) return guard.response;

    const body = parseJsonBody(guard.rawBody);
    if (!body.ok) return instanceError(400, "invalid_json");
    const values = (body.value as { values?: unknown })?.values;
    if (!values || typeof values !== "object" || Array.isArray(values)) {
        return instanceError(422, "validation_failed", { errors: { values: "Objet { NOM: valeur | null } attendu" } });
    }

    try {
        const result = await setIntegrationKeys(values as Record<string, string | null>, { kind: "console" });
        if (!result.ok) return instanceError(422, "validation_failed", { errors: result.errors });
        if (result.changed.length) {
            auditSystem(
                {
                    action: "INTEGRATION_KEYS_UPDATE",
                    entityType: "SystemConfig",
                    entityId: "integrations",
                    summary: `Clés d'intégration modifiées depuis la Console (${result.changed.join(", ")})`,
                    metadata: { source: ACTOR, keys: result.changed },
                },
                ACTOR,
            );
        }
        return instanceJson({ ok: true, changed: result.changed, keys: result.keys });
    } catch (err) {
        console.error("[instance-api] integrations", err);
        return instanceError(500, "database_error");
    }
}
