// ============================================
// EMAIL PROVIDER FACTORY & EXPORTS
// ============================================

import { EmailProvider } from '@prisma/client';
import { IEmailProvider } from './types';
import { GmailProvider, gmailProvider } from './gmail';
import { OutlookProvider, outlookProvider } from './outlook';
import { ImapProvider, imapProvider, type ImapConfig } from './imap';
import { ReachInboxProvider, reachInboxProvider } from './reachinbox';

// Re-export types
export * from './types';
export type { ImapConfig } from './imap';

// Re-export provider classes
export { GmailProvider, gmailProvider } from './gmail';
export { OutlookProvider, outlookProvider } from './outlook';
export { ImapProvider, imapProvider } from './imap';
export { ReachInboxProvider, reachInboxProvider } from './reachinbox';

// ============================================
// PROVIDER FACTORY
// ============================================

/**
 * Get the appropriate email provider instance based on provider type
 */
export function getEmailProvider(provider: EmailProvider): IEmailProvider {
    if ((provider as string) === 'REACHINBOX') {
        return reachInboxProvider;
    }

    switch (provider) {
        case 'GMAIL':
            return gmailProvider;
        case 'OUTLOOK':
            return outlookProvider;
        case 'CUSTOM':
            return imapProvider;
        default:
            throw new Error(`Unknown email provider: ${provider}`);
    }
}

/**
 * Get a new instance of the email provider (not singleton)
 */
export function createEmailProvider(provider: EmailProvider, config?: ImapConfig): IEmailProvider {
    if ((provider as string) === 'REACHINBOX') {
        return new ReachInboxProvider();
    }

    switch (provider) {
        case 'GMAIL':
            return new GmailProvider();
        case 'OUTLOOK':
            return new OutlookProvider();
        case 'CUSTOM':
            return new ImapProvider(config);
        default:
            throw new Error(`Unknown email provider: ${provider}`);
    }
}

// ============================================
// PROVIDER UTILITIES
// ============================================

/**
 * Check if a provider is supported
 */
export function isProviderSupported(provider: EmailProvider): boolean {
    return ['GMAIL', 'OUTLOOK', 'CUSTOM', 'REACHINBOX'].includes(provider as string);
}

/**
 * Get display name for provider
 */
export function getProviderDisplayName(provider: EmailProvider): string {
    if ((provider as string) === 'REACHINBOX') {
        return 'ReachInbox';
    }

    switch (provider) {
        case 'GMAIL':
            return 'Gmail';
        case 'OUTLOOK':
            return 'Outlook';
        case 'CUSTOM':
            return 'Custom IMAP/SMTP';
        default:
            return 'Unknown';
    }
}

/**
 * Get icon/logo path for provider
 */
export function getProviderIcon(provider: EmailProvider): string {
    if ((provider as string) === 'REACHINBOX') {
        return '/icons/email.svg';
    }

    switch (provider) {
        case 'GMAIL':
            return '/icons/gmail.svg';
        case 'OUTLOOK':
            return '/icons/outlook.svg';
        case 'CUSTOM':
            return '/icons/email.svg';
        default:
            return '/icons/email.svg';
    }
}

/**
 * Get brand color for provider
 */
export function getProviderColor(provider: EmailProvider): string {
    if ((provider as string) === 'REACHINBOX') {
        return '#10B981';
    }

    switch (provider) {
        case 'GMAIL':
            return '#EA4335'; // Google red
        case 'OUTLOOK':
            return '#0078D4'; // Microsoft blue
        case 'CUSTOM':
            return '#6366F1'; // Indigo (default)
        default:
            return '#6366F1';
    }
}

// ============================================
// ALL SUPPORTED PROVIDERS
// ============================================

export const SUPPORTED_PROVIDERS: { 
    value: EmailProvider; 
    label: string; 
    icon: string;
    color: string;
    supported: boolean;
}[] = [
    {
        value: 'GMAIL',
        label: 'Gmail',
        icon: '/icons/gmail.svg',
        color: '#EA4335',
        supported: true,
    },
    {
        value: 'OUTLOOK',
        label: 'Outlook / Microsoft 365',
        icon: '/icons/outlook.svg',
        color: '#0078D4',
        supported: true,
    },
    {
        value: 'CUSTOM',
        label: 'Custom IMAP/SMTP',
        icon: '/icons/email.svg',
        color: '#6366F1',
        supported: true,
    },
    {
        value: 'REACHINBOX' as EmailProvider,
        label: 'ReachInbox',
        icon: '/icons/email.svg',
        color: '#10B981',
        supported: true,
    },
];
