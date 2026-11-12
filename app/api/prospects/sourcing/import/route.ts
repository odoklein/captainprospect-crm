import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { errorResponse, requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { calculateCompanyCompleteness, calculateContactCompleteness, type CompletenessStatus } from "@/lib/scoring";
import { applyActiveExclusionsToList } from "@/lib/exclusions/service";
import { SOURCE_BY_ID } from "@/lib/sourcing/catalog";
import { normalizeCompanyName } from "@/lib/sourcing/merge";
import { leadSchema, querySchema } from "@/lib/sourcing/schemas";
import type { SourcingImportResult } from "@/lib/sourcing/types";

// ============================================
// POST /api/prospects/sourcing/import — write selected leads into a list.
// One request, server-side: phone, address, SIREN, rating and contacts are
// kept (the old per-row import only sent name/industry/country/site/size).
// Companies already in the target list (same normalized name) are skipped.
// ============================================

const bodySchema = z
    .object({
        listId: z.string().optional(),
        newList: z
            .object({
                name: z.string().trim().min(1, "Nom de la liste requis").max(200),
                missionId: z.string().min(1, "Mission requise"),
                type: z.enum(["SUZALI", "CLIENT", "MIXED"]).default("SUZALI"),
            })
            .optional(),
        // The UI sends the selection in batches; this only guards an abusive payload.
        leads: z.array(leadSchema).min(1, "Aucune société sélectionnée").max(10000, "Maximum 10 000 sociétés par requête"),
        query: querySchema.partial().optional(),
    })
    .refine((b) => !!b.listId !== !!b.newList, "Choisissez une liste existante ou créez-en une");

const regionNames = new Intl.DisplayNames(["fr"], { type: "region" });

/** "FR" → "France"; anything that is not an ISO-2 code is kept as is. */
function countryName(code?: string): string | null {
    if (!code) return null;
    if (!/^[a-z]{2}$/i.test(code)) return code;
    try {
        return regionNames.of(code.toUpperCase()) ?? code;
    } catch {
        return code;
    }
}

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const body = await validateRequest(request, bodySchema);

    const usedSources = [...new Set(body.leads.flatMap((l) => l.sources))].map((s) => SOURCE_BY_ID[s].label);

    let list: { id: string; name: string } | null;
    if (body.newList) {
        const mission = await prisma.mission.findUnique({ where: { id: body.newList.missionId }, select: { id: true } });
        if (!mission) return errorResponse("Mission introuvable", 404);
        list = await prisma.list.create({
            data: {
                name: body.newList.name,
                missionId: body.newList.missionId,
                type: body.newList.type,
                source: usedSources.join(" + "),
                importConfig: { kind: "sourcing", sources: usedSources, query: body.query ?? null },
            },
            select: { id: true, name: true },
        });
    } else {
        list = await prisma.list.findUnique({ where: { id: body.listId! }, select: { id: true, name: true } });
        if (!list) return errorResponse("Liste introuvable", 404);
    }

    const existing = await prisma.company.findMany({ where: { listId: list.id }, select: { name: true } });
    const seen = new Set(existing.map((c) => normalizeCompanyName(c.name)));

    type ContactRow = {
        firstName: string | null;
        lastName: string | null;
        title: string | null;
        email: string | null;
        phone: string | null;
        linkedin: string | null;
        status: CompletenessStatus;
    };
    type PendingCompany = {
        company: {
            name: string;
            industry: string | null;
            country: string | null;
            website: string | null;
            size: string | null;
            phone: string | null;
            customData: Record<string, string | number>;
            listId: string;
            status: CompletenessStatus;
        };
        contacts: ContactRow[];
    };

    let skipped = 0;
    let contacts = 0;
    let phones = 0;
    const pending: PendingCompany[] = [];

    for (const lead of body.leads) {
        const key = normalizeCompanyName(lead.name);
        if (seen.has(key)) {
            skipped++;
            continue;
        }
        seen.add(key);

        const contactRows: ContactRow[] = lead.contacts
            .filter((c) => c.firstName || c.lastName || c.email || c.phone)
            .map((c) => ({
                firstName: c.firstName || null,
                lastName: c.lastName || null,
                title: c.title || null,
                email: c.email || null,
                phone: c.phone || null,
                linkedin: c.linkedin || null,
                status: calculateContactCompleteness(c),
            }));

        const customData = Object.fromEntries(
            Object.entries({
                adresse: lead.address,
                codePostal: lead.postalCode,
                ville: lead.city,
                siren: lead.siren,
                codeNaf: lead.naf,
                effectif: lead.headcount,
                noteGoogle: lead.rating,
                avisGoogle: lead.reviews,
                ficheGoogleMaps: lead.mapsUrl,
                linkedin: lead.linkedin,
                sourcing: lead.sources.map((s) => SOURCE_BY_ID[s].label).join(" + "),
            }).filter(([, v]) => v !== undefined && v !== null && v !== ""),
        ) as Record<string, string | number>;

        const companyData = {
            name: lead.name,
            industry: lead.industry || null,
            country: countryName(lead.country),
            website: lead.website ? `https://${lead.website}` : null,
            size: lead.headcount || null,
        };

        pending.push({
            company: {
                ...companyData,
                phone: lead.phone || null,
                customData,
                listId: list.id,
                status: calculateCompanyCompleteness({ ...companyData, contacts: contactRows }),
            },
            contacts: contactRows,
        });
        contacts += contactRows.length;
        if (lead.phone) phones++;
    }

    // Bulk insert in bounded transactions: 1 000 sequential creates per request
    // is slow on a hosted database, and the old per-row loop blocked large imports.
    const WRITE_CHUNK = 500;
    for (let offset = 0; offset < pending.length; offset += WRITE_CHUNK) {
        const chunk = pending.slice(offset, offset + WRITE_CHUNK);
        await prisma.$transaction(
            async (tx) => {
                await tx.company.createMany({ data: chunk.map((p) => p.company) });
                const createdRows = await tx.company.findMany({
                    where: { listId: list.id, name: { in: chunk.map((p) => p.company.name) } },
                    select: { id: true, name: true },
                });
                const idByName = new Map<string, string>();
                for (const row of createdRows) {
                    const key = normalizeCompanyName(row.name);
                    if (!idByName.has(key)) idByName.set(key, row.id);
                }
                const contactData = chunk.flatMap((p) => {
                    const companyId = idByName.get(normalizeCompanyName(p.company.name));
                    if (!companyId) return [];
                    return p.contacts.map((c) => ({ ...c, companyId }));
                });
                if (contactData.length > 0) {
                    await tx.contact.createMany({ data: contactData });
                }
            },
            { timeout: 30000 },
        );
    }

    const created = pending.length;

    if (created > 0) {
        try {
            await applyActiveExclusionsToList(list.id);
        } catch (err) {
            console.error("Exclusion re-apply after sourcing import failed:", err);
        }
    }

    const result: SourcingImportResult = { listId: list.id, listName: list.name, created, skipped, contacts, phones };
    return successResponse(result, 201);
});
