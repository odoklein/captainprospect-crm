/**
 * Where an SDR stands against today's call pace, computed server-side: the
 * same figures `/api/sdr/pace` returns to the SDR and the agent's
 * `sdr_under_pace` watch rule reads for every SDR.
 *
 * Allo (the telephony metrics) is the better call count when the line is
 * known; the CRM's own actions are the floor. The route waits for Allo as it
 * always has; the agent passes `alloTimeoutMs` and falls back to CRM calls
 * when Allo is slow or down, flagging it in `alloDegraded`.
 */

import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { getPaceConfig, type PaceConfig } from "./config";
import { computeEffectiveTime, computePace, type EffectiveTime, type Interval, type PaceResult } from "./pace";
import { fetchAlloMetricsForLine } from "@/lib/call-enrichment/allo-metrics";

export const APP_TIMEZONE = "Europe/Paris";

export function minuteOfDay(hhmm: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
}

export interface SdrPaceSnapshot {
    pace: PaceResult;
    time: EffectiveTime;
    config: PaceConfig;
    crmCalls: number;
    alloCalls: number;
    /** The SDR has an Allo line and its metrics were read. */
    alloUsed: boolean;
    /** Allo was wanted but timed out or failed: CRM calls only. */
    alloDegraded: boolean;
}

/** The reads behind the snapshot; a test injects plain functions. */
export interface SdrPaceDeps {
    getPaceConfig: () => Promise<PaceConfig>;
    listCallTimes: (sdrId: string, since: Date) => Promise<Date[]>;
    listScheduleBlocks: (sdrId: string, dayStart: Date, dayEnd: Date) => Promise<Array<{ startTime: string; endTime: string }>>;
    alloPhoneNumber: (sdrId: string) => Promise<string | null>;
    alloCalls: (alloPhoneNumber: string, from: Date, to: Date) => Promise<number>;
}

export const prismaSdrPaceDeps: SdrPaceDeps = {
    getPaceConfig,
    listCallTimes: async (sdrId, since) =>
        (
            await prisma.action.findMany({
                where: { sdrId, channel: "CALL", createdAt: { gte: since } },
                select: { createdAt: true },
            })
        ).map((c) => c.createdAt),
    listScheduleBlocks: (sdrId, dayStart, dayEnd) =>
        prisma.scheduleBlock.findMany({
            where: {
                sdrId,
                date: { gte: dayStart, lt: dayEnd },
                status: { not: "CANCELLED" },
                OR: [{ suggestionStatus: null }, { suggestionStatus: "CONFIRMED" }],
            },
            select: { startTime: true, endTime: true },
        }),
    alloPhoneNumber: async (sdrId) =>
        (await prisma.user.findUnique({ where: { id: sdrId }, select: { alloPhoneNumber: true } }))?.alloPhoneNumber ?? null,
    alloCalls: async (line, from, to) => (await fetchAlloMetricsForLine(line, from, to)).calls,
};

export async function computeSdrPaceFor(
    sdrId: string,
    nowDate: Date = new Date(),
    options: { alloTimeoutMs?: number; deps?: SdrPaceDeps } = {},
): Promise<SdrPaceSnapshot> {
    const deps = options.deps ?? prismaSdrPaceDeps;
    const now = DateTime.fromJSDate(nowDate).setZone(APP_TIMEZONE);
    const startOfDay = now.startOf("day");
    const todayKey = now.toFormat("yyyy-MM-dd");
    const tomorrowKey = now.plus({ days: 1 }).toFormat("yyyy-MM-dd");
    // ScheduleBlock.date is a @db.Date: compare against UTC midnight of the Paris day
    // (same convention as /api/sdr/today-blocks).
    const dayStart = new Date(`${todayKey}T00:00:00.000Z`);
    const dayEnd = new Date(`${tomorrowKey}T00:00:00.000Z`);

    const [config, callTimes, scheduleBlocks, line] = await Promise.all([
        deps.getPaceConfig(),
        deps.listCallTimes(sdrId, startOfDay.toJSDate()),
        deps.listScheduleBlocks(sdrId, dayStart, dayEnd),
        deps.alloPhoneNumber(sdrId),
    ]);

    let alloCalls = 0;
    let alloUsed = false;
    let alloDegraded = false;
    if (line) {
        const read = deps.alloCalls(line, startOfDay.toJSDate(), now.endOf("day").toJSDate());
        if (options.alloTimeoutMs === undefined) {
            alloCalls = await read;
            alloUsed = true;
        } else {
            let timer: NodeJS.Timeout | undefined;
            const timeout = new Promise<null>((resolve) => {
                timer = setTimeout(() => resolve(null), options.alloTimeoutMs);
            });
            try {
                const value = await Promise.race([read.then((n) => n), timeout]);
                if (value === null) alloDegraded = true;
                else {
                    alloCalls = value;
                    alloUsed = true;
                }
            } catch {
                alloDegraded = true;
            } finally {
                if (timer) clearTimeout(timer);
                read.catch(() => undefined); // a late failure must not be an unhandled rejection
            }
        }
    }

    const blocks: Interval[] = [];
    for (const b of scheduleBlocks) {
        const start = minuteOfDay(b.startTime);
        const end = minuteOfDay(b.endTime);
        if (start !== null && end !== null && end > start) blocks.push({ start, end });
    }

    const callMinutes = callTimes.map((c) => {
        const t = DateTime.fromJSDate(c, { zone: APP_TIMEZONE });
        return t.hour * 60 + t.minute + t.second / 60;
    });
    const nowMinute = now.hour * 60 + now.minute + now.second / 60;

    const time = computeEffectiveTime({ blocks, callMinutes, nowMinute });
    const effectiveCallsDone = Math.max(callTimes.length, alloCalls);
    const pace = computePace({
        callsDone: effectiveCallsDone,
        dailyQuota: config.dailyQuota,
        targetHours: config.targetHours,
        time,
    });

    return { pace, time, config, crmCalls: callTimes.length, alloCalls, alloUsed, alloDegraded };
}
