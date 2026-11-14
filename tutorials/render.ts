// npx tsx render.ts [id ...] — renders captured tutorials and publishes them to the CRM:
//   public/tutorials/<id>.mp4   H.264, CRF 29, faststart, no audio track
//   public/tutorials/<id>.jpg   poster (title card)
//   public/tutorials/<id>.vtt   French captions (WebVTT), same text as the caption band
//   public/tutorials/<id>.json  chapters + transcript for the in-app player
//   lib/tutorials/registry.generated.ts   route → tutorial mapping (tiny, client-safe)
// Rendering runs here, never in the app runtime.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STORYBOARDS } from "./capture/storyboards";
import { FPS, captions, chapters, totalFrames } from "./video/src/timeline";
import type { Capture } from "./video/src/types";

const here = dirname(fileURLToPath(import.meta.url));
const VIDEO = join(here, "video");
const APP = join(here, "..");
const PUBLIC = join(APP, "public/tutorials");
const TMP = join(VIDEO, "out/raw");
mkdirSync(PUBLIC, { recursive: true });
mkdirSync(TMP, { recursive: true });

// Remotion's own browser download (remotion.media) is not reachable from every environment;
// fall back to a local headless shell when one is configured.
const BROWSER = process.env.REMOTION_BROWSER;
const browserArgs = BROWSER ? [`--browser-executable=${BROWSER}`] : [];

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
const registryOnly = args.includes("--registry-only");

const loadCapture = (id: string): Capture | null => {
    const p = join(VIDEO, "public/captures", id, "capture.json");
    return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Capture) : null;
};

const ts = (ms: number) => {
    const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000), r = ms % 1000;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
};

function vtt(c: Capture) {
    const cues = captions(c).map((cap, i) => `${i + 1}\n${ts(cap.startMs)} --> ${ts(cap.endMs)}\n${cap.text}`);
    return `WEBVTT\nKind: captions\nLanguage: fr\n\n${cues.join("\n\n")}\n`;
}

function render(c: Capture) {
    const raw = join(TMP, `${c.id}.mp4`);
    const remotion = (...a: string[]) => execFileSync("npx", ["remotion", ...a, ...browserArgs], { cwd: VIDEO, stdio: ["ignore", "ignore", "inherit"] });
    remotion("render", c.id, raw, "--codec=h264", "--crf=18", "--jpeg-quality=95", "--concurrency=4");
    const out = join(PUBLIC, `${c.id}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-c:v", "libx264", "-preset", "veryslow", "-tune", "stillimage", "-crf", "29", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out]);
    // Poster: the title card, once its text has settled.
    const still = join(TMP, `${c.id}-poster.png`);
    remotion("still", c.id, still, "--frame=48");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", still, "-vf", "scale=1280:720", "-q:v", "5", join(PUBLIC, `${c.id}.jpg`)]);
    writeFileSync(join(PUBLIC, `${c.id}.vtt`), vtt(c));
    rmSync(raw, { force: true });
    rmSync(still, { force: true });
}

/** Text lives in the storyboards: copy it onto the capture so a wording change only needs a re-render. */
function syncText(c: Capture, sb: (typeof STORYBOARDS)[number]): Capture {
    if (sb.steps.length !== c.steps.length) throw new Error(`${sb.id}: storyboard has ${sb.steps.length} steps, capture has ${c.steps.length} — recapture it`);
    const next: Capture = {
        ...c, title: sb.title, section: sb.section, purpose: sb.purpose,
        steps: c.steps.map((st, i) => ({ ...st, title: sb.steps[i].title, detail: sb.steps[i].detail })),
        outcome: { ...c.outcome, title: sb.outcome.title, detail: sb.outcome.detail },
    };
    for (const t of [next.title, ...next.steps.map((x) => x.title), next.outcome.title]) if (t.length > 46) throw new Error(`${sb.id}: title too long for the caption band: « ${t} »`);
    for (const t of [...next.steps.map((x) => x.detail), next.outcome.detail]) if (t.length > 104) throw new Error(`${sb.id}: detail too long for the caption band (${t.length}/104): « ${t} »`);
    writeFileSync(join(VIDEO, "public/captures", c.id, "capture.json"), JSON.stringify(next, null, 2));
    return next;
}

const published: { id: string; title: string; section: string; match: string[]; durationSec: number; version: string; bytes: number }[] = [];
for (const sb of STORYBOARDS) {
    const captured = loadCapture(sb.id);
    if (!captured) {
        console.log(`skip ${sb.id}: not captured`);
        continue;
    }
    const c = syncText(captured, sb);
    if (!registryOnly && (!only.length || only.includes(sb.id))) {
        const t = Date.now();
        render(c);
        console.log(`rendered ${sb.id} in ${((Date.now() - t) / 1000).toFixed(0)} s`);
    }
    const mp4 = join(PUBLIC, `${sb.id}.mp4`);
    if (!existsSync(mp4)) continue;
    const durationSec = Math.round(totalFrames(c) / FPS);
    const chs = chapters(c);
    writeFileSync(
        join(PUBLIC, `${sb.id}.json`),
        JSON.stringify(
            {
                id: sb.id, title: c.title, section: c.section, purpose: c.purpose, durationSec,
                chapters: chs.map((ch) => ({ label: ch.label, title: ch.title, detail: ch.detail, start: Math.round(ch.startMs / 100) / 10 })),
            },
            null, 2,
        ) + "\n",
    );
    const version = createHash("sha1").update(readFileSync(mp4)).digest("hex").slice(0, 8);
    published.push({ id: sb.id, title: c.title, section: c.section, match: sb.match, durationSec, version, bytes: statSync(mp4).size });
}

writeFileSync(
    join(APP, "lib/tutorials/registry.generated.ts"),
    `// Generated by tutorials/render.ts — do not edit by hand. Source: tutorials/capture/storyboards.
import type { TutorialEntry } from "./types";

export const TUTORIALS: TutorialEntry[] = ${JSON.stringify(published.map(({ bytes: _b, ...e }) => e), null, 4)};
`,
);
for (const p of published) console.log(`${p.id.padEnd(22)} ${String(p.durationSec).padStart(3)} s  ${(p.bytes / 1024 / 1024).toFixed(2)} MB`);
