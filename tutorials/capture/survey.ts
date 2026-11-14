// npx tsx capture/survey.ts [out-dir] — one screenshot per manager route, to audit data and layout.
import { mkdirSync } from "node:fs";
import { BASE, launch, settle } from "./lib";

const ROUTES = (process.env.ROUTES ?? "").split(",").filter(Boolean);
const out = process.argv[2] ?? "/var/tmp/survey";
mkdirSync(out, { recursive: true });

const { browser, page } = await launch();
page.on("pageerror", (e) => console.log("  pageerror:", e.message.slice(0, 160)));
for (const r of ROUTES) {
    const t = Date.now();
    try {
        await page.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await settle(page, 1200);
        await page.screenshot({ path: `${out}/${r.replace(/^\/manager\/?/, "").replace(/\//g, "_") || "root"}.png`, scale: "css" });
        console.log(`${r} ${Date.now() - t}ms -> ${page.url().replace(BASE, "")}`);
    } catch (e) {
        console.log(`${r} FAILED ${(e as Error).message.slice(0, 120)}`);
    }
}
await browser.close();
