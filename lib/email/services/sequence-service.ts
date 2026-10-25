// ============================================
// EMAIL SEQUENCE SERVICE
// Enrolment, the Redis-free sending engine (driven by
// /api/cron/email-sequences), reply/bounce handling and step editing.
// ============================================

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import type {
    EmailSequence,
    EmailSequenceStep,
    EmailSequenceEnrollment,
    EnrollmentStatus,
} from '@prisma/client';
import { emailSendingService, type SendOptions } from './sending-service';
import {
    buildVariablesFromData,
    renderEmailContent,
    renderTemplateString,
    textToHtml,
    htmlToText,
    looksLikeHtml,
} from './template-variables';

// ============================================
// TYPES
// ============================================

export interface EnrollContactParams {
    sequenceId: string;
    contactId: string;
    tokens?: Record<string, string>;
}

export interface ProcessResult {
    success: boolean;
    action: 'sent' | 'skipped' | 'completed' | 'paused' | 'deferred' | 'exited' | 'error';
    message?: string;
    nextStepAt?: Date;
    /** Set when the failure belongs to the mailbox, not the contact. */
    mailboxBlocked?: boolean;
}

export type EnrollSkipReason =
    | 'NO_EMAIL'
    | 'INVALID_EMAIL'
    | 'EXCLUDED'
    | 'UNSUBSCRIBED'
    | 'ALREADY_ENROLLED';

export const ENROLL_SKIP_LABELS: Record<EnrollSkipReason, string> = {
    NO_EMAIL: 'Sans email',
    INVALID_EMAIL: 'Email invalide',
    EXCLUDED: 'Exclu (ne plus contacter)',
    UNSUBSCRIBED: 'Désinscrit',
    ALREADY_ENROLLED: 'Déjà inscrit',
};

export interface EnrollManyResult {
    enrolled: number;
    skipped: Partial<Record<EnrollSkipReason, number>>;
    results: { contactId: string; success: boolean; error?: string; reason?: EnrollSkipReason }[];
}

export interface StepInput {
    id?: string | null;
    name?: string | null;
    subject: string;
    /** Plain text (preferred) or HTML. */
    body?: string | null;
    bodyHtml?: string | null;
    bodyText?: string | null;
    delayDays?: number;
    delayHours?: number;
    delayMinutes?: number;
    skipIfOpened?: boolean;
    skipIfClicked?: boolean;
    skipIfReplied?: boolean;
}

export interface EngineRunSummary {
    at: string;
    durationMs: number;
    scanned: number;
    sent: number;
    skipped: number;
    completed: number;
    deferred: number;
    exited: number;
    errors: number;
    errorSamples: string[];
}

export const ENGINE_LAST_RUN_KEY = 'email_sequences_engine_last_run';

/** Enrollment exit reasons written by older code when a sequence was paused. */
const LEGACY_SEQUENCE_PAUSE_REASONS = ['Sequence paused', 'Séquence en pause'];
const MAX_SEND_FAILURES = 3;
const CLAIM_LEASE_MS = 15 * 60 * 1000;
const RETRY_DELAY_MS = 30 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type SequenceSchedule = Pick<EmailSequence, 'sendOnWeekends' | 'sendTimeStart' | 'sendTimeEnd' | 'timezone'>;

// ============================================
// TIMEZONE HELPERS (Intl-based, no dependency)
// ============================================

const DEFAULT_TZ = 'Europe/Paris';
const formatterCache = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function safeTimezone(tz: string | null | undefined): string {
    if (!tz) return DEFAULT_TZ;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return tz;
    } catch {
        return DEFAULT_TZ;
    }
}

function getFormatter(tz: string): Intl.DateTimeFormat {
    let f = formatterCache.get(tz);
    if (!f) {
        f = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            weekday: 'short',
        });
        formatterCache.set(tz, f);
    }
    return f;
}

interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number }

export function zonedParts(date: Date, tz: string): ZonedParts {
    const out: Record<string, string> = {};
    for (const p of getFormatter(tz).formatToParts(date)) out[p.type] = p.value;
    return {
        year: Number(out.year),
        month: Number(out.month),
        day: Number(out.day),
        hour: Number(out.hour) % 24,
        minute: Number(out.minute),
        second: Number(out.second),
        weekday: WEEKDAYS[out.weekday] ?? 0,
    };
}

