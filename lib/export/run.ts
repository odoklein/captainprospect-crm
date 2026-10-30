// ============================================
// INSTANCE DATA EXPORT (server) — a zip of one CSV per table + manifest.json,
// written to MinIO under exports/<id>.zip and handed back as a signed URL.
//
//   const job = startInstanceExport("instance-api");   → returns at once
//   getExportJob(id) / latestExportJob()                → poll
//
// Runs in the web process (one container per instance), one job at a time.
// The zip is built on disk (flat memory) and read back once for the upload, so
// the compressed archive must fit in memory: fine for an agency's CRM data.
// Job state is in memory: a restart loses the status but not the uploaded file.
// Files stored in MinIO (attachments, recordings) are not included; the manifest says so.
// ============================================

import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auditSystem } from "@/lib/audit";
import { generateSignedUrl, getMinioConfig, uploadFile } from "@/lib/storage/minio";
import { CSV_BOM, csvLine, planExport, type ExportModel, type TablePlan } from "./plan";
import { ZipWriter } from "./zip";

const BATCH = 2000;
const SIGNED_URL_SECONDS = 3600;

export type ExportJob = {
    id: string;
    state: "running" | "done" | "failed";
    startedAt: string;
    finishedAt: string | null;
    tablesDone: number;
    tablesTotal: number;
    rows: number;
    bytes: number | null;
    key: string | null;
    error: string | null;
};

const g = globalThis as typeof globalThis & { __exportJobs?: Map<string, ExportJob> };
const jobs = (g.__exportJobs ??= new Map<string, ExportJob>());

export function getExportJob(id: string): ExportJob | null {
    return jobs.get(id) ?? null;
}

export function latestExportJob(): ExportJob | null {
    let latest: ExportJob | null = null;
    for (const j of jobs.values()) if (!latest || j.startedAt > latest.startedAt) latest = j;
    return latest;
}

export function runningExportJob(): ExportJob | null {
    for (const j of jobs.values()) if (j.state === "running") return j;
    return null;
}

/** Fresh signed download URL for a finished job (the URL itself expires after an hour). */
export async function exportDownloadUrl(job: ExportJob): Promise<string | null> {
    if (job.state !== "done" || !job.key) return null;
    return generateSignedUrl({ key: job.key, expiresIn: SIGNED_URL_SECONDS });
}

export function exportStorageConfigured(): boolean {
    try {
        getMinioConfig();
        return true;
    } catch {
        return false;
    }
}

async function* tableCsv(plan: TablePlan, counter: { rows: number }): AsyncGenerator<string> {
    yield CSV_BOM + csvLine(plan.columns.map((c) => c.name));
    const select = plan.columns.map((c) => c.sql).join(", ");
    const order = plan.orderBy.length ? ` ORDER BY ${plan.orderBy.join(", ")}` : "";
    for (let offset = 0; ; offset += BATCH) {
        const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
            `SELECT ${select} FROM ${plan.table}${order} LIMIT ${BATCH} OFFSET ${offset}`,
        );
        if (rows.length === 0) return;
        let chunk = "";
        for (const row of rows) {
            // $queryRaw keys are the SQL column names, which equal the select list.
            chunk += csvLine(plan.columns.map((c) => row[c.sql.slice(1, -1)]));
        }
        counter.rows += rows.length;
        yield chunk;
        if (rows.length < BATCH) return;
    }
}

async function buildAndUpload(job: ExportJob): Promise<void> {
    const plan = planExport(Prisma.dmmf.datamodel.models as unknown as ExportModel[]);
    job.tablesTotal = plan.tables.length;
    const tmp = path.join(tmpdir(), `instance-export-${job.id}.zip`);
    const manifest = {
        generatedAt: job.startedAt,
        format: "Un fichier CSV par table (UTF-8, séparateur virgule). Dates en ISO 8601, listes et JSON en texte JSON.",
        note: "Les cellules qui commenceraient par = + - @ sont précédées d'une apostrophe (protection contre les formules de tableur). Les fichiers stockés (pièces jointes, enregistrements) ne sont pas inclus.",
        tables: [] as { table: string; rows: number; droppedColumns: string[]; error?: string }[],
        excludedModels: plan.excludedModels,
    };

    try {
        const zip = new ZipWriter(createWriteStream(tmp));
        for (const t of plan.tables) {
            const counter = { rows: 0 };
            let error: string | undefined;
            // Probe first: a table missing from a lagging schema is skipped cleanly, whereas
            // a failure after the entry started would leave a truncated entry in the zip.
            try {
                await prisma.$queryRawUnsafe(`SELECT 1 FROM ${t.table} LIMIT 1`);
            } catch (err) {
                error = err instanceof Error ? err.message.split("\n").map((l) => l.trim()).filter(Boolean).pop() : String(err);
                console.warn(`[export] ${t.model} skipped:`, error);
            }
            if (!error) await zip.addEntry(`${t.model}.csv`, tableCsv(t, counter));
            job.rows += counter.rows;
            job.tablesDone += 1;
            manifest.tables.push({ table: t.model, rows: counter.rows, droppedColumns: t.droppedColumns, ...(error ? { error } : {}) });
        }
        await zip.addEntry("manifest.json", [JSON.stringify(manifest, null, 2)]);
        await zip.finish();

        const body = await readFile(tmp);
        job.bytes = body.length;
        const key = `exports/${job.id}.zip`;
        await uploadFile({ key, body, contentType: "application/zip" });
        job.key = key;
    } finally {
        await rm(tmp, { force: true }).catch(() => undefined);
    }
}

/** Start an export in the background. Throws if one is already running or storage is not configured. */
export function startInstanceExport(actor: string): ExportJob {
    const running = runningExportJob();
    if (running) throw Object.assign(new Error("export_in_progress"), { job: running });
    if (!exportStorageConfigured()) throw new Error("storage_not_configured");

    const job: ExportJob = {
        id: `${new Date().toISOString().slice(0, 10)}-${randomBytes(6).toString("hex")}`,
        state: "running",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        tablesDone: 0,
        tablesTotal: 0,
        rows: 0,
        bytes: null,
        key: null,
        error: null,
    };
    jobs.set(job.id, job);
    // Keep the last few jobs only.
    for (const old of [...jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(5)) jobs.delete(old.id);

    auditSystem(
        { action: "EXPORT", entityType: "Instance", entityId: job.id, summary: "Export complet des données demandé par le control plane", metadata: { source: actor, exportId: job.id } },
        actor,
    );

    void buildAndUpload(job)
        .then(() => {
            job.state = "done";
            auditSystem(
                { action: "EXPORT", entityType: "Instance", entityId: job.id, summary: `Export complet terminé (${job.rows} lignes, ${job.tablesTotal} tables)`, metadata: { source: actor, exportId: job.id, bytes: job.bytes } },
                actor,
            );
        })
        .catch((err) => {
            job.state = "failed";
            job.error = err instanceof Error ? err.message : String(err);
            console.error("[export] failed", err);
        })
        .finally(() => {
            job.finishedAt = new Date().toISOString();
        });
    return job;
}
