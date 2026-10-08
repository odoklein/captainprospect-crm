import { createHash } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { ApiError } from "./errors";
import { scopesFromAllowedEndpoints, type Scope } from "./scopes";

/** Who is calling, resolved once from the API key. Never from the request body or query. */
export interface Principal {
  keyId: string;
  keyName: string;
  /** The tenant. Every query is filtered on it. */
  clientId: string;
  /** Optional narrowing of the tenant to a single mission. */
  missionId: string | null;
  scopes: Scope[];
  /** Manager who issued the key — the accountable human behind the agent. */
  issuedById: string;
}

const KEY_PREFIX = "cp_live_";

export function extractBearerKey(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (auth && /^bearer /i.test(auth)) return auth.slice(7).trim().slice(0, 200) || null;
  const legacy = headers.get("x-api-key");
  return legacy ? legacy.trim().slice(0, 200) : null;
}

/**
 * MCP clients that cannot set headers (ChatGPT's custom connector offers only
 * OAuth or nothing) pass the key as `?key=`. Used by /api/mcp only — never by
 * /api/v1. A real Authorization header always wins.
 */
export function withUrlKey(headers: Headers, url: URL): Headers {
  if (extractBearerKey(headers)) return headers;
  const key = url.searchParams.get("key");
  if (!key) return headers;
  const merged = new Headers(headers);
  merged.set("authorization", `Bearer ${key.slice(0, 200)}`);
  return merged;
}

/**
 * API key → tenant + scopes. Throws ApiError (401 / 403 / 429) on any failure,
 * with the same message for "unknown" and "malformed" so keys can't be probed.
 */
export async function authenticateApiKey(
  db: Pick<PrismaClient, "apiKey" | "apiKeyUsageLog">,
  headers: Headers,
  now: Date = new Date(),
): Promise<Principal> {
  const raw = extractBearerKey(headers);
  if (!raw) throw new ApiError(401, "unauthorized", "Missing API key. Send 'Authorization: Bearer <key>'.");
  if (!raw.startsWith(KEY_PREFIX) || !/^[A-Za-z0-9_]+$/.test(raw)) {
    throw new ApiError(401, "unauthorized", "Invalid API key.");
  }

  const key = await db.apiKey.findUnique({
    where: { keyHash: createHash("sha256").update(raw).digest("hex") },
    select: {
      id: true,
      name: true,
      clientId: true,
      missionId: true,
      allowedEndpoints: true,
      isActive: true,
      expiresAt: true,
      rateLimitPerMinute: true,
      rateLimitPerHour: true,
      createdById: true,
    },
  });

  if (!key) throw new ApiError(401, "unauthorized", "Invalid API key.");
  if (!key.isActive) throw new ApiError(401, "key_revoked", "This API key has been revoked.");
  if (key.expiresAt && key.expiresAt <= now) throw new ApiError(401, "key_expired", "This API key has expired.");

  const scopes = scopesFromAllowedEndpoints(key.allowedEndpoints);
  if (scopes.length === 0) {
    throw new ApiError(403, "no_scopes", "This API key has no /api/v1 scopes.");
  }
  // A v1 key without a tenant would read every client's data: refuse it outright.
  if (!key.clientId) {
    throw new ApiError(403, "no_tenant", "This API key is not bound to a client.");
  }

  const [lastMinute, lastHour] = await Promise.all([
    db.apiKeyUsageLog.count({ where: { apiKeyId: key.id, createdAt: { gte: new Date(now.getTime() - 60_000) } } }),
    db.apiKeyUsageLog.count({ where: { apiKeyId: key.id, createdAt: { gte: new Date(now.getTime() - 3_600_000) } } }),
  ]);
  if (lastMinute >= key.rateLimitPerMinute || lastHour >= key.rateLimitPerHour) {
    throw new ApiError(429, "rate_limited", "Rate limit exceeded.", { "Retry-After": "30" });
  }

  return {
    keyId: key.id,
    keyName: key.name,
    clientId: key.clientId,
    missionId: key.missionId,
    scopes,
    issuedById: key.createdById,
  };
}

export function requireScope(principal: Principal, scope: Scope): void {
  if (!principal.scopes.includes(scope)) {
    throw new ApiError(403, "insufficient_scope", `This API key lacks the '${scope}' scope.`);
  }
}
