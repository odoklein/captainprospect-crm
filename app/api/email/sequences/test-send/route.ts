// ============================================
// POST /api/email/sequences/test-send
// Body: { mailboxId, subject, body, contactId? }
// Sends ONE rendered step to the signed-in user's own address, from the
// sequence's mailbox, so they see it exactly as a prospect would.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emailSendingService } from '@/lib/email/services/sending-service';
import { canUseMailbox, getSequenceUser, jsonError, unauthorized } from '../_lib/shared';
import { renderForUser } from '../_lib/render';

export async function POST(req: NextRequest) {
    try {
        const user = await getSequenceUser();
        if (!user) return unauthorized();

        const body = (await req.json()) as Record<string, unknown>;
        const mailboxId = typeof body.mailboxId === 'string' ? body.mailboxId : '';
        if (!mailboxId) return jsonError("Choisissez d'abord une boîte d'envoi", 400);
        if (!(await canUseMailbox(user, mailboxId))) {
            return jsonError('Vous ne pouvez pas envoyer depuis cette boîte', 403);
        }

        const me = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true, name: true } });
        if (!me?.email) return jsonError('Votre compte n\'a pas d\'adresse email', 400);

        const subject = String(body.subject ?? '');
        const text = String(body.body ?? '');
        if (!text.trim()) return jsonError("L'email est vide", 400);

        const rendered = await renderForUser(user, {
            subject,
            body: text,
            contactId: typeof body.contactId === 'string' ? body.contactId : null,
            mailboxId,
        });

        const result = await emailSendingService.sendEmail(mailboxId, {
            to: [{ email: me.email, name: me.name || undefined }],
            subject: `[Test] ${rendered.subject || '(suite du fil précédent)'}`,
            bodyHtml: rendered.bodyHtml,
            bodyText: rendered.bodyText,
            sentById: user.id,
            trackOpens: false,
        });

        if (!result.success) return jsonError(`Envoi impossible : ${result.error || 'erreur inconnue'}`, 502);
        return NextResponse.json({ success: true, data: { to: me.email } });
    } catch (error) {
        console.error('POST /api/email/sequences/test-send error:', error);
        return jsonError("Impossible d'envoyer le test", 500);
    }
}
