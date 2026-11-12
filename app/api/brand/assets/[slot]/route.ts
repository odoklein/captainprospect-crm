import { NextRequest, NextResponse } from "next/server";
import { readBrandAsset } from "@/lib/brand/upload";
import { BRAND_ASSET_DEFAULTS, isBrandAssetSlot } from "@/lib/brand/types";

// ============================================
// GET /api/brand/assets/:slot?v=<logoVersion>
// Public (login page, emails): the instance's uploaded logo / icon. No upload,
// no storage or a missing object → 307 to the /public/brand default, so a
// logo is always shown. Versioned URLs are immutable; SVGs are served with a
// sandboxing CSP on top of the upload-time sanitizer (lib/brand/assets).
// ============================================

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slot: string }> }) {
    const { slot } = await params;
    if (!isBrandAssetSlot(slot)) {
        return new NextResponse("Not found", { status: 404, headers: { "X-Content-Type-Options": "nosniff" } });
    }

    const asset = await readBrandAsset(slot);
    if (!asset) {
        return new NextResponse(null, {
            status: 307,
            headers: { Location: BRAND_ASSET_DEFAULTS[slot], "Cache-Control": "public, max-age=60" },
        });
    }

    // Immutable only when the URL names the current version; an old ?v= keeps a short cache.
    const v = request.nextUrl.searchParams.get("v");
    const headers: Record<string, string> = {
        "Content-Type": asset.contentType,
        "Cache-Control": v && v === asset.version ? "public, max-age=31536000, immutable" : "public, max-age=300",
        ETag: asset.etag,
        "X-Content-Type-Options": "nosniff",
    };
    if (asset.contentType === "image/svg+xml") {
        headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    }

    if (request.headers.get("if-none-match") === asset.etag) {
        return new NextResponse(null, { status: 304, headers });
    }
    return new NextResponse(new Uint8Array(asset.bytes), { status: 200, headers });
}
