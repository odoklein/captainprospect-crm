/** One manager tutorial, as listed in registry.generated.ts (kept tiny: it ships in the shell bundle). */
export interface TutorialEntry {
    id: string;
    title: string;
    /** Manager navigation section, e.g. « Rendez-vous ». */
    section: string;
    /** Routes offering this tutorial: "*" = one path segment, "**" = any suffix. */
    match: string[];
    durationSec: number;
    /** Content hash of the video, for cache busting. */
    version: string;
}

/** public/tutorials/<id>.json, fetched when the player opens. */
export interface TutorialMeta {
    id: string;
    title: string;
    section: string;
    purpose: string;
    durationSec: number;
    chapters: { label: string; title: string; detail: string; start: number }[];
}

export const tutorialAsset = (t: Pick<TutorialEntry, "id" | "version">, ext: "mp4" | "jpg" | "vtt" | "json") =>
    `/tutorials/${t.id}.${ext}?v=${t.version}`;
