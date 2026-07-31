import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
    errorResponse,
    requireRole,
    successResponse,
    validateRequest,
    withErrorHandler,
} from "@/lib/api-utils";
import {
    buildPhoneLookupHash,
    findCompanyPhoneViaGoogle,
} from "@/lib/enrichment/google-places-phone";
import { hasUsablePhone } from "@/lib/phone-utils";

const ALLOWED_ROLES = ["SDR", "MANAGER", "BUSINESS_DEVELOPER", "BOOKER"];
const SEARCH_LIMIT_PER_MINUTE = 10;
const CACHE_HOURS = Math.max(
    1,
    Number.parseInt(process.env.GOOGLE_PLACES_PHONE_CACHE_HOURS ?? "168", 10) ||
        168,
);

const searchSchema = z.object({
    companyId: z.string().min(1),
});

const reviewSchema = z.object({
    lookupId: z.string().min(1),
    action: z.enum(["APPLY", "REJECT"]),
});

function additionalPhonesFromCustomData(customData: unknown): string[] {
    if (!customData || typeof customData !== "object") return [];
    const value = (customData as { additionalPhones?: unknown }).additionalPhones;
    if (!Array.isArray(value)) return [];
    return value.filter(
        (phone): phone is string => typeof phone === "string" && phone.trim().length > 0,
    );
}

function lookupPayload(lookup: {
    id: string;
    suggestedPhone: string | null;
    sourceUrl: string | null;
    matchedCompanyName: string | null;
    matchedAddress: string | null;
    confidence: number;
    cacheHit: boolean;
}) {
    if (!lookup.suggestedPhone) {
        return { found: false, cached: lookup.cacheHit };
    }

    return {
        found: true,
        lookupId: lookup.id,
        phone: lookup.suggestedPhone,
        source: "Google Places",
        sourceUrl: lookup.sourceUrl,
        matchedCompany: lookup.matchedCompanyName,
        matchedAddress: lookup.matchedAddress,
        confidence: lookup.confidence,
        cached: lookup.cacheHit,
    };
}

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(ALLOWED_ROLES, request);
    const { companyId } = await validateRequest(request, searchSchema);

    const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
            id: true,
            name: true,
            country: true,
            website: true,
            phone: true,
            customData: true,
        },
    });

    if (!company) return errorResponse("Société non trouvée", 404);

    const additionalPhones = additionalPhonesFromCustomData(company.customData);
    if (hasUsablePhone(company.phone, additionalPhones)) {
        return errorResponse(
            "La recherche Google est réservée aux sociétés sans numéro valide.",
            409,
        );
    }

    const oneMinuteAgo = new Date(Date.now() - 60_000);
    const recentSearches = await prisma.phoneEnrichmentLookup.count({
        where: {
            requestedById: session.user.id,
            createdAt: { gte: oneMinuteAgo },
        },
    });
    if (recentSearches >= SEARCH_LIMIT_PER_MINUTE) {
        return errorResponse(
            "Limite atteinte. Réessayez dans une minute.",
            429,
        );
    }

    const searchInput = {
        name: company.name,
        country: company.country,
        website: company.website,
    };
    const queryHash = buildPhoneLookupHash(searchInput);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_HOURS * 60 * 60 * 1000);

    const cached = await prisma.phoneEnrichmentLookup.findFirst({
        where: {
            queryHash,
            expiresAt: { gt: now },
            status: { in: ["PENDING", "APPLIED", "REJECTED", "NO_RESULT"] },
        },
        orderBy: { createdAt: "desc" },
    });

    if (cached) {
        const copy = await prisma.phoneEnrichmentLookup.create({
            data: {
                companyId: company.id,
                queryHash,
                suggestedPhone:
                    cached.status === "REJECTED" ? null : cached.suggestedPhone,
                sourceUrl: cached.sourceUrl,
                matchedCompanyName: cached.matchedCompanyName,
                matchedAddress: cached.matchedAddress,
                confidence: cached.confidence,
                status:
                    cached.status === "REJECTED" || !cached.suggestedPhone
                        ? "NO_RESULT"
                        : "PENDING",
                requestedById: session.user.id,
                cacheHit: true,
                expiresAt,
            },
        });
        return successResponse(lookupPayload(copy));
    }

    let suggestion;
    try {
        suggestion = await findCompanyPhoneViaGoogle(searchInput);
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "GOOGLE_PLACES_API_KEY_MISSING"
        ) {
            return errorResponse(
                "La recherche Google n’est pas configurée. Ajoutez GOOGLE_PLACES_API_KEY.",
                503,
            );
        }
        console.error("Google Places phone lookup failed:", error);
        return errorResponse(
            "Google Places est temporairement indisponible.",
            502,
        );
    }

    const lookup = await prisma.phoneEnrichmentLookup.create({
        data: {
            companyId: company.id,
            queryHash,
            suggestedPhone: suggestion?.phone ?? null,
            sourceUrl: suggestion?.sourceUrl ?? null,
            matchedCompanyName: suggestion?.matchedCompanyName ?? null,
            matchedAddress: suggestion?.matchedAddress ?? null,
            confidence: suggestion?.confidence ?? 0,
            status: suggestion ? "PENDING" : "NO_RESULT",
            requestedById: session.user.id,
            expiresAt,
        },
    });

    return successResponse(lookupPayload(lookup));
});

export const PATCH = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(ALLOWED_ROLES, request);
    const { lookupId, action } = await validateRequest(request, reviewSchema);

    const lookup = await prisma.phoneEnrichmentLookup.findUnique({
        where: { id: lookupId },
    });
    if (!lookup) return errorResponse("Suggestion introuvable", 404);
    if (lookup.status !== "PENDING") {
        return errorResponse("Cette suggestion a déjà été traitée.", 409);
    }

    if (action === "REJECT") {
        await prisma.phoneEnrichmentLookup.update({
            where: { id: lookup.id },
            data: {
                status: "REJECTED",
                reviewedById: session.user.id,
                reviewedAt: new Date(),
            },
        });
        return successResponse({ action: "REJECTED" });
    }

    if (!lookup.suggestedPhone) {
        return errorResponse("Aucun numéro ne peut être appliqué.", 409);
    }

    const company = await prisma.company.findUnique({
        where: { id: lookup.companyId },
        select: { phone: true, customData: true },
    });
    if (!company) return errorResponse("Société non trouvée", 404);
    if (
        hasUsablePhone(
            company.phone,
            additionalPhonesFromCustomData(company.customData),
        )
    ) {
        return errorResponse(
            "Un numéro valide existe déjà. La suggestion n’a pas été appliquée.",
            409,
        );
    }

    await prisma.$transaction([
        prisma.company.update({
            where: { id: lookup.companyId },
            data: { phone: lookup.suggestedPhone },
        }),
        prisma.phoneEnrichmentLookup.update({
            where: { id: lookup.id },
            data: {
                status: "APPLIED",
                reviewedById: session.user.id,
                reviewedAt: new Date(),
            },
        }),
    ]);

    return successResponse({
        action: "APPLIED",
        companyId: lookup.companyId,
        phone: lookup.suggestedPhone,
        reviewedById: session.user.id,
        reviewedAt: new Date().toISOString(),
    });
});
