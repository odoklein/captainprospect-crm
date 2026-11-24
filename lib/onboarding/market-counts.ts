// ============================================
// MARKET COUNTS — "X entreprises · Y décideurs" for the mission brief, from the
// agency's own base (this instance's companies and contacts), per département.
//
// Server-only. One grouped query reads every company once and buckets it by
// postcode prefix × sector × size (and contacts by role family); the result,
// a few thousand aggregate rows, is cached per instance for 15 minutes and
// served stale while it refreshes. Each request only folds that cube with
// the client's criteria, so typing never reaches the database. Nothing but
// counts ever leaves this module: no names, no emails, no ids.
//
// Why a scan: postcodes live in Company.customData (import columns), so no
// index can serve a per-département count. Approved trade-off: no migration,
// an 8 s statement timeout, at most one scan per 15 minutes.
//
//   npx tsx --test lib/onboarding/market-counts.pglite.test.ts
// ============================================

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SECTOR_LABEL, SIZES } from "@/lib/client-onboarding/questionnaire";
import {
    ADDRESS_KEY, FOLD_FROM, FOLD_TO, FRANCE_NAMES, NAF_KEY, NAF_SECTIONS, NOT_DECIDER, POSTCODE_KEY, ROLE_FAMILIES, ROLE_KEYS,
    SECTOR_PATTERNS, SIZE_KEY, THOUSANDS_RE,
} from "./market-classify";
import { departementFromPrefix } from "./territory";

/** Counts under this are shown as « moins de 20 ». */
export const SMALL_COUNT = 20;
const TTL_MS = 15 * 60_000;

/** JS → PostgreSQL regex: the shared subset only differs on word boundaries. */
const pgRe = (pattern: string) => pattern.replace(/\\b/g, "\\y");
/** Our own constants (section letters, size and role keys), never user input. */
function lit(value: string | number): Prisma.Sql {
    if (typeof value === "number") return Prisma.raw(String(Math.trunc(value)));
    if (!/^[\w+-]+$/.test(value)) throw new Error(`Unsafe SQL literal: ${value}`);
    return Prisma.raw(`'${value}'`);
}
const fold = (expr: Prisma.Sql) => Prisma.sql`lower(translate(${expr}, ${FOLD_FROM}, ${FOLD_TO}))`;
const OBJ = Prisma.sql`(CASE WHEN jsonb_typeof(c."customData") = 'object' THEN c."customData" ELSE '{}'::jsonb END)`;

/** First 3 digits of the company's French postcode (customData postcode column, else a 5-digit run in its address). */
const POSTCODE_PREFIX = Prisma.sql`CASE WHEN ${fold(Prisma.sql`btrim(coalesce(c.country, ''))`)} = ANY(${FRANCE_NAMES}::text[]) THEN (
    SELECT left(lpad(p.pc, 5, '0'), 3) FROM (
        SELECT regexp_replace(e.value, ${"[[:space:]. ]"}, '', 'g') AS pc, 1 AS rank
          FROM jsonb_each_text(${OBJ}) e WHERE e.key ~* ${POSTCODE_KEY}
        UNION ALL
        SELECT substring(e.value from ${"(?:^|\\D)(\\d{5})(?:\\D|$)"}), 2
          FROM jsonb_each_text(${OBJ}) e WHERE e.key ~* ${ADDRESS_KEY}
    ) p WHERE p.pc ~ ${"^\\d{4,5}$"} ORDER BY p.rank LIMIT 1
) END`;

const NAF_CASE = Prisma.join(NAF_SECTIONS.map(([section, from, to]) => Prisma.sql`WHEN n.d BETWEEN ${lit(from)} AND ${lit(to)} THEN ${lit(section)}`), " ");
const INDUSTRY_CASE = Prisma.join(SECTOR_PATTERNS.map((s) => Prisma.sql`WHEN i.t ~* ${pgRe(s.pattern)} THEN ${lit(s.key)}`), " ");
const SECTOR = Prisma.sql`COALESCE(
    (SELECT CASE ${NAF_CASE} END FROM (
        SELECT substring(e.value from ${"^\\s*(\\d{2})"})::int AS d FROM jsonb_each_text(${OBJ}) e
         WHERE e.key ~* ${NAF_KEY} AND e.value ~ ${"^\\s*\\d{2}"} LIMIT 1) n),
    (SELECT CASE ${INDUSTRY_CASE} END FROM (SELECT ${fold(Prisma.sql`coalesce(c.industry, '')`)} AS t) i)
)`;

