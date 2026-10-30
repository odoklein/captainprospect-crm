/**
 * Job validation and serialisation shared by the jobs routes: the playbook's
 * scope rules, its zod config schema, the cron expression, and the item with
 * its French schedule label.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/lib/api-utils";
import type { AgentJobItem } from "@/lib/assistant/api-contract";
import { optional } from "@/lib/assistant/store/missing";
import { resolveProjectBinding } from "@/lib/ai/tools/context";
import { isValidCron, nextMatch } from "./cron";
import { getPlaybook } from "./playbooks/registry";
import type { Playbook } from "./playbooks/types";
import { toJobItem, type JobRow } from "./serialize";

export function parseJobConfig(playbook: Playbook, config: unknown): Record<string, unknown> {
    const parsed = playbook.configSchema.safeParse(config ?? {});
    if (!parsed.success) {
        throw new ValidationError(`Configuration invalide : ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "config"} : ${i.message}`).join(", ")}`);
    }
    const { jobName: _jobName, ...rest } = parsed.data as Record<string, unknown>;
    return rest;
}

/** Validates a cron for storage; null = manual only. Returns the next fire time. */
export function parseSchedule(schedule: string | null, timezone: string, now: Date): { schedule: string | null; nextRunAt: Date | null } {
    if (schedule === null) return { schedule: null, nextRunAt: null };
    const s = schedule.trim().replace(/\s+/g, " ");
    if (!isValidCron(s)) throw new ValidationError(`Planification invalide : « ${schedule} » (cron à 5 champs attendu, ex. « 0 8 * * 1 »).`);
    const next = nextMatch(s, now, timezone);
    if (!next) throw new ValidationError(`Planification jamais atteinte : « ${schedule} ».`);
    return { schedule: s, nextRunAt: next };
}

export function requirePlaybook(id: string): Playbook {
    const playbook = getPlaybook(id);
    if (!playbook) throw new ValidationError(`Playbook inconnu : ${id}`);
    return playbook;
}

export async function folderClientId(folderId: string | null | undefined): Promise<string | null> {
    if (!folderId) return null;
    return optional(
        "agent.jobs.folder",
        async () => (await prisma.assistantFolder.findUnique({ where: { id: folderId }, select: { clientId: true } }))?.clientId ?? null,
        null,
    );
}

/** Scope of a job or mission: folder → client fallback, playbook scope rule, mission belongs to client. */
export async function resolveScope(playbook: Playbook | null, input: { folderId?: string | null; clientId?: string | null; missionId?: string | null }) {
    const folderId = input.folderId ?? null;
    const clientId = input.clientId ?? (await folderClientId(folderId));
    const missionId = clientId ? (input.missionId ?? null) : null;
    if (playbook?.scope === "client" && !clientId) throw new ValidationError("Ce playbook demande un client.");
    if (playbook?.scope === "agency" && (clientId || folderId)) throw new ValidationError("Ce playbook porte sur toute l'agence : pas de client ni de dossier.");
    const project = clientId ? await resolveProjectBinding(clientId, missionId) : null;
    return { folderId, clientId: project?.clientId ?? null, missionId: project?.missionId ?? null, clientName: project?.clientName ?? null };
}

export async function jobItems(rows: JobRow[]): Promise<AgentJobItem[]> {
    const ids = [...new Set(rows.map((r) => r.clientId).filter((id): id is string => !!id))];
    const clients = ids.length > 0 ? await prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const names = new Map(clients.map((c) => [c.id, c.name]));
    return rows.map((r) => toJobItem(r, { playbookLabel: getPlaybook(r.playbook)?.label ?? null, clientName: r.clientId ? (names.get(r.clientId) ?? null) : null }));
}

export function isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
