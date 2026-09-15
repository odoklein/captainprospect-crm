// ============================================
// BOOKING SUCCESS API
// Handles successful booking events from whichever tool the client uses
// (Cal.com, Calendly, HubSpot Meetings, Microsoft Bookings, in-house pages…).
// Meeting formats: VISIO (meetingJoinUrl), PHYSIQUE (meetingAddress), TELEPHONIQUE (meetingPhone/contact fallback).
// Regression: (1) Book with each format from UnifiedActionDrawer (2) Confirm CTAs in SDR, client portal, manager client (3) Cancel/reschedule/feedback unchanged.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole, withErrorHandler, validateRequest } from '@/lib/api-utils';
import { z } from 'zod';
import { autoEnrichAction } from '@/lib/call-enrichment/auto-enrichment';

// ============================================
// SCHEMAS
// ============================================

const bookingSuccessSchema = z.object({
    contactId: z.string().min(1).optional(),
    companyId: z.string().min(1).optional(),
    eventData: z.record(z.string(), z.any()).optional(),
    rdvDate: z.string().optional(),
    meetingType: z.enum(['VISIO', 'PHYSIQUE', 'TELEPHONIQUE']).optional(),
    meetingCategory: z.enum(['EXPLORATOIRE', 'BESOIN']).optional(),
    meetingAddress: z.string().max(500).optional(),
    meetingJoinUrl: z.string().url('Lien de rejoindre invalide').max(2000).optional(),
    meetingPhone: z.string().max(50).optional(),
    interlocuteurId: z.string().min(1).optional(),
    interlocuteurName: z.string().max(200).optional(),
})
    .refine((data) => !!data.contactId || !!data.companyId, {
        message: 'Contact ou société requis',
        path: ['contactId'],
    })
    .refine(
        (data) => {
            if (!data.meetingType) return true;
            if (data.meetingType === 'PHYSIQUE') return !!data.meetingAddress?.trim();
            return true;
        },
        { message: 'PHYSIQUE requiert une adresse.', path: ['meetingType'] }
    );

function normalizeUrlCandidate(value: string | null | undefined): string | null {
    const raw = value?.trim();
    if (!raw) return null;

    try {
        const url = new URL(raw);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        return url.toString();
    } catch {
        return null;
    }
}

function isLikelyJoinLink(value: string): boolean {
    const candidate = normalizeUrlCandidate(value);
    if (!candidate) return false;

    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    const full = candidate.toLowerCase();

    // A booking-tool URL is the scheduling page, never the join link — and several of
    // them ("meetings.hubspot.com", "meet.…") would otherwise match the keyword test below.
    const BOOKING_TOOL_HOSTS = [
        'calendly.com', 'cal.com', 'hubspot.com', 'tidycal.com', 'savvycal.com',
        'youcanbook.me', 'zcal.co', 'zoho.com', 'acuityscheduling.com', 'squarespace-scheduling.com',
        'bookings.microsoft.com', 'outlook.office.com', 'setmore.com', 'simplybook.me', 'koalendar.com',
    ];
    if (BOOKING_TOOL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
        return false;
    }

    return /(zoom|meet|teams|webex|whereby|jitsi|hangout|video|conference|join)/i.test(full);
}

function collectNestedUrls(input: unknown, seen = new Set<unknown>(), depth = 0): string[] {
    if (input == null || depth > 6 || seen.has(input)) return [];
    if (typeof input === 'string') {
        return isLikelyJoinLink(input) ? [input] : [];
    }

    if (typeof input !== 'object') return [];
    seen.add(input);

    if (Array.isArray(input)) {
        return input.flatMap((item) => collectNestedUrls(item, seen, depth + 1));
    }

    return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) => {
        const matchesKey = /(join|meeting|conference|meet|zoom|teams|webex|whereby|jitsi|hangout|video|url|location)/i.test(key);
        if (typeof value === 'string' && matchesKey && isLikelyJoinLink(value)) {
            return [value];
        }
        return collectNestedUrls(value, seen, depth + 1);
    });
}

// Clients bring their own booking tool, so the payload shape is unknown: score keys
// rather than matching a fixed list of field paths. Mirrors the client-side helper
// in components/sdr/BookingDrawer.tsx.
const START_KEY_RE = /^(invitee_)?(start|starts?_?(time|at|date)|scheduled_?start|from|begin(s|ning)?)$/i;
const WEAK_DATE_KEY_RE = /^(date|when|slot|datetime|date_?time|scheduled_?(at|time|for)|meeting_?(date|time)|booking_?(date|time)|appointment_?(date|time))$/i;
const REJECT_DATE_KEY_RE = /(^|_)(end|ends|created|updated|modified|expires?|cancel|deleted|booked_?at|paid|reminder|birth|timezone|tz)/i;

