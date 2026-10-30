/**
 * Bounded retry for provider calls.
 *
 * The provider is called with raw `fetch`, so this is the only retry layer —
 * nothing underneath retries on its own. It retries what the error marks as
 * transient (429, 5xx, network, time-to-first-byte timeout) and nothing else:
 * a 400, a 401 or a cancelled request fails at once. It never waits past the
 * turn deadline and stops sleeping the moment the turn is aborted.
 */

export interface RetryInfo {
    attempt: number;
    delayMs: number;
    error: unknown;
}

export interface RetryOptions {
    maxRetries: number;
    /** Epoch ms after which no new attempt starts. */
    deadlineAt: number;
    signal?: AbortSignal;
    isRetryable: (error: unknown) => boolean;
    /** Server hint (Retry-After), when the error carries one. */
    retryAfterMs?: (error: unknown) => number | undefined;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (info: RetryInfo) => void;
    /** Injected in tests. */
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    random?: () => number;
    now?: () => number;
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal?.reason);
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

/** Full-jitter exponential backoff, capped; a Retry-After hint wins when larger. */
export function backoffDelay(attempt: number, base: number, cap: number, random: () => number, hint?: number): number {
    const exp = Math.min(cap, base * 2 ** (attempt - 1));
    const jittered = Math.round(exp / 2 + random() * (exp / 2));
    return hint !== undefined ? Math.min(cap * 2, Math.max(jittered, hint)) : jittered;
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
    const sleep = options.sleep ?? abortableSleep;
    const random = options.random ?? Math.random;
    const now = options.now ?? Date.now;
    const base = options.baseDelayMs ?? 400;
    const cap = options.maxDelayMs ?? 4_000;

    for (let attempt = 1; ; attempt++) {
        try {
            return await fn(attempt);
        } catch (error) {
            if (attempt > options.maxRetries || !options.isRetryable(error) || options.signal?.aborted) throw error;
            const delayMs = backoffDelay(attempt, base, cap, random, options.retryAfterMs?.(error));
            // A retry that cannot finish before the deadline only delays the error.
            if (now() + delayMs >= options.deadlineAt) throw error;
            options.onRetry?.({ attempt, delayMs, error });
            await sleep(delayMs, options.signal);
        }
    }
}
