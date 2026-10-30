import { NextRequest } from "next/server";
import { guardInstanceRequest, instanceError, instanceJson } from "@/lib/instance/respond";
import { exportDownloadUrl, getExportJob, latestExportJob, startInstanceExport, type ExportJob } from "@/lib/export/run";

// Full export of this instance's data, for offboarding, deletion and GDPR requests.
// HMAC-signed (lib/instance/auth). Works while the instance is suspended.
//   POST            → 202 { ok, export }       starts a job (409 export_in_progress, 503 storage_not_configured)
//   GET ?id=<id>    → { ok, export, downloadUrl }   status; downloadUrl (1 h) once done
//   GET             → the most recent job, or 404 when none ran since this process started
// The archive is exports/<id>.zip in the instance's MinIO bucket: one CSV per table + manifest.json.
export const dynamic = "force-dynamic";

const ACTOR = "instance-api";

function view(job: ExportJob) {
    const { key: _key, ...rest } = job;
    return rest;
}

export async function POST(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "export");
    if (!guard.ok) return guard.response;
    try {
        return instanceJson({ ok: true, export: view(startInstanceExport(ACTOR)) }, 202);
    } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message === "export_in_progress") {
            return instanceError(409, "export_in_progress", { export: view((err as unknown as { job: ExportJob }).job) });
        }
        if (message === "storage_not_configured") {
            return instanceError(503, "storage_not_configured", { message: "MinIO n'est pas configuré sur cette instance (MINIO_*)." });
        }
        console.error("[instance-api] export", err);
        return instanceError(500, "export_failed");
    }
}

export async function GET(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "export");
    if (!guard.ok) return guard.response;

    const id = request.nextUrl.searchParams.get("id");
    const job = id ? getExportJob(id) : latestExportJob();
    if (!job) return instanceError(404, "export_not_found");
    try {
        return instanceJson({ ok: true, export: view(job), downloadUrl: await exportDownloadUrl(job) });
    } catch (err) {
        console.error("[instance-api] export url", err);
        return instanceError(500, "signed_url_failed");
    }
}
