import { NextRequest } from 'next/server';
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

const updateCompanySchema = z.object({
    name: z.string().min(1, 'Nom requis').optional(),
    industry: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    website: z.string().optional().nullable(),
    size: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
});

// ============================================
// GET /api/companies/[id] - Get single company
// ============================================

export const GET = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER', 'SDR', 'BUSINESS_DEVELOPER', 'BOOKER'], request);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const light = searchParams.get('light') === 'true';

    const company = await prisma.company.findUnique({
        where: { id },
        include: {
            contacts: light
                ? {
                      take: 25,
                      orderBy: { createdAt: 'desc' as const },
                      select: {
                          id: true,
                          firstName: true,
                          lastName: true,
                          email: true,
                          phone: true,
                          title: true,
                          linkedin: true,
                          status: true,
                          companyId: true,
                      },
                  }
                : {
                      orderBy: { createdAt: 'desc' },
                  },
            list: {
                select: {
                    id: true,
                    name: true,
                    mission: {
                        select: {
                            id: true,
                            name: true,
                            client: {
                                select: { id: true, name: true },
                            },
                        },
                    },
                },
            },
            _count: {
                select: { contacts: true, opportunities: true },
            },
        },
    });

    if (!company) {
        return errorResponse('Société non trouvée', 404);
    }

    // Why this row is not callable, resolved here so the drawer can explain
    // itself in one request instead of leaving an SDR guessing.
    const exclusion = company.exclusionId
        ? await prisma.exclusion.findUnique({
              where: { id: company.exclusionId },
              select: {
                  id: true,
                  target: true,
                  reason: true,
                  createdAt: true,
                  expiresAt: true,
                  createdById: true,
              },
          })
        : null;

    const createdByName = exclusion
        ? (await prisma.user.findUnique({
              where: { id: exclusion.createdById },
              select: { name: true },
          }))?.name ?? null
        : null;

    return successResponse({
        ...company,
        exclusion: exclusion ? { ...exclusion, createdByName } : null,
    });
});

// ============================================
// PUT /api/companies/[id] - Update company
// ============================================

export const PUT = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER', 'SDR', 'BUSINESS_DEVELOPER', 'BOOKER'], request);
    const { id } = await params;
    const data = await validateRequest(request, updateCompanySchema);

    const company = await prisma.company.findUnique({
        where: { id },
    });

    if (!company) {
        return errorResponse('Société non trouvée', 404);
    }

    const updated = await prisma.company.update({
        where: { id },
        data: {
            name: data.name ?? company.name,
            industry: data.industry ?? company.industry,
            country: data.country ?? company.country,
            website: data.website ?? company.website,
            size: data.size ?? company.size,
            phone: data.phone ?? company.phone,
        },
        include: {
            contacts: true,
            _count: {
                select: { contacts: true },
            },
        },
    });

    return successResponse(updated);
});

// ============================================
// DELETE /api/companies/[id] - Delete company
// ============================================

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    await requireRole(['MANAGER', 'SDR'], request);
    const { id } = await params;

    const company = await prisma.company.findUnique({
        where: { id },
    });

    if (!company) {
        return errorResponse('Société non trouvée', 404);
    }

    await prisma.company.delete({
        where: { id },
    });

    return successResponse({ message: 'Société supprimée' });
});
