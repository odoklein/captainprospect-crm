import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    paginatedResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
    getPaginationParams,
} from '@/lib/api-utils';
import { z } from 'zod';

// ============================================
// SCHEMAS — only companyId required; empty strings treated as omitted (no "fill all" requirement)
// ============================================

const emptyStringToUndefined = <T>(v: unknown): T | undefined => (v === "" || v === null ? undefined : v as T);

const createContactSchema = z.object({
    companyId: z.string().min(1, 'Entreprise requise'),
    firstName: z.preprocess(emptyStringToUndefined, z.string().optional()),
    lastName: z.preprocess(emptyStringToUndefined, z.string().optional()),
    title: z.preprocess(emptyStringToUndefined, z.string().optional()),
    email: z.preprocess(emptyStringToUndefined, z.string().email().optional()),
    phone: z.preprocess(emptyStringToUndefined, z.string().optional()),
    additionalPhones: z.array(z.string()).optional(),
    additionalEmails: z.preprocess(
        (arr) => (Array.isArray(arr) ? arr.filter((s) => typeof s === "string" && s.trim() !== "") : arr),
        z.array(z.string().email()).optional()
    ),
    linkedin: z.preprocess(emptyStringToUndefined, z.string().url().optional()),
});

const updateContactSchema = createContactSchema.partial();

// ============================================
// GET /api/contacts - List contacts
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER', 'SDR'], request);
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(searchParams);

    const companyId = searchParams.get('companyId');
    const listId = searchParams.get('listId');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {};

    if (companyId) where.companyId = companyId;
    if (listId) where.company = { listId };
    if (status) where.status = status;
    if (search) {
        where.OR = [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { company: { name: { contains: search, mode: 'insensitive' } } },
        ];

        // Phone search: compare digits only, ignoring the +33 / leading 0 prefix, so
        // a pasted "06 12 34 56 78", "+33612345678" or "612345678" all find the same
        // contact — e.g. a prospect calling back with only their number in hand (TC-0040).
        const searchDigits = search.replace(/\D/g, '');
        const phoneNeedle = searchDigits.length >= 4
            ? (searchDigits.startsWith('33') && searchDigits.length > 9 ? searchDigits.slice(2) : searchDigits)
                .replace(/^0+/, '')
                .slice(-9)
            : '';
        if (phoneNeedle.length >= 3) {
            const filters: Prisma.Sql[] = [];
            if (companyId) filters.push(Prisma.sql`c."companyId" = ${companyId}`);
            if (listId) filters.push(Prisma.sql`co."listId" = ${listId}`);
            const extraWhere = filters.length
                ? Prisma.sql`AND ${Prisma.join(filters, ' AND ')}`
                : Prisma.empty;
            const phonePattern = `%${phoneNeedle}%`;
            const phoneMatches = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
                SELECT c.id FROM "Contact" c
                LEFT JOIN "Company" co ON co.id = c."companyId"
                WHERE (
                    regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') LIKE ${phonePattern}
                    OR regexp_replace(COALESCE(co.phone, ''), '[^0-9]', '', 'g') LIKE ${phonePattern}
                )
                ${extraWhere}
                LIMIT 200
            `);
            if (phoneMatches.length > 0) {
                (where.OR as unknown[]).push({ id: { in: phoneMatches.map((m) => m.id) } });
            }
        }
    }

    const [contacts, total] = await Promise.all([
        prisma.contact.findMany({
            where,
            include: {
                company: {
                    select: { id: true, name: true, industry: true, listId: true },
                },
                _count: { select: { actions: true, opportunities: true } },
            },
            orderBy: [
                { status: 'desc' }, // ACTIONABLE first
                { createdAt: 'desc' },
            ],
            skip,
            take: limit,
        }),
        prisma.contact.count({ where }),
    ]);

    return paginatedResponse(contacts, total, page, limit);
});

// ============================================
// POST /api/contacts - Create contact
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER', 'SDR'], request);
    const data = await validateRequest(request, createContactSchema);

    // Calculate completeness status
    let status: 'INCOMPLETE' | 'PARTIAL' | 'ACTIONABLE' = 'INCOMPLETE';
    const hasChannel = !!(data.phone || data.email || data.linkedin);
    const hasName = !!(data.firstName || data.lastName);
    if (hasChannel && hasName) {
        status = 'ACTIONABLE';
    } else if (hasChannel || hasName) {
        status = 'PARTIAL';
    }

    const contact = await prisma.contact.create({
        data: {
            ...data,
            status,
            ...(data.additionalPhones && { additionalPhones: data.additionalPhones }),
            ...(data.additionalEmails && { additionalEmails: data.additionalEmails }),
        },
        include: { company: true },
    });

    // Update company completeness
    await updateCompanyCompleteness(data.companyId);

    return successResponse(contact, 201);
});

// ============================================
// HELPER: Update company completeness
// ============================================

async function updateCompanyCompleteness(companyId: string) {
    const contacts = await prisma.contact.findMany({
        where: { companyId },
        select: { status: true },
    });

    let companyStatus: 'INCOMPLETE' | 'PARTIAL' | 'ACTIONABLE' = 'INCOMPLETE';

    if (contacts.some((c) => c.status === 'ACTIONABLE')) {
        companyStatus = 'ACTIONABLE';
    } else if (contacts.some((c) => c.status === 'PARTIAL')) {
        companyStatus = 'PARTIAL';
    }

    await prisma.company.update({
        where: { id: companyId },
        data: { status: companyStatus },
    });
}
