/**
 * Scopes of the public API (/api/v1) and the MCP server.
 *
 * ApiKey has no dedicated scopes column — adding one would make every existing
 * key lookup fail until the SQL is applied on each database. Scopes are stored
 * in the existing `allowedEndpoints` JSON as `scope:<name>` entries, next to the
 * `/api/v1` marker that keeps these keys off the legacy /api/stats endpoints.
 * A key without any `scope:` entry is a legacy key: it can never call /api/v1.
 *
 * READ scopes are what "all" means. WRITE scopes are never implied: a key gets
 * them only when they are named explicitly at creation.
 */

export const READ_SCOPES = [
  "contacts:read",
  "companies:read",
  "leads:read",
  "calls:read",
  "activities:read",
  "appointments:read",
  "reports:read",
  "users:read",
  "missions:read",
  "lists:read",
] as const;

/** No write tool exists yet: every key is read-only. */
export const WRITE_SCOPES = [] as const;

/** Reserved for a later version. Refused at key creation until the matching tools exist. */
export const RESERVED_WRITE_SCOPES = ["contacts:write", "activities:write", "appointments:write"] as const;

export type ReadScope = (typeof READ_SCOPES)[number];
export type WriteScope = (typeof WRITE_SCOPES)[number];
export type Scope = ReadScope | WriteScope;

export const ALL_SCOPES: readonly Scope[] = [...READ_SCOPES, ...WRITE_SCOPES];

export const V1_ENDPOINT_MARKER = "/api/v1";
const SCOPE_PREFIX = "scope:";

export function isReadScope(value: string): value is ReadScope {
  return (READ_SCOPES as readonly string[]).includes(value);
}

export function isWriteScope(value: string): value is WriteScope {
  return (WRITE_SCOPES as readonly string[]).includes(value);
}

export function isScope(value: string): value is Scope {
  return isReadScope(value) || isWriteScope(value);
}

/**
 * Internal keys: one key that sees EVERY client (for the agency's own managers).
 * Stored as a `flag:all_clients` entry; the key then has no clientId. Both halves
 * are required (flag AND no client), and the issuer must still be an active MANAGER.
 */
const ALL_CLIENTS_FLAG = "flag:all_clients";

export function hasAllClientsFlag(allowedEndpoints: unknown): boolean {
  return Array.isArray(allowedEndpoints) && allowedEndpoints.includes(ALL_CLIENTS_FLAG);
}

/** Scopes granted by a key, read from its stored `allowedEndpoints` JSON. */
export function scopesFromAllowedEndpoints(allowedEndpoints: unknown): Scope[] {
  if (!Array.isArray(allowedEndpoints)) return [];
  return allowedEndpoints
    .filter((e): e is string => typeof e === "string" && e.startsWith(SCOPE_PREFIX))
    .map((e) => e.slice(SCOPE_PREFIX.length))
    .filter(isScope);
}

/** The `allowedEndpoints` value to persist for a key holding these scopes. */
export function allowedEndpointsForScopes(scopes: readonly Scope[], opts: { allClients?: boolean } = {}): string[] {
  return [V1_ENDPOINT_MARKER, ...(opts.allClients ? [ALL_CLIENTS_FLAG] : []), ...scopes.map((s) => `${SCOPE_PREFIX}${s}`)];
}
