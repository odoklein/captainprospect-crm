// Contract between the capture script (Playwright, real UI) and the video.
// capture/capture.ts writes public/captures/<id>/capture.json in this shape.

export type Box = { x: number; y: number; w: number; h: number };

export type StepKind = "click" | "hover" | "type" | "select" | "point";

export type CapturedStep = {
    /** Short imperative caption, e.g. « Ouvrez un rendez-vous ». */
    title: string;
    /** One line on why it matters / what changes. */
    detail: string;
    kind: StepKind;
    /** Screenshot before the action (file in the capture folder). */
    before: string;
    /** Screenshot once the UI has settled after the action. */
    after: string;
    /** Where the cursor goes, in CSS px of the capture viewport. */
    target: Box;
    /** What changed and deserves the viewer's eye afterwards (optional). */
    result?: Box;
    /** Text typed by a `type` step, or the option label chosen by a `select` step. */
    typed?: string;
    /** `type` steps: the focused empty field, then one screenshot per character typed. */
    partials?: string[];
    /** Real hover state of the target, taken with the pointer on it. */
    hover?: string;
    /** `select` steps: labels of the options offered. */
    options?: string[];
    /** The page was scrolled before this step (its first screen differs from the previous one). */
    scrolled?: boolean;
    /** The page scrolled to show the result (new content below the fold). */
    scrolledAfter?: boolean;
};

export type Capture = {
    id: string;
    route: string;
    section: string;
    title: string;
    purpose: string;
    viewport: { width: number; height: number };
    /** Scale of the screenshot files relative to the CSS viewport. */
    dsf: number;
    overview: string;
    steps: CapturedStep[];
    outcome: { title: string; detail: string; box?: Box; image: string };
};
