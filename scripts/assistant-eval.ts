/**
 * Behavioural evaluation of the Assistant Projet against synthetic fixtures.
 *
 *     npx tsx scripts/assistant-eval.ts --runs 2 --out docs/assistant/eval-<name>.json
 *
 * Uses the real model (OPENAI_API_KEY from .env) and the real loop, guard and
 * schemas; every tool is replaced by fixture data, so no database is touched
 * and no CRM record is sent to the provider. Costs a few cents per run.
 */

import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { installFixtureTools, fixtureContext, type FixtureWorld } from "@/lib/ai/agent/evals/fixtures";
import { SCENARIOS, type EvalTurnResult } from "@/lib/ai/agent/evals/scenarios";
import { runEvalTurn, RUNTIME_NAME } from "@/lib/ai/agent/evals/adapter";

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function main() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");
    const runs = Number(arg("runs", "1"));
    const out = arg("out", `docs/assistant/eval-${RUNTIME_NAME}.json`);
    const only = arg("only", "");

    let world: FixtureWorld = "normal";
    const recorder = installFixtureTools(() => world);

    const rows: Array<{ scenario: string; category: string; run: number; pass: boolean; failures: string[]; result: EvalTurnResult; calls: unknown[] }> = [];

    for (let run = 1; run <= runs; run++) {
        for (const scenario of SCENARIOS) {
            if (only && !scenario.id.includes(only)) continue;
            world = scenario.world;
            recorder.reset();
            const ctx = fixtureContext(scenario.project === "none" ? { project: null } : {});
            const result = await runEvalTurn(scenario, ctx, apiKey);
            const failures = result.error ? [`runtime error: ${result.error}`] : scenario.grade(result, recorder.calls, recorder.confirmExecutions);
            rows.push({ scenario: scenario.id, category: scenario.category, run, pass: failures.length === 0, failures, result, calls: [...recorder.calls] });
            console.log(`${failures.length === 0 ? "PASS" : "FAIL"} [${run}] ${scenario.id} ${result.latencyMs}ms ${failures.join(" | ")}`);
        }
    }
    recorder.restore();

    const traces = rows.flatMap((r) => r.result.trace);
    const latencies = rows.map((r) => r.result.latencyMs);
    const firstText = rows.map((r) => r.result.firstTextMs).filter((v): v is number => v !== null);
    const summary = {
        runtime: RUNTIME_NAME,
        date: new Date().toISOString(),
        model: rows.find((r) => r.result.model)?.result.model ?? null,
        turns: rows.length,
        accuracy: rows.filter((r) => r.pass).length / rows.length,
        toolCalls: traces.length,
        toolSuccessRate: traces.length ? traces.filter((t) => t.ok).length / traces.length : null,
        cachedToolCalls: traces.filter((t) => t.cached).length,
        latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), max: Math.max(...latencies) },
        firstTextMs: firstText.length ? { p50: percentile(firstText, 50), p95: percentile(firstText, 95) } : null,
        tokens: {
            prompt: rows.reduce((s, r) => s + r.result.usage.promptTokens, 0),
            completion: rows.reduce((s, r) => s + r.result.usage.completionTokens, 0),
        },
        costEur: Math.round(rows.reduce((s, r) => s + r.result.usage.costEur, 0) * 10000) / 10000,
        byCategory: Object.fromEntries(
            [...new Set(rows.map((r) => r.category))].map((c) => {
                const rs = rows.filter((r) => r.category === c);
                return [c, `${rs.filter((r) => r.pass).length}/${rs.length}`];
            }),
        ),
        failureModes: rows.filter((r) => !r.pass).map((r) => `${r.scenario}#${r.run}: ${r.failures.join("; ")}`),
    };

    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
    console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
