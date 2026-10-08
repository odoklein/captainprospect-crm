/**
 * Scopes of the public API (/api/v1) and the MCP server.
 *
 * ApiKey has no dedicated scopes column — adding one would make every existing
 * key lookup fail until the SQL is applied on each database. Scopes are stored
 * in the existing `allowedEndpoints` JSON as `scope:<name>` entries, next to the
 * `/api/v1` marker that keeps these keys off the legacy /api/stats endpoints.
 * A key without any `scope:` entry is a legacy key: it can never call /api/v1.
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
] as const;

/** Reserved for a later version. Refused at key creation until writes exist. */
export const RESERVED_WRITE_SCOPES = ["contacts:write", "activities:write", "appointments:write"] as const;

export type Scope = (typeof READ_SCOPES)[number];

export const V1_ENDPOINT_MARKER = "/api/v1";
const SCOPE_PREFIX = "scope:";

export function isReadScope(value: string): value is Scope {
  return (READ_SCOPES as readonly string[]).includes(value);
}

/** Scopes granted by a key, read from its stored `allowedEndpoints` JSON. */
export function scopesFromAllowedEndpoints(allowedEndpoints: unknown): Scope[] {
  if (!Array.isArray(allowedEndpoints)) return [];
  return allowedEndpoints
    .filter((e): e is string => typeof e === "string" && e.startsWith(SCOPE_PREFIX))
    .map((e) => e.slice(SCOPE_PREFIX.length))
    .filter(isReadScope);
}

/** The `allowedEndpoints` value to persist for a key holding these scopes. */
export function allowedEndpointsForScopes(scopes: readonly Scope[]): string[] {
  return [V1_ENDPOINT_MARKER, ...scopes.map((s) => `${SCOPE_PREFIX}${s}`)];
}
