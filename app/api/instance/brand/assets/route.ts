import { NextRequest } from "next/server";
import { auditSystem } from "@/lib/audit";
import { resolveBrand } from "@/lib/brand/resolve";
import { BRAND_ASSET_SLOTS, isBrandAssetSlot } from "@/lib/brand/types";
import { removeBrandAsset, storeBrandAsset } from "@/lib/brand/upload";
import { guardInstanceRequest, instanceError, instanceJson } from "@/lib/instance/respond";

// Control-plane upload of this instance's logos. HMAC-signed over the raw multipart bytes.
//   POST   multipart/form-data { slot, file } → { ok, slot, settings, brand }
//   DELETE ?slot=<slot>                         → { ok, slot, settings, brand }  (back to the /public default)
export const dynamic = "force-dynamic";

const ACTOR = "instance-api";

function auditAsset(slot: string, removed: boolean, filename?: string) {
    auditSystem(
        {
            action: "BRAND_UPDATE",
            entityType: "BrandSettings",
            entityId: "default",
            summary: removed
                ? `Logo « ${slot} » retiré par le control plane`
                : `Logo « ${slot} » remplacé par le control plane`,
            metadata: { source: ACTOR, slot, removed, filename: filename ?? null },
        },
        ACTOR,
    );
}

export async function POST(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "brand-assets");
    if (!guard.ok) return guard.response;

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
        return instanceError(415, "multipart_required");
    }

    let form: FormData;
    try {
        // The body stream is consumed by the signature check: re-parse the verified bytes.
        form = await new Request(request.url, {
            method: "POST",
            headers: { "content-type": contentType },
            body: Buffer.from(guard.rawBody),
        }).formData();
    } catch {
        return instanceError(400, "invalid_multipart");
    }

    const slot = form.get("slot");
    if (!isBrandAssetSlot(slot)) {
        return instanceError(422, "invalid_slot", { allowed: BRAND_ASSET_SLOTS });
    }
    const file = form.get("file");
    if (!file || typeof file === "string") return instanceError(422, "file_required");

    const result = await storeBrandAsset(
        slot,
        { bytes: Buffer.from(await file.arrayBuffer()), contentType: file.type || undefined, filename: file.name || undefined },
        ACTOR,
    );
    if (!result.ok) return instanceError(result.status, result.error);
    auditAsset(slot, false, file.name || undefined);
    return instanceJson({ ok: true, slot, settings: result.settings, brand: resolveBrand(result.settings) });
}

export async function DELETE(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "brand-assets");
    if (!guard.ok) return guard.response;

    const slot = new URL(request.url).searchParams.get("slot");
    if (!isBrandAssetSlot(slot)) {
        return instanceError(422, "invalid_slot", { allowed: BRAND_ASSET_SLOTS });
    }
    const result = await removeBrandAsset(slot, ACTOR);
    if (!result.ok) return instanceError(result.status, result.error);
    auditAsset(slot, true);
    return instanceJson({ ok: true, slot, settings: result.settings, brand: resolveBrand(result.settings) });
}
