// ============================================
// SINGLE SEQUENCE API ROUTES
// GET    /api/email/sequences/[id] - Sequence, steps (+ per-step stats), enrollment counts
// PATCH  /api/email/sequences/[id] - Update settings, status and/or steps
// DELETE /api/email/sequences/[id] - Delete sequence
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { SequenceStatus } from '@prisma/client';
import { sequenceService } from '@/lib/email/services/sequence-service';
import {
    activationProblems,
    canUseMailbox,
    getSequenceUser,
    jsonError,
    loadOwnedSequence,
    parseSettings,
    serializeSequenceDetail,
    unauthorized,
    validateStepsInput,
} from '../_lib/shared';

type Params = { params: Promise<{ id: string }> };

// ============================================
// GET
// ============================================

export async function GET(_req: NextRequest, { params }: Params) {
    try {
        const user = await getSequenceUser();
        if (!user) return unauthorized();
        const { id } = await params;

        const owned = await loadOwnedSequence(id, user);
        if ('response' in owned) return owned.response;

        const data = await serializeSequenceDetail(id);
        if (!data) return jsonError('Séquence introuvable', 404);
        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('GET /api/email/sequences/[id] error:', error);
        return jsonError('Impossible de charger la séquence', 500);
    }
}

// ============================================
// PATCH
// ============================================

export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const user = await getSequenceUser();
        if (!user) return unauthorized();
        const { id } = await params;

        const owned = await loadOwnedSequence(id, user);
        if ('response' in owned) return owned.response;
        const current = owned.sequence;

        const body = (await req.json()) as Record<string, unknown>;

        const { data: settings, error } = parseSettings(body, current);
        if (error) return jsonError(error, 400);

        if (typeof settings.mailboxId === 'string' && settings.mailboxId !== current.mailboxId) {
            if (!(await canUseMailbox(user, settings.mailboxId))) {
                return jsonError("Vous ne pouvez pas envoyer depuis cette boîte", 403);
            }
        }

        // Steps first: a refused step edit must not leave half-saved settings behind.
        if (body.steps !== undefined) {
            const parsed = validateStepsInput(body.steps);
            if (parsed.error) return jsonError(parsed.error, 400);
            const saved = await sequenceService.saveSteps(id, parsed.steps!);
            if (!saved.ok) return jsonError(saved.error, 409);
        }

        let nextStatus: SequenceStatus | undefined;
        if (body.status !== undefined) {
            const status = String(body.status) as SequenceStatus;
            if (!['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'].includes(status)) {
                return jsonError('Statut inconnu', 400);
            }
            nextStatus = status;
        }

        if (Object.keys(settings).length > 0) {
            await prisma.emailSequence.update({ where: { id }, data: settings });
        }

        if (nextStatus && nextStatus !== current.status) {
            if (nextStatus === 'ACTIVE') {
                const problems = await activationProblems(id);
                if (problems.length > 0) {
                    return jsonError(`Impossible d'activer : ${problems[0]}`, 400, { problems });
                }
            }
            await prisma.emailSequence.update({ where: { id }, data: { status: nextStatus } });
            if (nextStatus === 'ACTIVE') await sequenceService.onSequenceActivated(id);
        }

        const data = await serializeSequenceDetail(id);
        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('PATCH /api/email/sequences/[id] error:', error);
        return jsonError("Impossible d'enregistrer la séquence", 500);
    }
}

// ============================================
// DELETE
// ============================================

export async function DELETE(_req: NextRequest, { params }: Params) {
    try {
        const user = await getSequenceUser();
        if (!user) return unauthorized();
        const { id } = await params;

        const owned = await loadOwnedSequence(id, user);
        if ('response' in owned) return owned.response;

        if (owned.sequence.status === 'ACTIVE') {
            const active = await prisma.emailSequenceEnrollment.count({ where: { sequenceId: id, status: 'ACTIVE' } });
            if (active > 0) {
                return jsonError(
                    `Cette séquence envoie encore à ${active} contact${active > 1 ? 's' : ''}. Mettez-la en pause avant de la supprimer.`,
                    400,
                );
            }
        }

        await prisma.emailSequence.delete({ where: { id } });
        return NextResponse.json({ success: true, message: 'Séquence supprimée' });
    } catch (error) {
        console.error('DELETE /api/email/sequences/[id] error:', error);
        return jsonError('Impossible de supprimer la séquence', 500);
    }
}
