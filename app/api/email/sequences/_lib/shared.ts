// ============================================
// Shared helpers for /api/email/sequences/** (private folder: not a route)
// ============================================

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { EmailSequence, EnrollmentStatus, Prisma } from '@prisma/client';
import { safeTimezone, stepBodyAsText, sequenceService } from '@/lib/email/services/sequence-service';

/** Roles that see and manage every sequence (same as the rest of the email admin). */
export const SEQUENCE_ADMIN_ROLES = ['MANAGER', 'DEVELOPER'];

export interface SequenceUser {
    id: string;
    role: string;
    email: string | null;
    name: string | null;
    isAdmin: boolean;
}

export async function getSequenceUser(): Promise<SequenceUser | null> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return null;
    const role = String(session.user.role || '');
    return {
        id: session.user.id,
        role,
        email: session.user.email ?? null,
        name: session.user.name ?? null,
        isAdmin: SEQUENCE_ADMIN_ROLES.includes(role),
    };
}

export function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
    return NextResponse.json({ success: false, error, ...extra }, { status });
}

export const unauthorized = () => jsonError('Non autorisé', 401);

export async function loadOwnedSequence(
    id: string,
    user: SequenceUser,
): Promise<{ sequence: EmailSequence } | { response: NextResponse }> {
    const sequence = await prisma.emailSequence.findUnique({ where: { id } });
    if (!sequence) return { response: jsonError('Séquence introuvable', 404) };
    if (sequence.createdById !== user.id && !user.isAdmin) {
        return { response: jsonError("Vous n'avez pas accès à cette séquence", 403) };
    }
    return { sequence };
}

export async function canUseMailbox(user: SequenceUser, mailboxId: string): Promise<boolean> {
    if (user.isAdmin) {
        return (await prisma.mailbox.count({ where: { id: mailboxId } })) > 0;
    }
    const count = await prisma.mailbox.count({
        where: {
            id: mailboxId,
            OR: [{ ownerId: user.id }, { permissions: { some: { userId: user.id, canSend: true } } }],
        },
    });
    return count > 0;
}

export const MAILBOX_SELECT = {
    id: true,
    email: true,
    displayName: true,
    provider: true,
    isActive: true,
    syncStatus: true,
    healthScore: true,
    lastError: true,
    lastSyncAt: true,
    dailySendLimit: true,
    sentToday: true,
    disabledReason: true,
} satisfies Prisma.MailboxSelect;

// ============================================
// SETTINGS PARSING
// ============================================

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export interface ParsedSettings {
    data: Prisma.EmailSequenceUncheckedUpdateInput;
    error?: string;
}

/** Validates the editable settings present in `body` (aliases from older clients accepted). */
export function parseSettings(body: Record<string, unknown>, current?: Partial<EmailSequence>): ParsedSettings {
    const data: Prisma.EmailSequenceUncheckedUpdateInput = {};

    if (body.name !== undefined) {
        const name = String(body.name ?? '').trim();
        if (!name) return { data, error: 'Donnez un nom à la séquence' };
        if (name.length > 120) return { data, error: 'Nom trop long (120 caractères max.)' };
        data.name = name;
    }
    if (body.description !== undefined) {
        data.description = String(body.description ?? '').trim() || null;
    }
    if (body.mailboxId !== undefined) {
        if (!body.mailboxId) return { data, error: "Choisissez une boîte d'envoi" };
        data.mailboxId = String(body.mailboxId);
    }
    if (body.campaignId !== undefined) data.campaignId = body.campaignId ? String(body.campaignId) : null;

    const start = body.sendTimeStart ?? body.sendWindowStart;
    const end = body.sendTimeEnd ?? body.sendWindowEnd;
    if (start !== undefined) {
        if (start && !HHMM.test(String(start))) return { data, error: 'Heure de début invalide (HH:MM)' };
        data.sendTimeStart = start ? String(start).padStart(5, '0') : null;
    }
    if (end !== undefined) {
        if (end && !HHMM.test(String(end))) return { data, error: 'Heure de fin invalide (HH:MM)' };
        data.sendTimeEnd = end ? String(end).padStart(5, '0') : null;
    }
    const finalStart = (data.sendTimeStart as string | null | undefined) ?? (start === undefined ? current?.sendTimeStart : null);
    const finalEnd = (data.sendTimeEnd as string | null | undefined) ?? (end === undefined ? current?.sendTimeEnd : null);
    if (finalStart && finalEnd && finalEnd <= finalStart) {
        return { data, error: "L'heure de fin doit être après l'heure de début" };
    }

    if (body.timezone !== undefined) {
        const tz = String(body.timezone || 'Europe/Paris');
        if (safeTimezone(tz) !== tz) return { data, error: 'Fuseau horaire inconnu' };
        data.timezone = tz;
    }
    for (const key of ['stopOnReply', 'stopOnBounce', 'trackOpens', 'trackClicks', 'sendOnWeekends'] as const) {
        if (typeof body[key] === 'boolean') data[key] = body[key] as boolean;
    }
    return { data };
}

