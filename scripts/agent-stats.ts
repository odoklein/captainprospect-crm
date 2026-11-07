/**
 * Read-only snapshot of the agent: worker mode, queue depths, cost today,
 * jobs, last runs and open findings. Same figures as /api/instance/agent/health.
 *
 *   npx tsx scripts/agent-stats.ts [--runs 10]
 */
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { queueStats } from "../lib/agent/queue";
import { agentEnabled, workerMode } from "../lib/agent/store";

async function main() {
    const now = new Date();
    const runsArg = process.argv.indexOf("--runs");
    const take = runsArg >= 0 ? Math.max(1, Number(process.argv[runsArg + 1]) || 10) : 10;

    const [enabled, mode, stats] = await Promise.all([agentEnabled(), workerMode(now), queueStats(now)]);
    console.log(`Agent : ${enabled ? "activé" : "DÉSACTIVÉ (agent.enabled)"} · mode ${mode.mode} · worker vu ${mode.workerSeenAt ? mode.workerSeenAt.toISOString() : "jamais"}`);
    console.log(`File : ${stats.queued} en attente (plus ancienne ${stats.oldestQueuedAgeS ?? "–"} s) · ${stats.running} en cours · ${stats.waitingApproval} à valider · ${stats.failed24h} échec(s) 24 h · ${stats.deferred24h} différé(s) 24 h`);

    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const cost = await prisma.agentStep.aggregate({ _sum: { costEur: true }, where: { createdAt: { gte: dayStart } } });
    console.log(`Coût aujourd'hui : ${(cost._sum.costEur ?? 0).toFixed(4)} €`);

    const jobs = await prisma.agentJob.findMany({ orderBy: { name: "asc" } });
    console.log(`\nJobs (${jobs.length}) :`);
    for (const j of jobs) {
        console.log(`  ${j.enabled ? "●" : "○"} ${j.name} [${j.playbook}] ${j.schedule ?? "manuel"} ${j.timezone} · prochain ${j.nextRunAt?.toISOString() ?? "–"} · dernier ${j.lastRunAt?.toISOString() ?? "–"} ${j.lastStatus ?? ""} · échecs ${j.failures}`);
    }

    const runs = await prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take });
    console.log(`\nDerniers runs (${runs.length}) :`);
    for (const r of runs) {
        const usage = (r.usage ?? {}) as { costEur?: number };
        console.log(`  ${r.createdAt.toISOString()} ${r.status.padEnd(16)} ${r.playbook.padEnd(24)} ${r.mode} ×${r.attempts} · ${r.findingsCount} signalement(s) · ${(usage.costEur ?? 0).toFixed(4)} €${r.error ? ` · ${r.error.slice(0, 80)}` : ""}`);
    }

    const open = await prisma.agentFinding.groupBy({ by: ["rule", "severity"], where: { state: "OPEN" }, _count: { _all: true } });
    console.log(`\nSignalements ouverts :`);
    if (open.length === 0) console.log("  aucun");
    for (const o of open) console.log(`  ${o.rule.padEnd(20)} ${o.severity.padEnd(9)} ${o._count._all}`);
}

main()
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
