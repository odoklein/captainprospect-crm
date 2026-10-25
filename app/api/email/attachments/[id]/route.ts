// ============================================
// GET /api/email/attachments/[id] - Download an email attachment
//
// Streamed through the app so the thread's read rule (mailbox access or
// participation) is checked on every download, whatever the storage provider.
// Attachments stored with a storageKey are streamed; an external url is a
// redirect; a record with neither (metadata only, not synced) is a 404.
// ?inline=1 displays instead of downloading (images, PDF).
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canReadThread } from '@/lib/email/permissions';
import { storageService } from '@/lib/storage/storage-service';

const INLINE_SAFE = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain)$/i;

function contentDisposition(filename: string, inline: boolean): string {
    const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
        }

        const { id } = await params;
        const attachment = await prisma.emailAttachment.findUnique({
            where: { id },
            select: {
                id: true,
                filename: true,
                mimeType: true,
                size: true,
                storageKey: true,
                url: true,
                email: {
                    select: {
                        thread: {
                            select: {
                                id: true,
                                mailbox: {
                                    select: {
                                        ownerId: true,
                                        permissions: {
                                            where: { userId: session.user.id },
                                            select: { canRead: true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!attachment) {
            return NextResponse.json({ success: false, error: 'Pièce jointe introuvable' }, { status: 404 });
        }

        const allowed = await canReadThread(attachment.email.thread, session.user.id, session.user.role);
        if (!allowed) {
            return NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 403 });
        }

        const wantsInline = new URL(req.url).searchParams.get('inline') === '1';
        const inline = wantsInline && INLINE_SAFE.test(attachment.mimeType);

        if (attachment.storageKey) {
            const buffer = await storageService.download(attachment.storageKey);
            return new NextResponse(new Uint8Array(buffer), {
                status: 200,
                headers: {
                    'Content-Type': inline ? attachment.mimeType : 'application/octet-stream',
                    'Content-Length': String(buffer.length),
                    'Content-Disposition': contentDisposition(attachment.filename, inline),
                    'X-Content-Type-Options': 'nosniff',
                    'Cache-Control': 'private, max-age=3600',
                },
            });
        }

        if (attachment.url && /^https:\/\//i.test(attachment.url)) {
            return NextResponse.redirect(attachment.url);
        }

        return NextResponse.json(
            { success: false, error: "Le contenu de cette pièce jointe n'a pas été synchronisé" },
            { status: 404 },
        );
    } catch (error) {
        console.error('GET /api/email/attachments/[id] error:', error);
        return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
    }
}
