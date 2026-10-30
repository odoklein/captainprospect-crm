/**
 * Runs one agent playbook in-process, against whatever DATABASE_URL points at
 * (check it first: findings are written, a digest may be appended to the AGENT
 * thread, and a non-dry run notifies managers).
 *
 *   npx tsx scripts/agent-run.ts --playbook watch.client_at_risk [--client <id>] [--actor <userId>] [--dry-run] [--days 14]
 *
 * --dry-run  findings are reconciled but nobody is notified and no digest is
 *            written (zero model cost).
 * --actor    the manager the run acts as; default: the first active MANAGER.
 *
 * Prints the run's steps, its findings and its cost, then exits 0 (DONE or
 * WAITING_APPROVAL) or 1.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { startIntegrationKeys } from "../lib/integrations/store";
import { getPlaybook, PLAYBOOKS } from "../lib/agent/playbooks/registry";
import { claimRun, enqueueRun } from "../lib/agent/queue";
import { executeRun, jsonLog } from "../lib/agent/run";
import { AgentStoreUnavailable } from "../lib/agent/store";

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && !process.argv[i + 1]?.startsWith("--") ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
    const playbookId = arg("playbook");
    const playbook = playbookId ? getPlaybook(playbookId) : undefined;
    if (!playbook) {
        console.error(`Usage: --playbook <id> [--client <id>] [--actor <userId>] [--dry-run] [--days N]\nPlaybooks : ${PLAYBOOKS.map((p) => p.id).join(", ")}`);
        process.exit(1);
    }
    const dryRun = flag("dry-run");
    const clientId = arg("client") ?? null;

    await startIntegrationKeys();

    const actorId =
        arg("actor") ??
        (await prisma.user.findFirst({ where: { role: "MANAGER", isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
    if (!actorId) {
        console.error("Aucun manager actif : passe --actor <userId>.");
        process.exit(1);
    }

    // A throwaway job carries the config (dryRun, days) the way a real job would.
    const days = arg("days") ? Number(arg("days")) : undefined;
    const config = { dryRun, ...(days ? { days } : {}), notify: "immediate" as const };
    const workerId = `cli:${process.pid}`;
    const jobId = `cli-${randomUUID().slice(0, 8)}`;
    let created = false;
    try {
        await prisma.agentJob.create({
            data: { id: jobId, kind: playbook.kind, playbook: playbook.id, name: `${playbook.label} (CLI)`, enabled: false, clientId, config, createdById: actorId },
        });
        created = true;

        const queued = await enqueueRun({ jobId, kind: playbook.kind, playbook: playbook.id, trigger: "MANUAL", clientId, actorId, priority: 100, dedupeKey: `cli:${jobId}` });
        if (!queued.id) throw new Error("run not enqueued");
        const run = await claimRun(workerId, new Date(), { mode: "worker" });
        if (!run || run.id !== queued.id) throw new Error(`run ${queued.id} not claimable (another run of the same scope is RUNNING?)`);

        console.log(`▶ ${playbook.id} · run ${run.id} · actor ${actorId}${clientId ? ` · client ${clientId}` : ""}${dryRun ? " · DRY RUN" : ""}`);
        const abort = new AbortController();
        process.once("SIGINT", () => abort.abort(new Error("SIGINT")));
        const result = await executeRun(run, { workerId, mode: "worker", signal: abort.signal, log: jsonLog });

        const steps = await prisma.agentStep.findMany({ where: { runId: run.id }, orderBy: { index: "asc" } });
        console.log("\nÉtapes :");
        for (const s of steps) {
            console.log(`  ${s.index}. [${s.status}] ${s.title}${s.model ? ` (${s.model}, ${s.costEur.toFixed(4)} €)` : ""}${s.durationMs ? ` ${s.durationMs} ms` : ""}`);
            if (s.resultDigest) console.log(`     ${s.resultDigest.split("\n").slice(0, 4).join("\n     ")}`);
        }
        const findings = await prisma.agentFinding.findMany({ where: { runId: run.id }, orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }] });
        console.log(`\nSignalements (${findings.length}) :`);
        for (const f of findings) {
            console.log(`  [${f.severity}] ${f.state} ×${f.seenCount}  ${f.title}`);
            console.log(`     ${f.body}`);
        }
        const notifications = dryRun ? 0 : await prisma.notification.count({ where: { title: { startsWith: "[Agent]" }, createdAt: { gte: run.startedAt ?? run.createdAt } } });
        console.log(`\nStatut : ${result.status}${result.error ? ` — ${result.error}` : ""}`);
        console.log(`Résumé : ${result.outcome?.summary ?? "—"}`);
        console.log(`Coût : ${(result.outcome?.usage.costEur ?? 0).toFixed(4)} € · ${result.outcome?.usage.toolCalls ?? 0} appel(s) d'outil · ${result.outcome?.usage.phases ?? 0} phase(s) modèle · notifications : ${notifications}`);
        process.exitCode = result.status === "DONE" || result.status === "WAITING_APPROVAL" ? 0 : 1;
    } catch (error) {
        if (error instanceof AgentStoreUnavailable) console.error("Tables agent absentes : applique prisma/migrations/20261101120000_add_agent_jobs d'abord.");
        else console.error(error);
        process.exitCode = 1;
    } finally {
        if (created) await prisma.agentJob.delete({ where: { id: jobId } }).catch(() => undefined); // runs keep jobId = null (SET NULL)
        await prisma.$disconnect();
    }
}

main();
