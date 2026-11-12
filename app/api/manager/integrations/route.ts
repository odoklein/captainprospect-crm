import { NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { listIntegrationKeys, setIntegrationKeys } from "@/lib/integrations/store";

// Paramètres → Intégrations: the agency's own keys (OpenAI, Allo, Serper…).
// Same store as the Console's signed /api/instance/integrations. Values go in,
// never come back out: GET returns the source and the last four characters.
//   GET → IntegrationKeyStatus[]
//   PUT { values: { OPENAI_API_KEY: "sk-…" | null } } → { changed, keys }

const putSchema = z.object({
    values: z.record(z.string(), z.string().nullable()),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    return successResponse(await listIntegrationKeys());
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const parsed = putSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse("Format attendu : { values: { NOM: valeur | null } }", 400);

    const result = await setIntegrationKeys(parsed.data.values, {
        kind: "manager",
        id: session.user.id,
        name: session.user.name ?? session.user.email ?? "Manager",
    });
    if (!result.ok) {
        const [name, message] = Object.entries(result.errors)[0];
        return errorResponse(`${name} : ${message}`, 400);
    }
    if (result.changed.length) {
        audit(request, session, {
            action: "INTEGRATION_KEYS_UPDATE",
            entityType: "SystemConfig",
            entityId: "integrations",
            summary: `Clés d'intégration modifiées (${result.changed.join(", ")})`,
            metadata: { keys: result.changed },
        });
    }
    return successResponse({ changed: result.changed, keys: result.keys });
});
