// ============================================
// POST /api/email/sequences/[id]/enroll
// Body: { contactIds: string[] }  — or —
//       { selection: { missionId?, listId?, q? }, excludeIds?: string[] }
//       (= every eligible contact of that selection, capped at 5 000)
// Works on DRAFT, PAUSED and ACTIVE sequences: contacts only receive emails
// once the sequence is ACTIVE.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sequenceService, ENROLL_SKIP_LABELS } from '@/lib/email/services/sequence-service';
import { getSequenceUser, jsonError, loadOwnedSequence, unauthorized } from '../../_lib/shared';
import { candidateWhere, eligibleWhere, readCandidateFilter } from '../../_lib/candidates';

const MAX_BULK = 5000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getSequenceUser();
        if (!user) return unauthorized();
        const { id: sequenceId } = await params;
        const owned = await loadOwnedSequence(sequenceId, user);
        if ('response' in owned) return owned.response;
        if (owned.sequence.status === 'ARCHIVED') {
            return jsonError('Séquence archivée : réactivez-la avant d\'inscrire des contacts', 400);
        }

        const body = (await req.json()) as Record<string, unknown>;
        let contactIds: string[] = [];

        if (Array.isArray(body.contactIds)) {
            contactIds = body.contactIds.filter((v): v is string => typeof v === 'string');
        } else if (body.selection && typeof body.selection === 'object') {
            const base = candidateWhere(readCandidateFilter(body.selection as Record<string, unknown>));
            if (!base) return jsonError('Choisissez une mission ou une liste', 400);
            const exclude = Array.isArray(body.excludeIds)
                ? body.excludeIds.filter((v): v is string => typeof v === 'string')
                : [];
            const rows = await prisma.contact.findMany({
                where: { AND: [base, eligibleWhere(sequenceId), ...(exclude.length ? [{ id: { notIn: exclude } }] : [])] },
                select: { id: true },
                take: MAX_BULK,
            });
            contactIds = rows.map((r) => r.id);
        }

        if (contactIds.length === 0) return jsonError('Aucun contact sélectionné', 400);
        if (contactIds.length > MAX_BULK) return jsonError(`${MAX_BULK} contacts maximum par inscription`, 400);

        const tokens = body.tokens && typeof body.tokens === 'object' ? (body.tokens as Record<string, string>) : undefined;
        const result = await sequenceService.enrollContacts(sequenceId, contactIds, tokens);

        return NextResponse.json({
            success: true,
            data: {
                enrolled: result.enrolled,
                failed: result.results.filter((r) => !r.success).length,
                skipped: result.skipped,
                skippedLabels: ENROLL_SKIP_LABELS,
                sequenceStatus: owned.sequence.status,
                results: result.results,
            },
        });
    } catch (error) {
        console.error('POST /api/email/sequences/[id]/enroll error:', error);
        return jsonError("Impossible d'inscrire les contacts", 500);
    }
}
