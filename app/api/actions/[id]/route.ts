import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
    successResponse,
    errorResponse,
    requireRole,
    withErrorHandler,
    validateRequest,
    NotFoundError,
} from '@/lib/api-utils';
import {
    MEETING_CANCELLATION_REASON_CODES,
    type MeetingCancellationReasonCode,
} from '@/lib/constants/meetingCancellationReasons';
import { actionService, resolveActionResult } from '@/lib/services/ActionService';
import { statusConfigService } from '@/lib/services/StatusConfigService';
import type { ActionResult } from '@prisma/client';
import { z } from 'zod';

// ============================================
// PATCH /api/actions/[id] - Update callback date (reschedule rappel) or meeting (result + note + cancellationReason + callbackDate)
// ============================================

const meetingResults = ['MEETING_BOOKED', 'MEETING_CANCELLED'] as const;

const updateCallbackSchema = z.object({
    callbackDate: z.union([z.string(), z.date()]).optional().transform((s) => (s ? (typeof s === 'string' ? new Date(s) : s) : undefined)),
    note: z.string().max(2000).optional(),
    result: z.string().optional(),
    cancellationReason: z
        .string()
        .refine((v) => MEETING_CANCELLATION_REASON_CODES.includes(v as MeetingCancellationReasonCode))
        .optional(),
    meetingType: z.enum(['VISIO', 'PHYSIQUE', 'TELEPHONIQUE']).optional(),
    meetingCategory: z.enum(['EXPLORATOIRE', 'BESOIN']).optional().nullable(),
    meetingAddress: z.string().max(500).optional().nullable(),
    meetingJoinUrl: z.string().url('Lien de rejoindre invalide').max(2000).optional().nullable(),
    meetingPhone: z.string().max(50).optional().nullable(),
}).refine(
    (data) => {
        if (!data.meetingType) return true;
        if (data.meetingType === 'VISIO') return !!data.meetingJoinUrl?.trim();
        if (data.meetingType === 'PHYSIQUE') return !!data.meetingAddress?.trim();
        return true;
    },
    { message: 'VISIO requiert un lien de rejoindre ; PHYSIQUE requiert une adresse.', path: ['meetingType'] }
);

