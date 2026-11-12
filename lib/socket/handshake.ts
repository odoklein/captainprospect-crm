// ============================================
// SOCKET HANDSHAKE TOKEN (pure) — proves to the comms socket server which
// instance and which user a connection belongs to.
//
// The socket server is shared by every agency instance, so it must (1) keep one
// room per instance, so `online-users` and messages never cross agencies, and
// (2) not trust the `userId` a browser claims. The CRM mints a short-lived token
// for the logged-in user (GET /api/comms/socket-token); the browser passes it as
// `auth: { token }` when it connects; the server verifies it with that
// instance's INSTANCE_ADMIN_SECRET (from the control plane's registry, looked up
// by the id in the token) and joins the socket to room `inst:<instanceId>`.
// Copy this file into the socket server as-is.
//
//   token = v1.<instanceId>.<base64url {u: userId, t: issuedAt}>.<base64url hmac>
//   hmac  = HMAC-SHA256(HMAC-SHA256(adminSecret, "socket-v1"), `${instanceId}.${payload}`)
// ============================================

import { createHmac, timingSafeEqual } from "node:crypto";

export const SOCKET_TOKEN_VERSION = "v1";
export const SOCKET_TOKEN_MAX_AGE_MS = 5 * 60 * 1000;
const INSTANCE_ID = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function mac(adminSecret: string, instanceId: string, payload: string): string {
    const key = createHmac("sha256", adminSecret).update("socket-v1").digest();
    return createHmac("sha256", key).update(`${instanceId}.${payload}`).digest("base64url");
}

export function signSocketToken(input: { instanceId: string; userId: string; adminSecret: string; now?: number }): string {
    if (!INSTANCE_ID.test(input.instanceId)) throw new Error("invalid_instance_id");
    const payload = Buffer.from(JSON.stringify({ u: input.userId, t: input.now ?? Date.now() })).toString("base64url");
    return [SOCKET_TOKEN_VERSION, input.instanceId, payload, mac(input.adminSecret, input.instanceId, payload)].join(".");
}

/** Instance id a token claims, UNVERIFIED: only to find which secret to verify with. */
export function peekSocketInstanceId(token: unknown): string | null {
    if (typeof token !== "string") return null;
    const parts = token.split(".");
    return parts.length === 4 && parts[0] === SOCKET_TOKEN_VERSION && INSTANCE_ID.test(parts[1]) ? parts[1] : null;
}

export type SocketTokenVerification =
    | { ok: true; instanceId: string; userId: string }
    | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifySocketToken(input: { token: unknown; adminSecret: string; now?: number; maxAgeMs?: number }): SocketTokenVerification {
    const instanceId = peekSocketInstanceId(input.token);
    if (!instanceId) return { ok: false, reason: "malformed" };
    const [, , payload, sig] = (input.token as string).split(".");

    const expected = Buffer.from(mac(input.adminSecret, instanceId, payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "bad_signature" };

    let body: { u?: unknown; t?: unknown };
    try {
        body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
        return { ok: false, reason: "malformed" };
    }
    if (typeof body.u !== "string" || !body.u || typeof body.t !== "number") return { ok: false, reason: "malformed" };
    const now = input.now ?? Date.now();
    if (now - body.t > (input.maxAgeMs ?? SOCKET_TOKEN_MAX_AGE_MS) || body.t - now > 60_000) return { ok: false, reason: "expired" };
    return { ok: true, instanceId, userId: body.u };
}

/** Room every socket of an instance joins; broadcasts go to this room, never to the whole server. */
export function socketRoomFor(instanceId: string): string {
    return `inst:${instanceId}`;
}
