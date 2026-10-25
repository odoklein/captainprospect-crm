/**
 * Supabase Storage utility for analytics report PDFs.
 * Requires: SUPABASE_URL (or legacy NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 * Bucket "analytics-reports" must exist (create in Supabase Dashboard).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { runtimeEnv } from "@/lib/runtime-config/env";

const BUCKET = "analytics-reports";

function getSupabaseAdmin(): SupabaseClient | null {
    const url = runtimeEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
}

/**
 * Upload a report PDF to Supabase Storage.
 * Returns the public URL, or null if Supabase is not configured.
 */
export async function uploadReportPdf(
    buffer: Buffer,
    filename: string
): Promise<{ url: string; path: string } | null> {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;

    const ext = filename.endsWith(".pdf") ? "" : ".pdf";
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `reports/${new Date().toISOString().slice(0, 7)}/${safeName}-${randomUUID().slice(0, 8)}${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
        contentType: "application/pdf",
        upsert: false,
    });

    if (error) {
        console.error("Supabase report upload error:", error);
        return null;
    }

    // Prefer signed URL (works for private buckets); fallback to public URL
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (signed?.signedUrl) return { url: signed.signedUrl, path };

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl, path };
}

/**
 * Get a signed URL for a private bucket (1 hour expiry).
 * Use when the bucket is private.
 */
export async function getReportSignedUrl(path: string): Promise<string | null> {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error) {
        console.error("Supabase signed URL error:", error);
        return null;
    }
    return data.signedUrl;
}
