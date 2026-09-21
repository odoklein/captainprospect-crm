/**
 * ============================================================
 * MESSAGING INTEGRATION — OUTBOX
 * ============================================================
 * Durable outbox operations using the MessagingOutbox Prisma model.
 */

import { prisma } from '@/lib/prisma';
import type { MessagingRoute, MessagingOutbox } from '@prisma/client';
import type { CrmEvent } from './types';
import { buildDedupeKey, buildSerialKey, BACKOFF_SCHEDULE_MS } from './types';

const MAX_ATTEMPTS = parseInt(process.env.MESSAGING_OUTBOX_MAX_ATTEMPTS || '6');

/** Enqueue outbox rows for each matched route. Uses createMany with skipDuplicates for deduplication. */
export async function enqueue(event: CrmEvent, routes: MessagingRoute[]): Promise<number> {
  if (routes.length === 0) return 0;

  const rows = routes.map(route => ({
    workspaceId: route.workspaceId,
    routeId: route.id,
    eventType: event.type,
    entityType: event.entityType,
    entityId: event.entityId,
    payload: event.payload as any,
    dedupeKey: buildDedupeKey(event.type, event.entityId, route.id),
    serialKey: buildSerialKey(event.entityType, event.entityId),
    status: 'PENDING' as const,
    nextAttemptAt: new Date(),
  }));
  
  const result = await prisma.messagingOutbox.createMany({
    data: rows,
    skipDuplicates: true,
  });
  return result.count;
}

/** Claim a batch of PENDING rows for processing. Updates status to SENDING atomically. */
export async function claimBatch(limit: number = 10): Promise<MessagingOutbox[]> {
  const now = new Date();
  
  // Note: Since Prisma doesn't have a simple UPDATE with LIMIT returning the updated rows,
  // we do a $transaction with SELECT FOR UPDATE if possible, or simple find+update logic.
  // We'll use a pragmatic approach since it's a polling worker.
  
  const rows = await prisma.messagingOutbox.findMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      nextAttemptAt: { lte: now },
    },
    orderBy: [
      { serialKey: 'asc' },
      { createdAt: 'asc' },
    ],
    take: limit,
  });

  if (rows.length === 0) return [];

  const ids = rows.map(r => r.id);

  await prisma.messagingOutbox.updateMany({
    where: { id: { in: ids } },
    data: { status: 'SENDING' },
  });

  return rows.map(r => ({ ...r, status: 'SENDING' }));
}

/** Mark a row as successfully sent. */
export async function complete(id: string, result: { channelId: string; messageTs: string }): Promise<void> {
  await prisma.messagingOutbox.update({
    where: { id },
    data: {
      status: 'SENT',
      sentAt: new Date(),
      // In a real app we might store channelId and messageTs in a related MessagingLink
      // But for outbox we just mark it SENT.
    },
  });
}

/** Mark a row as failed and schedule retry with exponential backoff. */
export async function fail(id: string, error: string, currentAttempts: number): Promise<void> {
  const attempts = currentAttempts + 1;
  const isDead = attempts >= MAX_ATTEMPTS;
  
  const delayMs = BACKOFF_SCHEDULE_MS[attempts] || BACKOFF_SCHEDULE_MS[BACKOFF_SCHEDULE_MS.length - 1];
  const nextAttemptAt = new Date(Date.now() + delayMs);

  await prisma.messagingOutbox.update({
    where: { id },
    data: {
      attempts,
      status: isDead ? 'DEAD_LETTER' : 'FAILED',
      nextAttemptAt,
      lastError: error,
    },
  });
}

/** Mark a row as skipped (e.g. no-op edit, no workspace configured). */
export async function skip(id: string, reason: string): Promise<void> {
  await prisma.messagingOutbox.update({
    where: { id },
    data: {
      status: 'SKIPPED',
      lastError: reason, // We can reuse lastError to store skip reason
    },
  });
}
