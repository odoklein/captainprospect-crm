import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, requireAuth, successResponse, withErrorHandler } from "@/lib/api-utils";
import {
    AVATAR_MAX_DATA_URL_LENGTH,
    avatarUrl,
    deleteAvatar,
    getAvatarVersion,
    parseAvatarDataUrl,
    saveAvatar,
} from "@/lib/user-avatar";

// ============================================
// /api/users/me/avatar — the signed-in user's own profile picture.
// GET    → { url, version } (both null when there is no picture)
// PUT    → { image: "data:image/webp;base64,…" } — already cropped client-side
// DELETE → back to initials
// The image bytes themselves are served by /api/users/[id]/avatar.
// ============================================

const putSchema = z.object({
    image: z.string().min(1).max(AVATAR_MAX_DATA_URL_LENGTH),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    const version = await getAvatarVersion(session.user.id);
    return successResponse({
        version,
        url: version ? avatarUrl(session.user.id, version) : null,
    });
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);

    const parsed = putSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return errorResponse("Image trop lourde ou manquante", 400);
    }
    if (!parseAvatarDataUrl(parsed.data.image)) {
        return errorResponse("Format non pris en charge (PNG, JPEG ou WebP)", 400);
    }

    const version = await saveAvatar(session.user.id, parsed.data.image);
    return successResponse({ version, url: avatarUrl(session.user.id, version) });
});

export const DELETE = withErrorHandler(async (request: NextRequest) => {
    const session = await requireAuth(request);
    await deleteAvatar(session.user.id);
    return successResponse({ version: null, url: null });
});
