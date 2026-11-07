// ============================================
// BRAND (server) — this instance's runtime brand, read from BrandSettings.
//
//   const b = await getBrand();          pages, layouts, route handlers, emails
//   const b = await getBrandUncached();  right after a write, scripts
//   invalidateBrand();                   after any write to BrandSettings
//
// Server-only (imports Prisma). Client components use useBrand()
// (lib/brand/client) with the value the root layout passes down.
//
// Cache: one in-process entry, 60 s TTL, shared through globalThis so route
// handlers and server components (separate module instances in Next) see the
// same entry and the same invalidation. One container per instance, so an
// in-process cache is coherent; workers (separate processes) converge within
// the TTL. Never throws: no database (next build), missing table (migration
// not applied yet) or a bad row → brand/brand.config.ts defaults + a warning.
// ============================================

import { prisma } from "@/lib/prisma";
import { mergeBrandSettings, resolveBrand } from "./resolve";
import type { Brand, BrandSettingsValues } from "./types";

export const BRAND_ROW_ID = "default";
const TTL_MS = 60_000;

type Entry = { settings: BrandSettingsValues; brand: Brand; at: number };
type BrandCacheState = { entry: Entry | null; inflight: Promise<Entry> | null; generation: number };

const g = globalThis as typeof globalThis & { __brandCache?: BrandCacheState };
const state: BrandCacheState = (g.__brandCache ??= { entry: null, inflight: null, generation: 0 });

let warned = false;

function toValues(row: Record<string, unknown>): Partial<BrandSettingsValues> {
    const updatedAt = row.updatedAt instanceof Date ? row.updatedAt.toISOString() : (row.updatedAt as string | null);
    return { ...(row as Partial<BrandSettingsValues>), updatedAt: updatedAt ?? null };
}

/** The stored row, or null when there is none or the table cannot be read. */
async function readRow(): Promise<Partial<BrandSettingsValues> | null> {
    try {
        const row = await prisma.brandSettings.findUnique({ where: { id: BRAND_ROW_ID } });
        warned = false;
        return row ? toValues(row as unknown as Record<string, unknown>) : null;
    } catch (err) {
        if (!warned) {
            warned = true;
            console.warn(
                "[brand] BrandSettings unreadable, rendering brand/brand.config.ts defaults:",
                // Prisma messages start with blank lines; keep the first meaningful one.
                err instanceof Error ? err.message.split("\n").map((l) => l.trim()).filter(Boolean).pop() ?? err.name : err,
            );
        }
        return null;
    }
}

async function load(): Promise<Entry> {
    const row = await readRow();
    const settings = mergeBrandSettings(row);
    let brand: Brand;
    try {
        brand = resolveBrand(settings);
    } catch (err) {
        console.warn("[brand] invalid stored brand, using defaults:", err);
        brand = resolveBrand(null);
    }
    return { settings, brand, at: Date.now() };
}

async function getEntry(): Promise<Entry> {
    const e = state.entry;
    if (e && Date.now() - e.at < TTL_MS) return e;
    if (state.inflight) return state.inflight;
    const generation = state.generation;
    const p = load()
        .then((entry) => {
            // A write during the read invalidated it: don't cache stale data.
            if (generation === state.generation) state.entry = entry;
            return entry;
        })
        .finally(() => {
            if (state.inflight === p) state.inflight = null;
        });
    state.inflight = p;
    return p;
}

/** This instance's brand (cached 60 s). Never throws. */
export async function getBrand(): Promise<Brand> {
    return (await getEntry()).brand;
}

/** Stored settings merged over the defaults (what the settings UI edits). Cached. */
export async function getBrandSettings(): Promise<BrandSettingsValues> {
    return (await getEntry()).settings;
}

/** Fresh read, bypassing the cache (scripts, right after a write). Never throws. */
export async function getBrandUncached(): Promise<Brand> {
    return (await load()).brand;
}

/** Drop the cached brand; the next getBrand() reads the database. */
export function invalidateBrand(): void {
    state.generation += 1;
    state.entry = null;
    state.inflight = null;
}
