// Preview / test-send rendering: the same renderer the engine uses, fed with a
// real contact when one is picked, otherwise with a realistic sample.

import { prisma } from '@/lib/prisma';
import {
    buildVariablesFromData,
    extractVariables,
    findUnknownVariables,
    renderEmailContent,
    type VariableData,
} from '@/lib/email/services/template-variables';
import { safeTimezone } from '@/lib/email/services/sequence-service';
import type { SequenceUser } from './shared';

export const SAMPLE_CONTACT: NonNullable<VariableData['contact']> = {
    firstName: 'Camille',
    lastName: 'Martin',
    title: 'Directrice commerciale',
    email: 'camille.martin@exemple.fr',
    phone: '06 12 34 56 78',
    linkedin: 'linkedin.com/in/camille-martin',
};

export const SAMPLE_COMPANY: NonNullable<VariableData['company']> = {
    name: 'Atelier Durand',
    industry: 'Industrie',
    website: 'atelier-durand.fr',
    country: 'France',
    size: '50-200',
    phone: '01 23 45 67 89',
};

export async function renderForUser(
    user: SequenceUser,
    input: { subject: string; body: string; contactId?: string | null; mailboxId?: string | null; timezone?: string | null },
) {
    const data: VariableData = { timezone: safeTimezone(input.timezone) };
    let contactLabel = 'Exemple : Camille Martin · Atelier Durand';
    let isSample = true;

    if (input.contactId) {
        const contact = await prisma.contact.findUnique({
            where: { id: input.contactId },
            include: {
                company: {
                    include: { list: { select: { mission: { select: { name: true, client: { select: { name: true } } } } } } },
                },
            },
        });
        if (contact) {
            data.contact = contact;
            data.company = contact.company;
            const mission = contact.company?.list?.mission;
            data.mission = mission ? { name: mission.name, clientName: mission.client?.name } : null;
            contactLabel = [[contact.firstName, contact.lastName].filter(Boolean).join(' '), contact.company?.name]
                .filter(Boolean)
                .join(' · ');
            isSample = false;
        }
    }
    if (isSample) {
        data.contact = SAMPLE_CONTACT;
        data.company = SAMPLE_COMPANY;
        data.mission = { name: 'Mission exemple', clientName: 'Client exemple' };
    }

    const sender = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, email: true, phone: true } });
    data.sender = sender;
    if (input.mailboxId) {
        data.mailbox = await prisma.mailbox.findUnique({
            where: { id: input.mailboxId },
            select: { email: true, displayName: true },
        });
    }

    const variables = buildVariablesFromData(data);
    const rendered = renderEmailContent({ subject: input.subject, bodyText: input.body, bodyHtml: input.body }, variables);
    const used = extractVariables(`${input.subject}\n${input.body}`);
    const emptyVariables = used.filter((name) => {
        const key = Object.keys(variables).find((k) => k.toLowerCase() === name.toLowerCase());
        return key !== undefined && !variables[key];
    });
    const unknownVariables = findUnknownVariables(`${input.subject}\n${input.body}`);

    return { ...rendered, contactLabel, isSample, emptyVariables, unknownVariables };
}
