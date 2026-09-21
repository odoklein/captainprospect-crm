import 'dotenv/config';
import { prisma } from '@/lib/prisma';
import { claimBatch, complete, fail, skip } from '@/lib/integrations/messaging/outbox';
import type { RenderedMessage } from '@/lib/integrations/messaging/types';

// Dummy imports for adapters and renderers since they may not exist yet
// We will dynamically import or just mock them if they don't exist
async function getAdapter(workspaceId: string) {
  try {
    const { getSlackAdapter } = await import('@/lib/integrations/messaging/adapters/slack');
    return getSlackAdapter(workspaceId);
  } catch (e) {
    // Mock adapter
    return {
      post: async (ch: string, msg: any) => ({ channelId: ch, messageTs: `ts-${Date.now()}` }),
      edit: async (ch: string, ts: string, msg: any) => {},
    };
  }
}

async function runWorker() {
  console.log('[Messaging Worker] Started. Polling outbox...');

  while (true) {
    try {
      const batch = await claimBatch(10);
      
      if (batch.length > 0) {
        for (const row of batch) {
          try {
            // a. Look up workspace
            const workspace = await prisma.messagingWorkspace.findUnique({
              where: { id: row.workspaceId },
            });

            // b. If no workspace or not active -> skip
            if (!workspace || !workspace.isActive) {
              await skip(row.id, 'Workspace not found or inactive');
              continue;
            }

            // c. Instantiate adapter
            const adapter = await getAdapter(workspace.id);

            // d. Render message
            let msg: RenderedMessage;
            if (row.eventType.startsWith('support.')) {
              try {
                const { renderSupportConversationCreated } = await import('@/lib/integrations/messaging/render/support');
                msg = renderSupportConversationCreated(row.payload as any);
              } catch {
                msg = { title: row.eventType, severity: 0, fields: [], fallbackText: row.eventType };
              }
            } else if (row.eventType === 'rdv.no_show_reported') {
              try {
                const { renderNoShowReport } = await import('@/lib/integrations/messaging/render/rdv');
                msg = renderNoShowReport(row.payload as any);
              } catch {
                msg = { title: row.eventType, severity: 0, fields: [], fallbackText: row.eventType };
              }
            } else {
              msg = {
                title: `Event: ${row.eventType}`,
                severity: 0,
                fields: [{ label: 'Entity ID', value: row.entityId }],
                fallbackText: `Event ${row.eventType} for ${row.entityId}`,
              };
            }

            // e. Check for existing MessagingLink
            const existingLink = await prisma.messagingLink.findFirst({
              where: {
                workspaceId: row.workspaceId,
                entityType: row.entityType,
                entityId: row.entityId,
                isRoot: true,
              },
            });

            // f. Post or edit via adapter
            if (!row.routeId) { await skip(row.id, 'No route ID'); continue; }
            const route = await prisma.messagingRoute.findUnique({ where: { id: row.routeId } });
            if (!route) {
              await skip(row.id, 'Route not found');
              continue;
            }

            if (!adapter) {
              await skip(row.id, 'Adapter not initialized');
              continue;
            }

            if (existingLink) {
              await adapter.edit(existingLink.channelId, existingLink.messageTs, msg);
              await complete(row.id, { channelId: existingLink.channelId, messageTs: existingLink.messageTs });
            } else {
              const result = await adapter.post(route.channelId, msg);
              // g. Create MessagingLink on success
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
              // h. Call complete
              await complete(row.id, result);
            }
          } catch (err: any) {
            console.error(`[Messaging Worker] Failed row ${row.id}:`, err);
            await fail(row.id, err.message || String(err), row.attempts);
          }
        }
      } else {
        // 4. Wait 2 seconds between polls if no work found
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (err) {
      console.error('[Messaging Worker] Poll error:', err);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// 5. Handle SIGTERM for graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Messaging Worker] SIGTERM received, shutting down gracefully...');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[Messaging Worker] SIGINT received, shutting down gracefully...');
  process.exit(0);
});

if (require.main === module) {
  runWorker();
}
