import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type { ActionResult } from '@prisma/client';
import { parseDateFromNote } from '@/lib/utils/parseDateFromNote';
import { createClientPortalNotification, sendNewRdvEmailNotification, createNotification } from '@/lib/notifications';
import type { EffectiveStatusDefinition } from './StatusConfigService';

// ============================================
// ACTION SERVICE
// ============================================
// Centralized business logic for actions
// Replaces scattered logic in API routes
// ============================================

export interface CreateActionInput {
    contactId?: string;
    companyId?: string;
    sdrId: string;
    campaignId: string;
    channel: 'CALL' | 'EMAIL' | 'LINKEDIN';
    result: string;
    note?: string;
    /** When result triggers callback: set from calendar UI; if not provided, parsed from note. */
    callbackDate?: Date;
    duration?: number;
    meetingType?: string;
    meetingCategory?: string;
    meetingAddress?: string;
    meetingJoinUrl?: string;
    meetingPhone?: string;
}

const VALID_ACTION_RESULTS: Set<ActionResult> = new Set<ActionResult>([
    "NO_RESPONSE",
    "BAD_CONTACT",
    "BARRAGE_STANDARD",
    "NUMERO_KO",
    "INTERESTED",
    "CALLBACK_REQUESTED",
    "MEETING_BOOKED",
    "MEETING_CANCELLED",
    "INVALIDE",
    "DISQUALIFIED",
    "ENVOIE_MAIL",
    "MAIL_ENVOYE",
    "CONNECTION_SENT",
    "MESSAGE_SENT",
    "REPLIED",
    "NOT_INTERESTED",
    "REFUS",
    "REFUS_ARGU",
    "REFUS_CATEGORIQUE",
    "RELANCE",
    "RAPPEL",
    "GERE_PAR_SIEGE",
    "FAUX_NUMERO",
    "PROJET_A_SUIVRE",
    "MAUVAIS_INTERLOCUTEUR",
    "MAIL_UNIQUEMENT",
    "BARRAGE_SECRETAIRE",
    "MAIL_DOC",
    "HORS_CIBLE",
]);

const ACTION_RESULT_ALIASES: Record<string, ActionResult> = {
    NE_REPONDS_PAS: "NO_RESPONSE",
    NRP: "NO_RESPONSE",
    PAS_DE_REPONSE: "NO_RESPONSE",
    MAUVAIS_CONTACT: "BAD_CONTACT",
    RAPEL: "RAPPEL",
    RAPPEL_DEMANDE: "CALLBACK_REQUESTED",
    RAPPEL_DEMANDEE: "CALLBACK_REQUESTED",
    RAPPEL_REQUESTED: "CALLBACK_REQUESTED",
    RELENCE: "RELANCE",
    RELANCEE: "RELANCE",
    CALL_BACK_REQUESTED: "CALLBACK_REQUESTED",
    CALLBACK: "CALLBACK_REQUESTED",
};

function normalizeActionResultCode(raw: string): string {
    return raw
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase();
}

export function resolveActionResult(inputResult: string): ActionResult {
    const normalized = normalizeActionResultCode(inputResult);
    const mapped = ACTION_RESULT_ALIASES[normalized] ?? normalized;
    if (VALID_ACTION_RESULTS.has(mapped as ActionResult)) {
        return mapped as ActionResult;
    }
    throw new Error(`Invalid action result: ${inputResult}`);
}

export interface ActionWithRelations {
 id: string;
 contact: {
 id: string;
 firstName?: string | null;
 lastName?: string | null;
 company: {
 id: string;
 name: string;
 };
 };
 result: string;
 createdAt: Date;
}

/**
 * Auto-detect meeting category from note text.
 * "BESOIN" = concrete project/need, "EXPLORATOIRE" = discovery/information.
 */
export function detectMeetingCategoryFromNote(note: string | null | undefined): string | null {
    if (!note) return null;
    const lower = note.toLowerCase();
    const besoinKw = [
        "besoin", "projet", "budget", "cahier des charges", "appel d'offre",
        "devis", "proposition", "lancement", "deadline", "urgent",
        "décision", "achat", "investir", "investissement", "signer",
        "go", "valider", "validation", "contractualiser", "déployer",
    ];
    const exploKw = [
        "exploratoire", "découverte", "premier contact", "prise de contact",
        "veille", "information", "se renseigner", "benchmark", "curieux",
        "pas de besoin", "pas de projet", "aucun projet", "à voir", "réflexion",
        "échange", "introduction", "présentation", "demo", "démo",
    ];
    let bScore = 0, eScore = 0;
    for (const kw of besoinKw) if (lower.includes(kw)) bScore++;
    for (const kw of exploKw) if (lower.includes(kw)) eScore++;
    if (bScore > eScore) return "BESOIN";
    if (eScore > bScore) return "EXPLORATOIRE";
    if (bScore > 0) return "BESOIN";
    return null;
}

