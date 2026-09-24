import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { successResponse, requireRole, withErrorHandler } from '@/lib/api-utils';

// ============================================
// GET /api/client/access-check
// Real checks behind the portal's entry screen ("Vérification de votre accès"):
// the session is valid, the account is still active, and it is attached to an
// existing client space. Every line the screen shows maps to a field here.
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(['CLIENT', 'COMMERCIAL'], request);

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isActive: true, clientId: true, client: { select: { name: true } } },
    });

    return successResponse({
        sessionValid: true,
        accountActive: !!user?.isActive,
        clientSpace: user?.client ? { name: user.client.name } : null,
        checkedAt: new Date().toISOString(),
    });
});
