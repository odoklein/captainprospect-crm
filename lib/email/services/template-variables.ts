import prisma from '@/lib/prisma';
import {
    buildVariablesFromData,
    looksLikeHtml,
    renderTemplateString,
    type VariableData,
} from '@/lib/email/template-render';

// ============================================
// TEMPLATE VARIABLES — DB-backed side of the one {{variable}} renderer.
// Syntax, aliases and the pure helpers live in lib/email/template-render.ts
// (re-exported here so existing imports keep working); this file loads the
// contact, company, sender, mailbox and mission to build the variable map.
// ============================================

export * from '@/lib/email/template-render';

export interface VariableContext {
    contactId?: string;
    companyId?: string;
    customData?: Record<string, string>;
    /** User the email is sent on behalf of — fills {{senderName}} & co. */
    senderId?: string;
    /** Mailbox used to send — {{senderEmail}} falls back to it. */
    mailboxId?: string;
    /** Mission context — fills {{missionName}} / {{clientName}}. When absent,
     *  derived from the contact's list. */
    missionId?: string;
    /** IANA zone for date variables (default Europe/Paris). */
    timezone?: string;
}

export interface SubstitutionResult {
    subject: string;
    bodyHtml: string;
    bodyText: string | null;
    variables: Record<string, string>;
}

// ============================================
// DB-BACKED VARIABLE MAP
// ============================================

// Build variable map from contact and company data
export async function buildVariableMap(context: VariableContext): Promise<Record<string, string>> {
    const data: VariableData = { custom: context.customData ?? null, timezone: context.timezone };

    let missionId = context.missionId;

    if (context.contactId) {
        const contact = await prisma.contact.findUnique({
            where: { id: context.contactId },
            include: { company: { include: { list: { select: { missionId: true } } } } },
        });
        if (contact) {
            data.contact = contact;
            data.company = contact.company;
            if (!missionId) missionId = contact.company?.list?.missionId;
        }
    } else if (context.companyId) {
        const company = await prisma.company.findUnique({ where: { id: context.companyId } });
        if (company) data.company = company;
    }

    if (context.senderId) {
        data.sender = await prisma.user.findUnique({
            where: { id: context.senderId },
            select: { name: true, email: true, phone: true },
        });
    }
    if (context.mailboxId) {
        data.mailbox = await prisma.mailbox.findUnique({
            where: { id: context.mailboxId },
            select: { email: true, displayName: true },
        });
    }
    if (missionId) {
        const mission = await prisma.mission.findUnique({
            where: { id: missionId },
            select: { name: true, client: { select: { name: true } } },
        });
        if (mission) data.mission = { name: mission.name, clientName: mission.client?.name };
    }

    return buildVariablesFromData(data);
}

// Main function: substitute all variables in template
export async function processTemplate(
    subject: string,
    bodyHtml: string,
    bodyText: string | null,
    context: VariableContext
): Promise<SubstitutionResult> {
    const variables = await buildVariableMap(context);

    return {
        subject: renderTemplateString(subject, variables),
        bodyHtml: renderTemplateString(bodyHtml, variables, { html: looksLikeHtml(bodyHtml) }),
        bodyText: bodyText ? renderTemplateString(bodyText, variables) : null,
        variables
    };
}

