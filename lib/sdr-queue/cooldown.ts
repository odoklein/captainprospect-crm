import { prisma } from "@/lib/prisma";

// ============================================
// QUEUE COOLDOWN — "pause 24 h"
// A row called in the last 24 h leaves every calling queue (SDR table
// /api/sdr/action-queue, card view /api/actions/next, manager prospection
// queue), so a prospect is not rung several times a day. The SDR who set a
// callback (RAPPEL, RELANCE…) keeps seeing it.
//
// A manager can switch the pause off for one list (mission workspace, onglet
// Audience). The setting is a SystemConfig row "list.queueCooldown:<listId>" =
// "off": no row means the pause is on. No schema migration, and a missing or
// unreadable setting keeps prospects protected.
// ============================================

export const QUEUE_COOLDOWN_HOURS = 24;
const COOLDOWN_MS = QUEUE_COOLDOWN_HOURS * 60 * 60 * 1000;

const KEY_PREFIX = "list.queueCooldown:";
const OFF = "off";

function keyFor(listId: string): string {
    return `${KEY_PREFIX}${listId}`;
}

/** Rows whose last action is at or after this instant are paused. */
export function cooldownCutoff(now: number = Date.now()): Date {
    return new Date(now - COOLDOWN_MS);
}

/** Lists whose manager switched the 24 h pause off. Fails open: on error, every list keeps the pause. */
export async function getCooldownDisabledListIds(listIds: Iterable<string | null | undefined>): Promise<Set<string>> {
    const ids = Array.from(new Set(Array.from(listIds).filter((id): id is string => !!id)));
    if (ids.length === 0) return new Set();
    try {
        const rows = await prisma.systemConfig.findMany({
            where: { key: { in: ids.map(keyFor) }, value: OFF },
            select: { key: true },
        });
        return new Set(rows.map((r) => r.key.slice(KEY_PREFIX.length)));
    } catch (err) {
        console.warn("[queue-cooldown] list settings unreadable, keeping the 24 h pause on", err);
        return new Set();
    }
}

export async function isQueueCooldownEnabled(listId: string): Promise<boolean> {
    const disabled = await getCooldownDisabledListIds([listId]);
    return !disabled.has(listId);
}

export async function setQueueCooldownEnabled(listId: string, enabled: boolean): Promise<void> {
    const key = keyFor(listId);
    if (enabled) {
        await prisma.systemConfig.deleteMany({ where: { key } });
    } else {
        await prisma.systemConfig.upsert({
            where: { key },
            create: { key, value: OFF },
            update: { value: OFF },
        });
    }
}

/** Rows held back by the pause, so an empty queue can say why and when it fills again. */
export interface PausedSummary {
    total: number;
    contacts: number;
    companies: number;
    /** When the first paused contact / company comes back (ISO), null if none. */
    nextContactAt: string | null;
    nextCompanyAt: string | null;
}

export function summarizePaused(
    rows: Array<{ contact_id: string | null; last_action_created: Date | string | null }>
): PausedSummary {
    let contacts = 0;
    let companies = 0;
    let nextContact = Infinity;
    let nextCompany = Infinity;
    for (const row of rows) {
        if (!row.last_action_created) continue;
        const releaseAt = new Date(row.last_action_created).getTime() + COOLDOWN_MS;
        if (Number.isNaN(releaseAt)) continue;
        if (row.contact_id) {
            contacts++;
            nextContact = Math.min(nextContact, releaseAt);
        } else {
            companies++;
            nextCompany = Math.min(nextCompany, releaseAt);
        }
    }
    const iso = (t: number) => (Number.isFinite(t) ? new Date(t).toISOString() : null);
    return {
        total: contacts + companies,
        contacts,
        companies,
        nextContactAt: iso(nextContact),
        nextCompanyAt: iso(nextCompany),
    };
}
