// ============================================
// /api/enrichment/company-ai
// AI web-search enrichment of an incomplete company sheet.
//   GET   ?companyId=   restore the pending suggestions of a company (no AI call)
//   POST  {companyId}   search the web for the missing fields
//   PATCH {lookupId, decisions[]}  apply / reject suggestions, field by field
// Nothing is written on the company until an SDR applies a suggestion.
// ============================================

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
    const companyId = request.nextUrl.searchParams.get("companyId");
    if (!companyId) return errorResponse("companyId requis", 400);

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: companySelect });
    if (!company) return errorResponse("Société non trouvée", 404);

    const lookup = await prisma.companyEnrichmentLookup.findFirst({
        where: { companyId, status: "OPEN", expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
    });
    return successResponse(toPayload(lookup, lookup?.cacheHit ?? false, new Set(missingCompanyFields(company))));
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(ALLOWED_ROLES, request);
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

    // The same company already has suggestions waiting: show them, don't search again.
    if (!force) {
        const open = await prisma.companyEnrichmentLookup.findFirst({
            where: { companyId, queryHash, status: "OPEN", expiresAt: { gt: now } },
            orderBy: { createdAt: "desc" },
        });
        if (open) return successResponse(toPayload(open, open.cacheHit, new Set(missing)));
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
        return successResponse(toPayload(copy, true, new Set(missing)));
    }

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
    const lookup = await prisma.companyEnrichmentLookup.create({
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
    });
    return successResponse(toPayload(lookup, false, new Set(missing)));
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(ALLOWED_ROLES, request);
    const { lookupId, decisions } = await validateRequest(request, reviewSchema);

    const outcome = await prisma.$transaction(async (tx) => {
        const lookup = await tx.companyEnrichmentLookup.findUnique({ where: { id: lookupId } });
        if (!lookup) throw new NotFoundError("Suggestion introuvable");

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
        await tx.companyEnrichmentLookup.update({
            where: { id: lookup.id },
            data: {
                suggestions: suggestions as unknown as Prisma.InputJsonValue,
                status: suggestions.some((s) => s.status === "PENDING") ? "OPEN" : "DONE",
            },
        });

        return { company, applied, rejected, skipped, suggestions, after: state };
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
        company: {
            phone: outcome.after.phone,
            industry: outcome.after.industry,
            country: outcome.after.country,
            website: outcome.after.website,
            customData: outcome.after.customData,
        },
    });
});
