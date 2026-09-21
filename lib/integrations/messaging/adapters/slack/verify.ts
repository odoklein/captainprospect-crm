/**
 * ============================================================
 * SLACK SIGNATURE VERIFICATION
 * ============================================================
 */

import crypto from "crypto";

const FIVE_MINUTES_S = 5 * 60;

/**
 * Verify a Slack request signature per https://api.slack.com/authentication/verifying-requests-from-slack
 * 
 * The signature is: v0=HMAC-SHA256(signingSecret, `v0:${timestamp}:${rawBody}`)
 * 
 * @returns true if the signature is valid and the timestamp is fresh
 */
export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  // 1. Reject stale timestamps (replay protection)
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > FIVE_MINUTES_S) return false;

  // 2. Compute expected signature
  const baseString = `v0:${timestamp}:${rawBody}`;
  const expected = "v0=" + crypto
    .createHmac("sha256", signingSecret)
    .update(baseString)
    .digest("hex");

  // 3. Timing-safe comparison
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}
