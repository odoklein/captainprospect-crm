// ============================================
// PATCH  /api/email/sequences/[id]/enrollments/[enrollmentId]  { action: 'pause' | 'resume' }
// DELETE /api/email/sequences/[id]/enrollments/[enrollmentId]  — remove the contact
//        (deleted if nothing was sent yet, otherwise stopped so stats survive)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sequenceService } from '@/lib/email/services/sequence-service';
import { getSequenceUser, jsonError, loadOwnedSequence, unauthorized } from '../../../_lib/shared';

type Params = { params: Promise<{ id: string; enrollmentId: string }> };

async function load(params: Params['params']) {
    const user = await getSequenceUser();
    if (!user) return { response: unauthorized() };
    const { id, enrollmentId } = await params;
    const owned = await loadOwnedSequence(id, user);
    if ('response' in owned) return { response: owned.response };
    const enrollment = await prisma.emailSequenceEnrollment.findFirst({
        where: { id: enrollmentId, sequenceId: id },
        select: { id: true, status: true },
    });
    if (!enrollment) return { response: jsonError('Inscription introuvable', 404) };
    return { enrollment };
}

export async function PATCH(req: NextRequest, { params }: Params) {
    try {
        const loaded = await load(params);
        if ('response' in loaded) return loaded.response;
        const { enrollment } = loaded;
        const body = (await req.json()) as { action?: string };

        if (body.action === 'pause') {
            if (enrollment.status !== 'ACTIVE') return jsonError('Seul un contact en cours peut être mis en pause', 400);
            await sequenceService.pauseEnrollment(enrollment.id, 'Mis en pause manuellement');
        } else if (body.action === 'resume') {
            if (enrollment.status !== 'PAUSED') return jsonError("Ce contact n'est pas en pause", 400);
            await sequenceService.resumeEnrollment(enrollment.id);
        } else {
            return jsonError('Action inconnue', 400);
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('PATCH enrollment error:', error);
        return jsonError('Action impossible', 500);
    }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
    try {
        const loaded = await load(params);
        if ('response' in loaded) return loaded.response;
        const outcome = await sequenceService.removeEnrollment(loaded.enrollment.id);
        return NextResponse.json({ success: true, data: { outcome } });
    } catch (error) {
        console.error('DELETE enrollment error:', error);
        return jsonError('Impossible de retirer ce contact', 500);
    }
}
