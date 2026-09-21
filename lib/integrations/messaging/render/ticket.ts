/**
 * Ticket messaging renderers.
 */

import type { RenderedMessage } from "@/lib/integrations/messaging/types";

// Ticket renderers — P1
export function renderTicketCreated(_data: unknown): never {
  throw new Error("Not implemented: ticket renderers ship in P1");
}
