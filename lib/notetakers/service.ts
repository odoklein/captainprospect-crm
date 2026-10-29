// ============================================
// NOTE-TAKERS — server side of the « Appel enregistré » source.
//
//   listNotetakers()                 which tools exist and which ones this agency connected
//   listProviderCalls(id, {query})   recent recordings, or a search over the last `days`
//   getProviderCall(id, callId)      one recording with notes, tasks and transcript
//   testNotetaker(id)                Paramètres › Intégrations « Tester »
//
// Leexi goes through lib/leexi (its own keys and settings route). Every other
// tool is an adapter (./providers) reading its key with integrationKey(): no
// key, tool off. Calls come back in Leexi's shape (./normalize).
// ============================================

import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/api-utils";
import { integrationKey } from "@/lib/integrations/keys";
import {
    getLeexiCall,
    isLeexiAvailable,
    LeexiError,
    listLeexiCalls,
    normalizeContext,
    searchLeexiCalls,
    testLeexiKeys,
    type LeexiCallDetail,
    type LeexiCallSummary,
} from "@/lib/leexi/service";
import { callMatchesQuery } from "@/lib/leexi/normalize";
import { NOTETAKERS, notetakerImportId, type NotetakerDef } from "./catalog";
import { toCallDetail, toCallSummary } from "./normalize";
import { ADAPTERS } from "./providers";
import { NotetakerError, type ListOptions, type NotetakerAdapter, type ProviderPage } from "./types";

export interface NotetakerStatus {
    id: string;
    label: string;
    configured: boolean;
}

export type CallWithImport = LeexiCallSummary & { importedClient: { id: string; name: string } | null };

export interface CallsResult {
    calls: CallWithImport[];
    /** Recordings looked at by a search (scan of recent pages). */
    scanned?: number;
    warning: string | null;
}

function isConfigured(def: NotetakerDef): boolean {
    return def.keys.every((k) => !!integrationKey(k));
}

export async function listNotetakers(): Promise<NotetakerStatus[]> {
    const leexi = await isLeexiAvailable();
    return NOTETAKERS.map((def) => ({
        id: def.id,
        label: def.label,
        configured: def.id === "leexi" ? leexi : isConfigured(def),
    }));
}

function adapterFor(id: string): { def: NotetakerDef; adapter: NotetakerAdapter } {
    const def = NOTETAKERS.find((n) => n.id === id);
    const adapter = ADAPTERS[id];
    if (!def || !adapter) throw new NotetakerError("Outil d'enregistrement inconnu.", 404);
    if (!isConfigured(def)) {
        throw new NotetakerError(`${def.label} n'est pas connecté : un manager doit ajouter sa clé API dans Paramètres › Intégrations.`, 503);
    }
    return { def, adapter };
}

// ============================================
// IMPORTS (which client a call already created)
// ============================================

async function withImports(provider: string, calls: LeexiCallSummary[]): Promise<CallWithImport[]> {
    const ids = calls.map((c) => notetakerImportId(provider, c.id));
    const imports = ids.length
        ? await prisma.leexiCallImport.findMany({
              where: { leexiCallId: { in: ids } },
              select: { leexiCallId: true, client: { select: { id: true, name: true } } },
          })
        : [];
    const byId = new Map(imports.filter((i) => i.client).map((i) => [i.leexiCallId, i.client!]));
    return calls.map((c) => ({ ...c, importedClient: byId.get(notetakerImportId(provider, c.id)) ?? null }));
}

// ============================================
// LIST & SEARCH
// ============================================

const PAGE_TTL_MS = 60_000;
/** A search reads at most this many pages of recent recordings. */
const SCAN_PAGES = 6;

const pageCache = new Map<string, { at: number; page: ProviderPage }>();

async function cachedPage(def: NotetakerDef, adapter: NotetakerAdapter, opts: ListOptions): Promise<ProviderPage> {
    // The key's tail is in the cache key: a replaced key never reads the old account's list.
    const keyTail = def.keys.map((k) => integrationKey(k)?.slice(-6) ?? "").join("|");
    const cacheKey = `${def.id}:${keyTail}:${opts.cursor ?? ""}:${opts.since?.toISOString() ?? ""}`;
    const hit = pageCache.get(cacheKey);
    if (hit && Date.now() - hit.at < PAGE_TTL_MS) return hit.page;
    const page = await adapter.list(opts);
    pageCache.set(cacheKey, { at: Date.now(), page });
    if (pageCache.size > 200) pageCache.delete(pageCache.keys().next().value!);
    return page;
}

