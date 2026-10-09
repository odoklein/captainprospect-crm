import { parseAlloCallsListResponse } from "./allo-response";
import { DateTime } from "luxon";

export interface AlloLineMetrics {
    calls: number;
    connectedCalls: number;
    talkTimeSeconds: number;
    callsOver1Min: number;
    answerRate: number;
}

const ALLO_BASE_URL = "https://api.withallo.com";
const ALLO_MAX_PAGES = 10;
const ALLO_CONNECTED_RESULTS = new Set([
    "ANSWERED",
    "COMPLETED",
    "CONNECTED",
    "IN_PROGRESS",
    "BUSY",
]);

interface CacheEntry {
    data: AlloLineMetrics;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const dailyCache = new Map<string, { data: Map<string, number>; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

function normalizeDay(date: Date): string {
    return date.toISOString().split("T")[0];
}

/**
 * Normalizes phone numbers to digits or E.164-compatible format
 * for matching WithAllo query parameters.
 */
function cleanPhoneNumber(phone: string): string {
    return phone.trim().replace(/\s+/g, "");
}

/**
 * Fetches real WithAllo call stats strictly partitioned by the SDR's assigned phone line.
 * CRUCIAL: In WithAllo, multiple CRM users share the same Allo account/user seat.
 * Therefore, metrics MUST ALWAYS be queried and filtered by `allo_number`, never by email.
 */
export async function fetchAlloMetricsForLine(
    alloPhoneNumber: string | null | undefined,
    dateFrom: Date,
    dateTo: Date,
    apiKeyOverride?: string
): Promise<AlloLineMetrics> {
    const emptyResult: AlloLineMetrics = {
        calls: 0,
        connectedCalls: 0,
        talkTimeSeconds: 0,
        callsOver1Min: 0,
        answerRate: 0,
    };

    if (!alloPhoneNumber || !alloPhoneNumber.trim()) {
        return emptyResult;
    }

    const apiKey = apiKeyOverride || process.env.ALLO_API_KEY;
    if (!apiKey) {
        return emptyResult;
    }

    const cleanNumber = cleanPhoneNumber(alloPhoneNumber);
    const fromIso = normalizeDay(dateFrom);
    const toIso = normalizeDay(dateTo);
    const cacheKey = `${cleanNumber}:${fromIso}:${toIso}`;

    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }

    const totals: AlloLineMetrics = {
        calls: 0,
        connectedCalls: 0,
        talkTimeSeconds: 0,
        callsOver1Min: 0,
        answerRate: 0,
    };

    let page = 0;
    while (page < ALLO_MAX_PAGES) {
        const url = new URL(`${ALLO_BASE_URL}/v1/api/calls`);
        url.searchParams.set("allo_number", cleanNumber);
        url.searchParams.set("size", "100");
        url.searchParams.set("page", String(page));

        try {
            const res = await fetch(url.toString(), {
                headers: { Authorization: apiKey },
                cache: "no-store",
            });

            if (!res.ok) {
                break;
            }

            const body = await res.json();
            const parsed = parseAlloCallsListResponse(body);
            if (!parsed.rawCalls.length) {
                break;
            }

            let oldestCallDateOnPage: Date | null = null;
            for (const call of parsed.rawCalls) {
                const rawStart =
                    call.start_date ??
                    call.start_time ??
                    call.created_at ??
                    call.date;
                if (!rawStart) continue;

                let start: Date;
                if (typeof rawStart === "number") {
                    start = new Date(rawStart > 1e12 ? rawStart : rawStart * 1000);
                } else {
                    start = new Date(String(rawStart));
                }

                if (Number.isNaN(start.getTime())) continue;

                if (!oldestCallDateOnPage || start < oldestCallDateOnPage) {
                    oldestCallDateOnPage = start;
                }

                const isoDay = normalizeDay(start);
                if (isoDay < fromIso || isoDay > toIso) continue;

                totals.calls += 1;

                let duration =
                    typeof call.duration === "number" ? call.duration : 0;
                if (!duration && typeof call.length_in_minutes === "number") {
                    duration = Math.round(call.length_in_minutes * 60);
                }
                duration = Math.max(0, Math.round(duration));

                totals.talkTimeSeconds += duration;
                if (duration >= 60) {
                    totals.callsOver1Min += 1;
                }

                const result =
                    typeof call.result === "string"
                        ? call.result.toUpperCase()
                        : typeof call.outcome === "string"
                        ? call.outcome.toUpperCase()
                        : "";

                if (ALLO_CONNECTED_RESULTS.has(result) || duration > 0) {
                    totals.connectedCalls += 1;
                }
            }

            if (oldestCallDateOnPage && oldestCallDateOnPage < dateFrom) {
                break;
            }

            page += 1;
        } catch (err) {
            console.error("[allo-metrics] Error querying WithAllo API:", err);
            break;
        }
    }

    if (totals.calls > 0) {
        totals.answerRate = Math.round((totals.connectedCalls / totals.calls) * 100);
    }

    cache.set(cacheKey, {
        data: totals,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return totals;
}

/**
 * Fetches daily call counts from WithAllo strictly partitioned by phone line.
 * Returns a Map where the key is the Europe/Paris day 'YYYY-MM-DD' and value is the call count.
 */
export async function fetchAlloDailyCallsForLine(
    alloPhoneNumber: string | null | undefined,
    dateFrom: Date,
    dateTo: Date,
    apiKeyOverride?: string
): Promise<Map<string, number>> {
    const dailyMap = new Map<string, number>();

    if (!alloPhoneNumber || !alloPhoneNumber.trim()) {
        return dailyMap;
    }

    const apiKey = apiKeyOverride || process.env.ALLO_API_KEY;
    if (!apiKey) {
        return dailyMap;
    }

    const cleanNumber = cleanPhoneNumber(alloPhoneNumber);
    const fromIso = normalizeDay(dateFrom);
    const toIso = normalizeDay(dateTo);
    const cacheKey = `${cleanNumber}:daily:${fromIso}:${toIso}`;

    const cached = dailyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return new Map(cached.data);
    }

    let page = 0;
    while (page < ALLO_MAX_PAGES) {
        const url = new URL(`${ALLO_BASE_URL}/v1/api/calls`);
        url.searchParams.set("allo_number", cleanNumber);
        url.searchParams.set("size", "100");
        url.searchParams.set("page", String(page));

        try {
            const res = await fetch(url.toString(), {
                headers: { Authorization: apiKey },
                cache: "no-store",
            });

            if (!res.ok) break;

            const body = await res.json();
            const parsed = parseAlloCallsListResponse(body);
            if (!parsed.rawCalls.length) break;

            let oldestCallDateOnPage: Date | null = null;
            for (const call of parsed.rawCalls) {
                const rawStart =
                    call.start_date ??
                    call.start_time ??
                    call.created_at ??
                    call.date;
                if (!rawStart) continue;

                let start: Date;
                if (typeof rawStart === "number") {
                    start = new Date(rawStart > 1e12 ? rawStart : rawStart * 1000);
                } else {
                    start = new Date(String(rawStart));
                }

                if (Number.isNaN(start.getTime())) continue;

                if (!oldestCallDateOnPage || start < oldestCallDateOnPage) {
                    oldestCallDateOnPage = start;
                }

                if (start < dateFrom || start > dateTo) continue;

                // Day key in Europe/Paris
                const dayKey = DateTime.fromJSDate(start, { zone: "Europe/Paris" }).toISODate();
                if (dayKey) {
                    dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + 1);
                }
            }

            if (oldestCallDateOnPage && oldestCallDateOnPage < dateFrom) {
                break;
            }

            page += 1;
        } catch (err) {
            console.error("[allo-metrics] Error querying daily WithAllo calls:", err);
            break;
        }
    }

    dailyCache.set(cacheKey, {
        data: dailyMap,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return dailyMap;
}