export class ActionService {
 // ============================================
 // CREATE ACTION WITH TRANSACTION
 // ============================================
 async createAction(
 input: CreateActionInput,
 statusDef?: EffectiveStatusDefinition | null
 ): Promise<any> {
        // IMPORTANT: Action.result must always be a valid ActionResult enum code.
        // statusDef.resultCategoryCode is for reporting grouping (ResultCategory),
        // and may contain values like "OTHER" that are not ActionResult values.
        const resolvedResult = resolveActionResult(input.result);
        const triggersCallback = statusDef?.triggersCallback ?? (resolvedResult === 'CALLBACK_REQUESTED');
 const triggersOpportunity = statusDef?.triggersOpportunity ??
 (resolvedResult === 'MEETING_BOOKED' || resolvedResult === 'INTERESTED');

 // Use transaction to ensure atomicity
 const actionRecord = await prisma.$transaction(async (tx) => {
 // Validate that either contactId or companyId is provided
 if (!input.contactId && !input.companyId) {
 throw new Error('Either contactId or companyId must be provided');
 }

            // Callback date: from calendar (callbackDate) or parsed from note
            let callbackDate: Date | null = null;
            let noteToStore = input.note;
            if (triggersCallback) {
                if (input.callbackDate) {
                    callbackDate = input.callbackDate;
                    // Keep note in sync with calendar so note and callbackDate don't diverge
                    const scheduledText = `Rappel programmé: ${callbackDate.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`;
                    noteToStore = (input.note?.trim() ? `${input.note.trim()} (${scheduledText})` : scheduledText).slice(0, 500);
                } else if (input.note) {
                    callbackDate = parseDateFromNote(input.note);
                }
            } else if (input.callbackDate) {
                // For non-callback results (e.g. MEETING_BOOKED), store the provided date directement
                callbackDate = input.callbackDate;
            }

            // Auto-generate note label if none provided
            if (!noteToStore?.trim()) {
                const resultLabels: Record<string, string> = {
                    NO_RESPONSE: 'Pas de réponse',
                    BAD_CONTACT: 'Mauvais contact — pas la bonne personne',
                    BARRAGE_STANDARD: 'Barrage standard',
                    NUMERO_KO: 'Numéro invalide / hors service',
                    INTERESTED: 'Contact intéressé',
                    CALLBACK_REQUESTED: 'Rappel demandé',
                    MEETING_BOOKED: 'Rendez-vous planifié',
                    MEETING_CANCELLED: 'Rendez-vous annulé',
                    INVALIDE: 'Lead invalide',
                    DISQUALIFIED: 'Contact disqualifié',
                    ENVOIE_MAIL: 'Email à envoyer',
                    MAIL_ENVOYE: 'Email envoyé',
                    CONNECTION_SENT: 'Demande de connexion envoyée',
                    MESSAGE_SENT: 'Message envoyé',
                    REPLIED: 'Réponse reçue',
                    NOT_INTERESTED: 'Pas intéressé',
                };
                noteToStore = resultLabels[resolvedResult] ?? input.result;
            }

            // 1. Create the action — prefer explicit category, fallback to auto-detection from note
            const autoCategory = (resolvedResult === 'MEETING_BOOKED')
                ? (input.meetingCategory || detectMeetingCategoryFromNote(noteToStore || input.note))
                : null;

            const action = await tx.action.create({
                data: {
                    contactId: input.contactId || null,
                    companyId: input.companyId || null,
                    sdrId: input.sdrId,
                    campaignId: input.campaignId,
                    channel: input.channel,
                    result: resolvedResult,
                    note: noteToStore,
                    callbackDate: callbackDate,
                    duration: input.duration,
                    meetingType: input.meetingType,
                    meetingCategory: autoCategory,
                    meetingAddress: input.meetingAddress,
                    meetingJoinUrl: input.meetingJoinUrl,
                    meetingPhone: input.meetingPhone,
                },
                include: {
                    contact: input.contactId ? {
                        include: { company: true },
                    } : undefined,
                    company: input.companyId ? true : undefined,
                },
            });

 // 2. Auto-create opportunity for positive outcomes (only for contacts)
 if (input.contactId && triggersOpportunity && input.note?.trim()) {
 const existing = await tx.opportunity.findFirst({
 where: { contactId: input.contactId },
 });
 if (!existing) {
 await this.createOpportunityFromAction(tx, action, input.note!);
 }
 }

            // 3. Data-cleaning side-effects (contacts only)
            if (input.contactId) {
                await this.applyResultSideEffects(tx, input.contactId, resolvedResult, input.note);
            }

 return action;
 });

        // 4. Notify client portal (outside transaction)
        if (actionRecord.result === 'MEETING_BOOKED' || actionRecord.result === 'INTERESTED') {
            const campaign = await prisma.campaign.findUnique({
                where: { id: actionRecord.campaignId },
                select: { mission: { select: { clientId: true, name: true } } },
            });
            const clientId = campaign?.mission?.clientId;
            if (clientId) {
                if (actionRecord.result === 'MEETING_BOOKED') {
                    await createClientPortalNotification(clientId, {
                        title: 'Nouveau RDV réservé',
                        message: 'Un nouveau rendez-vous a été réservé pour une de vos missions.',
                        type: 'success',
                        link: '/client/portal/meetings',
                    });

                    const contactData = (actionRecord as any).contact as {
                        firstName?: string | null;
                        lastName?: string | null;
                        company?: { name?: string | null } | null;
                    } | null | undefined;

                    const anyRecord = actionRecord as any;
                    void sendNewRdvEmailNotification(clientId, {
                        contactFirstName: contactData?.firstName,
                        contactLastName: contactData?.lastName,
                        companyName: contactData?.company?.name,
                        missionName: campaign?.mission?.name,
                        scheduledAt: anyRecord.callbackDate ?? undefined,
                        meetingChannel: anyRecord.channel ?? "CALL",
                        meetingType: anyRecord.meetingType ?? undefined,
                        meetingJoinUrl: anyRecord.meetingJoinUrl ?? undefined,
                        meetingAddress: anyRecord.meetingAddress ?? undefined,
                        meetingPhone: anyRecord.meetingPhone ?? undefined,
                        interlocuteurId: anyRecord.interlocuteurId ?? undefined,
                    });
                } else {
                    await createClientPortalNotification(clientId, {
                        title: 'Nouvelle opportunité',
                        message: 'Un nouveau contact qualifié est disponible sur votre tableau de bord.',
                        type: 'info',
                        link: '/client/portal',
                    });
                }
            }
        }

        // 5. Auto-create reminder notification 24h before RDV for the SDR
        if (actionRecord.result === 'MEETING_BOOKED' && (actionRecord as any).callbackDate) {
            const rdvDate = new Date((actionRecord as any).callbackDate);
            const reminderDate = new Date(rdvDate.getTime() - 24 * 60 * 60 * 1000);
            const now = new Date();

            if (reminderDate > now) {
                const contactData = (actionRecord as any).contact as {
                    firstName?: string | null;
                    lastName?: string | null;
                    company?: { name?: string | null } | null;
                } | null | undefined;
                const contactName = [contactData?.firstName, contactData?.lastName].filter(Boolean).join(' ') || 'le prospect';
                const companyName = contactData?.company?.name;
                const dateStr = rdvDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

                void createNotification({
                    userId: input.sdrId,
                    title: 'Confirmer le RDV',
                    message: `Pensez à confirmer le RDV du ${dateStr} avec ${contactName}${companyName ? ` (${companyName})` : ''}`,
                    type: 'info',
                    link: '/manager/rdv',
                });
            }
        }

        return actionRecord as any;
    }

