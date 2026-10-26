// ============================================
// LEEXI API SERVICE
// Live fetch of calls with their summary, sales playbook and follow-up tasks.
// Auth: HTTP Basic (KEY_ID:KEY_SECRET). Payload mapping: ./normalize.ts
//
// Keys: the one saved in Paramètres › Intégrations first, then the server's
// LEEXI_API_KEY_ID / _SECRET. A key Leexi refuses (401/403, e.g. no
// « read_calls » access) falls through to the next one, and the response
// carries a warning so the UI can say which key needs fixing.
// ============================================

import { prisma } from "@/lib/prisma";
import { getBrand } from "@/lib/brand/server";
import {
  callMatchesQuery,
  toLeexiCallDetail,
  toLeexiCallSummary,
  unwrapLeexi,
  type LeexiCallDetail,
  type LeexiCallSummary,
  type NormalizeContext,
  type RawLeexiCall,
} from "./normalize";

export type { LeexiCallDetail, LeexiCallSummary, LeexiPerson, LeexiDeal } from "./normalize";

const LEEXI_API_BASE = "https://public-api.leexi.ai/v1";
const REQUEST_TIMEOUT_MS = 20_000;
const LIST_CACHE_TTL_MS = 60_000;
const MAX_PAGE_SIZE = 100;

export class LeexiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "LeexiError";
  }
}

export interface LeexiResult<T> {
  data: T;
  /** Set when the saved key was refused and the server key answered instead. */
  warning: string | null;
}

// ============================================
// AUTH
// ============================================

const CONFIG_KEY_ID = "leexiApiKeyId";
const CONFIG_KEY_SECRET = "leexiApiKeySecret";

type KeySource = "settings" | "env";

interface LeexiKey {
  keyId: string;
  keySecret: string;
  source: KeySource;
}

async function getLeexiKeys(): Promise<LeexiKey[]> {
  const records = await prisma.systemConfig.findMany({
    where: { key: { in: [CONFIG_KEY_ID, CONFIG_KEY_SECRET] } },
  });
  const keys: LeexiKey[] = [];
  const settingsId = records.find((r) => r.key === CONFIG_KEY_ID)?.value?.trim();
  const settingsSecret = records.find((r) => r.key === CONFIG_KEY_SECRET)?.value?.trim();
  if (settingsId && settingsSecret) keys.push({ keyId: settingsId, keySecret: settingsSecret, source: "settings" });

  const envId = process.env.LEEXI_API_KEY_ID?.trim();
  const envSecret = process.env.LEEXI_API_KEY_SECRET?.trim();
  if (envId && envSecret && !keys.some((k) => k.keyId === envId)) {
    keys.push({ keyId: envId, keySecret: envSecret, source: "env" });
  }
  return keys;
}

export async function isLeexiAvailable(): Promise<boolean> {
  return (await getLeexiKeys()).length > 0;
}

function basicAuth(key: LeexiKey): string {
  return `Basic ${Buffer.from(`${key.keyId}:${key.keySecret}`).toString("base64")}`;
}

async function readMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text) as { message?: unknown; error?: unknown };
    const m = json.message ?? json.error;
    if (typeof m === "string") return m.slice(0, 200);
  } catch {
    // not JSON
  }
  return text.slice(0, 200);
}

function refusedMessage(leexiMessage: string): string {
  if (/read_calls/i.test(leexiMessage)) {
    return "Leexi refuse la clé API : elle n'a pas l'accès « read_calls ». Dans Leexi, donnez ce droit à la clé (Paramètres › API), puis enregistrez-la dans Paramètres › Intégrations.";
  }
  return `Leexi refuse la clé API${leexiMessage ? ` (« ${leexiMessage} »)` : ""}. Vérifiez l'identifiant et le secret dans Paramètres › Intégrations.`;
}

async function fetchWithKey(key: LeexiKey, url: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: { Authorization: basicAuth(key), Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new LeexiError(timeout ? "Leexi ne répond pas (délai dépassé). Réessayez dans un instant." : "Impossible de joindre Leexi.", 504);
  }
}

