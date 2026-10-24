import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
    parseClientState,
    parseScheduleSettings,
    type ClientScheduleState,
    type ScheduleSettings,
} from "./cycle-schedule";

// ============================================
// BILLING SCHEDULE — storage
// No migration: two kinds of SystemConfig rows (same pattern as
// lib/sdr-queue/cooldown.ts).
//   billing.schedule.settings         {trackFrom, leadDays, firstCycleGraceDays}
//   billing.schedule.client:<clientId> {anchorOverride?, disabled?, note?, setup?, cycles}
// A missing or unreadable row reads as the defaults / an empty state.
// Writes are guarded on updatedAt so two managers ticking at once don't
// overwrite each other: the update retries once on the fresh value, then fails.
// ============================================

export const SETTINGS_KEY = "billing.schedule.settings";
export const CLIENT_KEY_PREFIX = "billing.schedule.client:";

export function clientKey(clientId: string): string {
    return `${CLIENT_KEY_PREFIX}${clientId}`;
}

export class ScheduleConflictError extends Error {
    constructor() {
        super("L'échéancier a été modifié en même temps par quelqu'un d'autre. Rechargez la page et réessayez.");
        this.name = "ScheduleConflictError";
    }
}

export async function getScheduleSettings(): Promise<ScheduleSettings> {
    const row = await prisma.systemConfig.findUnique({ where: { key: SETTINGS_KEY } });
    return parseScheduleSettings(row?.value);
}

/** Stored states by client id; clients without a row are absent. */
export async function getClientStates(clientIds?: string[]): Promise<Map<string, ClientScheduleState>> {
    if (clientIds && clientIds.length === 0) return new Map();
    const rows = await prisma.systemConfig.findMany({
        where: clientIds
            ? { key: { in: clientIds.map(clientKey) } }
            : { key: { startsWith: CLIENT_KEY_PREFIX } },
        select: { key: true, value: true },
    });
    return new Map(rows.map((r) => [r.key.slice(CLIENT_KEY_PREFIX.length), parseClientState(r.value)]));
}

export async function getClientState(clientId: string): Promise<ClientScheduleState> {
    const states = await getClientStates([clientId]);
    return states.get(clientId) ?? parseClientState(null);
}

/**
 * Read-modify-write of one SystemConfig row, guarded on updatedAt: the write
 * only lands if nobody wrote the row since it was read. One retry on the fresh
 * value, then ScheduleConflictError.
 */
async function guardedUpdate<T>(
    key: string,
    parse: (raw: string | null | undefined) => T,
    mutate: (current: T) => T,
): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
        const row = await prisma.systemConfig.findUnique({ where: { key } });
        const next = mutate(parse(row?.value));
        const value = JSON.stringify(next);

        if (!row) {
            try {
                await prisma.systemConfig.create({ data: { key, value } });
                return next;
            } catch (err) {
                // Created by someone else in between: retry on their value.
                if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
                throw err;
            }
        }

        const { count } = await prisma.systemConfig.updateMany({
            where: { key, updatedAt: row.updatedAt },
            data: { value, updatedAt: new Date() },
        });
        if (count === 1) return next;
    }
    throw new ScheduleConflictError();
}

export function updateClientState(
    clientId: string,
    mutate: (current: ClientScheduleState) => ClientScheduleState,
): Promise<ClientScheduleState> {
    return guardedUpdate(clientKey(clientId), parseClientState, mutate);
}

export function updateScheduleSettings(
    mutate: (current: ScheduleSettings) => ScheduleSettings,
): Promise<ScheduleSettings> {
    return guardedUpdate(SETTINGS_KEY, parseScheduleSettings, mutate);
}
