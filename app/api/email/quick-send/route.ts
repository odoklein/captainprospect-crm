// ============================================
// POST /api/email/quick-send
// One-shot send from the call screen / CRM drawers: optional template with
// {{variable}} substitution for the contact, mission context for the mailbox
// permission (an SDR may use the mission default mailbox) and for linking.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { looksLikeHtml, processTemplate, textToHtml } from '@/lib/email/services/template-variables';
import { emailSendingService } from '@/lib/email/services/sending-service';
import { getMailboxSendAccess } from '@/lib/email/permissions';

function htmlToText(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
        }

        const body = await req.json();
        const {
            mailboxId,
            templateId,
            to,
            contactId,
            companyId,
            missionId,
            customSubject,
            customBodyHtml,
            customData,
        } = body;

        if (!mailboxId) {
            return NextResponse.json({ success: false, error: 'Boîte d\'envoi requise' }, { status: 400 });
        }

        const recipients: { email: string }[] = (Array.isArray(to) ? to : [])
            .map((e: { email?: string } | string) => (typeof e === 'string' ? e : e?.email || ''))
            .map((email: string) => email.trim())
            .filter((email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            .map((email: string) => ({ email }));

        if (recipients.length === 0) {
            return NextResponse.json({ success: false, error: 'Adresse du destinataire invalide' }, { status: 400 });
        }

        // Same permission rule as /api/email/send (owner, manager, shared
        // canSend, or SDR assigned to the mission whose default mailbox it is)
        const access = await getMailboxSendAccess({
            mailboxId,
            userId: session.user.id,
            userRole: session.user.role,
            missionId: missionId || null,
        });
        if (!access.mailboxExists) {
            return NextResponse.json({ success: false, error: 'Boîte mail non trouvée' }, { status: 404 });
        }
        if (!access.allowed) {
            return NextResponse.json(
                { success: false, error: access.reason || 'Permission d\'envoi non autorisée' },
                { status: 403 },
            );
        }

        let rawSubject: string;
        let rawBodyHtml: string;
        let rawBodyText: string | null = null;

        if (templateId) {
            const template = await prisma.emailTemplate.findUnique({ where: { id: templateId } });
            if (!template) {
                return NextResponse.json({ success: false, error: 'Modèle non trouvé' }, { status: 404 });
            }
            rawSubject = customSubject || template.subject;
            rawBodyHtml = customBodyHtml || template.bodyHtml;
            rawBodyText = customBodyHtml ? null : template.bodyText;
        } else {
            if (!customSubject?.trim() || !customBodyHtml?.trim()) {
                return NextResponse.json(
                    { success: false, error: 'Objet et message requis' },
                    { status: 400 },
                );
            }
            rawSubject = customSubject;
            rawBodyHtml = customBodyHtml;
        }

        // Plain-text bodies (typed in the modal) keep their line breaks once sent as HTML.
        if (!looksLikeHtml(rawBodyHtml)) rawBodyHtml = textToHtml(rawBodyHtml);

        const processed = await processTemplate(rawSubject, rawBodyHtml, rawBodyText, {
            contactId: contactId || undefined,
            companyId: companyId || undefined,
            missionId: missionId || undefined,
            senderId: session.user.id,
            mailboxId,
            customData,
        });

        const result = await emailSendingService.sendEmail(mailboxId, {
            to: recipients,
            subject: processed.subject,
            bodyHtml: processed.bodyHtml,
            bodyText: processed.bodyText || htmlToText(processed.bodyHtml),
            contactId: contactId || undefined,
            missionId: missionId || undefined,
            sentById: session.user.id,
            templateId: templateId || undefined,
        });

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error ? `L'envoi a échoué : ${result.error}` : 'L\'envoi a échoué' },
                { status: 502 },
            );
        }

        // Usage stats only once the email really left
        if (templateId) {
            await prisma.emailTemplate
                .update({
                    where: { id: templateId },
                    data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
                })
                .catch(() => undefined);
        }

        return NextResponse.json({
            success: true,
            data: {
                messageId: result.messageId,
                threadId: result.threadId,
                emailId: result.emailId,
                subject: processed.subject,
                to: recipients,
            },
        });
    } catch (error) {
        console.error('POST /api/email/quick-send error:', error);
        return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
    }
}
