// Server-only: per-SDR call volume from WithAllo, used by the manager
// leaderboard ("Appels" / "Connectés" tags).
//
// This is slow by nature (paged external API, serial on purpose — WithAllo
// rate-limits hard on parallel line requests, see lib/call-enrichment/allo-provider.ts),
// so it must never sit on the critical path of a dashboard response. The manager
// dashboard loads it through GET /api/stats/sdr-call-metrics after the KPIs render.

import { prisma } from '@/lib/prisma';
import { parseAlloCallsListResponse } from '@/lib/call-enrichment/allo-response';
import { integrationKey } from '@/lib/integrations/keys';

export interface CallMetrics {
    calls: number;
    connectedCalls: number;
}

const ALLO_BASE_URL = 'https://api.withallo.com';
const ALLO_CONNECTED_RESULTS = new Set([
    'ANSWERED',
    'TRANSFERRED_AI',
    'TRANSFERRED_EXTERNAL',
    'RECEIVED',
    'CLOSED',
]);
// Stats only needs recent data — 10 pages × 100 calls = 1 000 appels par ligne, largement suffisant.
// Surcharge possible via STATS_ALLO_MAX_PAGES (indépendant de CALL_ENRICHMENT_ALLO_MAX_PAGES).
const ALLO_MAX_PAGES = Math.max(1, parseInt(process.env.STATS_ALLO_MAX_PAGES ?? '10', 10));
// Gap entre les pages pour ne pas saturer Allo (300ms par défaut pour les stats).
const ALLO_STATS_PAGE_GAP_MS = Math.max(0, parseInt(process.env.STATS_ALLO_PAGE_GAP_MS ?? '300', 10));
// Cache TTL en ms (défaut 5 min). Évite de refaire des centaines de requêtes à chaque reload du dashboard.
const ALLO_STATS_CACHE_TTL_MS = Math.max(0, parseInt(process.env.STATS_ALLO_CACHE_TTL_MS ?? '300000', 10));
// A line whose fetch failed part-way (429, 5xx) is retried sooner than a complete one.
const ALLO_STATS_PARTIAL_TTL_MS = Math.min(ALLO_STATS_CACHE_TTL_MS, 30_000);
const ALLO_REQUEST_TIMEOUT_MS = 10_000;

/** Module-level in-process cache, keyed by alloNumber|fromDay|toDay. */
const cache = new Map<string, { data: CallMetrics; expiresAt: number }>();
/** Lines being fetched right now: concurrent dashboards share one Allo crawl. */
const inFlight = new Map<string, Promise<CallMetrics>>();

function isoDay(d: Date): string {
    return d.toISOString().split('T')[0];
}

async function crawlLine(alloNumber: string, dateFrom: Date, dateTo: Date, apiKey: string): Promise<{ totals: CallMetrics; complete: boolean }> {
    const fromIso = isoDay(dateFrom);
    const toIso = isoDay(dateTo);
    const totals: CallMetrics = { calls: 0, connectedCalls: 0 };

    for (let page = 0; page < ALLO_MAX_PAGES; page++) {
        if (page > 0 && ALLO_STATS_PAGE_GAP_MS > 0) {
            // Inter-page gap: évite les rafales sur le quota Allo
            await new Promise<void>((r) => setTimeout(r, ALLO_STATS_PAGE_GAP_MS));
        }
        const url = new URL(`${ALLO_BASE_URL}/v1/api/calls`);
        url.searchParams.set('allo_number', alloNumber);
        url.searchParams.set('size', '100');
        url.searchParams.set('page', String(page));

        let body: unknown;
        try {
            const res = await fetch(url.toString(), {
                headers: { Authorization: apiKey },
                cache: 'no-store',
                signal: AbortSignal.timeout(ALLO_REQUEST_TIMEOUT_MS),
            });
            if (!res.ok) return { totals, complete: false };
            body = await res.json();
        } catch {
            return { totals, complete: false };
        }

        const parsed = parseAlloCallsListResponse(body);
        if (!parsed.rawCalls.length) break;

        let oldestOnPage: Date | null = null;
        for (const call of parsed.rawCalls) {
            const rawStart = call.start_date ?? call.start_time ?? call.created_at ?? call.date;
            if (!rawStart) continue;
            const callDate = new Date(String(rawStart));
            if (Number.isNaN(callDate.getTime())) continue;
            if (!oldestOnPage || callDate < oldestOnPage) oldestOnPage = callDate;

            const callDay = isoDay(callDate);
            if (callDay < fromIso || callDay > toIso) continue;

            totals.calls += 1;
            const result = typeof call.result === 'string' ? call.result.toUpperCase() : '';
            if (ALLO_CONNECTED_RESULTS.has(result)) totals.connectedCalls += 1;
        }

        if (oldestOnPage && oldestOnPage < dateFrom) break;
    }
    return { totals, complete: true };
}

function lineMetrics(alloNumber: string, dateFrom: Date, dateTo: Date, apiKey: string): Promise<CallMetrics> {
    const key = `${alloNumber}|${isoDay(dateFrom)}|${isoDay(dateTo)}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);

    const pending = inFlight.get(key);
    if (pending) return pending;

    const run = crawlLine(alloNumber, dateFrom, dateTo, apiKey)
        .then(({ totals, complete }) => {
            const ttl = complete ? ALLO_STATS_CACHE_TTL_MS : ALLO_STATS_PARTIAL_TTL_MS;
            if (ttl > 0) cache.set(key, { data: totals, expiresAt: Date.now() + ttl });
            return totals;
        })
        .finally(() => inFlight.delete(key));
    inFlight.set(key, run);
    return run;
}

/** Allo totals per line. Lines are crawled one after another (WithAllo quota). */
export async function fetchAlloCallMetricsByLine(
    alloNumbers: string[],
    dateFrom: Date,
    dateTo: Date,
    apiKey: string,
): Promise<Record<string, CallMetrics>> {
    const byNumber: Record<string, CallMetrics> = {};
    for (const alloNumber of alloNumbers) {
        byNumber[alloNumber] = await lineMetrics(alloNumber, dateFrom, dateTo, apiKey);
    }
    return byNumber;
}

/**
 * Allo totals per SDR id over [dateFrom, dateTo). Every requested SDR gets an
 * entry (zeros when Allo is not configured or the SDR has no Allo line), so the
 * UI can tell "loaded, nothing" from "still loading".
 */
export async function getSdrCallMetrics(sdrIds: string[], dateFrom: Date, dateTo: Date): Promise<Record<string, CallMetrics>> {
    const out: Record<string, CallMetrics> = {};
    for (const id of sdrIds) out[id] = { calls: 0, connectedCalls: 0 };
    if (sdrIds.length === 0) return out;

    const apiKey = integrationKey('ALLO_API_KEY');
    if (!apiKey) return out;

    const users = await prisma.user.findMany({
        where: { id: { in: sdrIds } },
        select: { id: true, alloPhoneNumber: true },
    });
    const numberByUser = new Map(
        users
            .map((u) => [u.id, u.alloPhoneNumber?.trim() || ''] as const)
            .filter(([, n]) => n),
    );
    const numbers = [...new Set(numberByUser.values())];
    if (numbers.length === 0) return out;

    const byNumber = await fetchAlloCallMetricsByLine(numbers, dateFrom, dateTo, apiKey);
    for (const [userId, number] of numberByUser) {
        const m = byNumber[number];
        if (m) out[userId] = m;
    }
    return out;
}
