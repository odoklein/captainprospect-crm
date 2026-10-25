import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { resolveBrand } from "@/lib/brand";
import { getBrand, getBrandSettings } from "@/lib/brand/server";
import { isBrandStorageConfigured } from "@/lib/brand/upload";
import {
    BRAND_TABLE_MISSING_MESSAGE,
    diffBrandSettings,
    isBrandTableMissing,
    updateBrandSettings,
    validateBrandInput,
} from "@/lib/brand/write";

// ============================================
// /api/manager/brand — the instance's identity (Paramètres → Identité).
// GET  → stored settings (merged over the defaults) + the resolved brand
// PUT  → partial update of the editable fields, audited (BRAND_UPDATE)
// ============================================

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const [settings, brand] = await Promise.all([getBrandSettings(), getBrand()]);
    return successResponse({ settings, brand, storageConfigured: isBrandStorageConfigured() });
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);
    const body = await request.json().catch(() => null);
    const checked = validateBrandInput(body);
    if (!checked.ok) {
        return NextResponse.json({ success: false, error: "Certains champs sont invalides", errors: checked.errors }, { status: 400 });
    }

    let result;
    try {
        result = await updateBrandSettings(checked.value, session.user.id);
    } catch (err) {
        if (isBrandTableMissing(err)) return errorResponse(BRAND_TABLE_MISSING_MESSAGE, 503);
        throw err;
    }

    const diff = diffBrandSettings(result.before, result.after);
    if (diff.changed.length) {
        audit(request, session, {
            action: AUDIT_ACTIONS.BRAND_UPDATE,
            entityType: "BrandSettings",
            entityId: "default",
            summary: `Identité modifiée : ${diff.changed.join(", ")}`,
            before: diff.before,
            after: diff.after,
        });
    }
    return successResponse({ settings: result.after, brand: resolveBrand(result.after) });
});
