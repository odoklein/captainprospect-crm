/**
 * Cutting off a client commercial's portal access (ticket #119).
 *
 * A commercial who leaves the client is either deactivated (isActive=false on
 * the ClientInterlocuteur), deleted, or has only their portal revoked. Before
 * this, none of the three touched the COMMERCIAL User properly:
 *   - deleting the commercial left the User alive (FK ON DELETE SET NULL):
 *     still able to log in, email still taken, unreachable from the UI;
 *   - deactivating changed nothing for the User;
 *   - revoking hard-deleted the User, which fails with P2003 as soon as a
 *     manager has looked at their login history (AuthEventView is Restrict),
 *     after the vault password had already been deleted.
 *
 * Order matters: the account is disabled and its sessions killed first, so
 * access is gone even if a later step fails.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revokeAllUserSessions } from "@/lib/user-session";
import { deleteCredential } from "@/lib/vault/service";

/** Disables the account and ends its sessions; the account stays linked, ready to be re-enabled. */
export async function suspendCommercialUser(userId: string, actorId: string): Promise<number> {
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    return revokeAllUserSessions(userId, actorId, "DEACTIVATED").catch(() => 0);
}

/** Re-enables a suspended commercial account (after re-activating the commercial). */
export async function resumeCommercialUser(userId: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
}

export interface RevokeOutcome {
    revokedSessions: number;
    credentialsRemoved: number;
    /** "deleted" = the User row is gone; "detached" = kept (history points at it), disabled, unlinked, email freed. */
    account: "deleted" | "detached";
}

/**
 * Removes the portal account for good: no login, no vault password, the
 * email free for a successor. The User is deleted when nothing references it;
 * otherwise it is kept disabled, unlinked from the commercial, with a
 * rewritten email so the address can be reused.
 */
export async function revokeCommercialPortal(userId: string, actorId: string): Promise<RevokeOutcome> {
    const revokedSessions = await suspendCommercialUser(userId, actorId);

    const credentials = await prisma.vaultCredential.findMany({
        where: { userId, type: "PORTAL" },
        select: { id: true },
    });
    for (const credential of credentials) {
        await deleteCredential(credential.id, actorId);
    }

    try {
        await prisma.user.delete({ where: { id: userId } });
        return { revokedSessions, credentialsRemoved: credentials.length, account: "deleted" };
    } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2003") throw error;
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    await prisma.user.update({
        where: { id: userId },
        data: {
            isActive: false,
            interlocuteurId: null,
            email: `${user?.email ?? userId}.revoque-${stamp}-${userId.slice(-6)}`,
        },
    });
    return { revokedSessions, credentialsRemoved: credentials.length, account: "detached" };
}

/** Drops a deleted commercial's id from the lists that name them as a secondary commercial (no FK there). */
export async function forgetSecondaryCommercial(interlocuteurId: string): Promise<void> {
    const lists = await prisma.list.findMany({
        where: { secondaryCommercialIds: { has: interlocuteurId } },
        select: { id: true, secondaryCommercialIds: true },
    });
    for (const list of lists) {
        await prisma.list.update({
            where: { id: list.id },
            data: { secondaryCommercialIds: list.secondaryCommercialIds.filter((id) => id !== interlocuteurId) },
        });
    }
}
