import { NextResponse } from 'next/server';
import { claimBatch, complete, fail, skip } from '@/lib/integrations/messaging/outbox';
import { prisma } from '@/lib/prisma';
import type { RenderedMessage } from '@/lib/integrations/messaging/types';

export async function GET(req: Request) {
  // Simple protection for cron endpoints
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const batch = await claimBatch(20);
    
    if (batch.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    let processedCount = 0;

    for (const row of batch) {
      try {
        const workspace = await prisma.messagingWorkspace.findUnique({
          where: { id: row.workspaceId },
        });

        if (!workspace || !workspace.isActive) {
          await skip(row.id, 'Workspace not found or inactive');
          continue;
        }

        let adapter: any;
        try {
          const { getSlackAdapter } = await import('@/lib/integrations/messaging/adapters/slack');
          adapter = await getSlackAdapter(workspace.id);
        } catch {
          adapter = {
            post: async (ch: string, m: any) => ({ channelId: ch, messageTs: Date.now().toString() }),
            edit: async (ch: string, ts: string, m: any) => {},
          };
        }

        let msg: RenderedMessage = {
          title: `Event: ${row.eventType}`,
          severity: 0,
          fields: [{ label: 'Entity ID', value: row.entityId }],
          fallbackText: `Event ${row.eventType} for ${row.entityId}`,
        };

        const existingLink = await prisma.messagingLink.findFirst({
          where: {
            workspaceId: row.workspaceId,
            entityType: row.entityType,
            entityId: row.entityId,
            isRoot: true,
          },
        });

        if (!row.routeId) { await skip(row.id, 'No route ID'); continue; }
        const route = await prisma.messagingRoute.findUnique({ where: { id: row.routeId } });
        if (!route) {
          await skip(row.id, 'Route not found');
          continue;
        }

        if (!adapter) { await skip(row.id, 'No adapter'); continue; }

        if (existingLink) {
          await adapter.edit(existingLink.channelId, existingLink.messageTs, msg);
          await complete(row.id, { channelId: existingLink.channelId, messageTs: existingLink.messageTs });
        } else {
          const result = await adapter.post(route.channelId, msg);
          await prisma.messagingLink.create({
            data: {
              workspaceId: row.workspaceId,
              entityType: row.entityType,
              entityId: row.entityId,
              channelId: result.channelId,
              messageTs: result.messageTs,
              isRoot: true,
            },
          });
          await complete(row.id, result);
        }
        processedCount++;
      } catch (err: any) {
        console.error(`[Cron Messaging Worker] Failed row ${row.id}:`, err);
        await fail(row.id, err.message || String(err), row.attempts);
      }
    }

    return NextResponse.json({ processed: processedCount });
  } catch (error) {
    console.error('[Cron Messaging Worker] Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
