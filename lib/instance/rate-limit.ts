// ============================================
// INSTANCE API RATE LIMIT — fixed 60 s window per IP + route, in memory.
// One container per instance, so a process-local counter is enough. Checked
// before the signature, so a flood of bad signatures is throttled too.
// ============================================

import { LRUCache } from "lru-cache";

const WINDOW_MS = 60_000;
export const INSTANCE_RATE_LIMIT = 30;

type Window = { count: number; start: number };

const g = globalThis as typeof globalThis & { __instanceRateLimit?: LRUCache<string, Window> };
const windows = (g.__instanceRateLimit ??= new LRUCache<string, Window>({ max: 2000, ttl: WINDOW_MS }));

export function checkInstanceRateLimit(
    ip: string | null,
    route: string,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const key = `${ip ?? "unknown"}|${route}`;
    const now = Date.now();
    const w = windows.get(key);
    if (!w || now - w.start >= WINDOW_MS) {
        windows.set(key, { count: 1, start: now });
        return { allowed: true };
    }
    if (w.count >= INSTANCE_RATE_LIMIT) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((w.start + WINDOW_MS - now) / 1000)) };
    }
    w.count += 1;
    // Keep the original window start; ttl refresh is harmless (start decides).
    windows.set(key, w);
    return { allowed: true };
}
