// ============================================
// OAUTH RELAY STATE (pure) — lets many agency instances share ONE Google /
// Microsoft OAuth app and ONE registered callback URL.
//
// Flow:
//   1. Instance (connect route) builds its usual state, wraps it with
//      wrapRelayState() and sends the user to the provider with
//      redirect_uri = <OAUTH_RELAY_URL>/oauth/<provider>/callback.
//   2. The provider redirects to the relay (a small service run by the control
//      plane) with ?code&state.
//   3. The relay reads the instance id with peekRelayInstanceId(), looks the
//      instance up in ITS OWN registry, verifies the state with
//      verifyRelayState(state, thatInstanceSecret) and redirects the browser to
//      the instance's own callback with the original (inner) state.
//   4. The instance exchanges the code as today (same redirect_uri) and checks
//      its inner state against the logged-in user.
//
// Why signed: the relay must never forward an authorization code to a host an
// attacker picked. The target comes from the relay's registry, never from the
// state; the signature (key derived from the instance's INSTANCE_ADMIN_SECRET,
// which the control plane already holds) proves the state was minted by that
// instance, recently, for that provider. Copy this file into the relay as-is.
// ============================================

import { createHmac, timingSafeEqual } from "node:crypto";

export const RELAY_STATE_VERSION = "v1";
export const RELAY_STATE_MAX_AGE_MS = 10 * 60 * 1000;
export const RELAY_PROVIDERS = ["gmail", "outlook"] as const;
export type RelayProvider = (typeof RELAY_PROVIDERS)[number];

/** Path of the instance's own callback for each provider. */
export const RELAY_TARGET_PATHS: Record<RelayProvider, string> = {
    gmail: "/api/email/oauth/gmail/callback",
    outlook: "/api/email/oauth/outlook/callback",
};

const INSTANCE_ID = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isRelayProvider(v: unknown): v is RelayProvider {
    return typeof v === "string" && (RELAY_PROVIDERS as readonly string[]).includes(v);
}

export function isValidInstanceId(v: unknown): v is string {
    return typeof v === "string" && INSTANCE_ID.test(v);
}

/** Separate key per purpose, so the admin secret itself is never used as a MAC key here. */
function relayKey(adminSecret: string): Buffer {
    return createHmac("sha256", adminSecret).update("oauth-relay-v1").digest();
}

function mac(adminSecret: string, instanceId: string, payload: string): string {
    return createHmac("sha256", relayKey(adminSecret)).update(`${instanceId}.${payload}`).digest("base64url");
}

export function wrapRelayState(input: {
    instanceId: string;
    provider: RelayProvider;
    inner: string;
    adminSecret: string;
    now?: number;
}): string {
    if (!isValidInstanceId(input.instanceId)) throw new Error("invalid_instance_id");
    const payload = Buffer.from(JSON.stringify({ p: input.provider, s: input.inner, t: input.now ?? Date.now() })).toString("base64url");
    return [RELAY_STATE_VERSION, input.instanceId, payload, mac(input.adminSecret, input.instanceId, payload)].join(".");
}

function split(state: string): { instanceId: string; payload: string; sig: string } | null {
    const parts = state.split(".");
    if (parts.length !== 4 || parts[0] !== RELAY_STATE_VERSION || !isValidInstanceId(parts[1])) return null;
    return { instanceId: parts[1], payload: parts[2], sig: parts[3] };
}

/** Instance id claimed by a state, UNVERIFIED: only good for finding which secret to verify with. */
export function peekRelayInstanceId(state: string | null | undefined): string | null {
    return state ? (split(state)?.instanceId ?? null) : null;
}

export type RelayVerification =
    | { ok: true; instanceId: string; provider: RelayProvider; inner: string }
    | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "provider_mismatch" };

export function verifyRelayState(input: {
    state: string | null | undefined;
    adminSecret: string;
    /** Provider named in the callback path the relay received. */
    provider: RelayProvider;
    now?: number;
    maxAgeMs?: number;
}): RelayVerification {
    const parts = input.state ? split(input.state) : null;
    if (!parts) return { ok: false, reason: "malformed" };

    const expected = Buffer.from(mac(input.adminSecret, parts.instanceId, parts.payload));
    const given = Buffer.from(parts.sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "bad_signature" };

    let body: { p?: unknown; s?: unknown; t?: unknown };
    try {
        body = JSON.parse(Buffer.from(parts.payload, "base64url").toString("utf8"));
    } catch {
        return { ok: false, reason: "malformed" };
    }
    if (!isRelayProvider(body.p) || typeof body.s !== "string" || typeof body.t !== "number") return { ok: false, reason: "malformed" };
    if (body.p !== input.provider) return { ok: false, reason: "provider_mismatch" };
    const now = input.now ?? Date.now();
    if (now - body.t > (input.maxAgeMs ?? RELAY_STATE_MAX_AGE_MS) || body.t - now > 60_000) return { ok: false, reason: "expired" };
    return { ok: true, instanceId: parts.instanceId, provider: body.p, inner: body.s };
}

// ---------- relay side ----------

export type RelayInstance = { appUrl: string; adminSecret: string };

export type RelayResult =
    | { ok: true; location: string; instanceId: string }
    | { ok: false; status: 400 | 404; error: string };

/**
 * What the relay does for GET /oauth/<provider>/callback?…: find the instance,
 * verify the state, build the redirect to that instance's own callback.
 * `lookup` is the relay's registry (control-plane database), keyed by instance id.
 * Every query parameter the provider sent (code, error, scope…) is forwarded,
 * with `state` replaced by the instance's original state.
 */
export async function resolveRelayCallback(input: {
    provider: string;
    query: URLSearchParams;
    lookup: (instanceId: string) => Promise<RelayInstance | null> | RelayInstance | null;
    now?: number;
}): Promise<RelayResult> {
    if (!isRelayProvider(input.provider)) return { ok: false, status: 404, error: "unknown_provider" };
    const state = input.query.get("state");
    const instanceId = peekRelayInstanceId(state);
    if (!instanceId) return { ok: false, status: 400, error: "malformed_state" };

    const instance = await input.lookup(instanceId);
    if (!instance) return { ok: false, status: 400, error: "unknown_instance" };

    const verified = verifyRelayState({ state, adminSecret: instance.adminSecret, provider: input.provider, now: input.now });
    if (!verified.ok) return { ok: false, status: 400, error: verified.reason };

    const target = new URL(RELAY_TARGET_PATHS[input.provider], instance.appUrl.replace(/\/+$/, "") + "/");
    for (const [k, v] of input.query) if (k !== "state") target.searchParams.append(k, v);
    target.searchParams.set("state", verified.inner);
    return { ok: true, location: target.toString(), instanceId };
}