export function validateStepsInput(steps: unknown): { steps?: StepPayload[]; error?: string } {
    if (!Array.isArray(steps)) return { error: 'Format des étapes invalide' };
    if (steps.length > 20) return { error: '20 étapes maximum' };
    const out: StepPayload[] = [];
    for (let i = 0; i < steps.length; i++) {
        const s = (steps[i] ?? {}) as Record<string, unknown>;
        const subject = String(s.subject ?? '').trim();
        const body = String(s.body ?? s.bodyText ?? s.bodyHtml ?? '');
        if (i === 0 && !subject && body.trim()) return { error: "Le premier email a besoin d'un objet" };
        if (subject.length > 300) return { error: `Étape ${i + 1} : objet trop long` };
        out.push({
            id: typeof s.id === 'string' ? s.id : null,
            name: typeof s.name === 'string' ? s.name : null,
            subject,
            body,
            delayDays: Number(s.delayDays) || 0,
            delayHours: Number(s.delayHours) || 0,
            delayMinutes: Number(s.delayMinutes) || 0,
            skipIfOpened: !!s.skipIfOpened,
            skipIfClicked: !!s.skipIfClicked,
            skipIfReplied: s.skipIfReplied !== false,
        });
    }
    return { steps: out };
}

export interface StepPayload {
    id: string | null;
    name: string | null;
    subject: string;
    body: string;
    delayDays: number;
    delayHours: number;
    delayMinutes: number;
    skipIfOpened: boolean;
    skipIfClicked: boolean;
    skipIfReplied: boolean;
}

// ============================================
// ACTIVATION CHECKS (server side mirror of the UI checklist)
// ============================================

export async function activationProblems(sequenceId: string): Promise<string[]> {
    const sequence = await prisma.emailSequence.findUnique({
        where: { id: sequenceId },
        include: { mailbox: { select: MAILBOX_SELECT }, steps: { orderBy: { order: 'asc' } } },
    });
    if (!sequence) return ['Séquence introuvable'];
    const problems: string[] = [];
    if (!sequence.mailbox?.isActive) problems.push("La boîte d'envoi est désactivée");
    if (sequence.steps.length === 0) problems.push('Ajoutez au moins un email');
    sequence.steps.forEach((s, i) => {
        if (!stepBodyAsText(s).trim()) problems.push(`L'email ${i + 1} est vide`);
        if (i === 0 && !s.subject.trim()) problems.push("Le premier email n'a pas d'objet");
    });
    return problems;
}

// ============================================
// DETAIL SERIALISER
// ============================================

export const ENROLLMENT_STATUSES: EnrollmentStatus[] = [
    'ACTIVE', 'PAUSED', 'COMPLETED', 'REPLIED', 'BOUNCED', 'UNSUBSCRIBED', 'MANUAL_EXIT',
];

