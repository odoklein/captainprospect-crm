// DB side of the Allo webhook: turns call.received / call.answered /
// call.completed into IncomingCall rows for the users owning the called line.
//
// Allo delivers at-least-once and may skip or reorder events, so every branch is
// idempotent and tolerant: an answered/completed event with no ringing row
// creates the row itself (so a lost call.received still yields a missed-call
// reminder), and retries of the same event are no-ops.

import { IncomingCallStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/exclusions/matching";
import { createNotification } from "@/lib/notifications";
import type { AlloCallEvent } from "./allo-webhook";
import { findCallerCandidates, findLineOwners, type LineOwner } from "./caller-lookup";

/** A call.received this old is a late retry — popping a panel for it would be wrong. */
const STALE_RING_MS = 5 * 60_000;
/** How far back an answered/completed event looks for the ringing row it belongs to. */
const CORRELATION_WINDOW_MS = 3 * 60 * 60_000;
/** Completed events for calls older than this only update, never create. */
const CREATE_ON_COMPLETE_MAX_AGE_MS = 24 * 60 * 60_000;

export type HandleResult = { handled: string; rows: number };

export async function handleAlloCallEvent(event: AlloCallEvent): Promise<HandleResult> {
    if (event.kind === "ignored") return { handled: `ignored:${event.reason}`, rows: 0 };
    if (event.kind === "received" && Date.now() - event.startedAt.getTime() > STALE_RING_MS) {
        return { handled: "stale_ring", rows: 0 };
    }

    const owners = await findLineOwners(event.lineNumber, event.userEmail);
    if (owners.length === 0) return { handled: "no_line_owner", rows: 0 };

    const callerKey = phoneKey(event.callerNumber);
    let rows = 0;

    for (const owner of owners) {
        if (event.kind === "received") {
            const duplicate = await prisma.incomingCall.findFirst({
                where: { sdrId: owner.id, callerKey, startedAt: event.startedAt },
                select: { id: true },
            });
            if (duplicate) continue;

            await createResolvedRow(owner, event.callerNumber, event.lineNumber, callerKey, {
                status: IncomingCallStatus.RINGING,
                startedAt: event.startedAt,
                alloPersonName: event.personName,
                alloCompanyName: event.companyName,
            });
            rows++;
            continue;
        }

        const open = await prisma.incomingCall.findFirst({
            where: {
                sdrId: owner.id,
                callerKey,
                status: { in: [IncomingCallStatus.RINGING, IncomingCallStatus.ANSWERED] },
                startedAt: { gte: new Date(Date.now() - CORRELATION_WINDOW_MS) },
            },
            orderBy: { startedAt: "desc" },
            select: { id: true, status: true },
        });

        if (event.kind === "answered") {
            if (open) {
                if (open.status === IncomingCallStatus.RINGING) {
                    await prisma.incomingCall.update({
                        where: { id: open.id },
                        data: { status: IncomingCallStatus.ANSWERED, answeredAt: event.answeredAt },
                    });
                    rows++;
                }
                continue;
            }
            // call.received never arrived — still show the panel for the live call.
            await createResolvedRow(owner, event.callerNumber, event.lineNumber, callerKey, {
                status: IncomingCallStatus.ANSWERED,
                startedAt: event.startedAt ?? event.answeredAt,
                answeredAt: event.answeredAt,
            });
            rows++;
            continue;
        }

        // completed
        if (event.providerCallId) {
            const already = await prisma.incomingCall.findFirst({
                where: { sdrId: owner.id, providerCallId: event.providerCallId },
                select: { id: true },
            });
            if (already) continue;
        }

        const status = event.answered ? IncomingCallStatus.COMPLETED : IncomingCallStatus.MISSED;
        const final = {
            status,
            providerCallId: event.providerCallId,
            result: event.result,
            endedAt: new Date(),
            durationSec: event.durationSec,
            summary: event.summary,
            recordingUrl: event.recordingUrl,
        };

        let rowId: string;
        if (open) {
            await prisma.incomingCall.update({ where: { id: open.id }, data: final });
            rowId = open.id;
        } else {
            const startedAt = event.startedAt ?? new Date();
            if (Date.now() - startedAt.getTime() > CREATE_ON_COMPLETE_MAX_AGE_MS) continue;
            rowId = await createResolvedRow(owner, event.callerNumber, event.lineNumber, callerKey, {
                ...final,
                startedAt,
            });
        }
        rows++;

        if (status === IncomingCallStatus.MISSED) await notifyMissed(owner.id, rowId);
    }

    return { handled: event.kind, rows };
}

type RowData = Omit<
    Parameters<typeof prisma.incomingCall.create>[0]["data"],
    "sdrId" | "sdr" | "fromNumber" | "toNumber" | "callerKey"
>;

/**
 * Inserts first, then resolves the caller: the poll picks the row up
 * immediately and the name fills in a moment later, instead of the panel
 * waiting on a full-table phone scan.
 */
async function createResolvedRow(
    owner: LineOwner,
    callerNumber: string,
    lineNumber: string,
    callerKey: string | null,
    data: RowData,
): Promise<string> {
    const row = await prisma.incomingCall.create({
        data: { ...data, sdrId: owner.id, fromNumber: callerNumber, toNumber: lineNumber, callerKey },
        select: { id: true },
    });

    try {
        const candidates = await findCallerCandidates(callerNumber, owner.id);
        const best = candidates[0];
        if (best) {
            await prisma.incomingCall.update({
                where: { id: row.id },
                data: {
                    contactId: best.contactId,
                    companyId: best.companyId,
                    missionId: best.missionId,
                    callerName: best.callerName,
                    companyName: best.companyName,
                    matchCount: candidates.length,
                },
            });
        }
    } catch (error) {
        // An unresolved caller still pops as "numéro inconnu" — never fail the webhook over it.
        console.error("[incoming-calls] caller lookup failed", error);
    }

    return row.id;
}

async function notifyMissed(userId: string, incomingCallId: string) {
    const row = await prisma.incomingCall.findUnique({
        where: { id: incomingCallId },
        select: { callerName: true, companyName: true, alloPersonName: true, fromNumber: true },
    });
    if (!row) return;

    const who = row.callerName ?? row.alloPersonName ?? row.companyName ?? row.fromNumber;
    const where = row.callerName && row.companyName ? ` (${row.companyName})` : "";
    await createNotification({
        userId,
        title: "Appel manqué",
        message: `${who}${where} a essayé de vous joindre — ${row.fromNumber}`,
        type: "warning",
    });
}
