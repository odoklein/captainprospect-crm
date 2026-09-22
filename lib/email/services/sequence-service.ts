// ============================================
// EMAIL SEQUENCE SERVICE
// Handles email sequence automation
// ============================================

import { prisma } from '@/lib/prisma';
import { 
    EmailSequence, 
    EmailSequenceStep, 
    EmailSequenceEnrollment,
    EnrollmentStatus,
    Contact,
} from '@prisma/client';
import { emailSendingService } from './sending-service';
import { scheduleSequenceProcess } from '../queue';

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
    action: 'sent' | 'skipped' | 'completed' | 'paused' | 'error';
    message?: string;
    nextStepAt?: Date;
}

// ============================================
// SEQUENCE SERVICE CLASS
// ============================================

export class SequenceService {
    // ============================================
    // ENROLL CONTACT
    // ============================================

    async enrollContact(params: EnrollContactParams): Promise<{
        success: boolean;
        enrollmentId?: string;
        error?: string;
    }> {
        try {
            const { sequenceId, contactId, tokens } = params;

            // Get sequence
            const sequence = await prisma.emailSequence.findUnique({
                where: { id: sequenceId },
                include: {
                    steps: {
                        orderBy: { order: 'asc' },
                        take: 1,
                    },
                },
            });

            if (!sequence) {
                return { success: false, error: 'Sequence not found' };
            }

            if (sequence.status !== 'ACTIVE') {
                return { success: false, error: 'Sequence is not active' };
            }

            // Check if already enrolled
            const existing = await prisma.emailSequenceEnrollment.findUnique({
                where: {
                    sequenceId_contactId: {
                        sequenceId,
                        contactId,
                    },
                },
            });

            if (existing) {
                return { success: false, error: 'Contact already enrolled' };
            }

            // Get contact
            const contact = await prisma.contact.findUnique({
                where: { id: contactId },
                include: { company: { select: { excludedAt: true } } },
            });

            if (!contact || !contact.email) {
                return { success: false, error: 'Contact not found or has no email' };
            }

            // "Ne plus contacter" spans every channel: a company taken off the
            // phone must not keep receiving a sequence. Checked on the company
            // too, so a COMPANY-level rule covers contacts added afterwards.
            if (contact.excludedAt || contact.company?.excludedAt) {
                return { success: false, error: 'Contact exclu (ne plus contacter)' };
            }

            if (contact.unsubscribed) {
                return { success: false, error: 'Contact désinscrit' };
            }

            // Calculate first step timing
            const firstStep = sequence.steps[0];
            const nextStepAt = this.calculateNextStepTime(
                new Date(),
                firstStep?.delayDays || 0,
                firstStep?.delayHours || 0,
                firstStep?.delayMinutes || 0,
                sequence
            );

            // Create enrollment
            const enrollment = await prisma.emailSequenceEnrollment.create({
                data: {
                    sequenceId,
                    contactId,
                    status: 'ACTIVE',
                    currentStep: 0,
                    tokens: tokens || {},
                    nextStepAt,
                },
            });

            // Update sequence stats
            await prisma.emailSequence.update({
                where: { id: sequenceId },
                data: { totalEnrolled: { increment: 1 } },
            });

            // Schedule processing if immediate
            if (nextStepAt <= new Date()) {
                await scheduleSequenceProcess({ enrollmentId: enrollment.id });
            }

            return {
                success: true,
                enrollmentId: enrollment.id,
            };
        } catch (error) {
            console.error('Enroll contact error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    // ============================================
    // PROCESS ENROLLMENT
    // ============================================

    async processEnrollment(enrollmentId: string): Promise<ProcessResult> {
        try {
            // Get enrollment with full context
            const enrollment = await prisma.emailSequenceEnrollment.findUnique({
                where: { id: enrollmentId },
                include: {
                    sequence: {
                        include: {
                            mailbox: true,
                            steps: {
                                orderBy: { order: 'asc' },
                            },
                        },
                    },
                    contact: {
                        include: {
                            company: true,
                        },
                    },
                },
            });

            if (!enrollment) {
                return { success: false, action: 'error', message: 'Enrollment not found' };
            }

            // Check if still active
            if (enrollment.status !== 'ACTIVE') {
                return { 
                    success: true, 
                    action: 'skipped', 
                    message: `Enrollment is ${enrollment.status}` 
                };
            }

            // Check if sequence is active
            if (enrollment.sequence.status !== 'ACTIVE') {
                await this.pauseEnrollment(enrollmentId, 'Sequence paused');
                return { success: true, action: 'paused', message: 'Sequence is not active' };
            }

            // Get current step
            const currentStep = enrollment.sequence.steps[enrollment.currentStep];
            
            if (!currentStep) {
                // Completed all steps
                await this.completeEnrollment(enrollmentId);
                return { success: true, action: 'completed', message: 'All steps completed' };
            }

            // Check skip conditions
            if (await this.shouldSkipStep(enrollment, currentStep)) {
                return this.advanceToNextStep(enrollment, 'Step skipped due to conditions');
            }

            // Build personalized email
            const { subject, bodyHtml, bodyText } = this.personalizeTemplate(
                currentStep,
                enrollment.contact,
                enrollment.tokens as Record<string, string> | null
            );

            // Send email
            const sendResult = await emailSendingService.sendEmail(
                enrollment.sequence.mailboxId,
                {
                    to: [{
                        email: enrollment.contact.email!,
                        name: `${enrollment.contact.firstName || ''} ${enrollment.contact.lastName || ''}`.trim() || undefined,
                    }],
                    subject,
                    bodyHtml,
                    bodyText,
                }
            );

            if (!sendResult.success) {
                // Check if bounce
                if (sendResult.error?.includes('bounce')) {
                    await this.exitEnrollment(enrollmentId, 'BOUNCED', sendResult.error);
                    
                    // Update sequence stats
                    await prisma.emailSequence.update({
                        where: { id: enrollment.sequenceId },
                        data: { totalBounced: { increment: 1 } },
                    });
                    
                    return { success: false, action: 'error', message: sendResult.error };
                }
                
                return { success: false, action: 'error', message: sendResult.error };
            }

            // Link email to enrollment
            if (sendResult.emailId) {
                await prisma.email.update({
                    where: { id: sendResult.emailId },
                    data: {
                        sequenceStepId: currentStep.id,
                        sequenceEnrollmentId: enrollmentId,
                    },
                });
            }

            // Advance to next step
            return this.advanceToNextStep(enrollment, 'Email sent successfully');
        } catch (error) {
            console.error('Process enrollment error:', error);
            return {
                success: false,
                action: 'error',
                message: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    // ============================================
    // HANDLE REPLY
    // ============================================

    async handleReply(
        mailboxId: string,
        contactEmail: string
    ): Promise<void> {
        // Find active enrollments for this contact
        const enrollments = await prisma.emailSequenceEnrollment.findMany({
            where: {
                status: 'ACTIVE',
                contact: {
                    email: contactEmail,
                },
                sequence: {
                    mailboxId,
                    stopOnReply: true,
                },
            },
            include: {
                sequence: true,
            },
        });

        for (const enrollment of enrollments) {
            await this.exitEnrollment(enrollment.id, 'REPLIED', 'Contact replied');
            
            // Update sequence stats
            await prisma.emailSequence.update({
                where: { id: enrollment.sequenceId },
                data: { totalReplied: { increment: 1 } },
            });
        }
    }

    // ============================================
    // ENROLLMENT MANAGEMENT
    // ============================================

    async pauseEnrollment(enrollmentId: string, reason?: string): Promise<void> {
        await prisma.emailSequenceEnrollment.update({
            where: { id: enrollmentId },
            data: {
                status: 'PAUSED',
                exitReason: reason,
            },
        });
    }

    async resumeEnrollment(enrollmentId: string): Promise<void> {
        const enrollment = await prisma.emailSequenceEnrollment.findUnique({
            where: { id: enrollmentId },
            include: {
                sequence: {
                    include: {
                        steps: { orderBy: { order: 'asc' } },
                    },
                },
            },
        });

        if (!enrollment || enrollment.status !== 'PAUSED') return;

        const currentStep = enrollment.sequence.steps[enrollment.currentStep];
        const nextStepAt = this.calculateNextStepTime(
            new Date(),
            currentStep?.delayDays || 0,
            currentStep?.delayHours || 0,
            currentStep?.delayMinutes || 0,
            enrollment.sequence
        );

        await prisma.emailSequenceEnrollment.update({
            where: { id: enrollmentId },
            data: {
                status: 'ACTIVE',
                nextStepAt,
                exitReason: null,
            },
        });
    }

    async exitEnrollment(
        enrollmentId: string,
        status: EnrollmentStatus,
        reason?: string
    ): Promise<void> {
        await prisma.emailSequenceEnrollment.update({
            where: { id: enrollmentId },
            data: {
                status,
                exitedAt: new Date(),
                exitReason: reason,
                nextStepAt: null,
            },
        });
    }

    async completeEnrollment(enrollmentId: string): Promise<void> {
        const enrollment = await prisma.emailSequenceEnrollment.update({
            where: { id: enrollmentId },
            data: {
                status: 'COMPLETED',
                completedAt: new Date(),
                nextStepAt: null,
            },
        });

        // Update sequence stats
        await prisma.emailSequence.update({
            where: { id: enrollment.sequenceId },
            data: { totalCompleted: { increment: 1 } },
        });
    }

    // ============================================
    // PRIVATE HELPERS
    // ============================================

    private async advanceToNextStep(
        enrollment: EmailSequenceEnrollment & {
            sequence: EmailSequence & { steps: EmailSequenceStep[] };
        },
        message: string
    ): Promise<ProcessResult> {
        const nextStepIndex = enrollment.currentStep + 1;
        const nextStep = enrollment.sequence.steps[nextStepIndex];

        if (!nextStep) {
            // Completed all steps
            await this.completeEnrollment(enrollment.id);
            return { success: true, action: 'completed', message: 'All steps completed' };
        }

        const nextStepAt = this.calculateNextStepTime(
            new Date(),
            nextStep.delayDays,
            nextStep.delayHours,
            nextStep.delayMinutes,
            enrollment.sequence
        );

        await prisma.emailSequenceEnrollment.update({
            where: { id: enrollment.id },
            data: {
                currentStep: nextStepIndex,
                nextStepAt,
            },
        });

        return {
            success: true,
            action: 'sent',
            message,
            nextStepAt,
        };
    }

    private async shouldSkipStep(
        enrollment: EmailSequenceEnrollment & { contact: Contact },
        step: EmailSequenceStep
    ): Promise<boolean> {
        // Check if should skip due to previous opens
        if (step.skipIfOpened) {
            const hasOpened = await prisma.email.count({
                where: {
                    sequenceEnrollmentId: enrollment.id,
                    openCount: { gt: 0 },
                },
            });
            if (hasOpened > 0) return true;
        }

        // Check if should skip due to previous clicks
        if (step.skipIfClicked) {
            const hasClicked = await prisma.email.count({
                where: {
                    sequenceEnrollmentId: enrollment.id,
                    clickCount: { gt: 0 },
                },
            });
            if (hasClicked > 0) return true;
        }

        return false;
    }

    private calculateNextStepTime(
        from: Date,
        delayDays: number,
        delayHours: number,
        delayMinutes: number,
        sequence: EmailSequence
    ): Date {
        const next = new Date(from);
        next.setDate(next.getDate() + delayDays);
        next.setHours(next.getHours() + delayHours);
        next.setMinutes(next.getMinutes() + delayMinutes);

        // Skip weekends if configured
        if (!sequence.sendOnWeekends) {
            while (next.getDay() === 0 || next.getDay() === 6) {
                next.setDate(next.getDate() + 1);
            }
        }

        // Respect send time window if configured
        if (sequence.sendTimeStart && sequence.sendTimeEnd) {
            const [startHour, startMin] = sequence.sendTimeStart.split(':').map(Number);
            const [endHour, endMin] = sequence.sendTimeEnd.split(':').map(Number);
            
            const hours = next.getHours();
            const mins = next.getMinutes();
            
            // If before window, set to start of window
            if (hours < startHour || (hours === startHour && mins < startMin)) {
                next.setHours(startHour, startMin, 0, 0);
            }
            // If after window, set to start of window next day
            else if (hours > endHour || (hours === endHour && mins > endMin)) {
                next.setDate(next.getDate() + 1);
                next.setHours(startHour, startMin, 0, 0);
                
                // Skip weekends again
                if (!sequence.sendOnWeekends) {
                    while (next.getDay() === 0 || next.getDay() === 6) {
                        next.setDate(next.getDate() + 1);
                    }
                }
            }
        }

        return next;
    }

    private personalizeTemplate(
        step: EmailSequenceStep,
        contact: Contact & { company?: { name: string } | null },
        customTokens?: Record<string, string> | null
    ): { subject: string; bodyHtml: string; bodyText?: string } {
        const tokens: Record<string, string> = {
            firstName: contact.firstName || '',
            lastName: contact.lastName || '',
            fullName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
            email: contact.email || '',
            title: contact.title || '',
            company: contact.company?.name || '',
            ...customTokens,
        };

        let subject = step.subject;
        let bodyHtml = step.bodyHtml;
        let bodyText = step.bodyText || undefined;

        // Replace tokens
        for (const [key, value] of Object.entries(tokens)) {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
            subject = subject.replace(regex, value);
            bodyHtml = bodyHtml.replace(regex, value);
            if (bodyText) {
                bodyText = bodyText.replace(regex, value);
            }
        }

        return { subject, bodyHtml, bodyText };
    }
}

// ============================================
// EXPORT SINGLETON
// ============================================

export const sequenceService = new SequenceService();
