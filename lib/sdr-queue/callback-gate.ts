import { addDay, parisDay, parisMidnight } from "@/lib/manager-home/today-rules";

// ============================================
// CALLBACK GATE — when a row whose last action is a callback may be dialled
// from the queue (same "callback" codes as lib/callbacks/pending.ts).
//   - not before its day: a prospect who asked to be called in January is not
//     rung today just because CALLBACK sorts first (Europe/Paris day);
//   - by its author from its day on;
//   - by a teammate only once it is a full day late (the author had their
//     turn; after that the team picks it up rather than letting it rot).
// Undated callbacks (legacy rows) keep the previous behaviour: dialable.
// ============================================

export const TEAM_PICKUP_GRACE_MS = 24 * 60 * 60 * 1000;

export type CallbackGate = "not_callback" | "open" | "scheduled" | "owned_by_other";

export function callbackGate(
    row: { last_action_result: string | null; last_action_callback_date: Date | string | null; last_action_sdr_id?: string | null },
    sdrId: string,
    callbackCodes: Set<string>,
    now: Date = new Date(),
): CallbackGate {
    if (!row.last_action_result || !callbackCodes.has(row.last_action_result)) return "not_callback";
    if (!row.last_action_callback_date) return "open";
    const due = new Date(row.last_action_callback_date).getTime();
    if (Number.isNaN(due)) return "open";
    const tonight = parisMidnight(addDay(parisDay(now), 1)).getTime();
    if (due >= tonight) return "scheduled";
    if (row.last_action_sdr_id && row.last_action_sdr_id !== sdrId && now.getTime() - due < TEAM_PICKUP_GRACE_MS) {
        return "owned_by_other";
    }
    return "open";
}