 // ============================================
 // OPPORTUNITY CREATION LOGIC
 // ============================================
 private shouldCreateOpportunity(result: string, note?: string): boolean {
 return (result === 'MEETING_BOOKED' || result === 'INTERESTED') && !!note;
 }

 private async createOpportunityFromAction(
 tx: Prisma.TransactionClient,
 action: any,
 note: string
 ): Promise<void> {
 // Check if opportunity already exists
 const existing = await tx.opportunity.findFirst({
 where: { contactId: action.contactId },
 });

 if (existing) return; // Don't create duplicate

 await tx.opportunity.create({
 data: {
 contactId: action.contactId,
 companyId: action.contact.companyId,
 needSummary: note,
 urgency: action.result === 'MEETING_BOOKED' ? 'SHORT' : 'MEDIUM',
 },
 });
 }

    // ============================================
    // BAD CONTACT / DATA CLEANING HANDLERS
    // ============================================

    /**
     * Data-cleaning side-effects for a (re)qualified action result.
     * Shared by createAction and PATCH /api/actions/[id] so editing an
     * existing action's result behaves the same as recording a new one.
     */
    async applyResultSideEffects(
        tx: Prisma.TransactionClient,
        contactId: string,
        resolvedResult: string,
        note?: string | null
    ): Promise<void> {
        if (resolvedResult === 'BAD_CONTACT') {
            await this.handleBadContact(tx, contactId, note ?? undefined);
        } else if (resolvedResult === 'NUMERO_KO' || resolvedResult === 'FAUX_NUMERO') {
            // Confirmed bad phone: clear it so the contact drops out of CALL queues
            await this.handleDeadPhone(tx, contactId);
        } else if (resolvedResult === 'DISQUALIFIED' || resolvedResult === 'HORS_CIBLE') {
            // Hard disqualification: downgrade completeness so reporting is accurate
            await tx.contact.update({
                where: { id: contactId },
                data: { status: 'INCOMPLETE' },
            });
            await this.propagateCompanyStatus(tx, contactId);
        }
    }

