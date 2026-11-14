import { TUTORIALS } from "./registry.generated";
import type { TutorialEntry } from "./types";

/** "path?param" requires that query parameter to be present (e.g. the mission workspace,
 *  which lives on /manager/clients?mission=…). */
function matches(pattern: string, path: string, params?: URLSearchParams | null): boolean {
    const [route, query] = pattern.split("?");
    if (query && !query.split("&").every((k) => params?.has(k))) return false;
    const p = route.split("/").filter(Boolean);
    const s = path.split("/").filter(Boolean);
    for (let i = 0; i < p.length; i++) {
        if (p[i] === "**") return true;
        if (i >= s.length) return false;
        if (p[i] !== "*" && p[i] !== s[i]) return false;
    }
    return p.length === s.length;
}

/** Most specific pattern wins: more literal segments first, then fewer wildcards. */
function specificity(pattern: string): number {
    const [route, query] = pattern.split("?");
    const segs = route.split("/").filter(Boolean);
    return segs.filter((x) => x !== "*" && x !== "**").length * 10 - segs.filter((x) => x === "**").length + (query ? 5 : 0);
}

/** The tutorial for a pathname (and its query parameters), if any. */
export function findTutorial(pathname: string, list: TutorialEntry[] = TUTORIALS, params?: URLSearchParams | null): TutorialEntry | null {
    let best: TutorialEntry | null = null;
    let bestScore = -Infinity;
    for (const t of list) {
        for (const m of t.match) {
            if (!matches(m, pathname, params)) continue;
            const score = specificity(m);
            if (score > bestScore) {
                best = t;
                bestScore = score;
            }
        }
    }
    return best;
}
