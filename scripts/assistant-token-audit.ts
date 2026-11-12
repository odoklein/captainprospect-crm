/**
 * Token audit of the assistant tool schemas.
 *
 *     npm run ai:token-audit
 *     npx tsx scripts/assistant-token-audit.ts [--top 15]
 *
 * For both views (project bound, agency) prints each tool's estimated tokens
 * before and after slimming, sorted descending, then the totals for the
 * "core" and "full" profiles. No database, no network: the contexts are
 * fakes, exactly like lib/ai/usage.test.ts.
 *
 * Two estimates are shown. "json" is JSON length / 4 — the payload we send.
 * "wire" is the same ratio on the TypeScript-namespace rendering the provider
 * actually puts in the prompt (renderToolsAsTypeScript), which is what the
 * usage reports bill; the targets (core ≤ 4k, full ≤ 6.5k) are judged on it.
 */

import { toolProfileFor, toolGroupOf } from "@/lib/ai/tools/profiles";
import { estimateWireTokens, slimToolSchema, toRawProviderTools } from "@/lib/ai/tools/registry";
import type { AssistantContext } from "@/lib/ai/tools/types";
import type { ToolSpec } from "@/lib/ai/providers/types";

/** The question that decides the "core" profile here: a plain figures lookup. */
const CORE_QUESTION = "Combien de RDV ce mois ?";

const TARGETS = { core: 4_000, full: 6_500 };

function fakeContext(project: AssistantContext["project"]): AssistantContext {
    return {
        userId: "audit",
        userName: "Audit",
        role: "MANAGER",
        isActive: true,
        permissions: [],
        project,
        resolvedAt: new Date(),
        autoWriteBudget: 3,
        conversationId: null,
    };
}

const VIEWS: Array<{ label: string; ctx: AssistantContext }> = [
    {
        label: "Vue projet",
        ctx: fakeContext({ clientId: "c", clientName: "Client", missionId: null, missionName: null }),
    },
    { label: "Vue agence", ctx: fakeContext(null) },
];

const jsonTokens = (specs: ToolSpec[]): number => Math.ceil(JSON.stringify(specs).length / 4);

interface Row {
    name: string;
    group: string;
    raw: ToolSpec;
    slim: ToolSpec;
    before: number;
    after: number;
}

interface Total {
    profile: string;
    json: { before: number; after: number };
    wire: { before: number; after: number };
    target: number;
}

function topArg(): number {
    const index = process.argv.indexOf("--top");
    const value = index >= 0 ? Number(process.argv[index + 1]) : NaN;
    return Number.isFinite(value) && value > 0 ? value : 15;
}

function pad(text: string, width: number): string {
    return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function total(profile: string, rows: Row[], target: number): Total {
    return {
        profile: `${profile} (${rows.length} outils)`,
        json: { before: jsonTokens(rows.map((r) => r.raw)), after: jsonTokens(rows.map((r) => r.slim)) },
        wire: { before: estimateWireTokens(rows.map((r) => r.raw)), after: estimateWireTokens(rows.map((r) => r.slim)) },
        target,
    };
}

function audit(view: { label: string; ctx: AssistantContext }, top: number): Total[] {
    const rows: Row[] = toRawProviderTools(view.ctx)
        .map((raw) => {
            const slim = slimToolSchema(raw, view.ctx);
            return {
                name: raw.name,
                group: toolGroupOf(raw.name) ?? "?",
                raw,
                slim,
                before: jsonTokens([raw]),
                after: jsonTokens([slim]),
            };
        })
        .sort((a, b) => b.after - a.after);

    console.log(`\n=== ${view.label} — ${rows.length} outils accessibles (tokens json, avant → après) ===`);
    console.log(`${pad("outil", 32)}${pad("groupe", 11)}${pad("avant", 8)}après`);
    for (const row of rows.slice(0, top)) {
        console.log(`${pad(row.name, 32)}${pad(row.group, 11)}${pad(String(row.before), 8)}${row.after}`);
    }
    if (rows.length > top) console.log(`… ${rows.length - top} autres (--top N pour en voir plus)`);

    const accessible = rows.map((row) => row.name);
    const core = toolProfileFor({ ctx: view.ctx, depth: "standard", question: CORE_QUESTION, accessible });
    const coreNames = core.names ?? new Set(accessible);

    const totals = [
        total(`core [${core.groups.join("+")}]`, rows.filter((row) => coreNames.has(row.name)), TARGETS.core),
        total("full", rows, TARGETS.full),
    ];
    console.log("");
    console.log(`${pad("profil", 40)}${pad("json avant", 12)}${pad("json après", 12)}${pad("wire avant", 12)}${pad("wire après", 12)}cible (wire)`);
    for (const t of totals) {
        const verdict = t.wire.after <= t.target ? "OK" : "AU-DESSUS";
        console.log(
            `${pad(t.profile, 40)}${pad(String(t.json.before), 12)}${pad(String(t.json.after), 12)}${pad(String(t.wire.before), 12)}${pad(String(t.wire.after), 12)}≤ ${t.target}  ${verdict}`,
        );
    }
    return totals;
}

const top = topArg();
console.log(`Question « core » : ${CORE_QUESTION}`);
const results = VIEWS.flatMap((view) => audit(view, top));

const over = results.filter((t) => t.wire.after > t.target);
if (over.length > 0) {
    console.log(`\n${over.length} total(aux) au-dessus de la cible.`);
    process.exitCode = 1;
}
