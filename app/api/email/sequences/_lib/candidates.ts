// Contact selection shared by the enrolment picker (candidates) and bulk enrol.

import type { Prisma } from '@prisma/client';

export interface CandidateFilter {
    missionId?: string | null;
    listId?: string | null;
    q?: string | null;
}

export function readCandidateFilter(source: URLSearchParams | Record<string, unknown>): CandidateFilter {
    const get = (k: string) =>
        source instanceof URLSearchParams ? source.get(k) : (source[k] as string | null | undefined);
    return {
        missionId: get('missionId') || null,
        listId: get('listId') || null,
        q: (get('q') || '').toString().trim() || null,
    };
}

/** Base scope: contacts of a list, or of every list of a mission. */
export function candidateWhere(filter: CandidateFilter): Prisma.ContactWhereInput | null {
    const and: Prisma.ContactWhereInput[] = [];
    if (filter.listId) and.push({ company: { listId: filter.listId } });
    else if (filter.missionId) and.push({ company: { list: { missionId: filter.missionId, isArchived: false } } });
    else return null; // never scan the whole contact base
    if (filter.q) {
        const q = filter.q;
        and.push({
            OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
                { title: { contains: q, mode: 'insensitive' } },
                { company: { name: { contains: q, mode: 'insensitive' } } },
            ],
        });
    }
    return { AND: and };
}

/** Contacts that can be enrolled into `sequenceId` (email present, not excluded/unsubscribed/enrolled). */
export function eligibleWhere(sequenceId: string): Prisma.ContactWhereInput {
    return {
        AND: [
            { email: { not: null } },
            { NOT: { email: '' } },
            { excludedAt: null },
            { company: { excludedAt: null } },
            { unsubscribed: false },
            { sequenceEnrollments: { none: { sequenceId } } },
        ],
    };
}
