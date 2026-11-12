// ============================================
// INTEGRATION KEYS (read side) — the drop-in for process.env.<KEY>.
//
//   const apiKey = integrationKey("OPENAI_API_KEY");   // string | undefined
//
// Synchronous on purpose: constructors, module helpers and route handlers all
// read keys, and none of them should have to become async for it. Values come
// from an in-process snapshot of the encrypted store (lib/integrations/store),
// loaded before the first request (instrumentation.ts), replaced right after a
// write in this process, and refreshed in the background when older than 30 s
// (so a second process converges on its own). No import of Prisma here: the
// store registers itself as the refresher.
//
// Precedence: stored value → container env → undefined (feature off).
// ============================================

import type { IntegrationKeyName } from "./catalog";

export type IntegrationKeySource = "stored" | "env" | "none";

type SnapshotState = {
    values: Map<string, string>;
    loadedAt: number;
    refresh: (() => Promise<void>) | null;
    inflight: Promise<void> | null;
};

const STALE_MS = 30_000;

const g = globalThis as typeof globalThis & { __integrationKeys?: SnapshotState };
const state: SnapshotState = (g.__integrationKeys ??= { values: new Map(), loadedAt: 0, refresh: null, inflight: null });

function refreshIfStale(): void {
    if (!state.refresh || state.inflight || Date.now() - state.loadedAt < STALE_MS) return;
    state.inflight = state.refresh()
        .catch(() => undefined)
        .finally(() => {
            state.inflight = null;
        });
}

function envValue(name: string): string | undefined {
    return process.env[name]?.trim() || undefined;
}

export function integrationKey(name: IntegrationKeyName): string | undefined {
    refreshIfStale();
    return state.values.get(name) || envValue(name);
}

export function integrationKeySource(name: IntegrationKeyName): IntegrationKeySource {
    if (state.values.get(name)) return "stored";
    return envValue(name) ? "env" : "none";
}

// ── store side ──────────────────────────────────────────────────────────────

export function replaceIntegrationSnapshot(values: Map<string, string>): void {
    state.values = values;
    state.loadedAt = Date.now();
}

/** Keeps the current values but waits STALE_MS before trying again (failed load). */
export function markIntegrationSnapshotTried(): void {
    state.loadedAt = Date.now();
}

export function registerIntegrationRefresher(refresh: () => Promise<void>): void {
    state.refresh = refresh;
}
