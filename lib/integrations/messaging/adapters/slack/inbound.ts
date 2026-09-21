/**
 * ============================================================
 * SLACK INBOUND EVENTS
 * ============================================================
 */

import type { InboundEvent } from "@/lib/integrations/messaging/types";

/**
 * Parse a Slack Events API payload into InboundEvent objects.
 * Full implementation ships in P2 (support two-way).
 */
export function parseSlackEvent(_payload: unknown): InboundEvent[] {
  // P2: parse message events, reaction events, etc.
  return [];
}

/**
 * Handle Slack url_verification challenge.
 * Returns the challenge string if this is a verification request, null otherwise.
 */
export function handleUrlVerification(body: Record<string, unknown>): string | null {
  if (body.type === "url_verification" && typeof body.challenge === "string") {
    return body.challenge;
  }
  return null;
}
