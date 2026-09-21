/**
 * ============================================================
 * MESSAGING INTEGRATION — EVENTS
 * ============================================================
 * Main entry point for emitting CRM events.
 */

import { resolveRoutes } from './router';
import { enqueue } from './outbox';
import type { CrmEvent } from './types';
import { EVENT_SEVERITY } from './types';

/**
 * The single entry point for all CRM → messaging events.
 * Resolves routes, enqueues outbox rows, and optionally triggers
 * immediate processing via the fast path.
 *
 * This function never throws — messaging is never a dependency
 * of the business logic that triggers it.
 */
export async function emitCrmEvent(event: CrmEvent): Promise<void> {
  try {
    // 1. Default severity from EVENT_SEVERITY if not overridden
    const severity = event.severity ?? EVENT_SEVERITY[event.type] ?? 0;
    const eventWithSeverity = { ...event, severity };

    // 2. Resolve routes
    const routes = await resolveRoutes(eventWithSeverity);
    if (routes.length === 0) return;

    // 3. Enqueue
    await enqueue(eventWithSeverity, routes);

    // 4. Log for observability
    console.log(`[messaging] Enqueued ${routes.length} route(s) for ${event.type}:${event.entityId}`);
  } catch (error) {
    // Never throw — log and move on
    console.error('[messaging] Failed to emit event:', event.type, error);
  }
}
