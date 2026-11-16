import { NextRequest } from "next/server";
import { guardInstanceRequest, instanceError, instanceJson } from "@/lib/instance/respond";
import { EXTERNAL_ID } from "@/lib/changelog/contract";
import { retractFromConsole } from "@/lib/changelog/service";

// DELETE /api/instance/changelog/:externalId — the Console retracts an entry (and who saw it). Idempotent.
export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ externalId: string }> }) {
    const guard = await guardInstanceRequest(request, "changelog");
    if (!guard.ok) return guard.response;
    const { externalId } = await params;
    if (!EXTERNAL_ID.test(externalId)) return instanceError(422, "invalid_external_id");
    return instanceJson({ ok: true, removed: await retractFromConsole(externalId) });
}
