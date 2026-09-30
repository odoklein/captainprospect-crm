import { createHash } from "crypto";
import { prisma } from "./prisma";
import { getCountryFromIp } from "./geo-ip";
import type { AuthOutcome } from "@prisma/client";

export type { AuthOutcome };

export function hashEmail(email: string): string {
    return createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
}

interface RecordParams {
    outcome: AuthOutcome;
    userId?: string | null;
    email?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    usedMasterPassword?: boolean;
    eventTag?: "PASSWORD_RECOVERY_REQUEST" | "PASSWORD_RECOVERY_SUCCESS";
}

/**
 * Fire-and-forget: writes an AuthEvent row, then resolves country async.
 * Never throws — auth flow must not be blocked by logging failures.
 */
export function recordAuthEvent(params: RecordParams): void {
    const {
        outcome,
        userId,
        email,
        ip,
        userAgent,
        usedMasterPassword = false,
        eventTag,
    } = params;

    const emailHash =
        outcome === "UNKNOWN_USER" && email && !userId
            ? hashEmail(email)
            : undefined;

    const taggedUserAgent = eventTag
        ? `AUTH_EVT:${eventTag}${userAgent ? ` | ${userAgent}` : ""}`
        : userAgent;

    const data: Parameters<typeof prisma.authEvent.create>[0]["data"] = {
        outcome,
        ip: ip ?? null,
        userAgent: taggedUserAgent ? taggedUserAgent.slice(0, 512) : null,
        usedMasterPassword,
        emailHash: emailHash ?? null,
    };

    if (userId) data.userId = userId;

    prisma.authEvent
        .create({ data })
        .then(async (event) => {
            if (!ip) return;
            const country = await getCountryFromIp(ip).catch(() => null);
            if (country) {
                await prisma.authEvent
                    .update({ where: { id: event.id }, data: { country } })
                    .catch(() => {});
            }
        })
        .catch(() => {});
}

export interface AuthEventRow {
    id: string;
    outcome: AuthOutcome;
    ip: string | null;
    country: string | null;
    userAgent: string | null;
    usedMasterPassword: boolean;
    createdAt: Date;
}

export async function getAuthEvents(
    userId: string,
    options: { limit?: number; offset?: number; outcome?: AuthOutcome } = {}
): Promise<{ events: AuthEventRow[]; total: number }> {
    const { limit = 30, offset = 0, outcome } = options;
    const where = { userId, ...(outcome ? { outcome } : {}) };

    const [events, total] = await Promise.all([
        prisma.authEvent.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: limit,
            skip: offset,
            select: {
                id: true,
                outcome: true,
                ip: true,
                country: true,
                userAgent: true,
                usedMasterPassword: true,
                createdAt: true,
            },
        }),
        prisma.authEvent.count({ where }),
    ]);

    return { events, total };
}

export type AuthEventViewAction =
    | "VIEW_HISTORY"
    | "EXPORT_HISTORY"
    | "VIEW_SESSIONS"
    | "REVOKE_SESSION"
    | "FORCE_LOGOUT";

export async function logAuthEventView(
    viewerId: string,
    targetUserId: string,
    action: AuthEventViewAction = "VIEW_HISTORY"
): Promise<void> {
    await prisma.authEventView.create({
        data: { viewerId, targetUserId, action },
    });
}

/**
 * Deletes auth events older than retentionDays. Returns count deleted.
 */
export async function deleteOldAuthEvents(retentionDays = 90): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const result = await prisma.authEvent.deleteMany({
        where: { createdAt: { lt: cutoff } },
    });
    return result.count;
}
