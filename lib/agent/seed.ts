/**
 * Default agent jobs, created once per instance on the first GET /jobs.
 *
 *   watch.client_at_risk   agency-wide, every day 09:00     ENABLED
 *   watch.sdr_under_pace   agency-wide, workdays 11:00/15:00 ENABLED
 *   digest.morning         agency-wide, workdays 07:30       DISABLED
 *
 * Why: the watches are SQL detectors; the model only runs when something is
 * new (a few cents at most) and they only notify CRITICAL findings, so they
 * are useful from day one at no risk. The digest posts a message to every
 * manager every workday: that is an opt-in, a manager switches it on in
 * Réglages. No REPORT job is seeded (a bilan is per client, chosen by a human).
 *
 * Idempotent and race-safe: a SystemConfig marker row (`agent.jobs.seeded`,
 * primary key) is inserted first, and only the request that inserted it seeds.
 * The @@unique(playbook, folderId, clientId, missionId) does not protect rows
 * whose scope columns are NULL (Postgres treats NULLs as distinct), hence the
 * marker. A job deleted later is never re-created.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPlaybook } from "./playbooks/registry";
import { withStore } from "./store";

export const SEED_MARKER_KEY = "agent.jobs.seeded";

export interface SeedJob {
    playbook: string;
    name: string;
    schedule: string;
    enabled: boolean;
}

export const DEFAULT_JOBS: SeedJob[] = [
    { playbook: "watch.client_at_risk", name: "Clients à surveiller", schedule: "0 9 * * *", enabled: true },
    { playbook: "watch.sdr_under_pace", name: "SDR en retard sur le rythme", schedule: "0 11,15 * * 1-5", enabled: true },
    { playbook: "digest.morning", name: "Point du matin", schedule: "30 7 * * 1-5", enabled: false },
];

/** Returns the number of jobs created (0 when the instance was already seeded). */
export async function seedDefaultJobs(createdById: string): Promise<number> {
    // Tables first: a missing migration must not burn the marker.
    await withStore(() => prisma.agentJob.count({ take: 1 }));
    try {
        await prisma.systemConfig.create({ data: { key: SEED_MARKER_KEY, value: new Date().toISOString() } });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return 0;
        throw error;
    }
    try {
        return await createDefaults(createdById);
    } catch (error) {
        // Let the next request try again.
        await prisma.systemConfig.delete({ where: { key: SEED_MARKER_KEY } }).catch(() => undefined);
        throw error;
    }
}

async function createDefaults(createdById: string): Promise<number> {
    let created = 0;
    for (const job of DEFAULT_JOBS) {
        const playbook = getPlaybook(job.playbook);
        if (!playbook) continue;
        const existing = await withStore(() =>
            prisma.agentJob.findFirst({ where: { playbook: job.playbook, folderId: null, clientId: null, missionId: null }, select: { id: true } }),
        );
        if (existing) continue;
        await withStore(() =>
            prisma.agentJob.create({
                data: { kind: playbook.kind, playbook: job.playbook, name: job.name, enabled: job.enabled, schedule: job.schedule, timezone: "Europe/Paris", config: {}, createdById },
                select: { id: true },
            }),
        );
        created += 1;
    }
    return created;
}
