/**
 * ============================================================
 * MESSAGING INTEGRATION — REDACTION
 * ============================================================
 * Strip internal information from client-facing messages.
 */

import type { RenderedMessage } from './types';
import type { MessagingVisibility } from '@prisma/client';

/**
 * Apply redaction rules based on channel visibility.
 * INTERNAL: no redaction (return as-is).
 * CLIENT_SHARED: strip SDR notes, call transcriptions, prospect PII, etc.
 *
 * Full implementation ships in P1 when client-shared channels are enabled.
 */
export function redact(
  message: RenderedMessage,
  visibility: MessagingVisibility,
): RenderedMessage {
  if (visibility === 'INTERNAL') return message;

  // P1: implement CLIENT_SHARED redaction
  console.warn('[messaging:redaction] CLIENT_SHARED redaction not yet implemented — returning unredacted');
  return message;
}
