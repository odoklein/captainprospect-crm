import { NextRequest } from "next/server";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { resolveBrand } from "@/lib/brand";
import { BRAND_ASSET_MAX_BYTES } from "@/lib/brand/assets";
import { removeBrandAsset, storeBrandAsset } from "@/lib/brand/upload";
import { readBrandSettings } from "@/lib/brand/write";
import { BRAND_ASSET_COLUMNS, BRAND_ASSET_LABELS, isBrandAssetSlot, type BrandAssetSlot } from "@/lib/brand/types";

// ============================================
// /api/manager/brand/assets — logos and icons of the instance.
// POST   multipart { slot, file }  → validate (lib/brand/assets), store in MinIO
// DELETE ?slot=<slot>              → back to the /public/brand default
// Both audited (BRAND_UPDATE) with the old and new object keys.
// ============================================

export const dynamic = "force-dynamic";

async function currentKey(slot: BrandAssetSlot): Promise<string | null> {
    try {
        return (await readBrandSettings())[BRAND_ASSET_COLUMNS[slot]];
    } catch {
        return null;
    }
}

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);

    const form = await request.formData().catch(() => null);
    const slot = form?.get("slot");
    const file = form?.get("file");
    if (!isBrandAssetSlot(slot)) return errorResponse("Emplacement de logo inconnu", 400);
    if (!file || typeof file === "string") return errorResponse("Fichier manquant", 400);
    if (file.size > BRAND_ASSET_MAX_BYTES) return errorResponse("Fichier trop lourd (2 Mo maximum)", 413);

    const before = await currentKey(slot);
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await storeBrandAsset(slot, { bytes, contentType: file.type, filename: file.name }, session.user.id);
    if (!result.ok) return errorResponse(result.error, result.status);

    const column = BRAND_ASSET_COLUMNS[slot];
    audit(request, session, {
        action: AUDIT_ACTIONS.BRAND_UPDATE,
        entityType: "BrandSettings",
        entityId: "default",
        summary: `Logo remplacé : ${BRAND_ASSET_LABELS[slot]}`,
        before: { [column]: before },
        after: { [column]: result.settings[column] },
        metadata: { slot, bytes: bytes.length, filename: file.name },
    });
    return successResponse({ settings: result.settings, brand: resolveBrand(result.settings) });
});

export const DELETE = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);

    const slot = request.nextUrl.searchParams.get("slot");
    if (!isBrandAssetSlot(slot)) return errorResponse("Emplacement de logo inconnu", 400);

    const before = await currentKey(slot);
    const result = await removeBrandAsset(slot, session.user.id);
    if (!result.ok) return errorResponse(result.error, result.status);

    const column = BRAND_ASSET_COLUMNS[slot];
    audit(request, session, {
        action: AUDIT_ACTIONS.BRAND_UPDATE,
        entityType: "BrandSettings",
        entityId: "default",
        summary: `Logo retiré : ${BRAND_ASSET_LABELS[slot]}`,
        before: { [column]: before },
        after: { [column]: null },
        metadata: { slot },
    });
    return successResponse({ settings: result.settings, brand: resolveBrand(result.settings) });
});
