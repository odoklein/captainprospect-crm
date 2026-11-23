import { prisma } from "@/lib/prisma";
import { statusConfigService } from "@/lib/services/StatusConfigService";
import { DEFAULT_CALLBACK_CODES, callbackCodesFromStatuses, resolveCallbackEnum } from "@/lib/callbacks/codes";
import { buildLiveCallbacksQuery, type CallbackScope, type LiveCallbackRow } from "@/lib/callbacks/sql";

export type { CallbackScope, LiveCallbackRow };

// ============================================
// PENDING CALLBACKS — the single definition used by the Rappels page
// (/api/sdr/callbacks), the sidebar badge (/api/sdr/callbacks/count), the
// urgent count of the task feed (lib/callbacks/urgent.ts) and the SDR queue.
//
// A callback is an Action whose result "means call back" for ITS mission:
// the default codes, plus every status of that mission's effective config
// with triggersCallback (resolved to the stored ActionResult enum).
//
// It stays pending until a newer action exists, in the SAME mission, on:
//   - the same contact (contact callback) — a call to a colleague at the same
//     company no longer silently closes it;
//   - the same company or one of its imported copies (company-only callback).
// Ties on createdAt (CSV imports stamp several statuses with one date) are
// broken by id, so only the last one of a batch stays live.
//
// A callback is "orphaned" when its author no longer works the mission
// (assignment removed or user disabled). Orphans are shown to the SDRs still
// assigned to that mission so nobody's follow-up falls through the cracks.
// ============================================

export { DEFAULT_CALLBACK_CODES, callbackCodesFromStatuses };

/**
 * Every code that is a callback in at least one scope (pre-filter for SQL).
 * Only valid ActionResult values, so a free-form configured code can never
 * break the query.
 */
export async function getAllCallbackCodes(): Promise<string[]> {
    const codes = new Set<string>(DEFAULT_CALLBACK_CODES);
    try {
        const defs = await prisma.actionStatusDefinition.findMany({
            where: { triggersCallback: true, isActive: true },
            select: { code: true, label: true },
        });
        for (const d of defs) {
            const resolved = resolveCallbackEnum(d.code, d.label);
            if (resolved) codes.add(resolved);
        }
    } catch {
        // Keep the default codes if the config lookup fails.
    }
    return [...codes];
}

/** Per-mission callback codes, memoized for the duration of one request. */
export function createMissionCallbackCodes() {
    const cache = new Map<string, Promise<Set<string>>>();
    return (missionId: string): Promise<Set<string>> => {
        let hit = cache.get(missionId);
        if (!hit) {
            hit = statusConfigService
                .getEffectiveStatusConfig({ missionId })
                .then((cfg) => callbackCodesFromStatuses(cfg.statuses))
                .catch(() => new Set<string>(DEFAULT_CALLBACK_CODES));
            cache.set(missionId, hit);
        }
        return hit;
    };
}

/**
 * Live callbacks for a scope, ordered by callbackDate (undated last) then
 * newest first. Superseded and per-mission non-callback rows are removed
 * BEFORE any pagination, so counts and pages agree.
 */
export async function findLiveCallbacks(scope: CallbackScope): Promise<LiveCallbackRow[]> {
    if (scope.missionIds && scope.missionIds.length === 0) return [];
    if (scope.sdrIds && scope.sdrIds.length === 0 && !(scope.orphanMissionIds?.length)) return [];

    const codes = await getAllCallbackCodes();
    const rows = await prisma.$queryRaw<LiveCallbackRow[]>(buildLiveCallbacksQuery(scope, codes));

    // Mission-specific statuses: a code that is a callback in one mission only.
    const codesFor = createMissionCallbackCodes();
    const keep = await Promise.all(
        rows.map(async (r) =>
            (DEFAULT_CALLBACK_CODES as readonly string[]).includes(r.result) || (await codesFor(r.missionId)).has(r.result),
        ),
    );
    return rows.filter((_, i) => keep[i]);
}