export const PATCH = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['SDR', 'BUSINESS_DEVELOPER', 'MANAGER'], request);
    const { id } = await params;
    const data = await validateRequest(request, updateCallbackSchema);

    const action = await prisma.action.findUnique({
        where: { id },
        include: {
            campaign: { select: { id: true, missionId: true } },
        },
    });

    if (!action) {
        throw new NotFoundError('Action introuvable');
    }

    const isMeetingAction = action.result === 'MEETING_BOOKED' || action.result === 'MEETING_CANCELLED';

    // Meeting: result + note + cancellationReason (when cancelling) + callbackDate (reschedule); Callback: callbackDate + note
    if (isMeetingAction && data.result !== undefined && !meetingResults.includes(data.result as (typeof meetingResults)[number])) {
        return errorResponse('Statut RDV invalide', 400);
    }
    if (
        data.cancellationReason !== undefined &&
        !MEETING_CANCELLATION_REASON_CODES.includes(data.cancellationReason as MeetingCancellationReasonCode)
    ) {
        return errorResponse('Raison d\'annulation invalide', 400);
    }

    // Access: SDR, BD, Manager can all modify any meeting (remove, reschedule, cancel, absent)
    // No restriction by ownership - everyone has full access to meeting actions

    const updateData: {
        callbackDate?: Date;
        note?: string;
        result?: (typeof meetingResults)[number] | ActionResult;
        cancellationReason?: string | null;
        meetingType?: string | null;
        meetingCategory?: string | null;
        meetingAddress?: string | null;
        meetingJoinUrl?: string | null;
        meetingPhone?: string | null;
        confirmationStatus?: string;
        confirmationUpdatedAt?: Date;
    } = {};
    if (data.callbackDate !== undefined) updateData.callbackDate = data.callbackDate;
    if (data.note !== undefined) updateData.note = data.note;
    if (isMeetingAction && data.result !== undefined) {
        updateData.result = data.result as (typeof meetingResults)[number];
        if (updateData.result === 'MEETING_CANCELLED') {
            updateData.confirmationStatus = 'CANCELLED';
            updateData.confirmationUpdatedAt = new Date();
        }
    }
    if (isMeetingAction && data.cancellationReason !== undefined) updateData.cancellationReason = data.cancellationReason;
    if (isMeetingAction && data.meetingType !== undefined) updateData.meetingType = data.meetingType;
    if (isMeetingAction && data.meetingCategory !== undefined) updateData.meetingCategory = data.meetingCategory;
    if (isMeetingAction && data.meetingAddress !== undefined) updateData.meetingAddress = data.meetingAddress;
    if (isMeetingAction && data.meetingJoinUrl !== undefined) updateData.meetingJoinUrl = data.meetingJoinUrl;
    if (isMeetingAction && data.meetingPhone !== undefined) updateData.meetingPhone = data.meetingPhone;

    // Any other action (call/email/linkedin outcome, e.g. re-qualifying a
    // "PROJET_A_SUIVRE" contact to "HORS_CIBLE") can also have its result
    // changed in place, instead of forcing a brand-new action record.
    let resolvedGeneralResult: ActionResult | null = null;
    if (!isMeetingAction && data.result !== undefined) {
        const allowedCodes = await statusConfigService.getAllowedResultCodes({ campaignId: action.campaignId });
        if (!allowedCodes.includes(data.result)) {
            return errorResponse('Résultat non autorisé pour cette campagne', 400);
        }
        const config = await statusConfigService.getEffectiveStatusConfig({ campaignId: action.campaignId });
        const statusDef = config.statuses.find((s) => s.code === data.result);
        const finalNote = data.note !== undefined ? data.note : action.note;
        if (statusDef?.requiresNote && !finalNote?.trim()) {
            return errorResponse('Une note est requise pour ce type de résultat', 400);
        }
        resolvedGeneralResult = resolveActionResult(data.result);
        updateData.result = resolvedGeneralResult;
    }

    if (Object.keys(updateData).length === 0) {
        return errorResponse('Aucune donnée à mettre à jour', 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
        const rec = await tx.action.update({
            where: { id },
            data: updateData,
            include: {
                contact: { select: { id: true, firstName: true, lastName: true, company: { select: { name: true } } } },
                company: { select: { id: true, name: true } },
                campaign: { select: { id: true, name: true, mission: { select: { id: true, name: true } } } },
            },
        });
        if (resolvedGeneralResult && action.contactId) {
            await actionService.applyResultSideEffects(tx, action.contactId, resolvedGeneralResult, updateData.note ?? action.note);
        }
        return rec;
    });

    return successResponse(updated);
});

// ============================================
// DELETE /api/actions/[id] - Delete an action.
// Meetings (booked/cancelled) can be deleted by SDR, BD or Manager, as before.
// Any other action (e.g. a duplicate call/email/linkedin log entry) can only
// be deleted by a Manager, so the base can be cleaned up without opening
// deletion to everyone.
// ============================================

const MEETING_RESULTS_FOR_DELETE = ['MEETING_BOOKED', 'MEETING_CANCELLED'] as const;

export const DELETE = withErrorHandler(async (
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    const session = await requireRole(['SDR', 'BUSINESS_DEVELOPER', 'MANAGER'], request);
    const { id } = await params;

    const action = await prisma.action.findUnique({
        where: { id },
        include: {
            campaign: { select: { missionId: true } },
        },
    });

    if (!action) {
        throw new NotFoundError('Action introuvable');
    }

    const isMeeting = MEETING_RESULTS_FOR_DELETE.includes(action.result as (typeof MEETING_RESULTS_FOR_DELETE)[number]);
    if (!isMeeting && session.user.role !== 'MANAGER') {
        return errorResponse('Seuls les managers peuvent supprimer cette action', 403);
    }

    await prisma.action.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
});