    private async handleBadContact(
        tx: Prisma.TransactionClient,
        contactId: string,
        note: string | undefined
    ): Promise<void> {
        const lower = (note ?? '').toLowerCase();
        // Person left the company or is otherwise unreachable
        const leftKeywords = [
            'quitté', 'a quitté', 'parti', 'n\'est plus', 'ne travaille plus',
            'plus dans', 'n est plus', 'retraite', 'décédé', 'licencié',
            'left', 'no longer', 'not there', 'wrong person', 'departed',
        ];
        if (leftKeywords.some((kw) => lower.includes(kw))) {
            await tx.contact.update({
                where: { id: contactId },
                data: { status: 'INCOMPLETE' },
            });
            await this.propagateCompanyStatus(tx, contactId);
        }
    }

    private async handleDeadPhone(
        tx: Prisma.TransactionClient,
        contactId: string
    ): Promise<void> {
        // Clear the confirmed-dead phone number so the contact exits CALL queues
        const contact = await tx.contact.findUnique({
            where: { id: contactId },
            select: { phone: true, email: true, linkedin: true, firstName: true, lastName: true, title: true },
        });
        if (!contact || !contact.phone) return;

        await tx.contact.update({
            where: { id: contactId },
            data: {
                phone: null,
                // Re-score without the dead phone
                status: this.computeStatusInline({
                    firstName: contact.firstName,
                    lastName: contact.lastName,
                    title: contact.title,
                    email: contact.email,
                    phone: null,
                    linkedin: contact.linkedin,
                }),
            },
        });
        await this.propagateCompanyStatus(tx, contactId);
    }

    private computeStatusInline(c: {
        firstName?: string | null; lastName?: string | null; title?: string | null;
        email?: string | null; phone?: string | null; linkedin?: string | null;
    }): 'INCOMPLETE' | 'PARTIAL' | 'ACTIONABLE' {
        const hasName = !!(c.firstName || c.lastName);
        const channels = [c.phone, c.email, c.linkedin].filter(Boolean);
        const hasChannel = channels.length > 0;
        if (hasName && (channels.length >= 2 || (!!c.title && hasChannel))) return 'ACTIONABLE';
        if (hasName || hasChannel) return 'PARTIAL';
        return 'INCOMPLETE';
    }

    private async propagateCompanyStatus(
        tx: Prisma.TransactionClient,
        contactId: string
    ): Promise<void> {
        const contact = await tx.contact.findUnique({
            where: { id: contactId },
            select: { companyId: true },
        });
        if (!contact) return;

        const siblings = await tx.contact.findMany({
            where: { companyId: contact.companyId },
            select: { status: true },
        });
        let companyStatus: 'INCOMPLETE' | 'PARTIAL' | 'ACTIONABLE' = 'INCOMPLETE';
        if (siblings.some((s) => s.status === 'ACTIONABLE')) companyStatus = 'ACTIONABLE';
        else if (siblings.some((s) => s.status === 'PARTIAL')) companyStatus = 'PARTIAL';

        await tx.company.update({
            where: { id: contact.companyId },
            data: { status: companyStatus },
        });
    }