function tzOffsetMs(date: Date, tz: string): number {
    const p = zonedParts(date, tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Wall-clock time in `tz` → UTC instant. Day/month overflow is allowed (Date.UTC normalises). */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
    const guess = Date.UTC(year, month - 1, day, hour, minute);
    const off1 = tzOffsetMs(new Date(guess), tz);
    let t = guess - off1;
    const off2 = tzOffsetMs(new Date(t), tz);
    if (off2 !== off1) t = guess - off2;
    return new Date(t);
}

function parseHHMM(value: string | null | undefined): number | null {
    if (!value) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
}

/** First instant >= `candidate` that is inside the sequence's sending days and hours. */
export function alignToSendWindow(candidate: Date, sequence: SequenceSchedule): Date {
    const tz = safeTimezone(sequence.timezone);
    const start = parseHHMM(sequence.sendTimeStart);
    const end = parseHHMM(sequence.sendTimeEnd);
    const hasWindow = start !== null && end !== null && end > start;

    let t = candidate;
    for (let i = 0; i < 16; i++) {
        const p = zonedParts(t, tz);
        const isWeekend = p.weekday === 0 || p.weekday === 6;
        const minutes = p.hour * 60 + p.minute;
        const nextDayAt = (minuteOfDay: number) =>
            zonedToUtc(p.year, p.month, p.day + 1, Math.floor(minuteOfDay / 60), minuteOfDay % 60, tz);

        if (!sequence.sendOnWeekends && isWeekend) {
            t = nextDayAt(hasWindow ? start! : 0);
            continue;
        }
        if (hasWindow) {
            if (minutes < start!) return zonedToUtc(p.year, p.month, p.day, Math.floor(start! / 60), start! % 60, tz);
            if (minutes >= end!) {
                t = nextDayAt(start!);
                continue;
            }
        }
        return t;
    }
    return t;
}

/** `from` + delay (days counted on the sequence's calendar), then aligned to the window. */
export function calculateNextStepTime(
    from: Date,
    delayDays: number,
    delayHours: number,
    delayMinutes: number,
    sequence: SequenceSchedule,
): Date {
    const tz = safeTimezone(sequence.timezone);
    let candidate = from;
    if (delayDays > 0) {
        const p = zonedParts(from, tz);
        candidate = zonedToUtc(p.year, p.month, p.day + delayDays, p.hour, p.minute, tz);
    }
    candidate = new Date(candidate.getTime() + (delayHours * 60 + delayMinutes) * 60 * 1000);
    return alignToSendWindow(candidate, sequence);
}

// ============================================
// SMALL HELPERS
// ============================================

function engineTokens(tokens: unknown): Record<string, string> {
    if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(tokens as Record<string, unknown>)) {
        if (typeof v === 'string' || typeof v === 'number') out[k] = String(v);
    }
    return out;
}

function isHardBounceError(message: string): boolean {
    return /\b55[0-4]\b|user unknown|unknown user|recipient.*(rejected|refused)|mailbox (unavailable|not found)|does not exist|no such user|bounce/i.test(message);
}

function isMailboxError(message: string): boolean {
    return /mailbox not found|mailbox is inactive|smtp configuration|token expired|no access token|api key missing|authentication|invalid login|auth/i.test(message);
}

/** Step body as the editor shows it: plain text. */
export function stepBodyAsText(step: Pick<EmailSequenceStep, 'bodyHtml' | 'bodyText'>): string {
    if (step.bodyText && !looksLikeHtml(step.bodyText)) return step.bodyText;
    return htmlToText(step.bodyHtml || '');
}

export function getContactSkipReason(
    contact: {
        email: string | null;
        unsubscribed: boolean;
        excludedAt: Date | null;
        company?: { excludedAt: Date | null } | null;
    },
    alreadyEnrolled: boolean,
): EnrollSkipReason | null {
    const email = contact.email?.trim();
    if (!email) return 'NO_EMAIL';
    if (!EMAIL_RE.test(email)) return 'INVALID_EMAIL';
    // "Ne plus contacter" spans every channel, company-level rules included.
    if (contact.excludedAt || contact.company?.excludedAt) return 'EXCLUDED';
    if (contact.unsubscribed) return 'UNSUBSCRIBED';
    if (alreadyEnrolled) return 'ALREADY_ENROLLED';
    return null;
}

/** Optional Redis fast path — the cron is the source of truth, this only shortens the wait. */
async function tryScheduleImmediate(enrollmentId: string): Promise<void> {
    if (!process.env.REDIS_HOST && !process.env.REDIS_URL) return;
    try {
        const queue = await import('../queue');
        if (!queue.isRedisAvailable()) return;
        await queue.scheduleSequenceProcess({ enrollmentId });
    } catch (error) {
        console.warn('[sequences] Redis scheduling skipped:', error instanceof Error ? error.message : error);
    }
}

// ============================================
// SEQUENCE SERVICE CLASS
// ============================================

export class SequenceService {
    calculateNextStepTime = calculateNextStepTime;

    // ============================================
    // ENROLLMENT
    // ============================================

    async enrollContact(params: EnrollContactParams): Promise<{
        success: boolean;
        enrollmentId?: string;
        error?: string;
    }> {
        const result = await this.enrollContacts(params.sequenceId, [params.contactId], params.tokens);
        const r = result.results[0];
        if (!r?.success) return { success: false, error: r?.error || 'Inscription impossible' };
        const enrollment = await prisma.emailSequenceEnrollment.findUnique({
            where: { sequenceId_contactId: { sequenceId: params.sequenceId, contactId: params.contactId } },
            select: { id: true },
        });
        return { success: true, enrollmentId: enrollment?.id };
    }

