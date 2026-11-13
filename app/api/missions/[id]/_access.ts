import type { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { errorResponse } from '@/lib/api-utils';
import { isMissionInPortalLaunch } from '@/lib/portal-visibility';

/** Roles allowed to read a mission (GET /api/missions/[id] and its read-only sub-resources). */
export const MISSION_READ_ROLES = ['MANAGER', 'CLIENT', 'SDR', 'BUSINESS_DEVELOPER', 'BOOKER'];

export interface MissionAccessSubject {
    clientId: string;
    portalVisibleAt: Date | string | null;
    sdrAssignments: Array<{ sdrId: string }>;
}

/**
 * Per-role read access to a mission, shared by GET /api/missions/[id] and
 * GET /api/missions/[id]/insights:
 *   - CLIENT: a user of the mission's client, and not while the portal is in launch;
 *   - SDR / BUSINESS_DEVELOPER: assigned to the mission;
 *   - MANAGER / BOOKER: any mission.
 * Returns the 403 response to send, or null when access is granted.
 */
export async function denyMissionRead(
    user: { id: string; role: string },
    mission: MissionAccessSubject,
): Promise<NextResponse | null> {
    if (user.role === 'CLIENT') {
        const hasAccess = await prisma.user.findFirst({
            where: { id: user.id, clientId: mission.clientId },
            select: { id: true },
        });
        if (!hasAccess) {
            return errorResponse('Accès non autorisé', 403);
        }
        if (isMissionInPortalLaunch(mission)) {
            return errorResponse('Mission en phase de démarrage', 403);
        }
    }

    if (user.role === 'SDR' || user.role === 'BUSINESS_DEVELOPER') {
        const isAssigned = mission.sdrAssignments.some((a) => a.sdrId === user.id);
        if (!isAssigned) {
            return errorResponse('Accès non autorisé', 403);
        }
    }

    return null;
}