export async function serializeSequenceDetail(id: string) {
    const sequence = await prisma.emailSequence.findUnique({
        where: { id },
        include: {
            mailbox: { select: MAILBOX_SELECT },
            campaign: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true, email: true } },
            steps: { orderBy: { order: 'asc' } },
        },
    });
    if (!sequence) return null;

    const stepIds = sequence.steps.map((s) => s.id);
    const outbound = { sequenceStepId: { in: stepIds }, direction: 'OUTBOUND' as const };
    const [byStatus, nextSend, sentRows, openedRows, clickedRows, bouncedRows, contacted] = await Promise.all([
        prisma.emailSequenceEnrollment.groupBy({ by: ['status'], where: { sequenceId: id }, _count: { _all: true } }),
        prisma.emailSequenceEnrollment.aggregate({
            where: { sequenceId: id, status: 'ACTIVE', nextStepAt: { not: null } },
            _min: { nextStepAt: true },
        }),
        prisma.email.groupBy({ by: ['sequenceStepId'], where: outbound, _count: { _all: true } }),
        prisma.email.groupBy({ by: ['sequenceStepId'], where: { ...outbound, openCount: { gt: 0 } }, _count: { _all: true } }),
        prisma.email.groupBy({ by: ['sequenceStepId'], where: { ...outbound, clickCount: { gt: 0 } }, _count: { _all: true } }),
        prisma.email.groupBy({ by: ['sequenceStepId'], where: { ...outbound, status: 'BOUNCED' }, _count: { _all: true } }),
        prisma.emailSequenceEnrollment.count({ where: { sequenceId: id, emails: { some: {} } } }),
    ]);
    const pick = (rows: { sequenceStepId: string | null; _count: { _all: number } }[], stepId: string) =>
        rows.find((r) => r.sequenceStepId === stepId)?._count._all ?? 0;

    const counts: Record<string, number> = { total: 0 };
    for (const s of ENROLLMENT_STATUSES) counts[s] = 0;
    for (const row of byStatus) {
        counts[row.status] = row._count._all;
        counts.total += row._count._all;
    }

    const steps = sequence.steps.map((s) => ({
        id: s.id,
        order: s.order,
        name: s.name,
        subject: s.subject,
        body: stepBodyAsText(s),
        delayDays: s.delayDays,
        delayHours: s.delayHours,
        delayMinutes: s.delayMinutes,
        skipIfOpened: s.skipIfOpened,
        skipIfClicked: s.skipIfClicked,
        skipIfReplied: s.skipIfReplied,
        stats: {
            sent: pick(sentRows, s.id),
            opened: pick(openedRows, s.id),
            clicked: pick(clickedRows, s.id),
            replied: s.totalReplied,
            bounced: Math.max(s.totalBounced, pick(bouncedRows, s.id)),
        },
    }));

    const sum = (k: 'sent' | 'opened' | 'clicked' | 'replied' | 'bounced') => steps.reduce((acc, s) => acc + s.stats[k], 0);

    return {
        id: sequence.id,
        name: sequence.name,
        description: sequence.description,
        status: sequence.status,
        mailboxId: sequence.mailboxId,
        mailbox: sequence.mailbox,
        campaign: sequence.campaign,
        createdBy: sequence.createdBy,
        createdAt: sequence.createdAt,
        updatedAt: sequence.updatedAt,
        stopOnReply: sequence.stopOnReply,
        stopOnBounce: sequence.stopOnBounce,
        trackOpens: sequence.trackOpens,
        trackClicks: sequence.trackClicks,
        sendOnWeekends: sequence.sendOnWeekends,
        sendTimeStart: sequence.sendTimeStart,
        sendTimeEnd: sequence.sendTimeEnd,
        timezone: sequence.timezone,
        steps,
        counts,
        nextSendAt: nextSend._min.nextStepAt,
        stats: {
            enrolled: counts.total,
            contacted,
            sent: sum('sent'),
            opened: sum('opened'),
            clicked: sum('clicked'),
            replied: Math.max(sequence.totalReplied, sum('replied')),
            bounced: Math.max(sequence.totalBounced, sum('bounced')),
            completed: counts.COMPLETED,
        },
    };
}

export async function engineStatus() {
    try {
        return await sequenceService.getEngineStatus();
    } catch {
        return { lastRun: null, healthy: false, dueNow: 0 };
    }
}
