// ============================================
// INSTANCE API AUTH — HMAC signature of control-plane requests.
//
// Every /api/instance/* request carries:
//   X-Instance-Timestamp: 1760000000              (unix seconds)
//   X-Instance-Signature: v1=<hex hmac-sha256>
// over the canonical string
//   `${timestamp}.${METHOD}.${pathWithQuery}.${sha256hex(rawBody)}`
// with the secret INSTANCE_ADMIN_SECRET (container env). The body hash covers
// the exact bytes sent (JSON or multipart); an empty body hashes "".
// Requests older or newer than 5 minutes are rejected. No secret configured →
// the whole API answers 503: there is never a default key.
//
// signInstanceRequest / verifyInstanceSignature are pure, so the control plane
// and docs can reuse them as-is.
// ============================================

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { runtimeEnv } from "@/lib/runtime-config/env";

export const INSTANCE_TIMESTAMP_HEADER = "x-instance-timestamp";
export const INSTANCE_SIGNATURE_HEADER = "x-instance-signature";
export const INSTANCE_MAX_SKEW_SECONDS = 300;
const VERSION = "v1";

export type InstanceBody = string | Uint8Array | ArrayBuffer | null | undefined;

function bodyBytes(body: InstanceBody): Uint8Array {
    if (body == null) return new Uint8Array(0);
    if (typeof body === "string") return new TextEncoder().encode(body);
    if (body instanceof ArrayBuffer) return new Uint8Array(body);
    return body;
}

export function sha256Hex(body: InstanceBody): string {
    return createHash("sha256").update(bodyBytes(body)).digest("hex");
}

/** `${timestamp}.${METHOD}.${pathWithQuery}.${sha256hex(body)}` */
export function canonicalInstanceString(input: {
    method: string;
    pathWithQuery: string;
    body: InstanceBody;
    timestamp: number | string;
}): string {
    return `${input.timestamp}.${input.method.toUpperCase()}.${input.pathWithQuery}.${sha256Hex(input.body)}`;
}

/** Headers to send with a request: { "X-Instance-Timestamp", "X-Instance-Signature" }. */
export function signInstanceRequest(input: {
    secret: string;
    method: string;
    pathWithQuery: string;
    body?: InstanceBody;
    /** Unix seconds; defaults to now. */
    timestamp?: number;
}): { "X-Instance-Timestamp": string; "X-Instance-Signature": string } {
    const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000);
    const mac = createHmac("sha256", input.secret)
        .update(canonicalInstanceString({ ...input, body: input.body, timestamp }))
        .digest("hex");
    return { "X-Instance-Timestamp": String(timestamp), "X-Instance-Signature": `${VERSION}=${mac}` };
}

export type InstanceVerifyResult =
    | { ok: true }
    | { ok: false; reason: "missing" | "malformed" | "stale" | "unsupported_version" | "bad_signature" };

export function verifyInstanceSignature(input: {
    secret: string;
    method: string;
    pathWithQuery: string;
    body: InstanceBody;
    timestampHeader: string | null | undefined;
    signatureHeader: string | null | undefined;
    /** Unix seconds; defaults to now (injectable for tests). */
    now?: number;
}): InstanceVerifyResult {
    const { timestampHeader, signatureHeader } = input;
    if (!timestampHeader || !signatureHeader) return { ok: false, reason: "missing" };
    if (!/^\d{1,12}$/.test(timestampHeader.trim())) return { ok: false, reason: "malformed" };
    const ts = Number(timestampHeader.trim());
    const now = input.now ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > INSTANCE_MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };

    const sep = signatureHeader.indexOf("=");
    if (sep <= 0) return { ok: false, reason: "malformed" };
    const version = signatureHeader.slice(0, sep).trim();
    const hex = signatureHeader.slice(sep + 1).trim().toLowerCase();
    if (version !== VERSION) return { ok: false, reason: "unsupported_version" };
    if (!/^[0-9a-f]{64}$/.test(hex)) return { ok: false, reason: "malformed" };

    const expected = createHmac("sha256", input.secret)
        .update(
            canonicalInstanceString({
                method: input.method,
                pathWithQuery: input.pathWithQuery,
                body: input.body,
                timestamp: timestampHeader.trim(),
            }),
        )
        .digest();
    const given = Buffer.from(hex, "hex");
    if (given.length !== expected.length) return { ok: false, reason: "bad_signature" };
    return timingSafeEqual(given, expected) ? { ok: true } : { ok: false, reason: "bad_signature" };
}

/** INSTANCE_ADMIN_SECRET from the container env, or null (→ 503). Read per request. */
export function getInstanceSecret(): string | null {
    const secret = runtimeEnv("INSTANCE_ADMIN_SECRET");
    return secret && secret.length >= 16 ? secret : null;
}
