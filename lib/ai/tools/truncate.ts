/**
 * Structured truncation of oversized tool results.
 *
 * A CRM read can return thousands of rows. Cutting the serialised text at N
 * characters used to hand the model a broken JSON string: the fact extractor
 * found nothing in it and the verifier flagged every true figure as
 * "non vérifié". Here the largest arrays are sliced instead, so the result
 * stays valid JSON, the sibling scalars (totals, period, next_cursor) survive
 * untouched, and a `_truncated` marker on the parent object tells the model
 * what was cut and how to page.
 */

export interface TruncationInfo {
    /** JSONPath-like location of the sliced array: "$.data.items", "$" for the root. */
    path: string;
    kept: number;
    total: number;
}

export interface TruncationResult {
    value: unknown;
    truncated: TruncationInfo[] | null;
}

export const TRUNCATION_KEY = "_truncated";
export const TRUNCATION_NOTE = "Résultat coupé : relance avec un limit plus petit, des filtres ou le next_cursor.";

const CYCLE_MARKER = "[cycle]";
/** Room kept under the cap for the marker itself and the envelope the caller adds. */
const MARGIN = 400;
/** Arrays deeper than this are not worth hunting: the typical payload keeps its rows at $.items or $.data.rows. */
const MAX_ARRAY_DEPTH = 3;
const MAX_PASSES = 3;

type Json = Record<string, unknown>;

interface Candidate {
    array: unknown[];
    path: string;
    /** Nearest plain-object ancestor, which receives the marker. Null = the array is the root. */
    holder: Json | null;
    /** Where the array hangs, so the prefix can be swapped in. Null = root. */
    parent: { container: Json | unknown[]; key: string | number } | null;
    size: number;
}

function isPlainObject(value: unknown): value is Json {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const proto: unknown = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function sizeOf(value: unknown): number {
    const text = JSON.stringify(value);
    return text === undefined ? 4 : text.length;
}

/**
 * Deep copy of arrays and plain objects, so the caller's result is never
 * mutated. Dates, Decimals and other class instances are shared, exactly as
 * JSON.stringify would serialise them. A reference met again on the current
 * path is a cycle and becomes a marker string; a shared sibling is not.
 */
function clone(value: unknown, onPath: WeakSet<object>, state: { cyclic: boolean }): unknown {
    if (value === null || typeof value !== "object") return value;
    const isArray = Array.isArray(value);
    if (!isArray && !isPlainObject(value)) return value;
    if (onPath.has(value)) {
        state.cyclic = true;
        return CYCLE_MARKER;
    }
    onPath.add(value);
    let out: unknown;
    if (isArray) {
        out = value.map((item) => clone(item, onPath, state));
    } else {
        const copy: Json = {};
        for (const [key, entry] of Object.entries(value)) copy[key] = clone(entry, onPath, state);
        out = copy;
    }
    onPath.delete(value);
    return out;
}

function collectArrays(root: unknown): Candidate[] {
    const found: Candidate[] = [];
    const visit = (
        value: unknown,
        path: string,
        depth: number,
        holder: Json | null,
        parent: Candidate["parent"],
    ) => {
        if (depth > MAX_ARRAY_DEPTH) return;
        if (Array.isArray(value)) {
            // Only the root may lack an object holder: an array nested in a root
            // array has nowhere to carry its marker, and the root is bigger anyway.
            if (value.length > 0 && (holder !== null || parent === null)) {
                found.push({ array: value, path, holder, parent, size: sizeOf(value) });
            }
            value.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1, holder, { container: value, key: index }));
            return;
        }
        if (isPlainObject(value)) {
            for (const [key, entry] of Object.entries(value)) {
                // A marker list planted by an earlier pass is bookkeeping, never a candidate.
                if (key === TRUNCATION_KEY) continue;
                visit(entry, `${path}.${key}`, depth + 1, value, { container: value, key });
            }
        }
    };
    visit(root, "$", 0, null, null);
    return found;
}

/** Candidates that are not nested inside another candidate: their sizes add up without double counting. */
function disjoint(candidates: Candidate[]): Candidate[] {
    const inside = (inner: string, outer: string) => inner.startsWith(`${outer}.`) || inner.startsWith(`${outer}[`);
    return candidates.filter((c) => !candidates.some((other) => other !== c && inside(c.path, other.path)));
}

/** Largest k such that the serialised prefix of `lengths` fits in `allowance` characters. */
function prefixThatFits(lengths: number[], allowance: number): number {
    // Serialised prefix of k elements: brackets, elements and k-1 commas.
    const cumulative: number[] = [0];
    for (const n of lengths) cumulative.push(cumulative[cumulative.length - 1] + n);
    const prefixLength = (k: number) => 2 + cumulative[k] + Math.max(k - 1, 0);
    let low = 0;
    let high = lengths.length - 1;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (prefixLength(mid) <= allowance) low = mid;
        else high = mid - 1;
    }
    return prefixLength(low) <= allowance ? low : 0;
}

