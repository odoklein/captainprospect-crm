// ============================================
// OUTLOOK OAUTH CALLBACK - Handle OAuth callback
// GET /api/email/oauth/outlook/callback
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { outlookProvider } from '@/lib/email/providers';
import { encrypt } from '@/lib/encryption';

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.redirect(
                new URL('/login?error=unauthorized', req.url)
            );
        }

        const code = req.nextUrl.searchParams.get('code');
        const state = req.nextUrl.searchParams.get('state');
        const error = req.nextUrl.searchParams.get('error');
        const errorDescription = req.nextUrl.searchParams.get('error_description');

        const defaultReturn = '/manager/emails/mailboxes';

        if (error) {
            console.error('Outlook OAuth error:', error, errorDescription);
            let returnBase = defaultReturn;
            try {
                const stateData = JSON.parse(Buffer.from(state || '', 'base64url').toString());
                if (stateData.returnUrl) returnBase = stateData.returnUrl;
            } catch { /* ignore */ }
            return NextResponse.redirect(
                new URL(`${returnBase}?error=${encodeURIComponent(error)}`, req.url)
            );
        }

        if (!code || !state) {
            return NextResponse.redirect(
                new URL(`${defaultReturn}?error=missing_params`, req.url)
            );
        }

        // Decode and verify state
        let stateData: { userId: string; timestamp: number; returnUrl?: string };
        try {
            stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
        } catch {
            return NextResponse.redirect(
                new URL(`${defaultReturn}?error=invalid_state`, req.url)
            );
        }

        const returnUrl = stateData.returnUrl || defaultReturn;

        // Verify state matches current user
        if (stateData.userId !== session.user.id) {
            return NextResponse.redirect(
                new URL(`${returnUrl}?error=state_mismatch`, req.url)
            );
        }

        // Check state freshness (10 minute expiry)
        if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
            return NextResponse.redirect(
                new URL(`${returnUrl}?error=state_expired`, req.url)
            );
        }

        // Exchange code for tokens
        const tokens = await outlookProvider.handleCallback(code);

        // Get user profile/email
        const profile = await outlookProvider.getUserProfile(tokens);

        if (!profile.email) {
            return NextResponse.redirect(
                new URL(`${returnUrl}?error=no_email`, req.url)
            );
        }

        // Check if mailbox already exists
        const existingMailbox = await prisma.mailbox.findFirst({
            where: {
                ownerId: session.user.id,
                email: profile.email,
            },
        });

        if (existingMailbox) {
            // Update existing mailbox tokens
            await prisma.mailbox.update({
                where: { id: existingMailbox.id },
                data: {
                    accessToken: encrypt(tokens.accessToken),
                    refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
                    tokenExpiry: tokens.expiresAt,
                    displayName: profile.name,
                    syncStatus: 'PENDING',
                    lastError: null,
                    isActive: true,
                    updatedAt: new Date(),
                },
            });

            const finalUrl = stateData.returnUrl || defaultReturn;
            return NextResponse.redirect(
                new URL(`${finalUrl}?success=reconnected`, req.url)
            );
        }

        const mailboxType = session.user.role === 'CLIENT' ? 'CLIENT' : 'PERSONAL';

        // Create new mailbox
        await prisma.mailbox.create({
            data: {
                ownerId: session.user.id,
                provider: 'OUTLOOK',
                email: profile.email,
                displayName: profile.name,
                accessToken: encrypt(tokens.accessToken),
                refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
                tokenExpiry: tokens.expiresAt,
                type: mailboxType,
                syncStatus: 'PENDING',
                isActive: true,
            },
        });

        const finalUrl = stateData.returnUrl || defaultReturn;
        return NextResponse.redirect(
            new URL(`${finalUrl}?success=connected`, req.url)
        );
    } catch (error) {
        console.error('Outlook OAuth callback error:', error);
        const defaultReturn = '/manager/emails/mailboxes';
        return NextResponse.redirect(
            new URL(`${defaultReturn}?error=callback_failed`, req.url)
        );
    }
}