    /**
     * Enrol many contacts at once. Works for DRAFT, PAUSED and ACTIVE sequences —
     * contacts only start receiving emails once the sequence is ACTIVE.
     */
    async enrollContacts(
        sequenceId: string,
        contactIds: string[],
        tokens?: Record<string, string>,
    ): Promise<EnrollManyResult> {
        const out: EnrollManyResult = { enrolled: 0, skipped: {}, results: [] };
        const ids = Array.from(new Set(contactIds.filter(Boolean)));
        if (ids.length === 0) return out;

        const sequence = await prisma.emailSequence.findUnique({
            where: { id: sequenceId },
            include: { steps: { orderBy: { order: 'asc' }, take: 1 } },
        });
        if (!sequence) {
            out.results = ids.map((contactId) => ({ contactId, success: false, error: 'Séquence introuvable' }));
            return out;
        }
        if (sequence.status === 'ARCHIVED') {
            out.results = ids.map((contactId) => ({ contactId, success: false, error: 'Séquence archivée' }));
            return out;
        }

        const [contacts, existing] = await Promise.all([
            prisma.contact.findMany({
                where: { id: { in: ids } },
                select: {
                    id: true,
                    email: true,
                    unsubscribed: true,
                    excludedAt: true,
                    company: { select: { excludedAt: true } },
                },
            }),
            prisma.emailSequenceEnrollment.findMany({
                where: { sequenceId, contactId: { in: ids } },
                select: { contactId: true },
            }),
        ]);
        const byId = new Map(contacts.map((c) => [c.id, c]));
        const enrolledSet = new Set(existing.map((e) => e.contactId));

        const firstStep = sequence.steps[0];
        const nextStepAt = calculateNextStepTime(
            new Date(),
            firstStep?.delayDays || 0,
            firstStep?.delayHours || 0,
            firstStep?.delayMinutes || 0,
            sequence,
        );

        const eligible: string[] = [];
        for (const id of ids) {
            const contact = byId.get(id);
            if (!contact) {
                out.results.push({ contactId: id, success: false, error: 'Contact introuvable' });
                continue;
            }
            const reason = getContactSkipReason(contact, enrolledSet.has(id));
            if (reason) {
                out.skipped[reason] = (out.skipped[reason] || 0) + 1;
                out.results.push({ contactId: id, success: false, reason, error: ENROLL_SKIP_LABELS[reason] });
                continue;
            }
            eligible.push(id);
        }

        if (eligible.length > 0) {
            const created = await prisma.emailSequenceEnrollment.createMany({
                data: eligible.map((contactId) => ({
                    sequenceId,
                    contactId,
                    status: 'ACTIVE' as const,
                    currentStep: 0,
                    tokens: tokens || {},
                    nextStepAt,
                })),
                skipDuplicates: true,
            });
            out.enrolled = created.count;
            if (created.count > 0) {
                await prisma.emailSequence.update({
                    where: { id: sequenceId },
                    data: { totalEnrolled: { increment: created.count } },
                });
            }
            for (const contactId of eligible) out.results.push({ contactId, success: true });

            if (sequence.status === 'ACTIVE' && eligible.length <= 5 && nextStepAt <= new Date()) {
                const fresh = await prisma.emailSequenceEnrollment.findMany({
                    where: { sequenceId, contactId: { in: eligible } },
                    select: { id: true },
                });
                for (const e of fresh) await tryScheduleImmediate(e.id);
            }
        }

        return out;
    }

    // ============================================
    // ENGINE — called by /api/cron/email-sequences
    // ============================================

    async processDueEnrollments(options: {
        maxSends?: number;
        maxPerMailbox?: number;
        timeBudgetMs?: number;
    } = {}): Promise<EngineRunSummary> {
        const startedAt = Date.now();
        const maxSends = options.maxSends ?? 40;
        const maxPerMailbox = options.maxPerMailbox ?? 15;
        const timeBudgetMs = options.timeBudgetMs ?? 45_000;
        const summary: EngineRunSummary = {
            at: new Date().toISOString(),
            durationMs: 0,
            scanned: 0,
            sent: 0,
            skipped: 0,
            completed: 0,
            deferred: 0,
            exited: 0,
            errors: 0,
            errorSamples: [],
        };

        const now = new Date();
        const due = await prisma.emailSequenceEnrollment.findMany({
            where: {
                status: 'ACTIVE',
                nextStepAt: { lte: now },
                sequence: { status: 'ACTIVE' },
            },
            orderBy: { nextStepAt: 'asc' },
            take: maxSends * 3,
            select: {
                id: true,
                sequence: {
                    select: {
                        mailboxId: true,
                        sendOnWeekends: true,
                        sendTimeStart: true,
                        sendTimeEnd: true,
                        timezone: true,
                    },
                },
            },
        });
        summary.scanned = due.length;

        // Remaining daily quota per mailbox (sentToday resets on a new calendar day).
        const mailboxIds = Array.from(new Set(due.map((d) => d.sequence.mailboxId)));
        const mailboxes = await prisma.mailbox.findMany({
            where: { id: { in: mailboxIds } },
            select: { id: true, isActive: true, dailySendLimit: true, sentToday: true, lastSendReset: true },
        });
        const remaining = new Map<string, number>();
        const today = now.toDateString();
        for (const m of mailboxes) {
            const sent = m.lastSendReset.toDateString() === today ? m.sentToday : 0;
            remaining.set(m.id, m.isActive ? Math.max(0, Math.min(m.dailySendLimit - sent, maxPerMailbox)) : 0);
        }
        const blockedMailboxes = new Set<string>();

        let attempts = 0;
        for (const item of due) {
            if (attempts >= maxSends || Date.now() - startedAt > timeBudgetMs) break;
            const mailboxId = item.sequence.mailboxId;

            // Outside the sending window (e.g. sequence resumed at night): reschedule, don't send.
            const allowedAt = alignToSendWindow(new Date(), item.sequence);
            if (allowedAt.getTime() - Date.now() > 60_000) {
                await prisma.emailSequenceEnrollment.update({ where: { id: item.id }, data: { nextStepAt: allowedAt } });
                summary.deferred++;
                continue;
            }

            if (blockedMailboxes.has(mailboxId)) {
                summary.deferred++;
                continue;
            }
            if ((remaining.get(mailboxId) ?? 0) <= 0) {
                // Quota for today (or for this run) used up: next run / tomorrow picks it up.
                summary.deferred++;
                continue;
            }

            attempts++;
            const result = await this.processEnrollment(item.id);
            switch (result.action) {
                case 'sent':
                    summary.sent++;
                    remaining.set(mailboxId, (remaining.get(mailboxId) ?? 1) - 1);
                    break;
                case 'completed':
                    summary.completed++;
                    break;
                case 'deferred':
                    summary.deferred++;
                    if (result.mailboxBlocked) blockedMailboxes.add(mailboxId);
                    break;
                case 'exited':
                    summary.exited++;
                    break;
                case 'error':
                    summary.errors++;
                    if (result.mailboxBlocked) blockedMailboxes.add(mailboxId);
                    if (result.message && summary.errorSamples.length < 5) summary.errorSamples.push(result.message);
                    break;
                default:
                    summary.skipped++;
            }
        }

        summary.durationMs = Date.now() - startedAt;
        await this.recordEngineRun(summary);
        return summary;
    }

