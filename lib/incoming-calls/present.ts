import { IncomingCallStatus, type IncomingCall, type Prisma } from "@prisma/client";

/** Roles that can own an Allo line and log actions from the drawer. */
export const INCOMING_CALL_ROLES = ["SDR", "BUSINESS_DEVELOPER", "BOOKER", "MANAGER"];

const RING_STALE_MS = 3 * 60_000; // nobody lets a phone ring 3 min — call.completed was lost
const TALK_STALE_MS = 60 * 60_000;

/**
 * What the poll returns: live calls, a just-finished call the user hasn't acted
 * on yet, and today's missed calls until dismissed.
 */
export function activeCallsWhere(userId: string, now = Date.now()): Prisma.IncomingCallWhereInput {
    return {
        sdrId: userId,
        dismissedAt: null,
        OR: [
            {
                status: { in: [IncomingCallStatus.RINGING, IncomingCallStatus.ANSWERED] },
                startedAt: { gte: new Date(now - 2 * 60 * 60_000) },
            },
            { status: IncomingCallStatus.COMPLETED, openedAt: null, endedAt: { gte: new Date(now - 20 * 60_000) } },
            { status: IncomingCallStatus.MISSED, startedAt: { gte: new Date(now - 24 * 60 * 60_000) } },
        ],
    };
}

export type IncomingCallDTO = ReturnType<typeof presentIncomingCall>;

export function presentIncomingCall(row: IncomingCall, now = Date.now()) {
    const age = now - row.startedAt.getTime();
    const stale =
        (row.status === IncomingCallStatus.RINGING && age > RING_STALE_MS) ||
        (row.status === IncomingCallStatus.ANSWERED && age > TALK_STALE_MS);

    return {
        id: row.id,
        status: row.status,
        stale,
        fromNumber: row.fromNumber,
        toNumber: row.toNumber,
        startedAt: row.startedAt.toISOString(),
        answeredAt: row.answeredAt?.toISOString() ?? null,
        endedAt: row.endedAt?.toISOString() ?? null,
        durationSec: row.durationSec,
        result: row.result,
        summary: row.summary,
        contactId: row.contactId,
        companyId: row.companyId,
        missionId: row.missionId,
        callerName: row.callerName,
        companyName: row.companyName,
        matchCount: row.matchCount,
        alloPersonName: row.alloPersonName,
        alloCompanyName: row.alloCompanyName,
        openedAt: row.openedAt?.toISOString() ?? null,
    };
}
