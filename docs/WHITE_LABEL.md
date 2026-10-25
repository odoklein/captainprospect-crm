# White-label — operator guide

How one CRM image serves many agencies, each with its own name, colours, logos
and domain. Design and rationale: `docs/WHITE_LABEL_PLAN.md`. Secrets:
`docs/INTEGRATION_SECRETS_PROPOSAL.md`. Brand authoring: `brand/README.md`.

---

## 1. Model

- **One image** for every agency. Nothing agency-specific is baked at build.
- **One database and one container per agency** (an "instance"). There is no
  `tenantId`: isolation is the database. `Client` stays the agency's own customer.
- The **brand** of an instance lives in its database (`BrandSettings`, one row).
- The **URLs and integration keys** of an instance live in its container env.
- A **control plane** (out of this repo) builds the image, provisions the
  database, runs migrations, starts the container and calls the signed
  `/api/instance/*` API.

The existing Captain Prospect deployment is simply the first instance: with an
empty or missing `BrandSettings` table it renders exactly as before.

---

## 2. `BrandSettings`

One row, `id = 'default'` (`prisma/schema.prisma`, migration
`20261025120000_add_brand_settings`). Every column default equals
`brand/brand.config.ts`.

| Group | Columns |
|---|---|
| Identity | `name`, `productName`, `tagline`, `description` (used in AI prompts), `companyName` (legal, invoices), `companyShortName` (label of the agency's own lists) |
| Web | `appUrl` (only when the env gives none, see §3), `website` |
| Email | `senderName`, `notificationsAddress`, `supportAddress`, `emailDomains[]` |
| Locale | `lang`, `locale`, `currency`, `timeZone` |
| Colours | `primaryColor`, `accentColor` (hex seeds; every shade is derived), `neutralTint` (0–1) |
| Font | `fontPreset`: `default` (Bricolage Grotesque + Geist), `inter`, `manrope` |
| Logos | `logoFullKey`, `logoFullInverseKey`, `logoMarkKey`, `logoMarkInverseKey`, `faviconKey`, `appleTouchIconKey` (MinIO keys, null = `/public/brand/*` default), `logoFullWidth`/`logoFullHeight`, `logoVersion` (cache-buster) |
| Audit | `updatedAt`, `updatedBy` (user id or `instance-api`) |

Invalid stored values (bad hex, unknown preset, empty string) fall back to the
config value for that field; the brand never fails to render.

---

## 3. How the app reads it

```
brand/brand.config.ts      defaults
lib/brand/resolve.ts       defaults + row → Brand (pure)
lib/brand/server.ts        getBrand()  — cached 60 s, never throws
lib/brand/client.tsx       <BrandProvider> + useBrand()
app/layout.tsx             getBrand() → CSS tokens, metadata, icons, provider
```

- **Cache**: one in-process entry, 60 s TTL, shared across route handlers and
  server components through `globalThis`. Every write (manager panel, instance
  API) invalidates it immediately in that process. Workers are separate
  processes and pick up changes within 60 s.
- **Fallback**: no database (during `next build`), table missing (migration
  not applied yet) or unreadable row → `brand.config.ts` defaults and one
  `console.warn`.
- **Rendering**: the root layout calls `connection()`, so every page renders
  per request with the instance brand. There is no build-time snapshot.
- **App URL** precedence: `APP_URL` → `NEXT_PUBLIC_APP_URL` → `NEXTAUTH_URL`
  → `BrandSettings.appUrl`. The env wins because `NEXTAUTH_URL` drives auth
  cookies and OAuth callbacks; links in emails must agree with it.

### Runtime public config

The browser gets per-instance values from `window.__CP_RUNTIME_CONFIG__`, set
by the root layout before hydration (also served at `GET /api/public-config`).
Read on the server at request time from:

| Value | Env (preferred) | Legacy name, still read |
|---|---|---|
| App URL | `APP_URL` | `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL` |
| Socket server | `SOCKET_URL`, `SOCKET_PATH` | `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_SOCKET_PATH` |
| OpenReplay | `OPENREPLAY_ENABLED`, `OPENREPLAY_PROJECT_KEY`, `OPENREPLAY_INGEST_POINT` | `NEXT_PUBLIC_OPENREPLAY_*` |
| Feature flags | `QONTO_ENABLED`, `PAPPERS_ENABLED` | `NEXT_PUBLIC_QONTO_ENABLED`, `NEXT_PUBLIC_PAPPERS_ENABLED` |

**Important**: Next.js inlines every literal `process.env.NEXT_PUBLIC_X` it sees
at build into **both the client and the server bundles**
(`node_modules/next/dist/build/define-env.js`). A literal read in server code
therefore returns the build machine's value in every instance. Server code
must use `runtimeEnv("NEXT_PUBLIC_X")` (`lib/runtime-config/env.ts`, a computed
key Next cannot inline) or `getBrand()`; client code must use
`useRuntimeConfig()` / `getRuntimeConfig()`. Prefer the unprefixed names above
and do **not** set `NEXT_PUBLIC_*` in the image build environment.

---

## 4. Editing the brand

### Manager UI

`/manager/settings` → **Identité** (role `MANAGER`). Names, URLs, emails,
locale, two colour seeds with a live preview and contrast checks, font preset,
and the six logo slots. Every change is written to `AuditEvent`
(`action: "BRAND_UPDATE"`, before/after); reset to defaults is audited too.

### Logos

| Slot | Used for |
|---|---|
| `full` | Full logo on light backgrounds (login, PDFs) |
| `fullInverse` | Full logo on the primary colour (sidebar, dark emails) |
| `mark` | Square symbol, light backgrounds |
| `markInverse` | Square symbol on the primary colour |
| `favicon` | Browser tab |
| `appleTouchIcon` | iOS home screen (180×180, opaque) |

- Formats: PNG, WebP, SVG (sanitised: no script, `foreignObject`, event
  handlers or external references). Type is detected from the bytes.
- Limits: 2 MB, 4096 px per side.
- Storage: MinIO (`MINIO_*` env), keys `brand/<slot>-<version>.<ext>`. Without
  MinIO, uploads answer 503 and the `/public/brand/*` defaults stay.
- Served by `GET /api/brand/assets/:slot?v=<logoVersion>` (public):
  `Cache-Control: public, max-age=31536000, immutable`, `ETag`,
  `X-Content-Type-Options: nosniff`, sandboxing CSP; a slot with no upload
  redirects to its `/public/brand/*` default.

### Fonts

`next/font` downloads families at build. An instance can only choose among
`default`, `inter` and `manrope`. A new family = a new `next/font` call in
`brand/fonts.ts` + an entry in `FONT_PRESETS` (`lib/brand/types.ts`) + a rebuild.

---

## 5. Instance API (control plane)

All routes under `/api/instance/*` bypass the session middleware and verify an
HMAC signature themselves (`lib/instance/auth.ts`).

| Method | Route | Body / query | Response |
|---|---|---|---|
| `GET` | `/api/instance/health` | — | `{ version, schemaVersion, brandUpdatedAt, dbOk }` |
| `GET` | `/api/instance/brand` | — | current settings + resolved brand |
| `PUT` | `/api/instance/brand` | JSON, any editable field (`name`, `primaryColor`, `emailDomains`, …) | `{ ok, changed, settings, brand }` |
| `POST` | `/api/instance/brand/assets` | `multipart/form-data` `{ slot, file }` | `{ ok, slot, settings, brand }` |
| `DELETE` | `/api/instance/brand/assets?slot=<slot>` | — | `{ ok, slot, settings, brand }` |
| `POST` | `/api/instance/bootstrap` | `{ email, name }` | `201 { ok, userId, email, inviteUrl, expiresAt }`; `409` once any user exists |

`version` is `GIT_SHA`; `schemaVersion` is the last applied migration name
(`null` if `_prisma_migrations` is absent).

### Signature

```
X-Instance-Timestamp: <unix seconds>
X-Instance-Signature: v1=<hex HMAC-SHA256(INSTANCE_ADMIN_SECRET, canonical)>
canonical = `${timestamp}.${METHOD}.${pathWithQuery}.${sha256hex(rawBody)}`
```

- `pathWithQuery` is the request path plus query string, e.g.
  `/api/instance/brand/assets?slot=favicon`.
- `rawBody` is the exact bytes sent (JSON text, or the full multipart body);
  an empty body hashes the empty string.
- Rejected if `|now − timestamp| > 300 s`, if the version is not `v1`, or if
  the HMAC differs (constant-time compare).
- No `INSTANCE_ADMIN_SECRET` in the container → every instance route answers
  `503`. There is no default key.
- Rate limit: 30 requests per minute per IP and route (in memory) → `429`
  with `Retry-After`.

### Example: bash + openssl

```bash
SECRET="$INSTANCE_ADMIN_SECRET"
BASE="https://crm.agence.example"
PATHQ="/api/instance/brand"
BODY='{"name":"Agence Nord","primaryColor":"#123456","accentColor":"#E4572E"}'
TS=$(date +%s)
BODY_HASH=$(printf '%s' "$BODY" | openssl dgst -sha256 -hex | awk '{print $NF}')
SIG=$(printf '%s' "$TS.PUT.$PATHQ.$BODY_HASH" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $NF}')
curl -sS -X PUT "$BASE$PATHQ" \
  -H "Content-Type: application/json" \
  -H "X-Instance-Timestamp: $TS" \
  -H "X-Instance-Signature: v1=$SIG" \
  --data-binary "$BODY"
```

For a `GET`, hash the empty string: `printf '' | openssl dgst -sha256 -hex`.

### Example: Node

```ts
import { createHash, createHmac } from "node:crypto";

async function instanceFetch(base: string, secret: string, method: string, pathWithQuery: string, body?: string | Buffer, headers: Record<string, string> = {}) {
    const ts = Math.floor(Date.now() / 1000);
    const bodyHash = createHash("sha256").update(body ?? "").digest("hex");
    const sig = createHmac("sha256", secret).update(`${ts}.${method}.${pathWithQuery}.${bodyHash}`).digest("hex");
    return fetch(base + pathWithQuery, {
        method,
        body,
        headers: { ...headers, "X-Instance-Timestamp": String(ts), "X-Instance-Signature": `v1=${sig}` },
    });
}

// Logo upload: build the multipart body yourself so the signed bytes are the sent bytes.
const boundary = `----cp${Date.now()}`;
const file = await fs.promises.readFile("logo.png");
const multipart = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="slot"\r\n\r\nfull\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="logo.png"\r\nContent-Type: image/png\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
]);
await instanceFetch(BASE, SECRET, "POST", "/api/instance/brand/assets", multipart, {
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
});
```

`lib/instance/auth.ts` exports `signInstanceRequest()`, which the control plane
can copy as-is.

### Public routes (no auth)

- `GET /api/brand/assets/:slot` — logo files.
- `GET /api/public-config` — runtime public config + resolved brand. Contains
  no secret.

---

## 6. Provisioning a new agency

1. **Build** once per release, not per agency:
   `docker build --build-arg GIT_SHA=$(git rev-parse --short HEAD) -t crm:<sha> .`
   and the migration image:
   `docker build --target migrate --build-arg GIT_SHA=… -t crm-migrate:<sha> .`
   Optional build arg/env `OPENREPLAY_INGEST_ORIGIN` sets the CSP host (§8).
2. **Create** an empty Postgres database for the agency.
3. **Migrate** (one-shot container, before traffic):
   `docker run --rm -e DATABASE_URL=… -e DIRECT_URL=… crm-migrate:<sha>`
   (`npm run db:migrate:deploy` outside Docker). `DIRECT_URL` is required by the
   schema; use the same value as `DATABASE_URL` when there is no pooler.
4. **Seed** reference data: `npm run db:seed:instance` (idempotent; permissions,
   role permissions, global action statuses, result categories, external
   endpoints, `BrandSettings` default row; `SystemConfig` keys all have code
   defaults, so none are written; no users, no prospect data, no secrets).
   Safe to re-run on every deploy.
5. **Start** the runtime container (`crm:<sha>`, port 5000) with the instance
   env (§7). It never migrates on start.
6. **Bootstrap** the first manager: signed `POST /api/instance/bootstrap
   {email, name}` → send the returned `inviteUrl` (24 h password-set link) to
   the agency. No password ever travels in clear.
7. **Brand**: signed `PUT /api/instance/brand` with names, emails, colours,
   font preset.
8. **Logos**: signed `POST /api/instance/brand/assets` for each slot.
9. **Check**: signed `GET /api/instance/health` → `dbOk: true`,
   `schemaVersion` = latest migration, `version` = the image SHA.

Upgrades: build → migrate (step 3) → roll the runtime container → health.
Migrations are additive-first so the old container keeps working during step 3.

---

## 7. Instance env

Required:

| Key | Notes |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | The agency's own database |
| `NEXTAUTH_URL` | `https://crm.agence.example` — also the app URL |
| `NEXTAUTH_SECRET` | Random, unique per instance |
| `ENCRYPTION_KEY` | Random, unique per instance; never rotate without a re-encryption plan |
| `INSTANCE_ADMIN_SECRET` | Shared only with the control plane |
| `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY_ID`, `MINIO_SECRET_ACCESS_KEY`, `MINIO_BUCKET` | One bucket (or prefix) per instance; needed for logo uploads and recordings |
| SMTP (`SMTP_*` / `SYSTEM_SMTP_*`) | Sender on the agency's domain |

Optional: `APP_URL` (when it differs from `NEXTAUTH_URL`), `SOCKET_URL`,
`SOCKET_PATH`, `OPENREPLAY_*`, `QONTO_*`, `PAPPERS_*`, `CRON_SECRET`, and the
integration keys listed in `docs/INTEGRATION_SECRETS_PROPOSAL.md`. OAuth redirect
URIs (`GOOGLE_REDIRECT_URI`, `MICROSOFT_REDIRECT_URI`, Slack) must use the
agency's domain and be registered with each provider.

---

## 8. The existing Captain Prospect database

The migration is **additive** (one new table, one seeded row, no change to
existing tables). The app tolerates the table being absent, so order does not
matter:

- Deploy first: the app renders the config defaults (= today's brand) and
  logs one warning per process until the table exists.
- Apply `prisma/migrations/20261025120000_add_brand_settings/migration.sql`
  (via `prisma migrate deploy`, or by hand like the other `docs/MANUAL_MIGRATION_*`
  files; it is idempotent: `CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
  The seeded row equals today's brand, so nothing changes visually.

---

## 9. Known limits

- `ListType.SUZALI` stays a Postgres enum value (existing rows depend on it);
  users see `companyShortName` as its label.
- The CSP `script-src` OpenReplay host is fixed at build
  (`OPENREPLAY_INGEST_ORIGIN`). An instance on another OpenReplay host needs its
  own build or a middleware-generated CSP header.
- Font families are fixed at build (three presets).
- Workers (`worker:enrichment`, `worker:messaging`) see brand changes within
  60 s; the web process sees them immediately.
- The instance API rate limit is in memory: correct for one container per
  instance, not for several replicas behind a load balancer.
- `/favicon.ico` is a static file in the image; browsers that ignore
  `<link rel="icon">` still show the default icon.
