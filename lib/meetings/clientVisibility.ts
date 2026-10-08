import type { Prisma } from "@prisma/client";

/**
 * Meetings a client (admin or commercial) may see: confirmed ones, plus ones
 * that were confirmed and then cancelled.
 *
 * The cancel flows (client portal, SDR/manager PATCH /api/actions/[id]) flip
 * confirmationStatus to CANCELLED, so a list that only accepts CONFIRMED drops
 * a cancelled RDV right when the commercial needs to see it to remove it from
 * their agenda. `confirmedAt` tells "cancelled after confirmation" (kept by the
 * cancel flows) from "dropped while still pending" (the manager's un-confirm
 * clears it) — the latter was never shown to the client and must stay hidden.
 */
export const clientVisibleMeetingWhere: Prisma.ActionWhereInput = {
    result: { in: ["MEETING_BOOKED", "MEETING_CANCELLED"] },
    OR: [
        { confirmationStatus: "CONFIRMED" },
        { result: "MEETING_CANCELLED", confirmationStatus: "CANCELLED", confirmedAt: { not: null } },
    ],
};

/**
 * For any client-portal query over ALL actions (calls, timelines, the prospect
 * database): keeps every non-meeting action, and meeting actions only once the
 * SAS has confirmed them. A pending or SAS-rejected RDV stays invisible.
 */
export const clientVisibleActionWhere: Prisma.ActionWhereInput = {
    OR: [{ result: { notIn: ["MEETING_BOOKED", "MEETING_CANCELLED"] } }, clientVisibleMeetingWhere],
};

/** A booked RDV the client may count: confirmed at the SAS. */
export const clientCountableMeetingWhere: Prisma.ActionWhereInput = {
    result: "MEETING_BOOKED",
    confirmationStatus: "CONFIRMED",
};

/** Same rule for rows already loaded in memory. */
export function isClientCountableMeeting(a: { result: string; confirmationStatus: string }): boolean {
    return a.result === "MEETING_BOOKED" && a.confirmationStatus === "CONFIRMED";
}
