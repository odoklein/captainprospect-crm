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
