/**
 * Subscribes the CRM to Allo's call events (one subscription covers every line
 * of the workspace). Run once per environment.
 *
 *   npx tsx scripts/register-allo-webhook.ts --list
 *   npx tsx scripts/register-allo-webhook.ts --url https://<crm-domain>/api/webhooks/allo
 *
 * Needs ALLO_API_KEY with the WEBHOOKS_READ_WRITE scope. Allo returns the
 * signing secret ONCE, in the creation response: put it in the CRM env as
 * ALLO_WEBHOOK_SECRET and redeploy, otherwise /api/webhooks/allo refuses every
 * delivery.
 */
import "dotenv/config";

const ALLO_API = "https://api.withallo.com/v2/api/webhooks";
const TOPICS = ["call.received", "call.answered", "call.completed"];

async function main() {
    const apiKey = process.env.ALLO_API_KEY;
    if (!apiKey) throw new Error("ALLO_API_KEY is not set");

    const args = process.argv.slice(2);
    const headers = { Authorization: apiKey, "Content-Type": "application/json" };

    if (args.includes("--list")) {
        const res = await fetch(ALLO_API, { headers });
        console.log(res.status, JSON.stringify(await res.json().catch(() => null), null, 2));
        return;
    }

    const urlIndex = args.indexOf("--url");
    const url = urlIndex >= 0 ? args[urlIndex + 1] : undefined;
    if (!url || !/^https:\/\//.test(url) || !url.endsWith("/api/webhooks/allo")) {
        throw new Error("Pass --url https://<crm-domain>/api/webhooks/allo (Allo only delivers to HTTPS)");
    }

    const res = await fetch(ALLO_API, {
        method: "POST",
        headers,
        body: JSON.stringify({ url, topics: TOPICS, description: "Captain Prospect CRM — incoming-call panel" }),
    });
    const body = (await res.json().catch(() => null)) as { data?: { id?: string; signing_secret?: string } } | null;

    if (!res.ok) {
        console.error(`Allo refused the subscription (HTTP ${res.status}):`, JSON.stringify(body, null, 2));
        process.exit(1);
    }

    console.log(`Subscribed ${body?.data?.id ?? "(no id returned)"} to ${TOPICS.join(", ")} → ${url}`);
    if (body?.data?.signing_secret) {
        console.log("\nAdd to the CRM environment, then redeploy (shown only this once):\n");
        console.log(`ALLO_WEBHOOK_SECRET=${body.data.signing_secret}\n`);
    } else {
        console.warn("No signing_secret in the response — fetch it from the Allo dashboard.");
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
