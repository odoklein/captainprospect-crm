/**
 * Digest messaging renderers.
 */

import type { RenderedMessage } from "@/lib/integrations/messaging/types";

// Digest renderers — P4
export function renderDigest(_data: unknown): never {
  throw new Error("Not implemented: digest renderers ship in P4");
}
