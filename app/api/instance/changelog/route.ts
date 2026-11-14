import { NextRequest } from "next/server";
import { auditSystem } from "@/lib/audit";
import { guardInstanceRequest, instanceError, instanceJson, parseJsonBody } from "@/lib/instance/respond";
import { validateChangelogInput } from "@/lib/changelog/resolve";
import { consoleSummary, isChangelogTableMissing, upsertEntry } from "@/lib/changelog/server";

// « Nouveautés » pushed by the Console. HMAC-signed (lib/instance/auth).
//   PUT { externalId, kind: release|announcement, title, body?, notes?[], version?, category?, severity?,
//         audience?[], ctaLabel?, ctaUrl?, startsAt?, endsAt?, publishedAt?,
//         offer?: { tag, migration?, security?, deadline?, window? } | null }
//       → { ok, created }        idempotent by externalId; a new offer tag clears the manager's answer
//   GET → { ok, version, entries: [{ externalId, kind, version, seenUsers, totalUsers,
//         offer: { tag, state, decision, decisionAt, postponedUntil, decidedBy } | null }] }
export const dynamic = "force-dynamic";

const ACTOR = "instance-api";

function dbError(err: unknown) {
    if (isChangelogTableMissing(err)) {
        return instanceError(503, "changelog_table_missing", {
            message: "La table InstanceChangelogEntry n'existe pas encore : appliquez les migrations (prisma migrate deploy).",
        });
    }
    console.error("[instance-api] changelog", err);
    return instanceError(500, "database_error");
}

export async function GET(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "changelog");
    if (!guard.ok) return guard.response;
    try {
        return instanceJson({ ok: true, ...(await consoleSummary()) });
    } catch (err) {
        return dbError(err);
    }
}

export async function PUT(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "changelog");
    if (!guard.ok) return guard.response;

    const body = parseJsonBody(guard.rawBody);
    if (!body.ok) return instanceError(400, "invalid_json");
    const parsed = validateChangelogInput(body.value);
    if (!parsed.ok) return instanceError(422, "validation_failed", { errors: parsed.errors });

    try {
        const { created } = await upsertEntry(parsed.value);
        auditSystem(
            {
                action: created ? "CHANGELOG_PUBLISH" : "CHANGELOG_UPDATE",
                entityType: "InstanceChangelogEntry",
                entityId: parsed.value.externalId,
                summary: `Nouveauté ${created ? "publiée" : "mise à jour"} par le control plane : ${parsed.value.title}`,
                metadata: { source: ACTOR, kind: parsed.value.kind, offerTag: parsed.value.offer?.tag ?? null },
            },
            ACTOR,
            request,
        );
        return instanceJson({ ok: true, created });
    } catch (err) {
        return dbError(err);
    }
}
