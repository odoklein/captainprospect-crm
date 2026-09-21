/**
 * ============================================================
 * MESSAGING INTEGRATION — ROUTER
 * ============================================================
 * Route resolver for the messaging bus.
 */

import { prisma } from '@/lib/prisma';
import type { MessagingRoute } from '@prisma/client';
import type { CrmEvent } from './types';
import { EVENT_SEVERITY } from './types';

/**
 * Match an event type against a pattern.
 * - Empty pattern matches everything.
 * - `*` at the end matches any suffix.
 * - Exact match otherwise.
 */
export function matchEventType(pattern: string, eventType: string): boolean {
  if (!pattern) return true;
  if (pattern === eventType) return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -1);
    return eventType.startsWith(prefix);
  }
  return false;
}

/**
 * Resolve which routes match a given CRM event.
 * Precedence: mission > client > global (most specific wins).
 *
 * If a mission-scoped route matches, client- and global-scoped routes for
 * the SAME channel are excluded. Same for client vs global.
 */
export async function resolveRoutes(event: CrmEvent): Promise<MessagingRoute[]> {
  // 1. Query all active routes from all active workspaces
  const allRoutes = await prisma.messagingRoute.findMany({
    where: {
      workspace: {
        isActive: true,
      },
    },
  });

  // 2 & 3. Filter by event type, scope, and severity
  const severity = event.severity ?? EVENT_SEVERITY[event.type] ?? 0;
  
  const matched = allRoutes.filter(r => {
    if (r.missionId && r.missionId !== event.missionId) return false;
    if (r.clientId && !r.missionId && r.clientId !== event.clientId) return false;
    if (r.eventTypes.length > 0 && !r.eventTypes.some(pattern => matchEventType(pattern, event.type))) return false;
    if (severity < r.minSeverity) return false;
    return true;
  });

  // 4. Apply precedence: group by channelId, keep most specific scope
  const grouped = new Map<string, MessagingRoute[]>();
  for (const r of matched) {
    if (!grouped.has(r.channelId)) {
      grouped.set(r.channelId, []);
    }
    grouped.get(r.channelId)!.push(r);
  }

  const result: MessagingRoute[] = [];

  for (const routes of grouped.values()) {
    const missionRoutes = routes.filter(r => r.missionId);
    const clientRoutes = routes.filter(r => r.clientId && !r.missionId);
    const globalRoutes = routes.filter(r => !r.clientId && !r.missionId);

    if (missionRoutes.length > 0) {
      result.push(...missionRoutes);
    } else if (clientRoutes.length > 0) {
      result.push(...clientRoutes);
    } else {
      result.push(...globalRoutes);
    }
  }

  // 5. Return matched routes
  return result;
}