    async recordEngineRun(summary: EngineRunSummary): Promise<void> {
        try {
            const value = JSON.stringify(summary);
            await prisma.systemConfig.upsert({
                where: { key: ENGINE_LAST_RUN_KEY },
                create: { key: ENGINE_LAST_RUN_KEY, value },
                update: { value },
            });
        } catch (error) {
            console.error('[sequences] could not record engine run:', error);
        }
    }

    async getEngineStatus(): Promise<{ lastRun: EngineRunSummary | null; healthy: boolean; dueNow: number }> {
        const [row, dueNow] = await Promise.all([
            prisma.systemConfig.findUnique({ where: { key: ENGINE_LAST_RUN_KEY } }),
            prisma.emailSequenceEnrollment.count({
                where: { status: 'ACTIVE', nextStepAt: { lte: new Date() }, sequence: { status: 'ACTIVE' } },
            }),
        ]);
        let lastRun: EngineRunSummary | null = null;
        if (row?.value) {
            try {
                lastRun = JSON.parse(row.value) as EngineRunSummary;
            } catch {
                lastRun = null;
            }
        }
        const healthy = !!lastRun && Date.now() - new Date(lastRun.at).getTime() < 15 * 60 * 1000;
        return { lastRun, healthy, dueNow };
    }

    // ============================================
    // PROCESS ONE ENROLLMENT
    // ============================================

