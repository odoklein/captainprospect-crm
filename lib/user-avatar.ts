// ============================================
// USER AVATARS
// Profile pictures are stored in SystemConfig (key/value, TEXT) as small data
// URLs — one row per user under "user.avatar:<userId>" — so the feature needs
// no schema migration and works the same on every storage setup. The browser
// crops and re-encodes every upload to a small square (~20–60 KB) before it is
// sent; the server re-checks the format and size, then serves the bytes from
// /api/users/[id]/avatar.
// ============================================

import { prisma } from "./prisma";

const KEY_PREFIX = "user.avatar:";

/** Hard cap on the stored data URL (≈ 300 KB of image). The editor sends far less. */
export const AVATAR_MAX_DATA_URL_LENGTH = 400_000;

const DATA_URL_RE = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/;

// Magic bytes per accepted type — the declared mime type must match the content.
// SVG is deliberately not accepted (it can carry script).
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
    "image/png": (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/jpeg": (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    "image/webp": (b) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
};

function keyFor(userId: string): string {
    return `${KEY_PREFIX}${userId}`;
}

function versionOf(updatedAt: Date): string {
    return updatedAt.getTime().toString(36);
}

export function avatarUrl(userId: string, version: string): string {
    return `/api/users/${encodeURIComponent(userId)}/avatar?v=${version}`;
}

/** Validates a data URL and returns its decoded image, or null if it is not an accepted image. */
export function parseAvatarDataUrl(dataUrl: string): { mimeType: string; bytes: Buffer } | null {
    if (dataUrl.length > AVATAR_MAX_DATA_URL_LENGTH) return null;
    const match = DATA_URL_RE.exec(dataUrl);
    if (!match) return null;
    const [, mimeType, base64] = match;
    const bytes = Buffer.from(base64, "base64");
    if (!SIGNATURES[mimeType]?.(bytes)) return null;
    return { mimeType, bytes };
}

/** Cheap existence check: never loads the image itself. */
export async function getAvatarVersion(userId: string): Promise<string | null> {
    const row = await prisma.systemConfig.findUnique({
        where: { key: keyFor(userId) },
        select: { updatedAt: true },
    });
    return row ? versionOf(row.updatedAt) : null;
}

export async function getAvatar(userId: string): Promise<{ mimeType: string; bytes: Buffer; version: string } | null> {
    const row = await prisma.systemConfig.findUnique({ where: { key: keyFor(userId) } });
    if (!row) return null;
    const parsed = parseAvatarDataUrl(row.value);
    return parsed ? { ...parsed, version: versionOf(row.updatedAt) } : null;
}

/** Stores an already-validated data URL and returns the new version. */
export async function saveAvatar(userId: string, dataUrl: string): Promise<string> {
    const row = await prisma.systemConfig.upsert({
        where: { key: keyFor(userId) },
        create: { key: keyFor(userId), value: dataUrl },
        update: { value: dataUrl },
        select: { updatedAt: true },
    });
    return versionOf(row.updatedAt);
}

export async function deleteAvatar(userId: string): Promise<void> {
    await prisma.systemConfig.deleteMany({ where: { key: keyFor(userId) } });
}
