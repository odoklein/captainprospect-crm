import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
} from '@/lib/api-utils';
import { z } from 'zod';

// ============================================
// SCHEMAS
// ============================================

const createCompanySchema = z.object({
    name: z.string().min(1, 'Nom de la société requis'),
    industry: z.string().optional(),
    country: z.string().optional(),
    website: z.string().url().optional().or(z.literal('')),
    size: z.string().optional(),
});

// ============================================
// GET /api/lists/[id]/companies - Get list companies with contacts
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER', 'SDR'], request);
    const { id } = await params;

    const companies = await prisma.company.findMany({
        where: { listId: id },
        include: {
            contacts: true,
            _count: {
                select: { contacts: true },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    // Flatten the exclusion motive onto each row so the list can explain a
    // greyed-out company without one request per line.
    const exclusionIds = [
        ...new Set(companies.map((c) => c.exclusionId).filter((value): value is string => !!value)),
    ];
    const exclusions = exclusionIds.length
        ? await prisma.exclusion.findMany({
              where: { id: { in: exclusionIds } },
              select: { id: true, reason: true, expiresAt: true },
          })
        : [];
    const exclusionById = new Map(exclusions.map((e) => [e.id, e]));

    return successResponse(
        companies.map((company) => {
            const exclusion = company.exclusionId ? exclusionById.get(company.exclusionId) : null;
            return {
                ...company,
                exclusionReason: exclusion?.reason ?? null,
                exclusionExpiresAt: exclusion?.expiresAt ?? null,
            };
        })
    );
});

// ============================================
// POST /api/lists/[id]/companies - Create new company in list
// ============================================

export const POST = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER'], request);
    const { id: listId } = await params;
    const data = await validateRequest(request, createCompanySchema);

    // Verify list exists
    const list = await prisma.list.findUnique({
        where: { id: listId },
    });

    if (!list) {
        return errorResponse('Liste non trouvée', 404);
    }

    // Check if company with same name already exists in this list
    const existingCompany = await prisma.company.findFirst({
        where: {
            listId,
            name: data.name,
        },
    });

    if (existingCompany) {
        return errorResponse('Une société avec ce nom existe déjà dans cette liste', 400);
    }

    // Create company
    const company = await prisma.company.create({
        data: {
            name: data.name,
            industry: data.industry || null,
            country: data.country || null,
            website: data.website || null,
            size: data.size || null,
            listId,
            status: 'INCOMPLETE', // Will be updated when contacts are added
        },
        include: {
            contacts: true,
            _count: {
                select: { contacts: true },
            },
        },
    });

    return successResponse(company, 201);
});
