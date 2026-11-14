// Shared Playwright helpers for tutorial captures.
import { createRequire } from "node:module";
import type { Browser, BrowserContext, Page } from "playwright";

// Playwright is preinstalled globally (NODE_PATH); ESM ignores NODE_PATH, CJS honours it.
const require = createRequire(import.meta.url);
export const { chromium } = require("playwright") as typeof import("playwright");

export const BASE = process.env.CAPTURE_BASE_URL ?? "http://localhost:5000";
/** CSS viewport of every capture: 16:9, laptop width, all desktop breakpoints active. */
export const VIEWPORT = { width: 1280, height: 720 };
/** Captures are taken at 2x so the video can zoom up to 2x without blur. */
export const DSF = 2;

export const MANAGER = { email: "manager@demo.example", password: "demo1234" };

export async function launch(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: DSF,
        locale: "fr-FR",
        timezoneId: "Europe/Paris",
        reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await login(page);
    return { browser, context, page };
}

export async function login(page: Page) {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.locator('input[type="email"], input[name="email"]').first().fill(MANAGER.email);
    await page.locator('input[type="password"]').first().fill(MANAGER.password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/manager\//, { timeout: 60_000 });
}

/** Hide transient chrome that has nothing to do with the page being taught. */
export const CAPTURE_CSS = `
  nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; }
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
`;

export async function settle(page: Page, ms = 600) {
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await page.addStyleTag({ content: CAPTURE_CSS }).catch(() => {});
    // Skeletons and spinners: wait until gone (bounded).
    await page
        .waitForFunction(() => !document.querySelector('.cp-spinner, [data-skeleton], .animate-pulse'), null, { timeout: 15_000 })
        .catch(() => {});
    await page.waitForTimeout(ms);
}
