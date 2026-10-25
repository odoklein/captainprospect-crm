// ============================================
// BRAND UPLOADS — logo / icon files in MinIO (prefix brand/). Server-only.
//
// Object keys are versioned (brand/<slot>-<version>.<ext>), so a new upload
// never overwrites a file a browser may still have cached as immutable.
// No MinIO configured (MINIO_*) → uploads fail with 503 and every slot keeps
// its /public/brand default; there is no local-disk fallback (the container
// has no persistent disk).
// ============================================

import { createHash } from "node:crypto";
import { downloadFile, getMinioConfig, uploadFile } from "@/lib/storage/minio";
import { detectBrandAssetKind, validateBrandAsset, BRAND_ASSET_CONTENT_TYPES } from "./assets";
import { defaultBrandSettings } from "./resolve";
import { getBrandSettings } from "./server";
import { BRAND_ASSET_COLUMNS, type BrandAssetSlot, type BrandSettingsValues } from "./types";
import {
    BRAND_TABLE_MISSING_MESSAGE,
    isBrandTableMissing,
    newBrandVersion,
    readBrandSettings,
    writeBrandColumns,
} from "./write";

export type BrandAssetResult = { ok: true; settings: BrandSettingsValues } | { ok: false; status: number; error: string };

const STORAGE_MISSING = "Stockage des fichiers non configuré (MINIO_ENDPOINT, MINIO_ACCESS_KEY_ID, MINIO_SECRET_ACCESS_KEY, MINIO_BUCKET).";

/** True when MinIO env is complete (uploads possible). */
export function isBrandStorageConfigured(): boolean {
    try {
        const c = getMinioConfig();
        return Boolean(c.bucket);
    } catch {
        return false;
    }
}

function dbFailure(err: unknown): BrandAssetResult {
    if (isBrandTableMissing(err)) return { ok: false, status: 503, error: BRAND_TABLE_MISSING_MESSAGE };
    console.error("[brand] asset settings write failed", err);
    return { ok: false, status: 500, error: "Échec de l'enregistrement" };
}

export async function storeBrandAsset(
    slot: BrandAssetSlot,
    file: { bytes: Buffer; contentType?: string; filename?: string },
    updatedBy: string,
): Promise<BrandAssetResult> {
    const checked = validateBrandAsset(file.bytes);
    if (!checked.ok) return { ok: false, status: 400, error: checked.error };
    if (!isBrandStorageConfigured()) return { ok: false, status: 503, error: STORAGE_MISSING };

    const version = newBrandVersion();
    const key = `brand/${slot}-${version}.${checked.ext}`;
    try {
        await uploadFile({
            key,
            body: file.bytes,
            contentType: checked.contentType,
            metadata: { slot },
        });
    } catch (err) {
        console.error("[brand] upload to MinIO failed", err);
        return { ok: false, status: 502, error: "Le stockage des fichiers ne répond pas" };
    }

    const data: Record<string, unknown> = { [BRAND_ASSET_COLUMNS[slot]]: key, logoVersion: version };
    if (slot === "full" && checked.width && checked.height) {
        data.logoFullWidth = checked.width;
        data.logoFullHeight = checked.height;
    }
    try {
        await writeBrandColumns(data, updatedBy);
        return { ok: true, settings: await readBrandSettings() };
    } catch (err) {
        return dbFailure(err);
    }
}

/** Back to the /public default for this slot. The MinIO object is kept. */
export async function removeBrandAsset(slot: BrandAssetSlot, updatedBy: string): Promise<BrandAssetResult> {
    const data: Record<string, unknown> = { [BRAND_ASSET_COLUMNS[slot]]: null, logoVersion: newBrandVersion() };
    if (slot === "full") {
        const d = defaultBrandSettings();
        data.logoFullWidth = d.logoFullWidth;
        data.logoFullHeight = d.logoFullHeight;
    }
    try {
        await writeBrandColumns(data, updatedBy);
        return { ok: true, settings: await readBrandSettings() };
    } catch (err) {
        return dbFailure(err);
    }
}

// Small in-process cache of served files. Keys are versioned, so an entry is
// never stale; the cap bounds memory (6 slots × 2 MB worst case, ×2 for churn).
const g = globalThis as typeof globalThis & { __brandAssetBytes?: Map<string, { bytes: Buffer; contentType: string }> };
const files = (g.__brandAssetBytes ??= new Map());
const MAX_CACHED = 12;

/** The uploaded file for a slot, or null (no upload, no storage, object missing). Never throws. */
export async function readBrandAsset(
    slot: BrandAssetSlot,
): Promise<{ bytes: Buffer; contentType: string; etag: string; version: string | null } | null> {
    const settings = await getBrandSettings();
    const key = settings[BRAND_ASSET_COLUMNS[slot]];
    if (!key) return null;

    let entry = files.get(key);
    if (!entry) {
        if (!isBrandStorageConfigured()) return null;
        try {
            const bytes = await downloadFile(key);
            const kind = detectBrandAssetKind(bytes);
            if (!kind) return null;
            entry = { bytes, contentType: BRAND_ASSET_CONTENT_TYPES[kind] };
            if (files.size >= MAX_CACHED) files.delete(files.keys().next().value as string);
            files.set(key, entry);
        } catch (err) {
            console.warn(`[brand] asset ${slot} unreadable from MinIO (${key}):`, err instanceof Error ? err.message : err);
            return null;
        }
    }
    const etag = `"${createHash("sha1").update(key).digest("hex").slice(0, 20)}"`;
    return { ...entry, etag, version: settings.logoVersion };
}