/** Longest head of `text` (at most `maxHead` chars) whose JSON string form fits in `allowance` characters. */
function headThatFits(text: string, maxHead: number, allowance: number): string {
    // Escapes inflate the quoted form, so the head is measured serialised, not raw.
    let low = 0;
    let high = Math.min(text.length, maxHead);
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (sizeOf(text.slice(0, mid)) <= allowance) low = mid;
        else high = mid - 1;
    }
    return text.slice(0, low);
}

function attachMarker(holder: Json, info: TruncationInfo): void {
    const marker = { ...info, note: TRUNCATION_NOTE };
    const existing = holder[TRUNCATION_KEY];
    if (existing === undefined) holder[TRUNCATION_KEY] = marker;
    else if (Array.isArray(existing)) existing.push(marker);
    else holder[TRUNCATION_KEY] = [existing, marker];
}

/** Conservative size of the marker a cut adds: the list form, with the digits of `total` standing in for `kept`. */
function markerSizeFor(candidate: Candidate): number {
    const total = candidate.array.length;
    return sizeOf({ [TRUNCATION_KEY]: [{ path: candidate.path, kept: total, total, note: TRUNCATION_NOTE }] }) + 2;
}

/**
 * Characters the chosen array may keep. The plain figure assumes everything
 * else stays whole; when sibling arrays are oversized too, that figure goes
 * negative and the first array would be emptied while the last kept the whole
 * budget. The arrays the remaining passes can still cut therefore share the
 * budget in proportion to their size, and each later pass re-measures.
 */
function allowanceFor(chosen: Candidate, peers: Candidate[], docLength: number, budget: number, passesLeft: number): number {
    const markerSize = markerSizeFor(chosen);
    const plain = budget - (docLength - chosen.size) - markerSize;
    const toCut = [...peers].sort((a, b) => b.size - a.size).slice(0, passesLeft);
    const cutSize = toCut.reduce((sum, c) => sum + c.size, 0);
    const available = budget - (docLength - cutSize) - markerSize * toCut.length;
    const share = cutSize > 0 ? Math.floor((available * chosen.size) / cutSize) : plain;
    return Math.max(plain, share);
}

/** Slices one array and plants its marker. Returns the new document root (the root changes when the root array is wrapped). */
function cutArray(doc: unknown, candidate: Candidate, allowance: number): { doc: unknown; info: TruncationInfo } {
    const { array, path, holder, parent } = candidate;
    const total = array.length;
    const kept = allowance > 2 ? prefixThatFits(array.map(sizeOf), allowance) : 0;
    const prefix = array.slice(0, kept);
    const info: TruncationInfo = { path, kept, total };

    if (parent === null || holder === null) {
        const wrapped: Json = { items: prefix };
        attachMarker(wrapped, info);
        return { doc: wrapped, info };
    }
    if (Array.isArray(parent.container)) parent.container[parent.key as number] = prefix;
    else parent.container[parent.key as string] = prefix;
    attachMarker(holder, info);
    return { doc, info };
}

/**
 * Keeps a tool result under `maxChars` once serialised, slicing its largest
 * arrays rather than its text. Never mutates `value`. When no array can bring
 * the result under the cap (one giant transcript string, say), the fallback is
 * still valid JSON: a marker plus the head of the serialised text.
 */
export function truncateStructured(value: unknown, maxChars = 40_000): TruncationResult {
    const state = { cyclic: false };
    let doc = clone(value, new WeakSet(), state);
    let text = JSON.stringify(doc) ?? "null";
    // A cyclic input is returned as its acyclic copy: the caller will serialise it next.
    if (text.length <= maxChars) return { value: state.cyclic ? doc : value, truncated: null };

    const original = text;
    const budget = maxChars - MARGIN;
    const infos: TruncationInfo[] = [];
    const cut = new Set<string>();

    for (let pass = 0; pass < MAX_PASSES && text.length > maxChars; pass += 1) {
        const candidates = collectArrays(doc).filter((c) => !cut.has(c.path));
        if (candidates.length === 0) break;
        const largest = candidates.reduce((best, c) => (c.size > best.size ? c : best));
        const allowance = allowanceFor(largest, disjoint(candidates), text.length, budget, MAX_PASSES - pass);
        const result = cutArray(doc, largest, allowance);
        doc = result.doc;
        infos.push(result.info);
        // The root array, once wrapped, lives at $.items for later passes.
        cut.add(largest.parent === null ? "$.items" : largest.path);
        text = JSON.stringify(doc) ?? "null";
    }

    if (text.length <= maxChars) return { value: doc, truncated: infos };

    const info: TruncationInfo = { path: "$", kept: 0, total: 1 };
    const marker = { ...info, note: TRUNCATION_NOTE };
    const envelope = sizeOf({ [TRUNCATION_KEY]: marker, partial_text: "" }) - 2;
    return {
        value: { [TRUNCATION_KEY]: marker, partial_text: headThatFits(original, budget, maxChars - envelope) },
        truncated: [info],
    };
}
