// Storyboard format: one file per manager page in ./storyboards.
// Text is written for the manager, in French, and must describe verified behaviour only.
import type { Locator, Page } from "playwright";

/** A Playwright selector string, or a function returning a locator. */
export type Target = string | ((page: Page) => Locator);

export type Step = {
    /** Caption headline, imperative, ≤ 6 words. */
    title: string;
    /** One line: what changes and why it matters. */
    detail: string;
    kind: "click" | "hover" | "type" | "select" | "point";
    target: Target;
    /** `type` steps: text entered in the target. `select` steps: label of the option chosen. */
    text?: string;
    /** Region to look at once the action has settled (defaults to none: camera eases back). */
    result?: Target;
    /** Scroll the result into view before the "after" screenshot (new rows below the fold). */
    scrollResult?: boolean;
    /** Extra wait after the action: ms, or a selector that must appear. */
    wait?: number | string;
    /** Runs before the step's "before" screenshot (scroll, close a toast…). */
    before?: (page: Page) => Promise<void>;
};

export type Storyboard = {
    id: string;
    /** Route captured. */
    route: string;
    /** Route patterns where the launcher offers this tutorial ("*" = one segment, "**" = any suffix). */
    match: string[];
    /** Section of the manager navigation, shown as eyebrow. */
    section: string;
    title: string;
    /** Intro: what the page is for, one or two sentences. */
    purpose: string;
    /** After navigation: dismiss first-visit guides, pick a stable state. */
    setup?: (page: Page) => Promise<void>;
    steps: Step[];
    outcome: { title: string; detail: string; target?: Target };
};

export const resolve = (page: Page, t: Target): Locator => (typeof t === "string" ? page.locator(t) : t(page)).first();
