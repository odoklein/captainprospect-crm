// ============================================
// /api/enrichment/company-ai
// AI web-search enrichment of an incomplete company sheet.
//   GET   ?companyId=   restore the pending suggestions of a company (no AI call)
//   POST  {companyId}   search the web for the missing fields
//   PATCH {lookupId, decisions[]}  apply / reject suggestions, field by field
// Nothing is written on the company until an SDR applies a suggestion.
// ============================================

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
    NotFoundError,
    errorResponse,
    requireRole,
    successResponse,
    validateRequest,
    withErrorHandler,
} from "@/lib/api-utils";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { MistralError } from "@/lib/ai/mistral";
import { buildEnrichmentHash } from "@/lib/enrichment/company-ai-core";
import {
    COMPANY_AI_COMING_SOON_MESSAGE,
    COMPANY_AI_ENRICHMENT_ENABLED,
} from "@/lib/enrichment/company-ai-availability";
import { enrichCompanyViaAi } from "@/lib/enrichment/company-ai";
import {
    ENRICHABLE_FIELDS,
    companyPatchFor,
    missingCompanyFields,
    triggerGaps,
    type CompanyAiLookupPayload,
    type EnrichableField,
    type EnrichmentSuggestion,
} from "@/lib/enrichment/company-fields";

// Web search + parsing takes 10-20 s (more with a 429 retry): don't let the host cut it at its default.
export const maxDuration = 90;

const ALLOWED_ROLES = ["SDR", "MANAGER", "BUSINESS_DEVELOPER", "BOOKER"];
const SEARCHES_PER_MINUTE = 5;
const SEARCHES_PER_DAY = 120;
const FOUND_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const NO_RESULT_CACHE_MS = 24 * 60 * 60 * 1000;

const FREE_MAIL = /(^|\.)(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|orange|wanadoo|free|sfr|neuf|laposte|bbox|aol|proton|protonmail|gmx)\.[a-z.]+$/i;

const searchSchema = z.object({ companyId: z.string().min(1), force: z.boolean().optional() });
const reviewSchema = z.object({
    lookupId: z.string().min(1),
    decisions: z
        .array(z.object({ field: z.enum(ENRICHABLE_FIELDS), action: z.enum(["APPLY", "REJECT"]) }))
        .min(1)
        .max(ENRICHABLE_FIELDS.length),
});

const companySelect = {
    id: true,
    name: true,
    country: true,
    industry: true,
    website: true,
    phone: true,
    customData: true,
    listId: true,
} as const;

// ============================================
// Degraded mode: the CompanyEnrichmentLookup table may not exist yet (migration not applied).
// The feature must still work: the search runs, results are carried in a signed token instead
// of a DB row, rate limits live in memory, and nothing is cached. Once the table exists the
// persisted path takes over by itself (re-probed every few minutes).
// ============================================

const PERSISTENCE_RETRY_MS = 5 * 60 * 1000;
let persistenceDownUntil = 0;

function isMissingTableError(error: unknown): boolean {
    // Prisma client generated before the model existed: `prisma.companyEnrichmentLookup` is undefined.
    if (error instanceof TypeError) return /companyEnrichmentLookup|undefined/i.test(error.message);
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "P2021" || code === "P2022") return true;
    const message = error instanceof Error ? error.message : "";
    return /CompanyEnrichmentLookup/.test(message) && /does not exist|doesn't exist|not exist/i.test(message);
}

/** Runs a persistence step; `null` means "table unavailable, degrade". Any other error propagates. */
async function tryStore<T>(fn: () => Promise<T>): Promise<T | null> {
    if (Date.now() < persistenceDownUntil) return null;
    try {
        return await fn();
    } catch (error) {
        if (!isMissingTableError(error)) throw error;
        persistenceDownUntil = Date.now() + PERSISTENCE_RETRY_MS;
        console.warn("[company-ai] CompanyEnrichmentLookup table missing: running without persistence/cache (apply migration 20261001120000_add_company_enrichment_lookup).");
        return null;
    }
}

const memorySearches = new Map<string, number[]>();

function memoryQuota(userId: string, now: number) {
    const recent = (memorySearches.get(userId) ?? []).filter((t) => now - t < 86_400_000);
    memorySearches.set(userId, recent);
    return { lastMinute: recent.filter((t) => now - t < 60_000).length, today: recent.length };
}

const EPHEMERAL_PREFIX = "eph.";
const EPHEMERAL_TTL_MS = 24 * 60 * 60 * 1000;