async function leexiGet(path: string, params?: Record<string, string>): Promise<LeexiResult<unknown>> {
  const keys = await getLeexiKeys();
  if (keys.length === 0) {
    throw new LeexiError("Leexi n'est pas configuré : ajoutez une clé API dans Paramètres › Intégrations.", 503);
  }

  const url = new URL(`${LEEXI_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);

  let refused: { source: KeySource; message: string } | null = null;
  for (const key of keys) {
    const res = await fetchWithKey(key, url.toString());
    if (res.ok) {
      const warning = refused?.source === "settings"
        ? `La clé Leexi enregistrée dans Paramètres est refusée (« ${refused.message} ») : la clé du serveur a pris le relais. Mettez-la à jour dans Paramètres › Intégrations.`
        : null;
      return { data: await res.json(), warning };
    }
    const message = await readMessage(res);
    if (res.status === 401 || res.status === 403) {
      refused ??= { source: key.source, message };
      continue;
    }
    if (res.status === 404) throw new LeexiError("Appel introuvable dans Leexi.", 404);
    if (res.status === 429) throw new LeexiError("Leexi limite les requêtes : réessayez dans une minute.", 429);
    throw new LeexiError(`Leexi a répondu ${res.status}${message ? ` : ${message}` : ""}.`, 502);
  }
  throw new LeexiError(refusedMessage(refused?.message ?? ""), 403);
}

// ============================================
// CONTEXT (who "we" are on a call)
// ============================================

const STAFF_CACHE_TTL_MS = 5 * 60_000;
let staffCache: { at: number; names: string[] } | null = null;

/** Names of the agency's own people (every CRM user who is not a client). */
export async function staffNames(): Promise<string[]> {
  if (staffCache && Date.now() - staffCache.at < STAFF_CACHE_TTL_MS) return staffCache.names;
  const users = await prisma.user.findMany({
    where: { role: { notIn: ["CLIENT", "COMMERCIAL"] } },
    select: { name: true },
  });
  staffCache = { at: Date.now(), names: users.map((u) => u.name).filter(Boolean) };
  return staffCache.names;
}

async function normalizeContext(): Promise<NormalizeContext> {
  const [brand, internalNames] = await Promise.all([getBrand(), staffNames()]);
  const domains = [...brand.email.domains];
  try {
    const host = new URL(brand.web.website).hostname.replace(/^www\./, "");
    if (host) domains.push(host);
  } catch {
    // no website configured
  }
  return { internalDomains: domains, internalNames };
}

// ============================================
// CALLS
// ============================================

interface ListPage {
  calls: LeexiCallSummary[];
  total: number;
  pages: number;
  warning: string | null;
}

const listCache = new Map<string, { at: number; page: ListPage }>();

async function fetchPage(page: number, items: number, from?: string): Promise<ListPage> {
  const cacheKey = `${page}:${items}:${from ?? ""}`;
  const hit = listCache.get(cacheKey);
  if (hit && Date.now() - hit.at < LIST_CACHE_TTL_MS) return hit.page;

  const params: Record<string, string> = { page: String(page), items: String(Math.min(items, MAX_PAGE_SIZE)) };
  if (from) params.from = from;
  const [{ data: body, warning }, ctx] = await Promise.all([leexiGet("/calls", params), normalizeContext()]);

  const raw = unwrapLeexi<RawLeexiCall[]>(body) ?? [];
  const pagination = (body as { pagination?: { count?: number; pages?: number } } | null)?.pagination;
  const result: ListPage = {
    calls: (Array.isArray(raw) ? raw : []).map((c) => toLeexiCallSummary(c, ctx)).filter((c) => c.id),
    total: pagination?.count ?? raw.length,
    pages: pagination?.pages ?? 1,
    warning,
  };
  listCache.set(cacheKey, { at: Date.now(), page: result });
  return result;
}

/** Most recent calls first. */
export async function listLeexiCalls(page = 1, items = 50): Promise<LeexiResult<{ calls: LeexiCallSummary[]; total: number }>> {
  const p = await fetchPage(page, items);
  return { data: { calls: p.calls, total: p.total }, warning: p.warning };
}

/**
 * Leexi has no text search: scan the calls of the last `days` days (newest
 * first, up to `maxPages` × 100) and match title, company, deal, people and
 * emails, accent-insensitive.
 */
export async function searchLeexiCalls(
  query: string,
  { days = 180, maxPages = 6 }: { days?: number; maxPages?: number } = {},
): Promise<LeexiResult<{ calls: LeexiCallSummary[]; scanned: number }>> {
  // A day, not an instant: consecutive searches share the page cache.
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const found: LeexiCallSummary[] = [];
  let scanned = 0;
  let warning: string | null = null;
  for (let page = 1; page <= maxPages; page++) {
    const p = await fetchPage(page, MAX_PAGE_SIZE, from);
    warning ??= p.warning;
    scanned += p.calls.length;
    found.push(...p.calls.filter((c) => callMatchesQuery(c, query)));
    if (page >= p.pages || p.calls.length < MAX_PAGE_SIZE) break;
  }
  return { data: { calls: found, scanned }, warning };
}

export async function getLeexiCall(callId: string): Promise<LeexiResult<LeexiCallDetail>> {
  const [{ data: body, warning }, ctx] = await Promise.all([
    leexiGet(`/calls/${encodeURIComponent(callId)}`),
    normalizeContext(),
  ]);
  const raw = unwrapLeexi<RawLeexiCall>(body);
  if (!raw || typeof raw !== "object") throw new LeexiError("Réponse Leexi vide pour cet appel.", 502);
  return { data: toLeexiCallDetail(raw, ctx), warning };
}

// ============================================
// CONNECTION TEST (Paramètres › Intégrations)
// ============================================

export interface LeexiKeyCheck {
  source: KeySource;
  ok: boolean;
  message: string;
}

async function checkKey(key: LeexiKey): Promise<LeexiKeyCheck> {
  try {
    const res = await fetchWithKey(key, `${LEEXI_API_BASE}/calls?page=1&items=1`);
    if (res.ok) {
      const body = (await res.json()) as { pagination?: { count?: number } };
      const count = body?.pagination?.count;
      return { source: key.source, ok: true, message: count != null ? `${count} appels accessibles` : "Connexion réussie" };
    }
    const message = await readMessage(res);
    return {
      source: key.source,
      ok: false,
      message: res.status === 401 || res.status === 403 ? refusedMessage(message) : `Leexi a répondu ${res.status}${message ? ` : ${message}` : ""}`,
    };
  } catch (err) {
    return { source: key.source, ok: false, message: err instanceof Error ? err.message : "Erreur inconnue" };
  }
}

/** Tries every configured key on its own, so the settings page can say which one works. */
export async function testLeexiKeys(): Promise<LeexiKeyCheck[]> {
  return Promise.all((await getLeexiKeys()).map(checkKey));
}

/** Checks a key before it is saved: a key without « read_calls » must not replace a working one. */
export async function checkLeexiKey(keyId: string, keySecret: string): Promise<LeexiKeyCheck> {
  return checkKey({ keyId, keySecret, source: "settings" });
}
