/**
 * QA helper: plays an inbound call against /api/webhooks/allo exactly the way
 * Allo would (same payloads, same Standard Webhooks signature), so the
 * incoming-call panel can be tested without a real phone.
 *
 *   npx tsx scripts/simulate-allo-call.ts --line "+33187654321" --from "+33612345678" --scenario answered
 *
 *   --url       webhook URL (default http://localhost:5000/api/webhooks/allo)
 *   --line      the SDR's Allo number, as in their CRM profile (User.alloPhoneNumber)
 *   --from      the caller — a CRM contact's phone to test a match, any other number for "inconnu"
 *   --scenario  ringing  | only call.received (panel stays on "Sonne…")
 *               answered | rings 6s, answered, hangs up after 12s with a summary
 *               missed   | rings 8s, then call.completed MISSED
 *
 * Signs with ALLO_WEBHOOK_SECRET from the env, which must be the same secret
 * the target server runs with.
 */
import "dotenv/config";
import crypto from "crypto";

function arg(name: string, fallback?: string): string {
    const i = process.argv.indexOf(`--${name}`);
    const value = i >= 0 ? process.argv[i + 1] : fallback;
    if (!value) throw new Error(`--${name} is required`);
    return value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const secret = process.env.ALLO_WEBHOOK_SECRET;
    if (!secret) throw new Error("ALLO_WEBHOOK_SECRET is not set (use the same value as the target server)");

    const url = arg("url", "http://localhost:5000/api/webhooks/allo");
    const line = arg("line");
    const from = arg("from");
    const scenario = arg("scenario", "answered");
    if (!["ringing", "answered", "missed"].includes(scenario)) throw new Error(`unknown --scenario ${scenario}`);

    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const send = async (topic: string, data: Record<string, unknown>) => {
        const body = JSON.stringify({ topic, version: "2.0", timestamp: new Date().toISOString(), data });
        const id = `msg_sim_${crypto.randomBytes(6).toString("hex")}`;
        const ts = String(Math.floor(Date.now() / 1000));
        const signature = crypto.createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "webhook-id": id,
                "webhook-timestamp": ts,
                "webhook-signature": `v1,${signature}`,
            },
            body,
        });
        console.log(`${new Date().toLocaleTimeString("fr-FR")}  ${topic.padEnd(15)} → ${res.status} ${await res.text()}`);
    };

    const startedAt = new Date().toISOString();
    await send("call.received", { from_number: from, to_number: line, started_at: startedAt, user_email: null });
    if (scenario === "ringing") return;

    if (scenario === "missed") {
        await sleep(8_000);
        await send("call.completed", {
            id: `cll_sim_${Date.now()}`,
            start_date: startedAt,
            from_number: from,
            to: line,
            type: "INBOUND",
            result: "MISSED",
            length_in_minutes: 0,
        });
        return;
    }

    await sleep(6_000);
    await send("call.answered", {
        from_number: from,
        to_number: line,
        direction: "INBOUND",
        started_at: startedAt,
        answered_at: new Date().toISOString(),
    });
    await sleep(12_000);
    await send("call.completed", {
        id: `cll_sim_${Date.now()}`,
        start_date: startedAt,
        from_number: from,
        to: line,
        type: "INBOUND",
        result: "ANSWERED",
        length_in_minutes: 0.3,
        summary: "Appel simulé (QA) : le prospect rappelle suite au message laissé, souhaite une démo mardi.",
    });
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
