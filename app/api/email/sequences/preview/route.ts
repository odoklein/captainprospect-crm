// ============================================
// POST /api/email/sequences/preview
// Body: { subject, body, contactId?, mailboxId?, timezone? }
// Renders a step exactly as the engine would (sample contact when none given).
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSequenceUser, jsonError, unauthorized } from '../_lib/shared';
import { renderForUser } from '../_lib/render';

export async function POST(req: NextRequest) {
    try {
        const user = await getSequenceUser();
        if (!user) return unauthorized();
        const body = (await req.json()) as Record<string, unknown>;
        const data = await renderForUser(user, {
            subject: String(body.subject ?? ''),
            body: String(body.body ?? ''),
            contactId: typeof body.contactId === 'string' ? body.contactId : null,
            mailboxId: typeof body.mailboxId === 'string' ? body.mailboxId : null,
            timezone: typeof body.timezone === 'string' ? body.timezone : null,
        });
        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('POST /api/email/sequences/preview error:', error);
        return jsonError("Impossible de générer l'aperçu", 500);
    }
}
