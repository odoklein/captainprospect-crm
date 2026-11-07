import { NextRequest } from "next/server";
import { errorResponse, requireRole, successResponse, withErrorHandler } from "@/lib/api-utils";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { resolveBrand } from "@/lib/brand";
import {
    BRAND_TABLE_MISSING_MESSAGE,
    diffBrandSettings,
    isBrandTableMissing,
    resetBrandSettings,
} from "@/lib/brand/write";

// ============================================
// POST /api/manager/brand/reset — identity back to brand/brand.config.ts,
// uploaded logos detached (files kept in storage). Audited.
// ============================================

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(["MANAGER"], request);

    let result;
    try {
        result = await resetBrandSettings(session.user.id);
    } catch (err) {
        if (isBrandTableMissing(err)) return errorResponse(BRAND_TABLE_MISSING_MESSAGE, 503);
        throw err;
    }

    const diff = diffBrandSettings(result.before, result.after);
    audit(request, session, {
        action: AUDIT_ACTIONS.BRAND_UPDATE,
        entityType: "BrandSettings",
        entityId: "default",
        summary: "Identité réinitialisée (valeurs par défaut)",
        before: diff.before,
        after: diff.after,
        metadata: { reset: true },
    });
    return successResponse({ settings: result.after, brand: resolveBrand(result.after) });
});
