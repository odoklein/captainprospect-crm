import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse, requireRole, withErrorHandler } from '@/lib/api-utils';
import { companiesMatch } from '@/lib/leexi/matching';

// ============================================
// GET /api/clients/similar?name=Acme
// Existing clients whose name matches (SAS/SARL, accents and spacing ignored),
// so « Nouveau client » can warn before creating a duplicate.
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    await requireRole(['MANAGER'], request);
    const name = new URL(request.url).searchParams.get('name')?.trim() ?? '';
    if (name.length < 2) return successResponse([]);

    const clients = await prisma.client.findMany({
        select: { id: true, name: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
    });

    return successResponse(clients.filter((c) => companiesMatch(c.name, name)).slice(0, 5));
});
