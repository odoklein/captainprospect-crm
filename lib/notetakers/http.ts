// ============================================
// NOTE-TAKERS — one fetch for every adapter: timeout, JSON, and the
// provider's refusals turned into French messages with the right status.
// ============================================

import { NotetakerError } from "./types";

const REQUEST_TIMEOUT_MS = 20_000;

async function readMessage(res: Response): Promise<string> {
    const text = await res.text().catch(() => "");
    try {
        const json = JSON.parse(text) as { message?: unknown; error?: unknown; errors?: Array<{ message?: unknown }> };
        const m = json.message ?? json.error ?? json.errors?.[0]?.message;
        if (typeof m === "string") return m.slice(0, 200);
        if (m && typeof m === "object" && typeof (m as { message?: unknown }).message === "string") {
            return ((m as { message: string }).message).slice(0, 200);
        }
    } catch {
        // not JSON
    }
    return text.slice(0, 200);
}

/**
 * `emptyOn`: statuses that mean « nothing yet » for this call (a transcript still
 * processing, notes never written) and give null instead of an error.
 */
export async function providerFetch(label: string, url: string, init: RequestInit = {}, { emptyOn = [] }: { emptyOn?: number[] } = {}): Promise<unknown> {
    let res: Response;
    try {
        res = await fetch(url, {
            ...init,
            headers: { Accept: "application/json", ...(init.headers ?? {}) },
            cache: "no-store",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (err) {
        const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        throw new NotetakerError(timeout ? `${label} ne répond pas (délai dépassé). Réessayez dans un instant.` : `Impossible de joindre ${label}.`, 504);
    }
    if (res.ok) return res.json().catch(() => {
        throw new NotetakerError(`Réponse illisible de ${label}.`, 502);
    });

    if (emptyOn.includes(res.status)) return null;
    const message = await readMessage(res);
    if (res.status === 401 || res.status === 403) {
        throw new NotetakerError(
            `${label} refuse la clé API${message ? ` (« ${message} »)` : ""}. Vérifiez-la dans Paramètres › Intégrations.`,
            403,
        );
    }
    if (res.status === 404) throw new NotetakerError(`Enregistrement introuvable dans ${label}.`, 404);
    if (res.status === 429) throw new NotetakerError(`${label} limite les requêtes : réessayez dans une minute.`, 429);
    throw new NotetakerError(`${label} a répondu ${res.status}${message ? ` : ${message}` : ""}.`, 502);
}

/** Payload shapes not pinned down by the docs: read defensively. */
export type Obj = Record<string, unknown>;

export function obj(v: unknown): Obj {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}

export function arr(v: unknown): Obj[] {
    return Array.isArray(v) ? v.filter((x): x is Obj => !!x && typeof x === "object") : [];
}

/** First array found under one of these keys (`data`, `results`…), or the body itself. */
export function listIn(body: unknown, ...keys: string[]): Obj[] {
    if (Array.isArray(body)) return arr(body);
    const o = obj(body);
    for (const k of keys) if (Array.isArray(o[k])) return arr(o[k]);
    return [];
}

/** Seconds between two ISO dates (0 when either is missing). */
export function secondsBetween(start: unknown, end: unknown): number {
    const a = isoDate(start);
    const b = isoDate(end);
    return a && b ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000)) : 0;
}

export function person(name: unknown, email: unknown): { name: string; email: string | null } {
    return { name: str(name), email: str(email) || null };
}

export function str(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}

export function num(v: unknown): number {
    return typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : 0;
}

/** ISO string from an ISO string, epoch seconds or epoch milliseconds. */
export function isoDate(v: unknown): string | null {
    if (typeof v === "string" && v.trim()) {
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (typeof v === "number" && v > 0) return new Date(v < 1e12 ? v * 1000 : v).toISOString();
    return null;
}

/** Same person listed twice (invite + participant): keep the entry with an email. */
export function dedupePeople<T extends { name: string; email: string | null }>(people: T[]): T[] {
    const out: T[] = [];
    for (const p of people) {
        if (!p.name && !p.email) continue;
        const i = out.findIndex(
            (o) => (p.email && o.email && o.email.toLowerCase() === p.email.toLowerCase()) || (p.name && o.name && o.name.toLowerCase() === p.name.toLowerCase()),
        );
        if (i < 0) out.push(p);
        else if (!out[i].email && p.email) out[i] = { ...out[i], email: p.email, name: out[i].name || p.name };
    }
    return out;
}
