/**
 * ============================================================
 * MESSAGING INTEGRATION — IDENTITY
 * ============================================================
 * Resolve messaging identities.
 */

import { prisma } from '@/lib/prisma';

/** Resolve a chat platform user to a CRM User. Returns null if unlinked. */
export async function resolveIdentity(
  workspaceId: string,
  externalUserId: string,
): Promise<{ userId: string; userName: string } | null> {
  const identity = await prisma.messagingIdentity.findUnique({
    where: { workspaceId_externalUserId: { workspaceId, externalUserId } },
    include: { user: { select: { id: true, name: true } } },
  });
  
  if (!identity) return null;
  
  // Update lastSeenAt (fire-and-forget)
  prisma.messagingIdentity.update({
    where: { id: identity.id },
    data: { lastSeenAt: new Date() },
  }).catch(() => {});

  return { userId: identity.user.id, userName: identity.user.name ?? '' };
}
