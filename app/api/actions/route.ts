import { NextRequest } from 'next/server';
import { after } from 'next/server';
import {
 successResponse,
 errorResponse,
 paginatedResponse,
 requireRole,
 withErrorHandler,
 validateRequest,
 getPaginationParams,
} from '@/lib/api-utils';
import { actionService } from '@/lib/services/ActionService';
import { statusConfigService } from '@/lib/services/StatusConfigService';
import { enqueueActionCallEnrichment } from '@/lib/call-enrichment/scheduler';
import { z } from 'zod';

// ============================================
// SCHEMAS
// ============================================

const createActionSchema = z.object({
    contactId: z.string().min(1, 'Contact requis').optional(),
    companyId: z.string().min(1, 'Company requis').optional(),
    campaignId: z.string().min(1, 'Campagne requise'),
    channel: z.enum(['CALL', 'EMAIL', 'LINKEDIN']),
    result: z.string().min(1, 'Résultat requis'),
    note: z.string().max(500, 'Note trop longue (max 500 caractères)').optional(),
    callbackDate: z.union([z.string(), z.date()]).optional().transform((s) => (s ? (typeof s === 'string' ? new Date(s) : s) : undefined)),
    duration: z.number().positive().max(7200, 'Durée invalide').optional(),
    meetingType: z.enum(['VISIO', 'PHYSIQUE', 'TELEPHONIQUE']).optional(),
    meetingCategory: z.enum(['EXPLORATOIRE', 'BESOIN']).optional(),
    meetingAddress: z.string().max(500).optional(),
    meetingJoinUrl: z.string().url('Lien de rejoindre invalide').max(2000).optional(),
    meetingPhone: z.string().max(50).optional(),
}).refine(data => data.contactId || data.companyId, {
    message: 'Contact ou Company requis',
    path: ['contactId'],
}).refine(
    (data) => {
        if (data.result !== 'MEETING_BOOKED' || !data.meetingType) return true;
        // VISIO/PHYSIQUE: link and address are optional (e.g. manager-created RDV)
        return true;
    },
    {
        message: 'VISIO requiert un lien de rejoindre ; PHYSIQUE requiert une adresse.',
        path: ['meetingType'],
    }
);

// ============================================
// GET /api/actions - List actions
// ============================================

export const GET = withErrorHandler(async (request: NextRequest) => {
 const session = await requireRole(['MANAGER', 'SDR', 'BUSINESS_DEVELOPER', 'BOOKER'], request);
 const { searchParams } = new URL(request.url);
 const { page, limit } = getPaginationParams(searchParams);

 // Build filters
 const filters: any = { page, limit };

 const missionId = searchParams.get('missionId');
 const result = searchParams.get('result');
 const from = searchParams.get('from');
 const to = searchParams.get('to');
 const contactId = searchParams.get('contactId');
 const companyId = searchParams.get('companyId');
 if (missionId) filters.missionId = missionId;

 // When viewing actions for a specific contact or company (drawer history),
 // show ALL actions from all team members so every role can see notes & history.
 // Only filter by sdrId when listing actions in general (no entity-specific filter).
 const isEntityView = !!(contactId || companyId);

 if (session.user.role === 'SDR' || session.user.role === 'BUSINESS_DEVELOPER') {
 if (!isEntityView) {
 const isTeamLeadForMission = missionId
 ? await actionService.isTeamLeadForMission(session.user.id, missionId)
 : false;
 if (!isTeamLeadForMission) {
 filters.sdrId = session.user.id;
 }
 }
 // When isEntityView (contactId or companyId), no sdrId filter → show all actions
 } else {
 const sdrId = searchParams.get('sdrId');
 if (sdrId) filters.sdrId = sdrId;
 }
 if (result) filters.result = result;
 if (from) filters.from = new Date(from);
 if (to) filters.to = new Date(to);
 if (contactId) filters.contactId = contactId;
 if (companyId) filters.companyId = companyId;

 // Use service layer
 const { actions, total } = await actionService.getActions(filters);

 return paginatedResponse(actions, total, page, limit);
});

// ============================================
// POST /api/actions - Create new action
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
 const session = await requireRole(['SDR', 'MANAGER', 'BUSINESS_DEVELOPER', 'BOOKER'], request);
 const data = await validateRequest(request, createActionSchema);

 // Validate result against effective config
 const allowedCodes = await statusConfigService.getAllowedResultCodes({ campaignId: data.campaignId });
 if (!allowedCodes.includes(data.result)) {
 return errorResponse('Résultat non autorisé pour cette campagne', 400);
 }

 // Validate required note from config
 const config = await statusConfigService.getEffectiveStatusConfig({ campaignId: data.campaignId });
 const statusDef = config.statuses.find((s) => s.code === data.result);
 if (statusDef?.requiresNote && !data.note?.trim()) {
 return errorResponse('Une note est requise pour ce type de résultat', 400);
 }

    // Use service layer with transaction
    const action = await actionService.createAction({
        contactId: data.contactId,
        companyId: data.companyId,
        sdrId: session.user.id,
        campaignId: data.campaignId,
        channel: data.channel,
        result: data.result,
        note: data.note,
        callbackDate: data.callbackDate,
        duration: data.duration,
        meetingType: data.meetingType,
        meetingCategory: data.meetingCategory,
        meetingAddress: data.meetingAddress,
        meetingJoinUrl: data.meetingJoinUrl,
        meetingPhone: data.meetingPhone,
    }, statusDef);

    if (data.channel === 'CALL') {
        after(() => enqueueActionCallEnrichment(action.id));
    }

    return successResponse(action, 201);
});
