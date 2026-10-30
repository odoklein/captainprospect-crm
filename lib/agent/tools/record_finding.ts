/**
 * `record_finding` — a mission (or report) leaves something to follow up in
 * the manager's inbox, as an AgentFinding.
 *
 * Unlike a watch rule, a mission does not return "the full current set", so
 * nothing else may resolve when it records one: the lifecycle of
 * lib/agent/findings.ts (`reconcileFindings`) is applied to this single key
 * only. Same key again = the same finding bumped (or reopened), never a
 * duplicate. Rule "mission", key `mission:<clientId|agency>:<key>`.
 */

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { defineReadTool, params } from "@/lib/ai/tools/helpers";
import { dedupeKeyFor, reconcileFindings } from "../findings";
import { withStore } from "../store";
import type { FindingRow } from "../types";
import { AGENT_RUN_PERMISSION, getRunScope, type FindingInput } from "./with-run-tools";

export const MISSION_FINDING_RULE = "mission";

const json = (v: unknown) => (v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue));

/** The finding's stable key part: lowercase slug, so "Relancer Acme" and "relancer-acme" collide on purpose. */
export function findingKeySlug(raw: string): string {
    const slug = raw
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    return slug || "sans-cle";
}

/** Prisma sink for `RunToolScope.recordFinding`. */
export async function prismaRecordFinding(runId: string, input: FindingInput, now = new Date()): Promise<{ id: string; created: boolean }> {
    const scopeKey = input.clientId ?? "agency";
    const key = findingKeySlug(input.key);
    const dedupeKey = dedupeKeyFor(MISSION_FINDING_RULE, scopeKey, key);
    const existing = await withStore(() => prisma.agentFinding.findUnique({ where: { dedupeKey } }));
    const rows: FindingRow[] = existing
        ? [
              {
                  id: existing.id,
                  rule: existing.rule,
                  dedupeKey: existing.dedupeKey,
                  severity: existing.severity,
                  kind: existing.kind,
                  title: existing.title,
                  body: existing.body,
                  metrics: existing.metrics as Record<string, unknown> | null,
                  clientId: existing.clientId,
                  missionId: existing.missionId,
                  subjectUserId: existing.subjectUserId,
                  state: existing.state,
                  firstSeenAt: existing.firstSeenAt,
                  lastSeenAt: existing.lastSeenAt,
                  seenCount: existing.seenCount,
                  snoozedUntil: existing.snoozedUntil,
                  notifiedAt: existing.notifiedAt,
              },
          ]
        : [];
    const plan = reconcileFindings(
        rows,
        [{ key, severity: input.severity, kind: input.kind, title: input.title, body: input.body, metrics: input.metrics ?? undefined, clientId: input.clientId, missionId: input.missionId, subjectUserId: input.subjectUserId }],
        { rule: MISSION_FINDING_RULE, scopeKey, now },
    );

    const create = plan.creates[0];
    if (create) {
        const row = await withStore(() =>
            prisma.agentFinding.create({
                data: { ...create, metrics: json(create.metrics), suggested: Prisma.DbNull, runId, firstSeenAt: now, lastSeenAt: now, seenCount: 1 },
                select: { id: true },
            }),
        );
        return { id: row.id, created: true };
    }
    const update = plan.updates.find((u) => u.id === existing?.id);
    if (existing && update) {
        const { metrics, suggested: _suggested, ...rest } = update.data;
        await withStore(() =>
            prisma.agentFinding.update({
                where: { id: existing.id },
                data: { ...rest, ...(metrics !== undefined ? { metrics: json(metrics) } : {}), runId },
                select: { id: true },
            }),
        );
    }
    return { id: existing!.id, created: false };
}

const MetricValue = z.union([z.number().finite(), z.string().max(120), z.null()]);

const RecordSchema = z.object({
    key: z.string().min(1).max(120),
    title: z.string().min(3).max(160),
    body: z.string().min(3).max(2000),
    severity: z.enum(["INFO", "WARN", "CRITICAL"]).default("WARN"),
    kind: z.string().min(1).max(60).default("mission"),
    metrics: z.record(z.string().max(60), MetricValue).optional(),
    subject_user_id: z.string().min(1).max(40).optional(),
});

export const recordFinding = defineReadTool({
    name: "record_finding",
    label: "Signaler un point de suivi",
    description:
        "Enregistre un point à suivre dans la boîte « À traiter » du manager (même clé = même signalement mis à jour). Chiffres uniquement tirés des sources consultées.",
    parameters: params(
        {
            key: { type: "string", description: "Clé stable du sujet (ex. « relance-acme »), pour ne pas créer de doublon." },
            title: { type: "string", description: "Titre court, « Sujet : constat »." },
            body: { type: "string", description: "Constat et recommandation, en français, 2–4 phrases." },
            severity: { type: "string", enum: ["INFO", "WARN", "CRITICAL"], description: "CRITICAL = à traiter aujourd'hui." },
            kind: { type: "string", description: "Catégorie courte (ex. relance, qualite_donnees)." },
            metrics: { type: "object", description: "Chiffres clés tirés des sources, { nom: valeur }." },
            subject_user_id: { type: "string", description: "Id du SDR concerné, s'il y en a un." },
        },
        ["key", "title", "body"],
    ),
    schema: RecordSchema,
    requiresProject: false,
    requiredPermissions: [AGENT_RUN_PERMISSION],
    noEvidence: true,
    execute: async (args, ctx) => {
        const scope = getRunScope(ctx);
        const result = await scope.recordFinding({
            key: args.key,
            severity: args.severity,
            kind: args.kind,
            title: args.title,
            body: args.body,
            metrics: args.metrics ?? null,
            clientId: ctx.project?.clientId ?? scope.clientId,
            missionId: ctx.project?.missionId ?? scope.missionId,
            subjectUserId: args.subject_user_id ?? null,
        });
        return { signalement: result.id, nouveau: result.created, statut: result.created ? "créé" : "mis à jour" };
    },
});