    async processEnrollment(enrollmentId: string): Promise<ProcessResult> {
        const now = new Date();
        try {
            // Claim: a lease on nextStepAt so overlapping runs never double-send.
            const claim = await prisma.emailSequenceEnrollment.updateMany({
                where: { id: enrollmentId, status: 'ACTIVE', OR: [{ nextStepAt: { lte: now } }, { nextStepAt: null }] },
                data: { nextStepAt: new Date(now.getTime() + CLAIM_LEASE_MS) },
            });
            if (claim.count === 0) {
                return { success: true, action: 'skipped', message: 'Pas encore dû ou déjà en cours' };
            }

            const enrollment = await prisma.emailSequenceEnrollment.findUnique({
                where: { id: enrollmentId },
                include: {
                    sequence: {
                        include: {
                            mailbox: { select: { id: true, email: true, displayName: true, provider: true, isActive: true } },
                            createdBy: { select: { id: true, name: true, email: true, phone: true } },
                            steps: { orderBy: { order: 'asc' } },
                        },
                    },
                    contact: {
                        include: {
                            company: {
                                include: {
                                    list: {
                                        select: {
                                            missionId: true,
                                            mission: { select: { name: true, client: { select: { name: true } } } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (!enrollment) return { success: false, action: 'error', message: 'Inscription introuvable' };
            const { sequence, contact } = enrollment;

            if (sequence.status !== 'ACTIVE') {
                // Leave the enrollment ACTIVE: it resumes on its own when the sequence is re-activated.
                return { success: true, action: 'skipped', message: 'Séquence inactive' };
            }

            // Contact-level stops (may have changed since enrolment).
            const reason = getContactSkipReason(contact, false);
            if (reason) {
                await this.exitEnrollment(
                    enrollmentId,
                    reason === 'UNSUBSCRIBED' ? 'UNSUBSCRIBED' : 'MANUAL_EXIT',
                    `Arrêt automatique : ${ENROLL_SKIP_LABELS[reason].toLowerCase()}`,
                );
                return { success: true, action: 'exited', message: ENROLL_SKIP_LABELS[reason] };
            }

            const currentStep = sequence.steps[enrollment.currentStep];
            if (!currentStep) {
                await this.completeEnrollment(enrollmentId);
                return { success: true, action: 'completed', message: 'Toutes les étapes sont terminées' };
            }

            if (await this.shouldSkipStep(enrollment, contact.email!, sequence.mailboxId, currentStep)) {
                return this.advanceToNextStep(enrollment, 'Étape ignorée (condition remplie)', 'skipped');
            }

            // Personalise
            const tokens = engineTokens(enrollment.tokens);
            const variables = buildVariablesFromData({
                contact,
                company: contact.company,
                sender: sequence.createdBy,
                mailbox: sequence.mailbox,
                mission: contact.company?.list?.mission
                    ? { name: contact.company.list.mission.name, clientName: contact.company.list.mission.client?.name }
                    : null,
                custom: tokens,
                timezone: safeTimezone(sequence.timezone),
            });
            const rendered = renderEmailContent(currentStep, variables);

            // Follow-up with an empty subject = reply in the same conversation.
            let inReplyTo: string | undefined;
            let threadId: string | undefined;
            if (!rendered.subject) {
                const firstWithSubject = sequence.steps.find((s) => s.subject?.trim());
                const previous = await prisma.email.findFirst({
                    where: { sequenceEnrollmentId: enrollmentId, direction: 'OUTBOUND' },
                    orderBy: { createdAt: 'desc' },
                    select: { subject: true, providerMessageId: true, threadId: true },
                });
                const base = previous?.subject || (firstWithSubject ? renderTemplateString(firstWithSubject.subject, variables) : '');
                if (!base) {
                    await this.pauseEnrollment(enrollmentId, `Étape ${enrollment.currentStep + 1} sans objet`);
                    return { success: false, action: 'paused', message: 'Étape sans objet' };
                }
                rendered.subject = /^re\s*:/i.test(base) ? base : `Re: ${base}`;
                if (previous?.providerMessageId) inReplyTo = previous.providerMessageId;
                // OUR EmailThread id: the sending service maps it to the provider's thread id.
                if (previous?.threadId) threadId = previous.threadId;
            }

            // The sequence's own tracking settings. `trackClicks` is forwarded for when the
            // sender supports it separately; today it wraps links only when opens are tracked.
            const sendOptions: SendOptions & { trackClicks?: boolean } = {
                trackClicks: sequence.trackClicks,
                to: [{
                    email: contact.email!.trim(),
                    name: [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || undefined,
                }],
                subject: rendered.subject,
                bodyHtml: rendered.bodyHtml,
                bodyText: rendered.bodyText,
                contactId: contact.id,
                missionId: contact.company?.list?.missionId ?? undefined,
                sentById: sequence.createdById,
                trackOpens: sequence.trackOpens,
                inReplyTo,
                threadId,
            };
            const sendResult = await emailSendingService.sendEmail(sequence.mailboxId, sendOptions);

            if (!sendResult.success) {
                return this.handleSendFailure(enrollment, sendResult.error || 'Erreur inconnue');
            }

            if (sendResult.emailId) {
                await prisma.email.update({
                    where: { id: sendResult.emailId },
                    data: { sequenceStepId: currentStep.id, sequenceEnrollmentId: enrollmentId },
                });
            }
            await prisma.emailSequenceStep.update({
                where: { id: currentStep.id },
                data: { totalSent: { increment: 1 } },
            });

            if (tokens.__failures || tokens.__lastError) {
                const { __failures: _f, __lastError: _e, ...rest } = tokens;
                void _f;
                void _e;
                await prisma.emailSequenceEnrollment.update({ where: { id: enrollmentId }, data: { tokens: rest } });
            }

            return this.advanceToNextStep(enrollment, 'Email envoyé', 'sent');
        } catch (error) {
            console.error('Process enrollment error:', error);
            // Release the lease so the next run retries.
            await prisma.emailSequenceEnrollment
                .updateMany({
                    where: { id: enrollmentId, status: 'ACTIVE' },
                    data: { nextStepAt: new Date(Date.now() + RETRY_DELAY_MS) },
                })
                .catch(() => undefined);
            return {
                success: false,
                action: 'error',
                message: error instanceof Error ? error.message : 'Erreur inconnue',
            };
        }
    }

    private async handleSendFailure(
        enrollment: EmailSequenceEnrollment & { sequence: EmailSequence & { steps: EmailSequenceStep[] } },
        error: string,
    ): Promise<ProcessResult> {
        const enrollmentId = enrollment.id;

        if (/daily send limit/i.test(error)) {
            // Quota reached: first slot of the next sending day.
            const tz = safeTimezone(enrollment.sequence.timezone);
            const p = zonedParts(new Date(), tz);
            const tomorrow = alignToSendWindow(zonedToUtc(p.year, p.month, p.day + 1, 0, 0, tz), enrollment.sequence);
            await prisma.emailSequenceEnrollment.update({ where: { id: enrollmentId }, data: { nextStepAt: tomorrow } });
            return { success: false, action: 'deferred', message: 'Quota journalier atteint', mailboxBlocked: true, nextStepAt: tomorrow };
        }

        if (isHardBounceError(error)) {
            const step = enrollment.sequence.steps[enrollment.currentStep];
            if (enrollment.sequence.stopOnBounce) {
                await this.exitEnrollment(enrollmentId, 'BOUNCED', `Adresse refusée : ${error.slice(0, 180)}`);
            } else {
                await this.advanceToNextStep(enrollment, 'Adresse refusée', 'skipped');
            }
            await prisma.emailSequence.update({
                where: { id: enrollment.sequenceId },
                data: { totalBounced: { increment: 1 } },
            });
            if (step) {
                await prisma.emailSequenceStep.update({ where: { id: step.id }, data: { totalBounced: { increment: 1 } } });
            }
            return { success: false, action: 'exited', message: error };
        }

        const tokens = engineTokens(enrollment.tokens);

        if (isMailboxError(error)) {
            // The mailbox is the problem, not the contact: retry later without counting a failure.
            await prisma.emailSequenceEnrollment.update({
                where: { id: enrollmentId },
                data: {
                    nextStepAt: new Date(Date.now() + RETRY_DELAY_MS),
                    tokens: { ...tokens, __lastError: `Boîte d'envoi : ${error}`.slice(0, 300) },
                },
            });
            return { success: false, action: 'error', message: `Boîte d'envoi : ${error}`, mailboxBlocked: true };
        }

        const failures = Number(tokens.__failures || 0) + 1;
        if (failures >= MAX_SEND_FAILURES) {
            await prisma.emailSequenceEnrollment.update({
                where: { id: enrollmentId },
                data: {
                    status: 'PAUSED',
                    exitReason: `Échec d'envoi répété : ${error}`.slice(0, 300),
                    tokens: { ...tokens, __failures: String(failures), __lastError: error.slice(0, 300) },
                },
            });
            return { success: false, action: 'paused', message: error };
        }
        await prisma.emailSequenceEnrollment.update({
            where: { id: enrollmentId },
            data: {
                nextStepAt: new Date(Date.now() + RETRY_DELAY_MS),
                tokens: { ...tokens, __failures: String(failures), __lastError: error.slice(0, 300) },
            },
        });
        return { success: false, action: 'error', message: error };
    }

    // ============================================
    // INBOUND: replies & bounces (called by the sync service)
    // ============================================

    async handleInboundEmail(input: {
        mailboxId: string;
        threadId: string;
        fromAddress: string;
        subject?: string | null;
        bodyText?: string | null;
        receivedAt?: Date | null;
    }): Promise<void> {
        const from = (input.fromAddress || '').trim().toLowerCase();
        if (!from) return;
        const receivedAt = input.receivedAt ?? new Date();

        if (/mailer-daemon|postmaster|mail delivery subsystem/i.test(from)
            || /undeliver|delivery status notification|non remis|returned mail|failure notice|échec de (la )?remise|delivery has failed/i.test(input.subject || '')) {
            await this.handleBounceNotice(input.mailboxId, input.bodyText || '', receivedAt);
            return;
        }

        // 1. Thread-based: this conversation contains an email sent by a sequence.
        const outbound = await prisma.email.findFirst({
            where: { threadId: input.threadId, direction: 'OUTBOUND', sequenceEnrollmentId: { not: null } },
            orderBy: { createdAt: 'desc' },
            select: { sequenceEnrollmentId: true },
        });

        const enrollments = outbound?.sequenceEnrollmentId
            ? await prisma.emailSequenceEnrollment.findMany({
                where: { id: outbound.sequenceEnrollmentId },
                include: { sequence: { select: { id: true, stopOnReply: true } } },
            })
            : // 2. Sender-based: the contact has an enrollment in a sequence using this mailbox.
            await prisma.emailSequenceEnrollment.findMany({
                where: {
                    status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED'] },
                    contact: { email: { equals: from, mode: 'insensitive' } },
                    sequence: { mailboxId: input.mailboxId },
                },
                include: { sequence: { select: { id: true, stopOnReply: true } } },
            });

        for (const enrollment of enrollments) {
            if (enrollment.enrolledAt > receivedAt) continue; // an old email seen on first sync
            await this.markReplied(enrollment, receivedAt);
        }
    }

    /** Legacy entry point kept for callers that only know the sender. */
    async handleReply(mailboxId: string, contactEmail: string): Promise<void> {
        const enrollments = await prisma.emailSequenceEnrollment.findMany({
            where: {
                status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED'] },
                contact: { email: { equals: contactEmail, mode: 'insensitive' } },
                sequence: { mailboxId },
            },
            include: { sequence: { select: { id: true, stopOnReply: true } } },
        });
        for (const enrollment of enrollments) await this.markReplied(enrollment, new Date());
    }

    private async markReplied(
        enrollment: EmailSequenceEnrollment & { sequence: { id: string; stopOnReply: boolean } },
        at: Date,
    ): Promise<void> {
        const tokens = engineTokens(enrollment.tokens);
        if (enrollment.status === 'REPLIED' || tokens.__repliedAt) return; // counted once

        const stop = enrollment.sequence.stopOnReply || enrollment.status === 'COMPLETED';
        await prisma.emailSequenceEnrollment.update({
            where: { id: enrollment.id },
            data: stop
                ? {
                    status: 'REPLIED',
                    exitedAt: at,
                    exitReason: 'Le contact a répondu',
                    nextStepAt: null,
                    tokens: { ...tokens, __repliedAt: at.toISOString() },
                }
                : { tokens: { ...tokens, __repliedAt: at.toISOString() } },
        });
        await prisma.emailSequence.update({
            where: { id: enrollment.sequenceId },
            data: { totalReplied: { increment: 1 } },
        });

        const last = await prisma.email.findFirst({
            where: { sequenceEnrollmentId: enrollment.id, direction: 'OUTBOUND' },
            orderBy: { createdAt: 'desc' },
            select: { id: true, sequenceStepId: true, status: true },
        });
        if (last) {
            if (last.status !== 'BOUNCED') {
                await prisma.email.update({ where: { id: last.id }, data: { status: 'REPLIED' } });
            }
            if (last.sequenceStepId) {
                await prisma.emailSequenceStep.update({
                    where: { id: last.sequenceStepId },
                    data: { totalReplied: { increment: 1 } },
                });
            }
        }
    }

    private async handleBounceNotice(mailboxId: string, body: string, receivedAt: Date): Promise<void> {
        const addresses = Array.from(new Set((body.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || []).map((a) => a.toLowerCase())))
            .filter((a) => !/mailer-daemon|postmaster/.test(a))
            .slice(0, 20);
        if (addresses.length === 0) return;

        const enrollments = await prisma.emailSequenceEnrollment.findMany({
            where: {
                status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED'] },
                sequence: { mailboxId },
                OR: addresses.map((a) => ({ contact: { email: { equals: a, mode: 'insensitive' as const } } })),
            },
            include: { sequence: { select: { stopOnBounce: true } } },
        });

        for (const enrollment of enrollments) {
            if (enrollment.enrolledAt > receivedAt) continue;
            const last = await prisma.email.findFirst({
                where: { sequenceEnrollmentId: enrollment.id, direction: 'OUTBOUND' },
                orderBy: { createdAt: 'desc' },
                select: { id: true, sequenceStepId: true, status: true },
            });
            if (!last || last.status === 'BOUNCED') continue; // nothing sent yet, or already counted

            await prisma.email.update({ where: { id: last.id }, data: { status: 'BOUNCED', bounceType: 'hard' } });
            if (last.sequenceStepId) {
                await prisma.emailSequenceStep.update({
                    where: { id: last.sequenceStepId },
                    data: { totalBounced: { increment: 1 } },
                });
            }
            await prisma.emailSequence.update({
                where: { id: enrollment.sequenceId },
                data: { totalBounced: { increment: 1 } },
            });
            if (enrollment.sequence.stopOnBounce && enrollment.status !== 'COMPLETED') {
                await this.exitEnrollment(enrollment.id, 'BOUNCED', "L'adresse a rejeté l'email");
            }
        }
    }

    // ============================================
    // ENROLLMENT MANAGEMENT
    // ============================================

    async pauseEnrollment(enrollmentId: string, reason?: string): Promise<void> {
        await prisma.emailSequenceEnrollment.update({
            where: { id: enrollmentId },
            data: { status: 'PAUSED', exitReason: reason ?? null },
        });
    }

    async resumeEnrollment(enrollmentId: string): Promise<void> {
        const enrollment = await prisma.emailSequenceEnrollment.findUnique({
            where: { id: enrollmentId },
            include: { sequence: true },
        });
        if (!enrollment || enrollment.status !== 'PAUSED') return;

        const earliest = alignToSendWindow(new Date(), enrollment.sequence);
        const nextStepAt = enrollment.nextStepAt && enrollment.nextStepAt > earliest ? enrollment.nextStepAt : earliest;
        const { __failures: _f, __lastError: _e, ...tokens } = engineTokens(enrollment.tokens);
        void _f;
        void _e;

        await prisma.emailSequenceEnrollment.update({
            where: { id: enrollmentId },
            data: { status: 'ACTIVE', nextStepAt, exitReason: null, tokens },
        });
    }

    async exitEnrollment(enrollmentId: string, status: EnrollmentStatus, reason?: string): Promise<void> {
        await prisma.emailSequenceEnrollment.update({
            where: { id: enrollmentId },
            data: { status, exitedAt: new Date(), exitReason: reason ?? null, nextStepAt: null },
        });
    }

    async completeEnrollment(enrollmentId: string): Promise<void> {
        const enrollment = await prisma.emailSequenceEnrollment.update({
            where: { id: enrollmentId },
            data: { status: 'COMPLETED', completedAt: new Date(), nextStepAt: null },
        });
        await prisma.emailSequence.update({
            where: { id: enrollment.sequenceId },
            data: { totalCompleted: { increment: 1 } },
        });
    }

    /** Remove a contact: deleted if nothing was sent yet, otherwise stopped (keeps stats). */
    async removeEnrollment(enrollmentId: string): Promise<'deleted' | 'stopped'> {
        const enrollment = await prisma.emailSequenceEnrollment.findUnique({
            where: { id: enrollmentId },
            select: { id: true, sequenceId: true, _count: { select: { emails: true } } },
        });
        if (!enrollment) return 'deleted';
        if (enrollment._count.emails > 0) {
            await this.exitEnrollment(enrollmentId, 'MANUAL_EXIT', 'Retiré manuellement');
            return 'stopped';
        }
        await prisma.emailSequenceEnrollment.delete({ where: { id: enrollmentId } });
        await prisma.emailSequence.updateMany({
            where: { id: enrollment.sequenceId, totalEnrolled: { gt: 0 } },
            data: { totalEnrolled: { decrement: 1 } },
        });
        return 'deleted';
    }

    /**
     * Called when a sequence becomes ACTIVE: enrollments paused by older code
     * because the *sequence* was paused resume, and enrollments without a
     * schedule get one. Individually paused contacts stay paused.
     */
    async onSequenceActivated(sequenceId: string): Promise<void> {
        const sequence = await prisma.emailSequence.findUnique({ where: { id: sequenceId } });
        if (!sequence) return;
        const earliest = alignToSendWindow(new Date(), sequence);
        await prisma.emailSequenceEnrollment.updateMany({
            where: { sequenceId, status: 'PAUSED', exitReason: { in: LEGACY_SEQUENCE_PAUSE_REASONS } },
            data: { status: 'ACTIVE', exitReason: null, nextStepAt: earliest },
        });
        await prisma.emailSequenceEnrollment.updateMany({
            where: { sequenceId, status: 'ACTIVE', nextStepAt: null },
            data: { nextStepAt: earliest },
        });
    }

    // ============================================
    // STEP EDITING
    // ============================================

    /**
     * Replace the sequence's steps with `input` (order = array order). Steps
     * keep their id when passed back; steps missing from `input` are deleted —
     * unless they already sent emails, in which case nothing is saved.
     */
    async saveSteps(sequenceId: string, input: StepInput[]): Promise<{ ok: true } | { ok: false; error: string }> {
        const existing = await prisma.emailSequenceStep.findMany({
            where: { sequenceId },
            orderBy: { order: 'asc' },
            select: { id: true, order: true, _count: { select: { emails: true } } },
        });
        const existingIds = new Set(existing.map((s) => s.id));
        const keep = new Set(input.map((s) => s.id).filter((id): id is string => !!id && existingIds.has(id)));
        const toDelete = existing.filter((s) => !keep.has(s.id));
        const blocked = toDelete.filter((s) => s._count.emails > 0);
        if (blocked.length > 0) {
            const s = blocked[0];
            const position = existing.findIndex((e) => e.id === s.id) + 1;
            return {
                ok: false,
                error: `L'étape ${position} a déjà envoyé ${s._count.emails} email${s._count.emails > 1 ? 's' : ''} : elle ne peut pas être supprimée. Modifiez son contenu ou dupliquez la séquence.`,
            };
        }

        const data = input.map((s, index) => {
            const raw = (s.body ?? s.bodyText ?? s.bodyHtml ?? '').toString();
            const isHtml = looksLikeHtml(raw);
            return {
                order: index,
                name: s.name?.trim() || null,
                subject: (s.subject || '').trim(),
                bodyHtml: textToHtml(raw),
                bodyText: isHtml ? htmlToText(raw) : raw,
                delayDays: Math.max(0, Math.min(365, Math.floor(Number(s.delayDays) || 0))),
                delayHours: Math.max(0, Math.min(23, Math.floor(Number(s.delayHours) || 0))),
                delayMinutes: Math.max(0, Math.min(59, Math.floor(Number(s.delayMinutes) || 0))),
                skipIfOpened: !!s.skipIfOpened,
                skipIfClicked: !!s.skipIfClicked,
                skipIfReplied: s.skipIfReplied !== false,
            };
        });

        await prisma.$transaction(async (tx) => {
            if (toDelete.length > 0) {
                await tx.emailSequenceStep.deleteMany({ where: { id: { in: toDelete.map((s) => s.id) } } });
            }
            // Park kept steps on negative orders so the (sequenceId, order) unique never collides.
            let tmp = -1;
            for (const id of keep) {
                await tx.emailSequenceStep.update({ where: { id }, data: { order: tmp-- } });
            }
            for (let i = 0; i < input.length; i++) {
                const id = input[i].id;
                if (id && keep.has(id)) {
                    await tx.emailSequenceStep.update({ where: { id }, data: data[i] });
                } else {
                    await tx.emailSequenceStep.create({ data: { ...data[i], sequenceId } });
                }
            }
        });

        return { ok: true };
    }

    // ============================================
    // PRIVATE HELPERS
    // ============================================

    private async advanceToNextStep(
        enrollment: EmailSequenceEnrollment & {
            sequence: EmailSequence & { steps: EmailSequenceStep[] };
        },
        message: string,
        action: 'sent' | 'skipped',
    ): Promise<ProcessResult> {
        const nextStepIndex = enrollment.currentStep + 1;
        const nextStep = enrollment.sequence.steps[nextStepIndex];

        if (!nextStep) {
            await prisma.emailSequenceEnrollment.update({
                where: { id: enrollment.id },
                data: { currentStep: nextStepIndex },
            });
            await this.completeEnrollment(enrollment.id);
            return { success: true, action: action === 'sent' ? 'sent' : 'completed', message };
        }

        const nextStepAt = calculateNextStepTime(
            new Date(),
            nextStep.delayDays,
            nextStep.delayHours,
            nextStep.delayMinutes,
            enrollment.sequence,
        );

        await prisma.emailSequenceEnrollment.update({
            where: { id: enrollment.id },
            data: { currentStep: nextStepIndex, nextStepAt },
        });

        return { success: true, action, message, nextStepAt };
    }

    private async shouldSkipStep(
        enrollment: EmailSequenceEnrollment,
        contactEmail: string,
        mailboxId: string,
        step: EmailSequenceStep,
    ): Promise<boolean> {
        if (step.skipIfOpened) {
            const opened = await prisma.email.count({
                where: { sequenceEnrollmentId: enrollment.id, openCount: { gt: 0 } },
            });
            if (opened > 0) return true;
        }

        if (step.skipIfClicked) {
            const clicked = await prisma.email.count({
                where: { sequenceEnrollmentId: enrollment.id, clickCount: { gt: 0 } },
            });
            if (clicked > 0) return true;
        }

        // Only reachable when the sequence keeps going after a reply (stopOnReply off).
        if (step.skipIfReplied) {
            if (engineTokens(enrollment.tokens).__repliedAt) return true;
            const replied = await prisma.email.count({
                where: {
                    mailboxId,
                    direction: 'INBOUND',
                    fromAddress: { equals: contactEmail.trim(), mode: Prisma.QueryMode.insensitive },
                    OR: [{ receivedAt: { gte: enrollment.enrolledAt } }, { receivedAt: null, createdAt: { gte: enrollment.enrolledAt } }],
                },
            });
            if (replied > 0) return true;
        }

        return false;
    }
}

// ============================================
// EXPORT SINGLETON
// ============================================

export const sequenceService = new SequenceService();
