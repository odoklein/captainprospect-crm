import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { providersStatus, resolveFrenchArea, searchAnnuaire, searchApollo } from "@/lib/sourcing/providers.server";
import { querySchema } from "@/lib/sourcing/schemas";
import type { SourcedLead } from "@/lib/sourcing/types";

// ============================================
// POST /api/prospects/sourcing/search — synchronous sources (registry, Apollo).
// Runs every activity × location pair and returns the raw leads plus one
// warning per pair that failed, so a bad city never sinks the whole search.
// ============================================

// A whole-France registry pass is ~100 départements × a few pages.
export const maxDuration = 300;

const bodySchema = z.object({
    source: z.enum(["annuaire", "apollo"]),
    query: querySchema,
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const { source, query } = await validateRequest(request, bodySchema);

    const status = providersStatus()[source];
    if (!status.configured) return errorResponse(status.reason ?? "Source non configurée", 400);

    const leads: SourcedLead[] = [];
    const warnings: string[] = [];

    for (const location of query.locations) {
        if (source === "annuaire") {
            const area = await resolveFrenchArea(location);
            if (!area) {
                warnings.push(`« ${location} » introuvable en France (le registre ne couvre que la France)`);
                continue;
            }
            for (const activity of query.activities) {
                try {
                    leads.push(
                        ...(await searchAnnuaire({
                            activity,
                            area,
                            perSearch: query.perSearch,
                            activeOnly: query.activeOnly,
                            headcount: query.headcount,
                        })),
                    );
                } catch (e) {
                    warnings.push(`${activity.label} · ${location} : ${e instanceof Error ? e.message : "échec"}`);
                }
            }
        } else {
            for (const activity of query.activities) {
                try {
                    leads.push(...(await searchApollo({ activity, location, perSearch: query.perSearch })));
                } catch (e) {
                    warnings.push(`${activity.label} · ${location} : ${e instanceof Error ? e.message : "échec"}`);
                }
            }
        }
    }

    return successResponse({ leads, warnings });
});