/** Accept only dates a real RDV could plausibly fall on (filters out createdAt, epoch 0, …). */
function toPlausibleRdvDate(value: unknown): Date | null {
    let d: Date | null = null;
    if (value instanceof Date) {
        d = value;
    } else if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^\d{10}$/.test(trimmed)) d = new Date(Number(trimmed) * 1000);
        else if (/^\d{13}$/.test(trimmed)) d = new Date(Number(trimmed));
        else if (trimmed) d = new Date(trimmed);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
        d = value > 1e12 ? new Date(value) : new Date(value * 1000);
    }
    if (!d || Number.isNaN(d.getTime())) return null;

    const now = Date.now();
    if (d.getTime() < now - 7 * 24 * 3600 * 1000) return null;
    if (d.getTime() > now + 2 * 365 * 24 * 3600 * 1000) return null;
    return d;
}

function extractScheduledStartTime(eventData: Record<string, unknown> | undefined): Date | null {
    if (!eventData) return null;

    // Object holder rather than a `let`: TypeScript keeps the initial narrowing for
    // primitives assigned only inside the closure below.
    const best: { score: number; date: Date | null } = { score: 0, date: null };
    const seen = new Set<unknown>();

    const walk = (node: unknown, depth: number) => {
        if (node == null || depth > 6 || typeof node !== 'object' || seen.has(node)) return;
        seen.add(node);

        if (Array.isArray(node)) {
            node.forEach((item) => walk(item, depth + 1));
            return;
        }

        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
            if (value && typeof value === 'object' && !(value instanceof Date)) {
                walk(value, depth + 1);
                continue;
            }
            if (REJECT_DATE_KEY_RE.test(key)) continue;

            const score = START_KEY_RE.test(key) ? 2 : WEAK_DATE_KEY_RE.test(key) ? 1 : 0;
            if (score === 0) continue;

            const date = toPlausibleRdvDate(value);
            if (!date) continue;
            if (!best.date || score > best.score) {
                best.score = score;
                best.date = date;
            }
        }
    };

    walk(eventData, 0);
    return best.date;
}

function extractMeetingJoinUrl(eventData: Record<string, unknown> | undefined): string | null {
    if (!eventData) return null;

    const directCandidates = [
        eventData.join_url,
        eventData.joinUrl,
        eventData.meetingJoinUrl,
        eventData.meeting_join_url,
        eventData.meetingUrl,
        eventData.meeting_url,
        eventData.videoCallUrl,
        eventData.hangoutLink,
        eventData.location,
        (eventData.location as Record<string, unknown> | undefined)?.join_url,
        (eventData.location as Record<string, unknown> | undefined)?.joinUrl,
        (eventData.conferenceData as Record<string, unknown> | undefined)?.conferenceSolution,
        ((eventData.conferenceData as Record<string, unknown> | undefined)?.entryPoints as Array<Record<string, unknown>> | undefined)?.[0]?.uri,
        (eventData.event as Record<string, unknown> | undefined)?.location,
        ((eventData.event as Record<string, unknown> | undefined)?.location as Record<string, unknown> | undefined)?.join_url,
        ((eventData.event as Record<string, unknown> | undefined)?.location as Record<string, unknown> | undefined)?.joinUrl,
    ];

    for (const candidate of directCandidates) {
        if (typeof candidate === 'string' && isLikelyJoinLink(candidate)) {
            return normalizeUrlCandidate(candidate);
        }
    }

    const nestedCandidate = collectNestedUrls(eventData)[0];
    return normalizeUrlCandidate(nestedCandidate);
}

