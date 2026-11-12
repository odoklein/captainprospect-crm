// ============================================
// POST /api/enricher/serp-lookup — Website phone scraper
// Fetches company website pages and extracts phone via regex
// Falls back to web search (company name) if no website provided
// ============================================

import { NextRequest } from 'next/server';
import {
    successResponse,
    errorResponse,
    requireAuth,
    withErrorHandler,
    validateRequest,
} from '@/lib/api-utils';
import { z } from 'zod';
import { integrationKey } from "@/lib/integrations/keys";

const scrapeSchema = z.object({
    company_name: z.string().optional(),
    address: z.string().optional(),
    website: z.string().optional(),
});

// ─── Phone utilities ───────────────────────────────────────────────

const FAKE_NUMBERS = new Set([
    '0000000000', '1111111111', '2222222222', '3333333333', '4444444444',
    '5555555555', '6666666666', '7777777777', '8888888888', '9999999999',
    '1234567890', '0123456789', '0606060606',
]);

function isValidPhone(phone: string): boolean {
    if (!phone) return false;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return false;
    if (FAKE_NUMBERS.has(digits)) return false;
    if (/^(.)\1{6,}$/.test(digits)) return false;
    return true;
}

// Extracts all phone candidates from raw HTML/text
function extractPhones(text: string): string[] {
    const patterns = [
        // International format: +33 1 23 45 67 89 / +33123456789
        /\+\d{1,3}[\s.\-]?\(?\d{1,4}\)?[\s.\-]?\d{1,4}[\s.\-]?\d{1,4}[\s.\-]?\d{1,9}/g,
        // French 10-digit: 01 23 45 67 89 / 0123456789 / 01.23.45.67.89
        /0[1-9](?:[\s.\-]?\d{2}){4}/g,
        // tel: href
        /tel:[+\d\s.\-]{7,20}/g,
    ];

    const found = new Set<string>();
    for (const re of patterns) {
        for (const m of text.matchAll(re)) {
            const raw = m[0].replace(/^tel:/, '').trim();
            if (isValidPhone(raw)) found.add(raw);
        }
    }
    return [...found];
}

// Normalize to E.164-ish
function normalizePhone(phone: string): string {
    if (!phone) return '';
    const clean = phone.replace(/\s/g, '');
    if (/^\+\d{8,15}$/.test(clean)) return clean;
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('33') && digits.length === 11) return '+' + digits;
    if (digits.startsWith('0') && digits.length === 10 && /^0[1-9]/.test(digits)) {
        return '+33' + digits.substring(1);
    }
    return phone;
}

// ─── URL helpers ───────────────────────────────────────────────────

function normalizeUrl(url: string): string {
    let u = url.trim();
    if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'https://' + u;
    // Remove trailing slash
    return u.replace(/\/$/, '');
}

function buildPagesToCheck(baseUrl: string): string[] {
    const base = normalizeUrl(baseUrl);
    return [
        base,
        `${base}/contact`,
        `${base}/about`,
        `${base}/nous-contacter`,
    ];
}

// ─── Fetcher ───────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT = 'Mozilla/5.0 (compatible; PhoneEnricher/1.0)';

async function fetchPageText(url: string): Promise<string | null> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const resp = await fetch(url, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) return null;
        const html = await resp.text();
        // Strip tags for cleaner regex matching
        return html.replace(/<[^>]+>/g, ' ');
    } catch {
        return null;
    }
}

// ─── Scrape website ────────────────────────────────────────────────

async function scrapeWebsite(website: string): Promise<{ phone: string; source: string; confidence: number } | null> {
    const pages = buildPagesToCheck(website);

    for (const pageUrl of pages) {
        const text = await fetchPageText(pageUrl);
        if (!text) continue;
        const phones = extractPhones(text);
        if (phones.length > 0) {
            // Prefer numbers found on /contact or /nous-contacter (higher confidence)
            const isContactPage = pageUrl.includes('contact') || pageUrl.includes('nous-contacter');
            return {
                phone: normalizePhone(phones[0]),
                source: `website_scrape:${pageUrl}`,
                confidence: isContactPage ? 90 : 75,
            };
        }
    }
    return null;
}

// ─── Fallback: web search ──────────────────────────────────────────

async function searchPhoneViaWeb(
    companyName: string,
    address?: string
): Promise<{ phone: string; source: string; confidence: number } | null> {
    const apiKey = integrationKey("SERP_API_KEY");
    if (!apiKey) return null;

    const q = [companyName, address, 'téléphone'].filter(Boolean).join(' ');
    const params = new URLSearchParams({
        engine: 'google',
        q,
        api_key: apiKey,
        hl: 'fr',
        gl: 'fr',
        num: '5',
    });

    try {
        const resp = await fetch(`https://serpapi.com/search?${params.toString()}`, {
            headers: { Accept: 'application/json' },
        });
        if (!resp.ok) return null;

        const data = (await resp.json()) as {
            organic_results?: Array<{ snippet?: string; link?: string }>;
            answer_box?: { answer?: string; snippet?: string };
        };

        // Check answer box first (Google often shows phone directly)
        const boxText = [data.answer_box?.answer, data.answer_box?.snippet].filter(Boolean).join(' ');
        if (boxText) {
            const phones = extractPhones(boxText);
            if (phones.length > 0) {
                return { phone: normalizePhone(phones[0]), source: 'web_search:answer_box', confidence: 80 };
            }
        }

        // Check snippets
        for (const result of data.organic_results || []) {
            const snippet = result.snippet || '';
            const phones = extractPhones(snippet);
            if (phones.length > 0) {
                return { phone: normalizePhone(phones[0]), source: `web_search:${result.link || 'organic'}`, confidence: 60 };
            }
        }

        // Try fetching the first result's page
        const firstUrl = data.organic_results?.[0]?.link;
        if (firstUrl) {
            const scraped = await scrapeWebsite(firstUrl);
            if (scraped) return { ...scraped, confidence: Math.min(scraped.confidence, 55) };
        }
    } catch {
        // silently fall through
    }
    return null;
}

// ─── Handler ───────────────────────────────────────────────────────

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireAuth(request);

    const { company_name, address, website } = await validateRequest(request, scrapeSchema);

    if (!company_name && !website) {
        return errorResponse('Au moins company_name ou website requis', 400);
    }

    let result: { phone: string; source: string; confidence: number } | null = null;

    // 1. Try scraping the website directly
    if (website) {
        result = await scrapeWebsite(website);
    }

    // 2. Fall back to web search if no website or scrape failed
    if (!result && company_name) {
        result = await searchPhoneViaWeb(company_name, address);
    }

    return successResponse({
        phone_number: result?.phone ?? null,
        source: result?.source ?? null,
        confidence: result?.confidence ?? 0,
    });
});