const SIZE_CASE = Prisma.sql`CASE WHEN s.v IS NULL THEN NULL WHEN s.v < 10 THEN ${lit("1-9")} WHEN s.v < 50 THEN ${lit("10-49")}
    WHEN s.v < 250 THEN ${lit("50-249")} WHEN s.v < 1000 THEN ${lit("250-999")} ELSE ${lit("1000+")} END`;
const SIZE = Prisma.sql`(SELECT ${SIZE_CASE} FROM (
    SELECT CASE WHEN x.n2 IS NOT NULL AND x.n2 > x.n1 THEN sqrt(x.n1 * x.n2) ELSE x.n1 END AS v FROM (
        SELECT substring(z.t from ${"(\\d+)"})::numeric AS n1, substring(z.t from ${"\\d+\\D+(\\d+)"})::numeric AS n2 FROM (
            SELECT regexp_replace(lower(coalesce(nullif(btrim(c.size), ''),
                (SELECT e.value FROM jsonb_each_text(${OBJ}) e WHERE e.key ~* ${SIZE_KEY} LIMIT 1), '')), ${THOUSANDS_RE}, ${"\\1\\2"}, 'g') AS t
        ) z
    ) x
) s)`;

const ROLE_CASE = Prisma.join(ROLE_FAMILIES.map((r) => Prisma.sql`WHEN k.t ~* ${pgRe(r.pattern)} THEN ${lit(r.key)}`), " ");

/** Every counted company with its postcode prefix, sector and size (the cube's inner scan). */
export function companyBucketsSql(): Prisma.Sql {
    return Prisma.sql`SELECT c.id, ${POSTCODE_PREFIX} AS pc3, ${SECTOR} AS sector, ${SIZE} AS size
          FROM "Company" c
         WHERE c."excludedAt" IS NULL AND c."linkedFromId" IS NULL`;
}

/**
 * The single grouped query: one row per (postcode prefix, sector, size) with its
 * company count, plus one row per (…, role family) with its decision-maker count.
 * Excluded companies/contacts and dedup copies (linkedFromId) are left out.
 */
export function marketCubeSql(): Prisma.Sql {
    return Prisma.sql`WITH co AS (${companyBucketsSql()}), ct AS (
        SELECT k."companyId", CASE WHEN k.t ~* ${pgRe(NOT_DECIDER)} THEN NULL ${ROLE_CASE} END AS role
          FROM (SELECT "companyId", ${fold(Prisma.sql`title`)} AS t FROM "Contact"
                 WHERE "excludedAt" IS NULL AND title IS NOT NULL AND btrim(title) <> '') k
    )
    SELECT 'co' AS kind, co.pc3, co.sector, co.size, NULL::text AS role, count(*)::int AS n FROM co GROUP BY co.pc3, co.sector, co.size
    UNION ALL
    SELECT 'ct', co.pc3, co.sector, co.size, ct.role, count(*)::int FROM ct JOIN co ON co.id = ct."companyId"
     WHERE ct.role IS NOT NULL GROUP BY co.pc3, co.sector, co.size, ct.role`;
}

export interface CubeRow { kind: "co" | "ct"; pc3: string | null; sector: string | null; size: string | null; role: string | null; n: number }

interface Cell { dept: string | null; sector: string | null; size: string | null; role: string | null; n: number }

export interface MarketCube {
    companies: Cell[];
    contacts: Cell[];
    builtAt: number;
}