// ============================================
// POST /api/actions/booking-success
// ============================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    const session = await requireRole(['SDR', 'BUSINESS_DEVELOPER', 'MANAGER'], request);
    const { contactId, companyId, eventData, rdvDate, meetingType, meetingCategory, meetingAddress, meetingJoinUrl, meetingPhone, interlocuteurId, interlocuteurName } = await validateRequest(request, bookingSuccessSchema);

    const bookingSourceLabel = interlocuteurName?.trim()
        ? `RDV planifié via calendrier (${interlocuteurName.trim()})`
        : 'RDV planifié via calendrier';
    // On ne stocke plus le dump JSON de l'event : il finissait affiché tel quel
    // (ex. "RDV planifié via calendrier (X): {}") dans les portails client/commercial.
    const bookingNote = bookingSourceLabel;

    const scheduledAt = rdvDate
        ? new Date(rdvDate)
        : extractScheduledStartTime(eventData);

    const resolvedMeetingJoinUrl =
        meetingType === 'VISIO'
            ? normalizeUrlCandidate(meetingJoinUrl) ?? extractMeetingJoinUrl(eventData)
            : null;

    if (contactId) {
        // Classic: book with contact (and company via contact)
        const contact = await prisma.contact.findUnique({
            where: { id: contactId },
            include: {
                company: {
                    include: {
                        list: {
                            include: {
                                mission: {
                                    include: {
                                        campaigns: { where: { isActive: true }, take: 1 },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!contact) {
            return NextResponse.json(
                { success: false, error: 'Contact not found' },
                { status: 404 }
            );
        }

        const list = contact.company.list;
        const mission = list.mission;
        const campaign = mission.campaigns[0];
        if (!campaign) {
            return NextResponse.json(
                { success: false, error: 'No active campaign found for this contact' },
                { status: 400 }
            );
        }

        const resolvedInterlocuteurId =
            interlocuteurId
            ?? (list as any).commercialInterlocuteurId
            ?? (mission as any).defaultInterlocuteurId
            ?? null;

        const action = await prisma.action.create({
            data: {
                contactId: contact.id,
                companyId: contact.company.id,
                sdrId: session.user.id,
                campaignId: campaign.id,
                channel: (mission as any).channel ?? 'CALL',
                result: 'MEETING_BOOKED',
                confirmationStatus: 'PENDING',
                note: bookingNote,
                callbackDate: scheduledAt ?? undefined,
                meetingType: meetingType ?? null,
                meetingCategory: meetingCategory ?? null,
                meetingAddress: meetingAddress ?? null,
                meetingJoinUrl: resolvedMeetingJoinUrl,
                meetingPhone: meetingPhone ?? null,
                interlocuteurId: resolvedInterlocuteurId ?? undefined,
            },
            include: {
                contact: { select: { id: true, firstName: true, lastName: true } },
            },
        });

        // Fire-and-forget: search for Allo audio + generate fiche in the background.
        void autoEnrichAction(action.id);

        return NextResponse.json({
            success: true,
            data: {
                actionId: action.id,
                message: `Rendez-vous enregistré pour ${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
            },
        });
    }

    // Company-only: book with company only (no contact)
    if (!companyId) {
        return NextResponse.json(
            { success: false, error: 'Contact ou société requis' },
            { status: 400 }
        );
    }

    const company = await prisma.company.findUnique({
        where: { id: companyId },
        include: {
            list: {
                include: {
                    mission: {
                        include: {
                            campaigns: { where: { isActive: true }, take: 1 },
                        },
                    },
                },
            },
        },
    });

    if (!company) {
        return NextResponse.json(
            { success: false, error: 'Société non trouvée' },
            { status: 404 }
        );
    }

    const mission = company.list.mission;
    const campaign = mission.campaigns[0];
    if (!campaign) {
        return NextResponse.json(
            { success: false, error: 'Aucune campagne active pour cette liste' },
            { status: 400 }
        );
    }

    const resolvedInterlocuteurId =
        interlocuteurId
        ?? (company.list as any).commercialInterlocuteurId
        ?? (mission as any).defaultInterlocuteurId
        ?? null;

    const action = await prisma.action.create({
        data: {
            contactId: null,
            companyId: company.id,
            sdrId: session.user.id,
            campaignId: campaign.id,
            channel: (mission as any).channel ?? 'CALL',
            result: 'MEETING_BOOKED',
            confirmationStatus: 'PENDING',
            note: bookingNote,
            callbackDate: scheduledAt ?? undefined,
            meetingType: meetingType ?? null,
            meetingCategory: meetingCategory ?? null,
            meetingAddress: meetingAddress ?? null,
            meetingJoinUrl: resolvedMeetingJoinUrl,
            meetingPhone: meetingPhone ?? null,
            interlocuteurId: resolvedInterlocuteurId ?? undefined,
        },
    });

    // Fire-and-forget: search for Allo audio + generate fiche in the background.
    void autoEnrichAction(action.id);

    return NextResponse.json({
        success: true,
        data: {
            actionId: action.id,
            message: `Rendez-vous enregistré pour la société ${company.name}`,
        },
    });
});