function newestFirst(a: LeexiCallSummary, b: LeexiCallSummary): number {
    return (b.date ?? "").localeCompare(a.date ?? "");
}

export async function listProviderCalls(provider: string, { query, days }: { query: string; days: number }): Promise<CallsResult> {
    if (provider === "leexi") {
        if (query) {
            const { data, warning } = await searchLeexiCalls(query, { days });
            return { calls: await withImports(provider, data.calls), scanned: data.scanned, warning };
        }
        const { data, warning } = await listLeexiCalls(1, 50);
        return { calls: await withImports(provider, data.calls), warning };
    }

    const { def, adapter } = adapterFor(provider);
    const ctx = await normalizeContext();

    if (!query) {
        const page = await cachedPage(def, adapter, { cursor: null, since: null });
        const calls = page.meetings.map((m) => toCallSummary(m, ctx)).filter((c) => c.id).sort(newestFirst);
        return { calls: await withImports(provider, calls), warning: null };
    }

    // A day, not an instant: consecutive searches share the page cache.
    const since = new Date(new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10));
    if (adapter.search) {
        const page = await adapter.search(query, { cursor: null, since });
        const calls = page.meetings.map((m) => toCallSummary(m, ctx)).filter((c) => c.id).sort(newestFirst);
        return { calls: await withImports(provider, calls), scanned: calls.length, warning: null };
    }

    const found: LeexiCallSummary[] = [];
    let scanned = 0;
    let cursor: string | null = null;
    for (let i = 0; i < SCAN_PAGES; i++) {
        const page = await cachedPage(def, adapter, { cursor, since });
        const calls = page.meetings.map((m) => toCallSummary(m, ctx)).filter((c) => c.id);
        // Some APIs ignore the date filter: stop at the first page past the window.
        const inWindow = calls.filter((c) => !c.date || new Date(c.date) >= since);
        scanned += inWindow.length;
        found.push(...inWindow.filter((c) => callMatchesQuery(c, query)));
        if (!page.next || inWindow.length < calls.length) break;
        cursor = page.next;
    }
    return { calls: await withImports(provider, found.sort(newestFirst)), scanned, warning: null };
}

export async function getProviderCall(provider: string, callId: string): Promise<{ call: LeexiCallDetail; warning: string | null }> {
    if (provider === "leexi") {
        const { data, warning } = await getLeexiCall(callId);
        return { call: data, warning };
    }
    const { adapter } = adapterFor(provider);
    const [meeting, ctx] = await Promise.all([adapter.get(callId), normalizeContext()]);
    return { call: toCallDetail(meeting, ctx), warning: null };
}

// ============================================
// CONNECTION TEST
// ============================================

export async function testNotetaker(provider: string): Promise<{ ok: boolean; message: string }> {
    if (provider === "leexi") {
        const checks = await testLeexiKeys();
        const ok = checks.find((c) => c.ok);
        return ok ? { ok: true, message: ok.message } : { ok: false, message: checks[0]?.message ?? "Leexi n'est pas configuré." };
    }
    try {
        const { adapter } = adapterFor(provider);
        const page = await adapter.list({ cursor: null, since: null });
        const n = page.meetings.length;
        return {
            ok: true,
            message: n ? `Connexion réussie : ${n}${page.next ? "+" : ""} enregistrement${n > 1 ? "s" : ""} récent${n > 1 ? "s" : ""} accessible${n > 1 ? "s" : ""}.` : "Connexion réussie (aucun enregistrement pour l'instant).",
        };
    } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : "Erreur inconnue" };
    }
}

/** NotetakerError and LeexiError carry a French message and the right status; anything else is a 500. */
export function notetakerErrorResponse(err: unknown) {
    if (err instanceof NotetakerError || err instanceof LeexiError) return errorResponse(err.message, err.status);
    console.error("Note-taker error:", err);
    return errorResponse("Erreur inattendue de l'outil d'enregistrement", 500);
}
