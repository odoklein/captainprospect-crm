// ============================================
// EMAIL SEND API ROUTE
// POST /api/email/send - Send an email
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { emailSendingService } from '@/lib/email/services/sending-service';
import { getMailboxSendAccess } from '@/lib/email/permissions';

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Non autorisé' },
                { status: 401 }
            );
        }

        const contentType = req.headers.get('content-type') || '';
        let mailboxId: string;
        let to: { email: string }[];
        let cc: { email: string }[] = [];
        let bcc: { email: string }[] = [];
        let subject: string;
        let bodyHtml: string | null;
        let bodyText: string | null = null;
        let threadId: string | null = null;
        let contactId: string | null = null;
        let missionId: string | null = null;
        let sentByIdParam: string | null = null;
        let templateId: string | null = null;
        const attachments: { filename: string; content: Buffer; mimeType: string }[] = [];

        const normalizeRecipients = (arr: unknown): { email: string }[] =>
            (Array.isArray(arr) ? arr : []).map((t: unknown) =>
                typeof t === 'string' ? { email: t } : (t as { email: string })
            );

        if (contentType.includes('application/json')) {
            // JSON body (e.g. from quick-send internal call) — no attachments
            const body = await req.json();
            mailboxId = body.mailboxId;
            to = normalizeRecipients(body.to);
            cc = normalizeRecipients(body.cc);
            bcc = normalizeRecipients(body.bcc);
            subject = body.subject ?? '';
            bodyHtml = body.bodyHtml ?? null;
            bodyText = body.bodyText ?? null;
            threadId = body.threadId ?? null;
            contactId = body.contactId ?? null;
            missionId = body.missionId ?? null;
            sentByIdParam = body.sentById ?? null;
            templateId = body.templateId ?? null;
        } else {
            // FormData (e.g. from EmailComposer with attachments)
            const formData = await req.formData();
            mailboxId = formData.get('mailboxId') as string;
            const toJson = formData.get('to') as string;
            const ccJson = formData.get('cc') as string | null;
            const bccJson = formData.get('bcc') as string | null;
            subject = formData.get('subject') as string;
            bodyHtml = formData.get('bodyHtml') as string | null;
            bodyText = formData.get('bodyText') as string | null;
            threadId = formData.get('threadId') as string | null;
            contactId = formData.get('contactId') as string | null;
            missionId = formData.get('missionId') as string | null;
            sentByIdParam = formData.get('sentById') as string | null;
            templateId = formData.get('templateId') as string | null;

            to = toJson ? JSON.parse(toJson) : [];
            cc = ccJson ? JSON.parse(ccJson) : [];
            bcc = bccJson ? JSON.parse(bccJson) : [];

            for (const [key, value] of formData.entries()) {
                if (!key.startsWith('attachment_')) continue;
                // Accept File or Blob (some runtimes return Blob for multipart file parts)
                const blob = value instanceof Blob ? value : null;
                if (!blob) continue;
                const arrayBuffer = await blob.arrayBuffer();
                const filename = value instanceof File && value.name ? value.name : `attachment_${key.replace('attachment_', '')}`;
                const mimeType = value instanceof File && value.type ? value.type : 'application/octet-stream';
                attachments.push({
                    filename,
                    content: Buffer.from(arrayBuffer),
                    mimeType,
                });
            }
        }

        if (!mailboxId) {
            return NextResponse.json(
                { success: false, error: 'Mailbox ID requis' },
                { status: 400 }
            );
        }

        if (to.length === 0) {
            return NextResponse.json(
                { success: false, error: 'Au moins un destinataire requis' },
                { status: 400 }
            );
        }

        const sendAccess = await getMailboxSendAccess({
            mailboxId,
            userId: session.user.id,
            userRole: session.user.role,
            missionId,
        });

        if (!sendAccess.mailboxExists) {
            return NextResponse.json(
                { success: false, error: 'Boîte mail non trouvée' },
                { status: 404 }
            );
        }

        if (!sendAccess.allowed) {
            return NextResponse.json(
                { success: false, error: sendAccess.reason || 'Permission d\'envoi non autorisée' },
                { status: 403 }
            );
        }

        // Outreach context: use sentById from request or current user when contact/mission is set
        const sentById = sentByIdParam || ((contactId || missionId) ? session.user.id : undefined);

        // Send email
        const result = await emailSendingService.sendEmail(mailboxId, {
            to,
            cc,
            bcc,
            subject,
            bodyHtml: bodyHtml || undefined,
            bodyText: bodyText || undefined,
            attachments: attachments.length > 0 ? attachments : undefined,
            threadId: threadId || undefined,
            contactId: contactId || undefined,
            missionId: missionId || undefined,
            sentById: sentById || undefined,
            templateId: templateId || undefined,
        });

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            data: {
                messageId: result.messageId,
                threadId: result.threadId,
                emailId: result.emailId,
            },
        });
    } catch (error) {
        console.error('POST /api/email/send error:', error);
        return NextResponse.json(
            { success: false, error: 'Erreur serveur' },
            { status: 500 }
        );
    }
}
