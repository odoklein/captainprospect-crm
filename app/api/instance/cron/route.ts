import { NextRequest } from "next/server";
import { guardInstanceRequest, instanceError, instanceJson, parseJsonBody } from "@/lib/instance/respond";
import { CRON_JOBS, cronRequestFor, findCronJob } from "@/lib/instance/cron-jobs";
import { getLicense } from "@/lib/license/server";
import { isSuspended } from "@/lib/license/resolve";
import { getBrand } from "@/lib/brand/server";
import { runtimeAppUrl } from "@/lib/runtime-config/env";

// One scheduler for the whole fleet. HMAC-signed (lib/instance/auth).
//   GET  → { ok, jobs: [{ id, schedule, description, missedRun }] }   schedules are UTC cron expressions
//   POST { job } → { ok, job, status, result }   runs the job now; `status` is the job's own HTTP status
// A suspended instance runs nothing ({ ok, skipped: "suspended" }): no emails, no reminders, no invoices.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "cron");
    if (!guard.ok) return guard.response;
    return instanceJson({
        ok: true,
        jobs: CRON_JOBS.map(({ id, schedule, description, missedRun }) => ({ id, schedule, description, missedRun })),
        cronSecretConfigured: Boolean(process.env.CRON_SECRET),
    });
}

export async function POST(request: NextRequest) {
    const guard = await guardInstanceRequest(request, "cron");
    if (!guard.ok) return guard.response;

    const body = parseJsonBody(guard.rawBody);
    if (!body.ok) return instanceError(400, "invalid_json");
    const job = findCronJob((body.value as { job?: unknown } | null)?.job);
    if (!job) return instanceError(422, "unknown_job", { jobs: CRON_JOBS.map((j) => j.id) });

    if (isSuspended(await getLicense())) return instanceJson({ ok: true, job: job.id, skipped: "suspended" });

    const base = runtimeAppUrl() ?? (await getBrand()).appUrl;
    try {
        const res = await job.run(cronRequestFor(job, base, process.env.CRON_SECRET));
        const text = await res.text();
        let result: unknown = text;
        try {
            result = JSON.parse(text);
        } catch {
            // plain text answer (e.g. "Unauthorized")
        }
        return instanceJson({ ok: res.ok, job: job.id, status: res.status, result }, res.ok ? 200 : 502);
    } catch (err) {
        console.error(`[instance-api] cron ${job.id}`, err);
        return instanceError(500, "job_failed", { job: job.id, message: err instanceof Error ? err.message : String(err) });
    }
}
