import { prisma } from "@/lib/prisma";
import { addDay, parisDay, parisMidnight } from "@/lib/manager-home/today-rules";
import type { CallbackCount } from "@/lib/tasks/feed-types";
import { findLiveCallbacks, getAllCallbackCodes } from "@/lib/callbacks/pending";

// ============================================
// URGENT CALLBACKS — what the unified task list shows instead of listing callbacks.
// A callback is "urgent" when it is still live and due before tonight
// (Europe/Paris): late, or still to do today. "Live" is the shared rule of
// lib/callbacks/pending.ts (same as the Rappels page and the badge).
// An SDR counts their own callbacks on missions they still work, plus the
// orphaned ones (author removed from the mission) on their missions. The team
// view puts orphans in their own "Sans responsable" row.
// ============================================

export const ORPHAN_CALLBACKS_SDR_ID = "__orphan__";

/** Result codes that mean "call back" in at least one scope. */
export async function getCallbackStatusCodes(): Promise<string[]> {
    return getAllCallbackCodes();
}

/**
 * Urgent callbacks per SDR. `sdrIds` null = every SDR with at least one.
 * SDRs with none are left out of the result.
 */
export async function countUrgentCallbacks(sdrIds: string[] | null, now: Date = new Date()): Promise<CallbackCount[]> {
    if (sdrIds && sdrIds.length === 0) return [];
    const tonight = parisMidnight(addDay(parisDay(now), 1));

    let orphanMissionIds: string[] = [];
    // Orphans are attributed to the SDR only in the single-SDR view (their own task list).
    if (sdrIds && sdrIds.length === 1) {
        orphanMissionIds = (
            await prisma.sDRAssignment.findMany({
                where: { sdrId: { in: sdrIds } },
                select: { missionId: true },
            })
        ).map((a) => a.missionId);
    }

    const rows = await findLiveCallbacks({
        dueBefore: tonight,
        ...(sdrIds ? { sdrIds, requireAuthorAssigned: true, orphanMissionIds } : {}),
    });

    const counts = new Map<string, CallbackCount>();
    for (const r of rows) {
        // Per-SDR view: an orphan on their mission counts for them.
        const key = sdrIds
            ? (sdrIds.includes(r.sdrId) && !r.orphan ? r.sdrId : sdrIds[0])
            : (r.orphan ? ORPHAN_CALLBACKS_SDR_ID : r.sdrId);
        const name = key === ORPHAN_CALLBACKS_SDR_ID ? "Sans responsable" : (key === r.sdrId ? r.sdrName ?? "" : "");
        const entry = counts.get(key) ?? { sdrId: key, sdrName: name, urgent: 0, late: 0 };
        if (!entry.sdrName && name) entry.sdrName = name;
        entry.urgent += 1;
        if (r.callbackDate && new Date(r.callbackDate).getTime() < now.getTime()) entry.late += 1;
        counts.set(key, entry);
    }
    return [...counts.values()].sort((a, b) => b.urgent - a.urgent || a.sdrName.localeCompare(b.sdrName));
}
