// ============================================
// USER SESSIONS
// One row per sign-in. Lets a manager see which devices/IPs are logged in as
// a user and revoke them ("Force logout") — see prisma/schema.prisma UserSession.
// ============================================

import { prisma } from "./prisma";
import { getCountryFromIp } from "./geo-ip";

const MAX_UA_LENGTH = 512;

// ------------------------------------------------------------------
// Validity cache
// A per-instance, short-TTL cache so a revocation check doesn't cost a DB
// round trip on every single API request. This means a revoke or
// deactivation can take up to SESSION_CACHE_TTL_MS to take effect on a
// server instance that had already cached "valid" for that user — accepted
// trade-off; this is defense in depth on top of the 8h JWT expiry, not the
// only gate.
// ------------------------------------------------------------------
const SESSION_CACHE_TTL_MS = 20_000;
interface CacheEntry {
    valid: boolean;
    expiresAt: number;
}
const validityCache = new Map<string, CacheEntry>();

function cacheKey(userId: string, sessionId: string | null | undefined): string {
    return `${userId}:${sessionId ?? ""}`;
}

/** Drops every cached entry for this user (all of their sessionIds). */
export function invalidateUserSessionCache(userId: string): void {
    const prefix = `${userId}:`;
    for (const key of validityCache.keys()) {
        if (key.startsWith(prefix)) validityCache.delete(key);
    }
}

export interface CreateUserSessionParams {
    userId: string;
    ip?: string | null;
    userAgent?: string | null;
}

/**
 * Creates a UserSession row for a fresh sign-in and returns its id (to be
 * embedded in the JWT as token.sessionId). Country is resolved async, same
 * pattern as recordAuthEvent.
 */
export async function createUserSession({
    userId,
    ip,
    userAgent,
}: CreateUserSessionParams): Promise<string> {
    const session = await prisma.userSession.create({
        data: {
            userId,
            ip: ip ?? null,
            userAgent: userAgent ? userAgent.slice(0, MAX_UA_LENGTH) : null,
        },
        select: { id: true },
    });

    if (ip) {
        getCountryFromIp(ip)
            .then((country) => {
                if (country) {
                    prisma.userSession
                        .update({ where: { id: session.id }, data: { country } })
                        .catch(() => {});
                }
            })
            .catch(() => {});
    }

    return session.id;
}

/**
 * Checks whether a user is still active AND (when a sessionId is given)
 * that specific session hasn't been revoked. Used on every authenticated
 * API request via sessionFromToken. Fails OPEN on unexpected DB errors so a
 * transient outage doesn't lock everyone out — this check is defense in
 * depth, not the primary auth gate.
 */
export async function isSessionValid(
    userId: string,
    sessionId: string | null | undefined
): Promise<boolean> {
    const key = cacheKey(userId, sessionId);
    const cached = validityCache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.valid;

    let valid = true;
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { isActive: true },
        });
        if (!user || user.isActive === false) {
            valid = false;
        } else if (sessionId) {
            const session = await prisma.userSession.findUnique({
                where: { id: sessionId },
                select: { revokedAt: true },
            });
            if (!session || session.revokedAt) valid = false;
        }
    } catch {
        valid = true;
    }

    validityCache.set(key, { valid, expiresAt: now + SESSION_CACHE_TTL_MS });
    return valid;
}

// ------------------------------------------------------------------
// Heartbeat (lastSeenAt), throttled so we don't write on every request
// ------------------------------------------------------------------
const TOUCH_THROTTLE_MS = 2 * 60 * 1000;
const lastTouchAt = new Map<string, number>();

export function touchUserSession(sessionId: string): void {
    const now = Date.now();
    const last = lastTouchAt.get(sessionId) ?? 0;
    if (now - last < TOUCH_THROTTLE_MS) return;
    lastTouchAt.set(sessionId, now);
    prisma.userSession
        .update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } })
        .catch(() => {});
}

// ------------------------------------------------------------------
// Revocation
// ------------------------------------------------------------------
export type RevokeReason =
    | "DEACTIVATED"
    | "MANAGER_REVOKED"
    | "FORCE_LOGOUT"
    | "SELF_LOGOUT_OTHERS";

export async function revokeSession(
    sessionId: string,
    revokedById: string,
    reason: RevokeReason
): Promise<{ userId: string } | null> {
    try {
        const session = await prisma.userSession.update({
            where: { id: sessionId },
            data: { revokedAt: new Date(), revokedById, revokedReason: reason },
            select: { userId: true },
        });
        invalidateUserSessionCache(session.userId);
        return session;
    } catch {
        return null; // already gone / bad id — caller returns 404
    }
}

/**
 * Revokes every still-active session for a user. Pass exceptSessionId to
 * keep the caller's own current session alive ("log out other devices").
 */
export async function revokeAllUserSessions(
    userId: string,
    revokedById: string,
    reason: RevokeReason,
    exceptSessionId?: string | null
): Promise<number> {
    const result = await prisma.userSession.updateMany({
        where: {
            userId,
            revokedAt: null,
            ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
        },
        data: { revokedAt: new Date(), revokedById, revokedReason: reason },
    });
    invalidateUserSessionCache(userId);
    return result.count;
}

// ------------------------------------------------------------------
// Listing
// ------------------------------------------------------------------
export interface UserSessionRow {
    id: string;
    ip: string | null;
    country: string | null;
    userAgent: string | null;
    createdAt: Date;
    lastSeenAt: Date;
    revokedAt: Date | null;
    revokedReason: string | null;
}

export async function listUserSessions(userId: string): Promise<UserSessionRow[]> {
    return prisma.userSession.findMany({
        where: { userId },
        orderBy: { lastSeenAt: "desc" },
        take: 50,
        select: {
            id: true,
            ip: true,
            country: true,
            userAgent: true,
            createdAt: true,
            lastSeenAt: true,
            revokedAt: true,
            revokedReason: true,
        },
    });
}

/** Deletes revoked/stale sessions older than retentionDays. Returns count deleted. */
export async function deleteOldUserSessions(retentionDays = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const result = await prisma.userSession.deleteMany({
        where: {
            OR: [{ revokedAt: { lt: cutoff } }, { lastSeenAt: { lt: cutoff } }],
        },
    });
    return result.count;
}
