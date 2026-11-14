// npx tsx capture/measure-js.ts label — JS actually downloaded on first load of each route
// (compressed bytes on the wire, cold cache), so before/after bundle impact is measured, not guessed.
import { writeFileSync } from "node:fs";
import { BASE, chromium, login, VIEWPORT } from "./lib";

const label = process.argv[2] ?? "run";
const ROUTES = ["/manager/dashboard", "/manager/rdv", "/manager/lists", "/manager/billing", "/manager/tickets", "/manager/emails"];

const browser = await chromium.launch();
const result: Record<string, { jsBytes: number; jsFiles: number }> = {};
{
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    await login(page);
    const cookies = await ctx.cookies();
    await ctx.close();
    for (const r of ROUTES) {
        const c = await browser.newContext({ viewport: VIEWPORT });
        await c.addCookies(cookies);
        const p = await c.newPage();
        const reqs: import("playwright").Request[] = [];
        p.on("requestfinished", (req) => {
            if (req.resourceType() === "script") reqs.push(req);
        });
        await p.goto(`${BASE}${r}`, { waitUntil: "networkidle", timeout: 90_000 });
        await p.waitForTimeout(1500);
        let bytes = 0;
        for (const req of reqs) bytes += (await req.sizes()).responseBodySize;
        result[r] = { jsBytes: bytes, jsFiles: reqs.length };
        console.log(`${label} ${r}: ${(bytes / 1024).toFixed(1)} KiB in ${reqs.length} scripts`);
        await c.close();
    }
}
await browser.close();
writeFileSync(`/var/tmp/js-${label}.json`, JSON.stringify(result, null, 2));
