import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, successResponse, validateRequest, withErrorHandler } from "@/lib/api-utils";
import { cleanDomain, normalizeCompanyName, phoneKey } from "@/lib/sourcing/merge";
import type { CrmMatch } from "@/lib/sourcing/types";

// ============================================
// POST /api/prospects/sourcing/match — which sourced leads already exist in
// the CRM (any list), by phone, then domain, then exact company name.
// ============================================

const bodySchema = z.object({
    leads: z
        .array(
            z.object({
                id: z.string(),
                name: z.string(),
                website: z.string().optional(),
                phone: z.string().optional(),
            }),
        )
        .max(2000),
});

/** Company.phone is stored however the CSV had it: query the usual spellings. */
function phoneVariants(phone: string): string[] {
    const k = phoneKey(phone);
    if (!k) return [];
    const local = `0${k}`;
    const pairs = local.match(/.{1,2}/g)!;
    return [phone, local, pairs.join(" "), pairs.join("."), `+33${k}`, `+33 ${k[0]} ${pairs.slice(1).join(" ")}`];
}

function chunk<T>(arr: T[], n: number): T[][] {
    return Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
}

type Row = { id: string; name: string; phone: string | null; website: string | null; listId: string; list: { name: string } };

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(["MANAGER"], request);
    const { leads } = await validateRequest(request, bodySchema);
    if (leads.length === 0) return successResponse({});

    const phones = [...new Set(leads.flatMap((l) => (l.phone ? phoneVariants(l.phone) : [])))];
    const domains = [...new Set(leads.map((l) => cleanDomain(l.website)).filter((d): d is string => !!d))];
    const names = [...new Set(leads.map((l) => l.name.trim()))];

    const select = { id: true, name: true, phone: true, website: true, listId: true, list: { select: { name: true } } } as const;
    const rows: Row[] = [];

    for (const part of chunk(phones, 500)) {
        rows.push(...(await prisma.company.findMany({ where: { phone: { in: part } }, select, take: 2000 })));
    }
    for (const part of chunk(domains, 80)) {
        rows.push(
            ...(await prisma.company.findMany({
                where: { OR: part.map((d) => ({ website: { contains: d, mode: "insensitive" as const } })) },
                select,
                take: 2000,
            })),
        );
    }
    for (const part of chunk(names, 500)) {
        rows.push(...(await prisma.company.findMany({ where: { name: { in: part, mode: "insensitive" } }, select, take: 2000 })));
    }

    const byPhone = new Map<string, Row>();
    const byDomain = new Map<string, Row>();
    const byName = new Map<string, Row>();
    for (const r of rows) {
        const p = phoneKey(r.phone);
        if (p) byPhone.set(p, r);
        const d = cleanDomain(r.website);
        if (d) byDomain.set(d, r);
        byName.set(normalizeCompanyName(r.name), r);
    }

    const result: Record<string, CrmMatch> = {};
    for (const lead of leads) {
        const p = phoneKey(lead.phone);
        const d = cleanDomain(lead.website);
        const n = normalizeCompanyName(lead.name);
        let hit: [Row, CrmMatch["by"]] | null = null;
        if (p && byPhone.has(p)) hit = [byPhone.get(p)!, "phone"];
        else if (d && byDomain.has(d)) hit = [byDomain.get(d)!, "domain"];
        else if (n && byName.has(n)) hit = [byName.get(n)!, "name"];
        if (hit) {
            const [row, by] = hit;
            result[lead.id] = { companyId: row.id, companyName: row.name, listId: row.listId, listName: row.list.name, by };
        }
    }
    return successResponse(result);
});