 // ============================================
 // TEAM LEAD HELPERS
 // ============================================
 async isTeamLeadForMission(userId: string, missionId: string): Promise<boolean> {
 const mission = await prisma.mission.findUnique({
 where: { id: missionId },
 select: { teamLeadSdrId: true },
 });
 return mission?.teamLeadSdrId === userId;
 }

 // ============================================
 // GET ACTIONS WITH FILTERS
 // ============================================
 async getActions(filters: {
 sdrId?: string;
 missionId?: string;
 result?: string;
 from?: Date;
 to?: Date;
 contactId?: string;
 companyId?: string;
 page?: number;
 limit?: number;
 }) {
 const { page = 1, limit = 20, ...where } = filters;
 const skip = (page - 1) * limit;

 const whereClause: any = {};

 if (where.sdrId) whereClause.sdrId = where.sdrId;
 if (where.result) whereClause.result = where.result;
 if (where.contactId) whereClause.contactId = where.contactId;
 if (where.companyId) whereClause.companyId = where.companyId;
 if (where.missionId) {
 whereClause.campaign = { missionId: where.missionId };
 }
 if (where.from || where.to) {
 whereClause.createdAt = {};
 if (where.from) whereClause.createdAt.gte = where.from;
 if (where.to) whereClause.createdAt.lte = where.to;
 }

 const [actions, total] = await Promise.all([
 prisma.action.findMany({
 where: whereClause,
 include: {
 company: true,
 contact: {
 include: { company: true },
 },
 sdr: {
 select: { id: true, name: true },
 },
 campaign: {
 select: { id: true, name: true, missionId: true },
 },
 },
 orderBy: { createdAt: 'desc' },
 skip,
 take: limit,
 }),
 prisma.action.count({ where: whereClause }),
 ]);

 return { actions, total, page, limit };
 }

 // ============================================
 // STATS CALCULATION
 // ============================================
 async getActionStats(filters: {
 sdrId?: string;
 missionId?: string;
 channel?: 'CALL' | 'EMAIL' | 'LINKEDIN';
 from?: Date;
 to?: Date;
 }) {
 const whereClause: any = {};

 if (filters.sdrId) whereClause.sdrId = filters.sdrId;
 if (filters.missionId) {
 whereClause.campaign = { missionId: filters.missionId };
 }
 if (filters.channel) whereClause.channel = filters.channel;
 if (filters.from || filters.to) {
 whereClause.createdAt = {};
 if (filters.from) whereClause.createdAt.gte = filters.from;
 if (filters.to) whereClause.createdAt.lte = filters.to;
 }

 const [total, byResult, avgDuration] = await Promise.all([
 prisma.action.count({ where: whereClause }),
 prisma.action.groupBy({
 by: ['result'],
 where: whereClause,
 _count: true,
 }),
 prisma.action.aggregate({
 where: { ...whereClause, duration: { not: null } },
 _avg: { duration: true },
 }),
 ]);

 const resultBreakdown: Record<string, number> = {};
 byResult.forEach(item => {
 resultBreakdown[item.result] = item._count;
 });

 const conversionRate = total > 0
 ? ((resultBreakdown.MEETING_BOOKED ?? 0) / total * 100).toFixed(2)
 : '0.00';

 const sent = (resultBreakdown.MAIL_ENVOYE ?? 0) + (resultBreakdown.CONNECTION_SENT ?? 0) + (resultBreakdown.MESSAGE_SENT ?? 0);
 const replied = resultBreakdown.REPLIED ?? 0;
 const repliedRate = total > 0 ? ((replied / total) * 100).toFixed(2) : '0.00';

 return {
 total,
 resultBreakdown,
 avgDuration: Math.round(avgDuration._avg.duration || 0),
 conversionRate,
 sent,
 replied,
 repliedRate,
 };
 }
}

/** Get mission stats with optional channel filter. Reusable for Email + LinkedIn + Calls. */
export async function getMissionStats(missionId: string, channel?: 'CALL' | 'EMAIL' | 'LINKEDIN') {
 return actionService.getActionStats({ missionId, channel });
}

// Export singleton instance
export const actionService = new ActionService();
