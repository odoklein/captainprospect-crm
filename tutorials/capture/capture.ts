// npx tsx capture/capture.ts [id ...] — runs storyboards against the real UI (fictional data)
// and writes screenshots + element boxes to video/public/captures/<id>/capture.json.
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { BASE, DSF, VIEWPORT, launch, settle } from "./lib";
import { resolve, type Storyboard, type Target } from "./storyboard";
import { STORYBOARDS } from "./storyboards";
import type { Box, Capture, CapturedStep } from "../video/src/types";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "../video/public/captures");

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
// Storyboards change data (confirming a RDV…): every capture session starts from the same seed.
if (!args.includes("--no-seed")) execSync("npx tsx capture/seed/index.ts", { cwd: join(here, ".."), stdio: "inherit" });
const boards = only.length ? STORYBOARDS.filter((s) => only.includes(s.id)) : STORYBOARDS;
if (!boards.length) throw new Error(`No storyboard matches ${only.join(", ")}`);

/** Box of a target in viewport CSS px. Only action targets may scroll the page into view
 *  (before their "before" screenshot); results are measured where they are. */
async function boxOf(page: Page, t: Target, scroll = true): Promise<Box> {
    const loc = resolve(page, t);
    await loc.waitFor({ state: "visible", timeout: 15_000 });
    if (scroll) await loc.scrollIntoViewIfNeeded().catch(() => {});
    const b = await loc.boundingBox();
    if (!b) throw new Error(`No box for target ${String(t)}`);
    if (b.y >= VIEWPORT.height - 8 || b.x >= VIEWPORT.width - 8 || b.y + b.height <= 8) throw new Error(`Target off screen: ${String(t)}`);
    // Clip to the viewport: the camera never frames outside the capture.
    const x = Math.max(0, b.x), y = Math.max(0, b.y);
    return {
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(Math.min(VIEWPORT.width, b.x + b.width) - x),
        h: Math.round(Math.min(VIEWPORT.height, b.y + b.height) - y),
    };
}

async function shot(page: Page, dir: string, name: string) {
    await page.mouse.move(-10, -10).catch(() => {}); // no stray hover state unless the step wants it
    await page.screenshot({ path: join(dir, name), type: "jpeg", quality: 90 });
    return name;
}

async function run(page: Page, sb: Storyboard) {
    const dir = join(OUT, sb.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    await page.goto(`${BASE}${sb.route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await settle(page, 1500);
    if (sb.setup) {
        await sb.setup(page);
        await settle(page, 800);
    }
    const overview = await shot(page, dir, "overview.jpg");

    const steps: CapturedStep[] = [];
    for (const [i, s] of sb.steps.entries()) {
        if (s.before) {
            await s.before(page);
            await settle(page, 600);
        }
        const target = await boxOf(page, s.target);
        const before = await shot(page, dir, `s${i + 1}-before.jpg`);
        const loc = resolve(page, s.target);
        const partials: string[] = [];
        if (s.kind === "click") await loc.click();
        else if (s.kind === "hover") await loc.hover();
        else if (s.kind === "select") await loc.selectOption({ label: s.text ?? "" });
        else if (s.kind === "type") {
            await loc.click();
            const text = s.text ?? "";
            const cuts = [0.34, 0.67].map((f) => Math.max(1, Math.round(text.length * f)));
            let typed = 0;
            for (const [k, cut] of cuts.entries()) {
                await page.keyboard.type(text.slice(typed, cut));
                typed = cut;
                await page.waitForTimeout(120);
                partials.push(await shot(page, dir, `s${i + 1}-type${k + 1}.jpg`));
            }
            await page.keyboard.type(text.slice(typed));
        }
        if (typeof s.wait === "string") await page.locator(s.wait).first().waitFor({ state: "visible", timeout: 20_000 });
        await settle(page, typeof s.wait === "number" ? s.wait : 900);
        if (s.kind === "hover") await loc.hover();
        const result = s.result ? await boxOf(page, s.result, !!s.scrollResult) : undefined;
        // Hover steps keep the pointer on the element so the tooltip/menu stays open.
        const after = s.kind === "hover"
            ? (await page.screenshot({ path: join(dir, `s${i + 1}-after.jpg`), type: "jpeg", quality: 90 }), `s${i + 1}-after.jpg`)
            : await shot(page, dir, `s${i + 1}-after.jpg`);
        steps.push({ title: s.title, detail: s.detail, kind: s.kind, before, after, target, result, typed: s.text, partials: partials.length ? partials : undefined });
        console.log(`  ${sb.id} step ${i + 1}: ${s.title}`);
    }

    const box = sb.outcome.target ? await boxOf(page, sb.outcome.target, false) : undefined;
    const image = await shot(page, dir, "outcome.jpg");
    const capture: Capture = {
        id: sb.id, route: sb.route, section: sb.section, title: sb.title, purpose: sb.purpose,
        viewport: VIEWPORT, dsf: DSF, overview, steps,
        outcome: { title: sb.outcome.title, detail: sb.outcome.detail, box, image },
    };
    writeFileSync(join(dir, "capture.json"), JSON.stringify(capture, null, 2));
}

const { browser, page } = await launch();
page.on("pageerror", (e) => console.log("  pageerror:", e.message.slice(0, 160)));
let failed = 0;
for (const sb of boards) {
    console.log(`capture ${sb.id} (${sb.route})`);
    try {
        await run(page, sb);
    } catch (e) {
        failed++;
        console.log(`  FAILED ${sb.id}: ${(e as Error).message.split("\n")[0]}`);
        await page.screenshot({ path: `/var/tmp/capture-fail-${sb.id}.png` }).catch(() => {});
    }
}
await browser.close();

// The video project registers one composition per captured tutorial.
const captured = readdirSync(OUT).filter((d) => existsSync(join(OUT, d, "capture.json"))).sort();
writeFileSync(
    join(here, "../video/src/manifest.generated.ts"),
    `// Generated by capture/capture.ts — ids of the captured tutorials.\nexport const TUTORIAL_IDS: string[] = ${JSON.stringify(captured)};\n`,
);
process.exitCode = failed ? 1 : 0;
