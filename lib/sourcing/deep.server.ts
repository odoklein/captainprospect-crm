import { DEPARTEMENTS, DEPT_NAME, deptFromPostcode, parseLocation } from "./france";
import { normalizeSerper, searchSerperMaps, serperMapsCall, SERPER_PAGE_SIZE } from "./providers.server";
import type {
    ActivityTerm,
    GmapsEvent,
    SourcedLead,
    SourcingDepth,
    SourcingPlan,
    SourcingQuery,
    ZoneCoverage,
    ZonePlan,
} from "./types";

// ============================================
// SOURCING — deep Google Maps engine (Serper only).
//
// Google Maps gives ~60-120 places for one text search, ranked around
// wherever it decides "Paris" is. To go past that, a zone is cut into
// sub-areas (communes from geo.api.gouv.fr, then map tiles over each
// commune's bounding box) and every tile is searched through a GPS viewport.
// A tile that comes back full (every page had 20 places) is split in four and
// searched again, until tiles run dry, the depth allows no more splits, or the
// credit budget is spent. Results outside the requested zone (Maps drifting
// into the next département) are dropped.
// ============================================

type BBox = [w: number, s: number, e: number, n: number];

type Task =
    | { kind: "text"; location: string; pages: number }
    | { kind: "tile"; bbox: BBox; level: number };

interface ZoneWork {
    zone: string;
    seeds: number;
    tasks: Task[];
    note?: string;
    /** False = outside the zone the user asked for. */
    accept: (lead: SourcedLead) => boolean;
}

interface DepthConfig {
    /** Target tile width in km. */
    tileKm: number;
    /** Tiles per commune before the first split (Paris, Lyon…). */
    maxTilesPerCommune: number;
    /** One extra starting tile per this many inhabitants; small towns get one tile and split only if full. */
    popPerTile: number;
    /** Pages per tile; a tile is "full" when all of them came back with 20. */
    pages: number;
    /** How many times a full tile may be split in four. */
    splitLevels: number;
    /** Communes of a département worth their own search. */
    communeMinPop: number;
    communeCap: number;
    /** Communes of a région / France worth their own search (départements are always searched). */
    wideCommuneMinPop: number;
    wideCommuneCap: number;
    defaultBudget: number;
}

const DEPTH: Record<Exclude<SourcingDepth, "standard">, DepthConfig> = {
    deep: {
        tileKm: 4,
        maxTilesPerCommune: 12,
        popPerTile: 40000,
        pages: 2,
        splitLevels: 1,
        communeMinPop: 3000,
        communeCap: 60,
        wideCommuneMinPop: 20000,
        wideCommuneCap: 120,
        defaultBudget: 1500,
    },
    max: {
        tileKm: 2,
        maxTilesPerCommune: 36,
        popPerTile: 12000,
        pages: 3,
        splitLevels: 3,
        communeMinPop: 1000,
        communeCap: 200,
        wideCommuneMinPop: 5000,
        wideCommuneCap: 600,
        defaultBudget: 6000,
    },
};

export const CREDITS_PER_CALL = 3;
const CONCURRENCY = 10;

export function defaultBudget(depth: SourcingDepth): number | undefined {
    return depth === "standard" ? undefined : DEPTH[depth].defaultBudget;
}

// ============================================
// geo.api.gouv.fr
// ============================================

interface GeoCommune {
    nom: string;
    code: string;
    codeDepartement?: string;
    population?: number;
    codesPostaux?: string[];
    bbox?: { coordinates?: number[][][] };
}

const COMMUNE_FIELDS = "nom,code,codeDepartement,population,codesPostaux,bbox";

