/**
 * Inspects the Supabase project through PostgREST (service role) — read only.
 * Prints the table list, the assistant conversation columns and any RPC that
 * could run SQL. Never prints keys.
 *
 *     npx tsx work/supabase-inspect.ts
 */
import "dotenv/config";

const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!base || !key) {
    console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

console.log("base:", base);

async function main() {
    const specRes = await fetch(`${base}/rest/v1/`, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" },
    });
    console.log("openapi status:", specRes.status);
    if (!specRes.ok) {
        console.log((await specRes.text()).slice(0, 300));
        return;
    }
    const spec = (await specRes.json()) as {
        definitions?: Record<string, { properties?: Record<string, unknown> }>;
        paths?: Record<string, unknown>;
    };
    const tables = Object.keys(spec.definitions ?? {});
    console.log("tables:", tables.length);
    console.log(tables.filter((t) => /assistant|agent|ai_?usage/i.test(t)).join(", "));

    const conv = spec.definitions?.AssistantProjetConversation?.properties;
    if (conv) console.log("conversation columns:", Object.keys(conv).join(", "));
    else console.log("AssistantProjetConversation: not exposed");

    const rpcs = Object.keys(spec.paths ?? {}).filter((p) => p.startsWith("/rpc/"));
    console.log("rpc:", rpcs.join(", ") || "(none)");
}

main().catch((error) => {
    console.error("failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