interface EphemeralLookup {
    id: string;
    companyId: string;
    suggestions: EnrichmentSuggestion[];
    createdAt: Date;
}

function sign(body: string): string {
    const key = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "company-ai-ephemeral-dev-key";
    return createHmac("sha256", key).update(body).digest("base64url");
}

function encodeEphemeral(
    companyId: string,
    userId: string,
    suggestions: EnrichmentSuggestion[],
    createdAt = new Date(),
): EphemeralLookup {
    const body = Buffer.from(JSON.stringify({ c: companyId, u: userId, t: createdAt.getTime(), s: suggestions })).toString("base64url");
    return { id: `${EPHEMERAL_PREFIX}${body}.${sign(body)}`, companyId, suggestions, createdAt };
}

function decodeEphemeral(id: string, userId: string): EphemeralLookup | null {
    const [body, signature] = id.slice(EPHEMERAL_PREFIX.length).split(".");
    if (!body || !signature) return null;
    const expected = Buffer.from(sign(body));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
        const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
            c: string;
            u: string;
            t: number;
            s: EnrichmentSuggestion[];
        };
        if (parsed.u !== userId || Date.now() - parsed.t > EPHEMERAL_TTL_MS || !Array.isArray(parsed.s)) return null;
        return { id, companyId: parsed.c, suggestions: parsed.s, createdAt: new Date(parsed.t) };
    } catch {
        return null;
    }
}

function suggestionsOf(value: Prisma.JsonValue): EnrichmentSuggestion[] {
    return Array.isArray(value) ? (value as unknown as EnrichmentSuggestion[]) : [];
}

function toPayload(
    lookup: { id: string; suggestions: Prisma.JsonValue; createdAt: Date } | null,
    cached: boolean,
    stillMissing?: Set<EnrichableField>,
): CompanyAiLookupPayload {
    if (!lookup) return { found: false, suggestions: [], sources: [], cached, searchedAt: null };
    // A suggestion whose field got filled in the meantime (manual edit) is no longer actionable.
    const suggestions = suggestionsOf(lookup.suggestions).filter(
        (s) => s.status !== "PENDING" || !stillMissing || stillMissing.has(s.field),
    );
    const sources = [...new Map(suggestions.filter((s) => s.sourceUrl).map((s) => [s.sourceUrl as string, { url: s.sourceUrl as string, title: s.sourceLabel ?? (s.sourceUrl as string) }])).values()];
    return {
        found: suggestions.length > 0,
        lookupId: lookup.id,
        suggestions,
        sources,
        cached,
        searchedAt: lookup.createdAt.toISOString(),
    };
}