async function geo<T>(path: string): Promise<T | null> {
    try {
        const res = await fetch(`https://geo.api.gouv.fr${path}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(10000) });
        return res.ok ? ((await res.json()) as T) : null;
    } catch {
        return null;
    }
}

async function findCommune(name: string, deptCode?: string): Promise<GeoCommune | null> {
    const qs = new URLSearchParams({ nom: name, fields: COMMUNE_FIELDS, boost: "population", limit: "1" });
    if (deptCode) qs.set("codeDepartement", deptCode);
    return (await geo<GeoCommune[]>(`/communes?${qs}`))?.[0] ?? null;
}

async function communesOfPostcode(postcode: string): Promise<GeoCommune[]> {
    return (await geo<GeoCommune[]>(`/communes?codePostal=${postcode}&fields=${COMMUNE_FIELDS}`)) ?? [];
}

async function communesOfDept(code: string): Promise<GeoCommune[]> {
    return (await geo<GeoCommune[]>(`/departements/${code}/communes?fields=${COMMUNE_FIELDS}`)) ?? [];
}

function bboxOf(c: GeoCommune): BBox | undefined {
    const ring = c.bbox?.coordinates?.[0];
    if (!ring?.length) return undefined;
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Biggest communes first, above a population floor, capped. */
function topCommunes(list: GeoCommune[], minPop: number, cap: number): GeoCommune[] {
    return list
        .filter((c) => (c.population ?? 0) >= minPop)
        .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
        .slice(0, cap);
}

// ============================================
// Geometry
// ============================================

const KM_PER_DEG_LAT = 110.57;
const kmPerDegLng = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);

function sizeKm([w, s, e, n]: BBox) {
    const lat = (s + n) / 2;
    return { width: (e - w) * kmPerDegLng(lat), height: (n - s) * KM_PER_DEG_LAT, lat };
}

/**
 * Serper viewport ("@lat,lng,zoomz") framing a tile. Measured: at zoom 16 in
 * Paris the 20 places of page 1 spread over ~2.5 km, i.e. about six 256 px
 * map tiles wide, hence the factor 6.
 */
function viewport(b: BBox): string {
    const { width, height, lat } = sizeKm(b);
    const span = Math.max(width, height, 0.3);
    const zoom = Math.min(18, Math.max(10, Math.round(Math.log2((40075 * Math.cos((lat * Math.PI) / 180) * 6) / span))));
    const lng = (b[0] + b[2]) / 2;
    return `@${lat.toFixed(5)},${lng.toFixed(5)},${zoom}z`;
}

/** Cut a box into a grid of ~tileKm tiles, at most maxTiles of them. */
function grid(b: BBox, tileKm: number, maxTiles: number): BBox[] {
    const { width, height } = sizeKm(b);
    let nx = Math.max(1, Math.ceil(width / tileKm));
    let ny = Math.max(1, Math.ceil(height / tileKm));
    if (nx * ny > maxTiles) {
        const f = Math.sqrt((nx * ny) / maxTiles);
        nx = Math.max(1, Math.floor(nx / f));
        ny = Math.max(1, Math.floor(ny / f));
    }
    const [w, s, e, n] = b;
    const dx = (e - w) / nx;
    const dy = (n - s) / ny;
    const out: BBox[] = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out.push([w + i * dx, s + j * dy, w + (i + 1) * dx, s + (j + 1) * dy]);
    return out;
}

const quarter = ([w, s, e, n]: BBox): BBox[] => {
    const mx = (w + e) / 2;
    const my = (s + n) / 2;
    return [
        [w, s, mx, my],
        [mx, s, e, my],
        [w, my, mx, n],
        [mx, my, e, n],
    ];
};

// ============================================
// Zone planning
// ============================================

const keepAll = () => true;
const inDepts = (codes: Set<string>) => (l: SourcedLead) => {
    const d = deptFromPostcode(l.postalCode);
    return !d || codes.has(d);
};
const inPostcodes = (codes: Set<string>) => (l: SourcedLead) => codes.size === 0 || !l.postalCode || codes.has(l.postalCode);

const textTask = (location: string, pages: number): Task => ({ kind: "text", location, pages });

const deptText = (code: string, pages: number): Task => textTask(`${DEPT_NAME[code]} (${code})`, pages);

/** Starting tiles over a commune: as many as its size allows, no more than its population justifies. */
function communeTiles(c: GeoCommune, cfg: DepthConfig, cap = cfg.maxTilesPerCommune): Task[] {
    const b = bboxOf(c);
    if (!b) return [textTask(`${c.nom} (${c.codeDepartement ?? ""})`, cfg.pages)];
    const byPop = Math.max(1, Math.ceil((c.population ?? 0) / cfg.popPerTile));
    return grid(b, cfg.tileKm, Math.min(cap, byPop)).map((bbox) => ({ kind: "tile", bbox, level: 0 }));
}

async function planDepartements(zone: string, codes: string[], cfg: DepthConfig, wide: boolean): Promise<ZoneWork> {
    const tasks: Task[] = codes.map((code) => deptText(code, cfg.pages));
    const lists = await Promise.all(codes.map(communesOfDept));
    const all = lists.flat();
    const picked = wide
        ? topCommunes(all, cfg.wideCommuneMinPop, cfg.wideCommuneCap)
        : topCommunes(all, cfg.communeMinPop, cfg.communeCap);
    // Wide zones: a few tiles per city, the rest of the budget goes to breadth.
    for (const c of picked) tasks.push(...communeTiles(c, cfg, wide ? Math.min(4, cfg.maxTilesPerCommune) : undefined));
    const note = all.length === 0 ? "Communes introuvables : recherche par département seulement" : undefined;
    return { zone, seeds: codes.length + picked.length, tasks, note, accept: inDepts(new Set(codes)) };
}

async function planZone(location: string, depth: SourcingDepth, perSearch: number): Promise<ZoneWork> {
    const loc = parseLocation(location);
    const standardPages = Math.ceil(perSearch / SERPER_PAGE_SIZE);

    if (depth === "standard") {
        // Same single text search as before, but still keep results inside the zone.
        const task = textTask(location, standardPages);
        switch (loc.kind) {
            case "departement":
                return { zone: location, seeds: 1, tasks: [task], accept: inDepts(new Set([loc.code])) };
            case "region":
                return { zone: location, seeds: 1, tasks: [task], accept: inDepts(new Set(loc.region.departements.map((d) => d.code))) };
            case "ville": {
                const c = await findCommune(loc.name, loc.deptCode);
                return { zone: location, seeds: 1, tasks: [task], accept: c?.codesPostaux?.length ? inPostcodes(new Set(c.codesPostaux)) : keepAll };
            }
            default:
                return { zone: location, seeds: 1, tasks: [task], accept: /^\d{5}$/.test(loc.name) ? inPostcodes(new Set([loc.name])) : keepAll };
        }
    }

    const cfg = DEPTH[depth];
    switch (loc.kind) {
        case "departement":
            return planDepartements(location, [loc.code], cfg, false);
        case "region":
            return planDepartements(location, loc.region.departements.map((d) => d.code), cfg, true);
        case "pays":
            if (loc.iso === "FR") return planDepartements(location, DEPARTEMENTS.map((d) => d.code), cfg, true);
            return {
                zone: location,
                seeds: 1,
                tasks: [textTask(location, 3)],
                accept: keepAll,
                note: "Hors de France, pas de découpage : une recherche simple",
            };
        case "ville": {
            const c = await findCommune(loc.name, loc.deptCode);
            if (!c) return { zone: location, seeds: 1, tasks: [textTask(location, 3)], accept: keepAll, note: "Commune introuvable : recherche simple" };
            return { zone: location, seeds: 1, tasks: communeTiles(c, cfg), accept: inPostcodes(new Set(c.codesPostaux ?? [])) };
        }
        default: {
            const v = loc.name.toUpperCase();
            if (DEPT_NAME[v]) return planDepartements(location, [v], cfg, false);
            if (/^\d{5}$/.test(v)) {
                const communes = await communesOfPostcode(v);
                // A commune with its own single postcode can be tiled; a Paris
                // arrondissement can't (its box is the whole city), so search it
                // by text and keep that postcode only.
                const own = communes.filter((c) => c.codesPostaux?.length === 1);
                const tasks = own.length ? own.flatMap((c) => communeTiles(c, cfg)) : [textTask(location, 3)];
                return { zone: location, seeds: Math.max(1, own.length), tasks, accept: inPostcodes(new Set([v])) };
            }
            const c = await findCommune(loc.name);
            if (!c) return { zone: location, seeds: 1, tasks: [textTask(location, 3)], accept: keepAll, note: "Lieu introuvable : recherche simple" };
            return { zone: location, seeds: 1, tasks: communeTiles(c, cfg), accept: inPostcodes(new Set(c.codesPostaux ?? [])) };
        }
    }
}

async function planAll(query: SourcingQuery): Promise<{ plan: SourcingPlan; work: ZoneWork[] }> {
    const depth = query.depth ?? "standard";
    const work = await Promise.all(query.locations.map((l) => planZone(l, depth, query.perSearch)));
    const n = query.activities.length;
    const zones: ZonePlan[] = work.map((w) => ({ zone: w.zone, seeds: w.seeds, tiles: w.tasks.length, note: w.note }));
    const searches = work.reduce((sum, w) => sum + w.tasks.length, 0) * n;
    const budget = depth === "standard" ? undefined : (query.creditBudget ?? defaultBudget(depth));
    const rawMax = work.reduce((sum, w) => sum + w.tasks.reduce((total, task) => {
        if (task.kind === "text") return total + task.pages;
        const cfg = DEPTH[depth as "deep" | "max"];
        return total + cfg.pages * ((4 ** (cfg.splitLevels + 1) - 1) / 3);
    }, 0), 0) * n * CREDITS_PER_CALL;
    return {
        work,
        plan: {
            depth,
            zones,
            searches,
            minCredits: Math.min(searches * CREDITS_PER_CALL, budget ?? Infinity),
            maxCredits: budget ? Math.min(rawMax, budget) : rawMax,
            budget,
        },
    };
}

export async function planMaps(query: SourcingQuery): Promise<SourcingPlan> {
    return (await planAll(query)).plan;
}

// ============================================
// Run
// ============================================

interface Job {
    zone: number;
    activity: ActivityTerm;
    task: Task;
}

export async function runMaps(query: SourcingQuery, emit: (e: GmapsEvent) => void, signal: AbortSignal): Promise<void> {
    const { plan, work } = await planAll(query);
    emit({ t: "plan", plan });

    const depth = plan.depth;
    const cfg = depth === "standard" ? null : DEPTH[depth];
    const budgetCalls = plan.budget ? Math.floor(plan.budget / CREDITS_PER_CALL) : Infinity;

    // Round-robin over zones, then activities inside each task, so a budget
    // that runs out trims the small communes of every zone and activity
    // rather than starving the last ones entirely.
    const perZone = work.map((w, zone) => w.tasks.flatMap((task) => query.activities.map((activity) => ({ zone, activity, task }))));
    const queue: Job[] = [];
    for (let i = 0; perZone.some((list) => i < list.length); i++) for (const list of perZone) if (i < list.length) queue.push(list[i]);
    const coverage: ZoneCoverage[] = work.map((w) => ({ zone: w.zone, searches: 0, found: 0, saturated: 0, splits: 0, skipped: 0 }));
    const seen = new Set<string>();
    let calls = 0;
    let done = 0;
    let found = 0;
    let outside = 0;
    let budgetHit = false;
    let failures = 0;
    let lastError = "";
    let fatal = false;
    let active = 0;

    const onCall = () => {
        if (signal.aborted || fatal) return false;
        if (calls >= budgetCalls) {
            budgetHit = true;
            return false;
        }
        calls++;
        return true;
    };

    const keep = (zone: number, leads: SourcedLead[]) => {
        const fresh: SourcedLead[] = [];
        for (const l of leads) {
            if (!work[zone].accept(l)) {
                outside++;
                continue;
            }
            if (seen.has(l.id)) continue;
            seen.add(l.id);
            fresh.push(l);
        }
        coverage[zone].found += fresh.length;
        found += fresh.length;
        if (fresh.length) emit({ t: "leads", leads: fresh });
    };

    const runTile = async (job: Job & { task: { kind: "tile" } }) => {
        const ll = viewport(job.task.bbox);
        const pages = cfg!.pages;
        let full = true;
        for (let page = 1; page <= pages; page++) {
            if (!onCall()) {
                coverage[job.zone].skipped++;
                full = false;
                break;
            }
            const { places } = await serperMapsCall({ q: job.activity.label, gl: "fr", page, ll }, signal);
            keep(job.zone, places.filter((p) => p.title).map((p) => normalizeSerper(p, "FR")));
            if (places.length < SERPER_PAGE_SIZE) {
                full = false;
                break;
            }
        }
        if (!full) return;
        if (job.task.level < cfg!.splitLevels) {
            coverage[job.zone].splits++;
            for (const bbox of quarter(job.task.bbox)) queue.push({ ...job, task: { kind: "tile", bbox, level: job.task.level + 1 } });
        } else {
            coverage[job.zone].saturated++;
        }
    };

    const runText = async (job: Job & { task: { kind: "text" } }) => {
        const pagesLeft = Math.max(0, Math.min(job.task.pages, budgetCalls - calls));
        if (pagesLeft === 0) {
            budgetHit = true;
            coverage[job.zone].skipped++;
            return;
        }
        const leads = await searchSerperMaps({
            activity: job.activity,
            location: job.task.location,
            perSearch: pagesLeft * SERPER_PAGE_SIZE,
            signal,
            onCall,
        });
        keep(job.zone, leads);
        // Standard mode keeps the old signal: a full last page means Google had more.
        if (depth === "standard" && leads.length >= job.task.pages * SERPER_PAGE_SIZE) coverage[job.zone].saturated++;
    };

    const worker = async () => {
        while (queue.length > 0 && !signal.aborted && !fatal) {
            const job = queue.shift()!;
            if (calls >= budgetCalls) {
                budgetHit = true;
                coverage[job.zone].skipped++;
                done++;
                continue;
            }
            coverage[job.zone].searches++;
            active++;
            try {
                if (job.task.kind === "tile") await runTile(job as Job & { task: { kind: "tile" } });
                else await runText(job as Job & { task: { kind: "text" } });
            } catch (e) {
                if (signal.aborted) break;
                failures++;
                coverage[job.zone].skipped++;
                lastError = e instanceof Error ? e.message : "échec";
                // Bad key / no credits: every call will fail the same way, stop now.
                if (/Serper (401|402|403)|SERPER_API_KEY/.test(lastError)) {
                    fatal = true;
                    queue.length = 0;
                    emit({ t: "error", message: lastError });
                    return;
                }
                if (failures <= 5) emit({ t: "warning", message: `${job.activity.label} · ${work[job.zone].zone} : ${lastError}` });
            }
            finally {
                active--;
            }
            done++;
            emit({ t: "progress", done, total: done + queue.length + active, calls, found, outside });
        }
    };

    // Workers may finish while others still push split tiles; loop until the queue is really empty.
    while (queue.length > 0 && !signal.aborted && !fatal) {
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    }

    if (fatal || signal.aborted) return;
    emit({ t: "progress", done, total: done, calls, found, outside });
    if (failures > 5) emit({ t: "warning", message: `${failures - 5} autres recherches en échec (${lastError})` });
    if (found === 0 && failures > 0 && failures === done) {
        emit({ t: "error", message: lastError });
        return;
    }
    emit({ t: "done", calls, credits: calls * CREDITS_PER_CALL, coverage, outside, budgetHit });
}
