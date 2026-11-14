import { NextRequest } from "next/server";
import { auditSystem } from "@/lib/audit";
import { guardInstanceRequest, instanceError, instanceJson } from "@/lib/instance/respond";
import { deleteEntry, isChangelogTableMissing } from "@/lib/changelog/server";

// Retract one « Nouveauté » (and who saw it). HMAC-signed.
//   DELETE → { ok, deleted }   deleting an unknown id is not an error (idempotent)
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ externalId: string }> };

export async function DELETE(request: NextRequest, { params }: Params) {
    const guard = await guardInstanceRequest(request, "changelog");
    if (!guard.ok) return guard.response;
    const { externalId } = await params;
    const id = decodeURIComponent(externalId);
    if (!id || id.length > 100) return instanceError(422, "validation_failed", { errors: { externalId: "Identifiant invalide" } });
    try {
        const deleted = await deleteEntry(id);
        if (deleted) {
            auditSystem(
                { action: "CHANGELOG_RETRACT", entityType: "InstanceChangelogEntry", entityId: id, summary: "Nouveauté retirée par le control plane" },
                "instance-api",
                request,
            );
        }
        return instanceJson({ ok: true, deleted });
    } catch (err) {
        if (isChangelogTableMissing(err)) return instanceError(503, "changelog_table_missing");
        console.error("[instance-api] changelog delete", err);
        return instanceError(500, "database_error");
    }
}