/** Postcode prefixes → départements (several prefixes share one), unlocated as null. */
export function cubeFromRows(rows: readonly CubeRow[], builtAt = Date.now()): MarketCube {
    const merge = (kind: CubeRow["kind"]) => {
        const cells = new Map<string, Cell>();
        for (const row of rows) {
            if (row.kind !== kind) continue;
            const dept = departementFromPrefix(row.pc3) ?? null;
            const key = `${dept}|${row.sector}|${row.size}|${row.role}`;
            const cell = cells.get(key);
            if (cell) cell.n += Number(row.n);
            else cells.set(key, { dept, sector: row.sector, size: row.size, role: row.role, n: Number(row.n) });
        }
        return [...cells.values()];
    };
    return { companies: merge("co"), contacts: merge("ct"), builtAt };
}

export interface MarketCriteria {
    sectors: string[];
    sizes: string[];
    roles: string[];
}

export type Pair = [companies: number, deciders: number];

export interface MarketCounts {
    /** Per département code, only where something matches. */
    departements: Record<string, Pair>;
    /** French (or country-less) companies with no usable postcode. */
    unlocated: Pair;
}

const SIZE_KEYS = new Set<string>(SIZES.map((s) => s.key));
const ROLE_SET = new Set<string>(ROLE_KEYS);

/** Query string → known keys only (anything else is dropped, never echoed). */
export function parseCriteria(params: URLSearchParams): MarketCriteria {
    const list = (name: string, allowed: (v: string) => boolean) =>
        [...new Set((params.get(name) ?? "").split(",").map((v) => v.trim()).filter(Boolean))].filter(allowed).slice(0, 30).sort();
    return {
        sectors: list("sectors", (v) => Boolean(SECTOR_LABEL[v])),
        sizes: list("sizes", (v) => SIZE_KEYS.has(v)),
        roles: list("roles", (v) => ROLE_SET.has(v)),
    };
}

/**
 * The cube folded with the client's non-geographic criteria. An empty criterion
 * means « any »; once a sector or size is picked, companies we could not classify
 * no longer count. Without roles, every recognised decision-maker counts.
 */
export function countsFor(cube: MarketCube, criteria: MarketCriteria): MarketCounts {
    const sectors = new Set(criteria.sectors);
    const sizes = new Set(criteria.sizes);
    const roles = new Set(criteria.roles);
    const match = (cell: Cell) =>
        (!sectors.size || (cell.sector !== null && sectors.has(cell.sector))) && (!sizes.size || (cell.size !== null && sizes.has(cell.size)));
    const departements: Record<string, Pair> = {};
    const unlocated: Pair = [0, 0];
    const add = (dept: string | null, slot: 0 | 1, n: number) => {
        if (!dept) { unlocated[slot] += n; return; }
        (departements[dept] ??= [0, 0])[slot] += n;
    };
    for (const cell of cube.companies) if (match(cell)) add(cell.dept, 0, cell.n);
    for (const cell of cube.contacts) if (match(cell) && (!roles.size || roles.has(cell.role ?? ""))) add(cell.dept, 1, cell.n);
    return { departements, unlocated };
}

// ── Cache: one scan per instance per 15 minutes, stale while it refreshes ───

let cached: MarketCube | null = null;
let building: Promise<MarketCube> | null = null;

async function buildCube(db: PrismaClient): Promise<MarketCube> {
    const rows = await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '8s'");
        return tx.$queryRaw<CubeRow[]>(marketCubeSql());
    }, { maxWait: 2_000, timeout: 10_000 });
    return cubeFromRows(rows);
}

export async function marketCube(db: PrismaClient = prisma, now = Date.now()): Promise<MarketCube> {
    if (cached && now - cached.builtAt < TTL_MS) return cached;
    if (!building) {
        building = buildCube(db)
            .then((cube) => (cached = cube))
            .finally(() => { building = null; });
    }
    if (cached) {
        building.catch(() => undefined); // a failed refresh keeps serving the last cube
        return cached;
    }
    return building;
}

/** Tests only. */
export function resetMarketCube() {
    cached = null;
    building = null;
}
