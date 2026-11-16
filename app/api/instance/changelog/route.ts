import { NextRequest } from "next/server";
import { guardInstanceRequest, instanceError, instanceJson, parseJsonBody } from "@/lib/instance/respond";
import { changelogPayloadSchema } from "@/lib/changelog/contract";
import { consoleStats, upsertFromConsole } from "@/lib/changelog/service";

// « Nouveautés » pushed by the Console. HMAC-signed (lib/instance/auth). Contract: docs/CONSOLE_CHANGELOG.md
//   PUT  { externalId, kind: release|announcement, title, … }  → { ok, id, created }   upsert on externalId
//   GET                                                        → { ok, entries: [{ externalId, seen, audienceSize, … }], serverTime }
export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "changelog");
    if (!guard.ok) return guard.response;
    const body = parseJsonBody(guard.rawBody);
    if (!body.ok) return instanceError(400, "invalid_json");
    const parsed = changelogPayloadSchema.safeParse(body.value);
    if (!parsed.success) {
        return instanceError(422, "validation_failed", {
            errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
    }
    const result = await upsertFromConsole(parsed.data);
    return instanceJson({ ok: true, ...result });
}

export async function GET(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "changelog");
    if (!guard.ok) return guard.response;
    return instanceJson({ ok: true, entries: await consoleStats(), serverTime: new Date().toISOString() });
}
