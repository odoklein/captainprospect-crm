/**
 * API keys must never reach a log or an error tracker. The MCP endpoint can
 * receive the key in its URL (ChatGPT's connector has no header option), and
 * Sentry records request URLs, so every event is scrubbed before it leaves:
 * any `cp_live_…` token is replaced wherever it appears — URL, query string,
 * span attributes, breadcrumbs, messages.
 */
const KEY_PATTERN = /cp_live_[A-Za-z0-9_]+/g;
export const REDACTED_KEY = "cp_live_[redacted]";

export function redactApiKeys(text: string): string {
  return text.replace(KEY_PATTERN, REDACTED_KEY);
}

/** Deep-scrub any JSON-serialisable event (Sentry error, transaction, breadcrumb). */
export function scrubApiKeys<T>(event: T): T {
  try {
    const raw = JSON.stringify(event);
    return raw && KEY_PATTERN.test(raw) ? (JSON.parse(redactApiKeys(raw)) as T) : event;
  } finally {
    KEY_PATTERN.lastIndex = 0;
  }
}
