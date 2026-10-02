import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withErrorHandler } from "@/lib/api-utils";
import { getAvatar } from "@/lib/user-avatar";

// ============================================
// GET /api/users/[id]/avatar — a user's profile picture, as image bytes.
// Any signed-in user may load any avatar (they appear wherever names do).
// URLs carry ?v=<version>, so a versioned request is cached for good and a new
// upload simply changes the URL. 404 when the user has no picture.
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireAuth(request);
    const { id } = await params;

    const avatar = await getAvatar(id);
    if (!avatar) return new NextResponse(null, { status: 404 });

    const etag = `"${avatar.version}"`;
    const versioned = request.nextUrl.searchParams.get("v") === avatar.version;
    const headers = {
        "Content-Type": avatar.mimeType,
        "Cache-Control": versioned ? "private, max-age=31536000, immutable" : "private, no-cache",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
    };

    if (request.headers.get("if-none-match") === etag) {
        return new NextResponse(null, { status: 304, headers });
    }
    return new NextResponse(new Uint8Array(avatar.bytes), { status: 200, headers });
});