async function loadHints(company: { id: string; listId: string }) {
    const [industries, contacts] = await Promise.all([
        prisma.company.groupBy({
            by: ["industry"],
            where: { listId: company.listId, industry: { not: null } },
            _count: { industry: true },
            orderBy: { _count: { industry: "desc" } },
            take: 12,
        }),
        prisma.contact.findMany({ where: { companyId: company.id, email: { not: null } }, select: { email: true }, take: 15 }),
    ]);

    const knownIndustries = industries.map((row) => row.industry).filter((v): v is string => !!v && v.length <= 60);
    const emailDomains = [
        ...new Set(
            contacts
                .map((c) => c.email?.split("@")[1]?.toLowerCase().trim())
                .filter((d): d is string => !!d && !FREE_MAIL.test(d)),
        ),
    ].slice(0, 3);
    return { knownIndustries, emailDomains };
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(ALLOWED_ROLES, request);
    if (!COMPANY_AI_ENRICHMENT_ENABLED) return errorResponse(COMPANY_AI_COMING_SOON_MESSAGE, 503);
    const companyId = request.nextUrl.searchParams.get("companyId");
    if (!companyId) return errorResponse("companyId requis", 400);

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: companySelect });
    if (!company) return errorResponse("Société non trouvée", 404);

    // No table yet: nothing to restore (ephemeral results live in the open panel only).
    const lookup = await tryStore(() =>
        prisma.companyEnrichmentLookup.findFirst({
            where: { companyId, status: "OPEN", expiresAt: { gt: new Date() } },
            orderBy: { createdAt: "desc" },
        }),
    );
    return successResponse(toPayload(lookup, lookup?.cacheHit ?? false, new Set(missingCompanyFields(company))));
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(ALLOWED_ROLES, request);
    if (!COMPANY_AI_ENRICHMENT_ENABLED) return errorResponse(COMPANY_AI_COMING_SOON_MESSAGE, 503);
    const { companyId, force } = await validateRequest(request, searchSchema);

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: companySelect });
    if (!company) return errorResponse("Société non trouvée", 404);

    const missing = missingCompanyFields(company);
    if (triggerGaps(company).length === 0) return errorResponse("Cette fiche est déjà complète.", 409);

    const now = new Date();
    const queryHash = buildEnrichmentHash({
        name: company.name,
        website: company.website,
        country: company.country,
        requested: missing,
    });

    // Persisted path (table present): open suggestions, quota ledger, cross-SDR cache.
    // `null` = table missing, the search still runs (see "Degraded mode" above).
    const store = await tryStore(async () => {
        // The same company already has suggestions waiting: show them, don't search again.
        if (!force) {
            const open = await prisma.companyEnrichmentLookup.findFirst({
                where: { companyId, queryHash, status: "OPEN", expiresAt: { gt: now } },
                orderBy: { createdAt: "desc" },
            });
            if (open) return { early: toPayload(open, open.cacheHit, new Set(missing)), lastMinute: 0, today: 0 };
        }

        // Quota counts real searches only: a cache copy costs nothing.
        const [lastMinute, today] = await Promise.all([
            prisma.companyEnrichmentLookup.count({
                where: { requestedById: session.user.id, cacheHit: false, createdAt: { gte: new Date(now.getTime() - 60_000) } },
            }),
            prisma.companyEnrichmentLookup.count({
                where: { requestedById: session.user.id, cacheHit: false, createdAt: { gte: new Date(now.getTime() - 86_400_000) } },
            }),
        ]);

        // Another SDR already searched this very company: reuse it (their rejections stay out).
        const cached = force
            ? null
            : await prisma.companyEnrichmentLookup.findFirst({
                  where: { queryHash, expiresAt: { gt: now }, cacheHit: false },
                  orderBy: { createdAt: "desc" },
              });
        if (cached) {
            const reusable = suggestionsOf(cached.suggestions)
                .filter((s) => s.status !== "REJECTED" && missing.includes(s.field))
                .map((s) => ({ ...s, status: "PENDING" as const, reviewedById: null, reviewedAt: null }));
            const copy = await prisma.companyEnrichmentLookup.create({
                data: {
                    companyId,
                    queryHash,
                    status: reusable.length > 0 ? "OPEN" : "NO_RESULT",
                    requestedFields: missing,
                    suggestions: reusable as unknown as Prisma.InputJsonValue,
                    requestedById: session.user.id,
                    cacheHit: true,
                    expiresAt: cached.expiresAt,
                },
            });
            return { early: toPayload(copy, true, new Set(missing)), lastMinute, today };
        }
        return { early: null as CompanyAiLookupPayload | null, lastMinute, today };
    });

    if (store?.early) return successResponse(store.early);
    const { lastMinute, today } = store ?? memoryQuota(session.user.id, now.getTime());

    if (lastMinute >= SEARCHES_PER_MINUTE) return errorResponse("Trop de recherches d'affilée. Réessayez dans une minute.", 429);
    if (today >= SEARCHES_PER_DAY) return errorResponse("Quota journalier de recherches IA atteint.", 429);

    const hints = await loadHints(company);
    let result;
    try {
        result = await enrichCompanyViaAi({
            name: company.name,
            website: company.website,
            country: company.country,
            requested: missing,
            ...hints,
        });
    } catch (error) {
        if (error instanceof MistralError) {
            return errorResponse(error.userMessage, error.code === "rate_limited" ? 429 : error.code === "upstream" ? 502 : 503);
        }
        console.error("[company-ai] enrichment failed:", error);
        return errorResponse("La recherche IA est temporairement indisponible.", 502);
    }

    const found = result.suggestions.length > 0;
    memorySearches.set(session.user.id, [...(memorySearches.get(session.user.id) ?? []), now.getTime()]);

    const lookup = await tryStore(() =>
        prisma.companyEnrichmentLookup.create({
            data: {
                companyId,
                queryHash,
                status: found ? "OPEN" : "NO_RESULT",
                requestedFields: missing,
                suggestions: result.suggestions as unknown as Prisma.InputJsonValue,
                requestedById: session.user.id,
                searchCount: result.searchCount,
                durationMs: result.durationMs,
                expiresAt: new Date(now.getTime() + (found ? FOUND_CACHE_MS : NO_RESULT_CACHE_MS)),
            },
        }),
    );
    if (lookup) return successResponse(toPayload(lookup, false, new Set(missing)));
    // Table missing: hand the results back in a signed token so they can still be reviewed/applied.
    return successResponse(toPayload(encodeEphemeral(companyId, session.user.id, result.suggestions), false, new Set(missing)));
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(ALLOWED_ROLES, request);
    if (!COMPANY_AI_ENRICHMENT_ENABLED) return errorResponse(COMPANY_AI_COMING_SOON_MESSAGE, 503);
    const { lookupId, decisions } = await validateRequest(request, reviewSchema);

    const outcome = await prisma.$transaction(async (tx) => {
        const ephemeral = lookupId.startsWith(EPHEMERAL_PREFIX);
        const lookup = ephemeral
            ? decodeEphemeral(lookupId, session.user.id)
            : await tx.companyEnrichmentLookup.findUnique({ where: { id: lookupId } });
        if (!lookup) throw new NotFoundError("Suggestion introuvable ou expirée : relancez la recherche.");

        const company = await tx.company.findUnique({ where: { id: lookup.companyId }, select: companySelect });
        if (!company) throw new NotFoundError("Société non trouvée");

        const suggestions = suggestionsOf(lookup.suggestions).map((s) => ({ ...s }));
        const reviewedAt = new Date().toISOString();

        // Applied one by one onto a running copy, so two accepted fields cannot overwrite each other's customData.
        const state = { ...company };
        const columns: Record<string, string> = {};
        const applied: EnrichableField[] = [];
        const rejected: EnrichableField[] = [];
        const skipped: Array<{ field: EnrichableField; reason: string }> = [];

        for (const { field, action } of decisions) {
            const suggestion = suggestions.find((s) => s.field === field && s.status === "PENDING");
            if (!suggestion) {
                skipped.push({ field, reason: "Déjà traité" });
                continue;
            }
            const mark = (status: "APPLIED" | "REJECTED") => {
                suggestion.status = status;
                suggestion.reviewedById = session.user.id;
                suggestion.reviewedAt = reviewedAt;
            };

            if (action === "REJECT") {
                mark("REJECTED");
                rejected.push(field);
                continue;
            }
            if (!missingCompanyFields(state).includes(field)) {
                skipped.push({ field, reason: "Déjà renseigné sur la fiche" });
                continue;
            }

            const patch = companyPatchFor(state, field, suggestion.value);
            if (patch.column) {
                Object.assign(columns, patch.column);
                Object.assign(state, patch.column);
            }
            if (patch.customData) state.customData = patch.customData as Prisma.JsonObject;
            mark("APPLIED");
            applied.push(field);
        }

        if (applied.length > 0) {
            await tx.company.update({
                where: { id: company.id },
                data: {
                    ...columns,
                    ...(state.customData !== company.customData ? { customData: state.customData as Prisma.InputJsonValue } : {}),
                },
            });
        }
        let nextLookupId = lookup.id;
        if (ephemeral) {
            nextLookupId = encodeEphemeral(lookup.companyId, session.user.id, suggestions, lookup.createdAt).id;
        } else {
            await tx.companyEnrichmentLookup.update({
                where: { id: lookup.id },
                data: {
                    suggestions: suggestions as unknown as Prisma.InputJsonValue,
                    status: suggestions.some((s) => s.status === "PENDING") ? "OPEN" : "DONE",
                },
            });
        }

        return { company, applied, rejected, skipped, suggestions, after: state, lookupId: nextLookupId };
    });

    if (outcome.applied.length > 0) {
        audit(request, session, {
            action: AUDIT_ACTIONS.UPDATE,
            entityType: "Company",
            entityId: outcome.company.id,
            summary: `Fiche "${outcome.company.name}" complétée par l'IA : ${outcome.applied.join(", ")}`,
            metadata: {
                source: "company-ai-enrichment",
                lookupId,
                fields: outcome.applied,
                values: Object.fromEntries(outcome.suggestions.filter((s) => outcome.applied.includes(s.field)).map((s) => [s.field, s.value])),
            },
        });
    }

    return successResponse({
        applied: outcome.applied,
        rejected: outcome.rejected,
        skipped: outcome.skipped,
        suggestions: outcome.suggestions,
        lookupId: outcome.lookupId,
        company: {
            phone: outcome.after.phone,
            industry: outcome.after.industry,
            country: outcome.after.country,
            website: outcome.after.website,
            customData: outcome.after.customData,
        },
    });
});
