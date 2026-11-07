# Per-instance integration secrets — inventory and proposal

Status: **proposal only. No table, route or code has been written for this.**
Context: white-label = one image, one database and one container per agency
(see `docs/WHITE_LABEL.md`). This document covers step 9 of
`docs/WHITE_LABEL_PLAN.md`.

---

## 1. The key point first

Every integration key today is read from `process.env`. With **one container per
instance**, the control plane can already give each agency its own values by
injecting a different env into that container. Per-instance secrets therefore
work today with no code change.

An `IntegrationSecret` table is only needed if **agencies enter their own keys in
the CRM UI** (self-service: "paste your Allo key here") without going through
the control plane. Until that is a product requirement, the cheaper path is:

1. the control plane stores secrets in its own vault,
2. injects them as container env at deploy,
3. restarts the container to rotate.

The rest of this document describes the table for when self-service is wanted.

---

## 2. Inventory of env keys read by the app

Scan of `process.env.*` in `app/`, `lib/`, `workers/`, `scripts/`,
`components/`, `hooks/`, `prisma/`, `middleware.ts`, `next.config.ts`
(139 distinct keys, 2026-10-25). "Scope" says what the value should be in a
white-label deployment:

- **instance** — each agency must have its own value (its account, its
  database, its signing key).
- **platform** — may be shared by every instance (an account the operator pays
  for and resells), but can still be overridden per container.
- **tuning** — non-secret knobs; defaults are fine.

### 2.1 Core (must differ per instance)

| Key | Provider | Read in | Scope | Secret |
|---|---|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Postgres | `lib/prisma.ts`, `lib/config.ts`, `prisma/schema.prisma` | instance | yes |
| `NEXTAUTH_SECRET` | NextAuth | `lib/config.ts`, `app/api/enrichment/company-ai/route.ts` (+ next-auth itself) | instance | yes |
| `AUTH_SECRET` | NextAuth (fallback name) | `app/api/enrichment/company-ai/route.ts` | instance | yes |
| `NEXTAUTH_URL` | NextAuth | `lib/email/providers/types.ts`, `app/api/client/reporting/share/route.ts`, `app/api/manager/broadcast-emails/route.ts` | instance | no |
| `APP_URL`, `NEXT_PUBLIC_APP_URL` | App URL | `lib/runtime-config/env.ts`, `lib/brand/resolve.ts`, Slack OAuth, messaging render | instance | no |
| `ENCRYPTION_KEY` | AES-256-GCM (`lib/encryption.ts`) | `lib/encryption.ts` | instance | yes |
| `CRON_SECRET`, `BILLING_CRON_SECRET` | Cron routes | `app/api/cron/*`, `app/api/billing/cron/month-end/route.ts` | instance | yes |
| `INSTANCE_ADMIN_SECRET` | Control-plane HMAC (`lib/instance/auth.ts`) | instance API routes | instance | yes |
| `ALLOWED_ORIGINS` | CORS | `lib/config.ts` | instance | no |

### 2.2 Integrations

| Key | Provider | Read in | Scope | Secret |
|---|---|---|---|---|
| `ALLO_API_KEY` | Allo (telephony) | 9 files, e.g. `app/api/actions/[id]/recording/route.ts`, `app/api/analytics/stats/route.ts` | instance | yes |
| `ALLO_WEBHOOK_SECRET` | Allo webhook | `app/api/webhooks/allo/route.ts` | instance | yes |
| `ALLO_NUMBERS` | Allo lines | `lib/call-enrichment/enrich-action.ts` | instance | no |
| `LEEXI_API_KEY_ID`, `LEEXI_API_KEY_SECRET` | Leexi | `lib/leexi/service.ts`, `app/api/system-config/leexi/route.ts` | instance | yes |
| `QONTO_API_KEY`, `QONTO_ORG_ID` | Qonto (billing) | `lib/billing/qonto-service.ts` | instance | yes |
| `QONTO_ENABLED` / `NEXT_PUBLIC_QONTO_ENABLED` | Qonto flag | `lib/runtime-config/server.ts` | instance | no |
| `PAPPERS_API_KEY` | Pappers | `lib/billing/pappers-service.ts` | platform | yes |
| `PAPPERS_ENABLED` / `NEXT_PUBLIC_PAPPERS_ENABLED` | Pappers flag | `lib/runtime-config/server.ts` | instance | no |
| `OPENAI_API_KEY` | OpenAI (also every `lib/ai/mistral*.ts` — the "Mistral" modules call OpenAI) | 33 files | platform | yes |
| `OPENAI_MODEL`, `OPENAI_LARGE_MODEL`, `OPENAI_ASSISTANT_MODEL`, `OPENAI_TRANSCRIBE_MODEL`, `OPENAI_WEB_MODEL` | OpenAI models | `lib/ai/*` | tuning | no |
| `GEMINI_API_KEY` | Google Gemini | `app/api/ai/generate-cr/route.ts`, `app/api/ai/onboarding/route.ts`, … | platform | yes |
| `WHISPER_API_URL` | Self-hosted Whisper | `lib/ai/mistral-transcribe.ts` | platform | no |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`, `MICROSOFT_REDIRECT_URI` | Microsoft 365 mail OAuth | `lib/email/providers/types.ts` | instance (redirect URI is per domain) | secret: yes |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_PUBSUB_TOPIC` | Gmail OAuth | `lib/email/providers/types.ts`, `lib/email/providers/gmail.ts` | instance (redirect URI is per domain) | secret: yes |
| `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REDIRECT_URI` | Google Drive | `lib/google-drive.ts` | instance | secret: yes |
| `GOOGLE_PLACES_API_KEY` | Google Places | `lib/enrichment/google-places-phone.ts` | platform | yes |
| `MAPBOX_ACCESS_TOKEN` | Mapbox | `lib/enrichment/mapbox-phone.ts` | platform | yes |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`, `SLACK_APP_ID` | Slack app | `lib/config.ts`, `lib/integrations/messaging/adapters/slack/*` | platform app, per-instance redirect | yes |
| `SLACK_WEBHOOK_URL`, `SLACK_CLIENTS_LIVE_WEBHOOK_URL` | Slack incoming webhooks | `lib/slack/clientsLive.ts`, `lib/config.ts` | instance | yes |
| `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` | Supabase storage (reports) | `lib/storage/supabase-report-storage.ts` | instance | key: yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | `scripts/*` only | — | yes |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`/`SMTP_PASSWORD`, `SMTP_FROM`, `EMAIL_FROM` | Transactional SMTP | `lib/email/transactional.ts`, `lib/config.ts` | instance (sender domain) | pass: yes |
| `SYSTEM_SMTP_HOST`, `SYSTEM_SMTP_PORT`, `SYSTEM_SMTP_USER`, `SYSTEM_SMTP_PASS`/`SYSTEM_SMTP_PASSWORD`, `SYSTEM_SMTP_FROM` | System SMTP | `lib/email/transactional.ts`, `app/api/clients/[id]/sessions/route.ts` | instance | pass: yes |
| `SENDGRID_API_KEY` | SendGrid | `lib/config.ts` | instance | yes |
| `EMAIL_TRACKING_DOMAIN`, `EMAIL_TRACKING_ENABLED` | Email tracking | `lib/email/services/sending-service.ts` | instance | no |
| `REACHINBOX_API_BASE`, `REACHINBOX_WEBHOOK_SECRET` | ReachInbox | `lib/email/providers/reachinbox.ts`, `app/api/email/webhooks/reachinbox/route.ts` | instance | secret: yes |
| `WEBHOOK_SECRET` | Outlook webhooks | `lib/email/providers/outlook.ts` | instance | yes |
| `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY_ID`, `MINIO_SECRET_ACCESS_KEY`, `MINIO_REGION`, `MINIO_BUCKET` | MinIO / S3 (recordings, brand logos) | `lib/storage/minio.ts`, `lib/storage/storage-service.ts` | instance bucket | yes |
| `ASW_ACCESS_KEY_ID`, `ASW_SECRET_ACCESS_KEY`, `ASW_REGION`, `ASW_S3_BUCKET`, `STORAGE_PROVIDER` | AWS S3 alternative | `lib/storage/storage-service.ts` | instance | yes |
| `VAULT_API_URL`, `VAULT_API_KEY` | Call vault service | `lib/call-vault-client.ts`, `app/api/actions/[id]/recording/route.ts` | instance | key: yes |
| `APIFY_API_TOKEN` | Apify | `lib/listing/apify-service.ts`, `lib/sourcing/providers.server.ts` | platform | yes |
| `SERPER_API_KEY` | Serper (Maps sourcing) | `lib/sourcing/providers.server.ts` | platform | yes |
| `SERP_API_KEY` | SerpAPI | `app/api/enricher/serp-lookup/route.ts` | platform | yes |
| `EXPLORIUM_API_KEY` | Explorium | `lib/explorium.ts` | platform | yes |
| `APOLLO_API_KEY`, `APOLLO_ENABLED` | Apollo | `lib/config.ts` | platform | key: yes |
| `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Redis / BullMQ | `lib/email/queue/index.ts`, `lib/email/services/sequence-service.ts` | instance (or prefix per instance) | password: yes |
| `OPENREPLAY_PROJECT_KEY`, `OPENREPLAY_INGEST_POINT`, `OPENREPLAY_ENABLED` (+ legacy `NEXT_PUBLIC_*`) | OpenReplay | `lib/runtime-config/server.ts` | instance | no (public key) |
| `OPENREPLAY_INGEST_ORIGIN` | OpenReplay CSP host (build arg) | `next.config.ts` | image | no |
| `SOCKET_URL`, `SOCKET_PATH` (+ legacy `NEXT_PUBLIC_*`) | Comms Socket.IO server | `lib/runtime-config/server.ts` | instance | no |

Not found in the code: **Cognism** (no key read anywhere) and a separate
**Mistral** key (all `mistral*` modules use `OPENAI_API_KEY` and an OpenAI URL).

### 2.3 Tuning and runtime (not secrets)

`ALLO_ENRICH_CONCURRENCY`, `CALL_ENRICHMENT_*` (13 keys), `STATS_ALLO_*`,
`GOOGLE_PLACES_PHONE_CACHE_HOURS`, `PHONE_DEFAULT_COUNTRY`, `COOLDOWN_*`,
`FEATURE_*`, `API_TIMEOUT`, `MAX_RETRIES`, `RATE_LIMIT_MAX`,
`MESSAGING_OUTBOX_MAX_ATTEMPTS`, `EXTERNAL_API_METRICS_DISABLED`, `LOG_LEVEL`,
`LOG_FILE`, `DEFAULT_SDR_MANAGER_ID`, `NODE_ENV`, `VERCEL`, `REPLIT_DEV_DOMAIN`,
`GIT_SHA`.

### 2.4 Secrets already in the database

- **Leexi**: `app/api/system-config/leexi/route.ts` stores `leexiApiKeyId` /
  `leexiApiKeySecret` in `SystemConfig` (DB first, env fallback). Stored **in
  clear**; it should move to the encrypted table below.
- **Mailbox OAuth tokens, Slack bot tokens, Cal.com credentials, vault
  credentials**: encrypted with `lib/encryption.ts` (`lib/email/services/*`,
  `lib/integrations/messaging/adapters/slack/index.ts`,
  `app/api/clients/[id]/cal-credentials/route.ts`, `lib/vault/*`).

---

## 3. `ENCRYPTION_KEY` and `NEXTAUTH_SECRET`

Both **must be unique per instance** and generated by the control plane at
provisioning (32+ random bytes). Never copy them from Captain Prospect.

### `ENCRYPTION_KEY`

`lib/encryption.ts` derives an AES-256-GCM key with PBKDF2-SHA512 (100 000
iterations, random 64-byte salt per value) from the env string. The stored
format is `salt:iv:tag:ciphertext` and carries **no key identifier**.

Rotation today breaks every encrypted value:

- mailbox OAuth tokens (Gmail/Outlook sync and sending stop until reconnect),
- Slack bot tokens (messaging integration),
- Cal.com credentials, vault/portal credentials emailed to clients.

`decrypt()` throws `Failed to decrypt data`; there is no fallback to an old key.
Missing `ENCRYPTION_KEY` throws on first use.

Required change before any rotation: a key ring (`ENCRYPTION_KEYS="v2:…,v1:…"`),
new values prefixed `v2$salt:iv:tag:ct`, `decrypt()` trying the version named in
the prefix (unprefixed = v1), and a re-encryption script.

### `NEXTAUTH_SECRET`

Signs and encrypts the NextAuth JWT session cookie. Rotating it logs every user
out (acceptable, no data loss). It is also the HMAC key for the company-AI
enrichment route (`app/api/enrichment/company-ai/route.ts`), which falls back to
the hard-coded `"company-ai-ephemeral-dev-key"` when both secrets are missing:
in production `lib/config.ts` reports `NEXTAUTH_SECRET is required`, but the
fallback should be removed so a misconfigured instance fails closed.

A shared `NEXTAUTH_SECRET` across instances would let a session cookie from one
agency be accepted by another instance where a user with the same id exists.
Unique per instance is mandatory.

---

## 4. `IntegrationSecret` (for self-service keys)

### Schema

```prisma
model IntegrationSecret {
  key        String   @id            // "ALLO_API_KEY", "QONTO_API_KEY", …
  ciphertext String   @db.Text       // lib/encryption.ts format, prefixed with keyVersion
  keyVersion Int      @default(1)    // which ENCRYPTION_KEYS entry encrypted it
  last4      String?                 // shown in the UI ("…a9F2"), never the value
  updatedBy  String?                 // user id or "instance-api"
  updatedAt  DateTime @updatedAt
}
```

`key` is unique (it is the primary key) and restricted to an allow-list in code
(`lib/secrets/registry.ts`: key, label, provider, scope, validation regex,
whether a test call exists). Unknown keys are rejected.

### Lookup order

```
getSecret("ALLO_API_KEY")
  1. IntegrationSecret row (decrypted, cached in memory 60 s, invalidated on write)
  2. process.env.ALLO_API_KEY
  3. undefined → the feature reports "not configured"
```

All call sites move from `process.env.X` to `await getSecret("X")`, provider by
provider. Synchronous call sites resolve once at the route/worker boundary and
pass the value down (same pattern as the brand, plan A11).

### Encryption and versioning

- Encrypt with `lib/encryption.ts` once it supports the key ring (section 3).
- `keyVersion` is redundant with the ciphertext prefix but lets a script find
  rows still on an old key: `WHERE "keyVersion" < current`.
- Rotation: add the new key to `ENCRYPTION_KEYS` first, run the re-encryption
  script (decrypt with old, encrypt with new, bump `keyVersion`), then remove
  the old key at the next deploy.

### Access and audit

- Write: manager only (`requireRole(["MANAGER"])`), or the signed instance API.
  The API never returns a value, only `{ key, configured, last4, updatedAt, updatedBy }`.
- Audit every write and delete with `audit()` (`action: "SECRET_UPDATE" | "SECRET_DELETE"`,
  `entityType: "IntegrationSecret"`, `before/after` = `{ configured, last4 }`, never
  the value).
- Audit reads in bulk, not per call: a counter per key and day
  (`metadata.reads`) is enough to spot an unexpected consumer without writing
  one row per API call.
- Optional "test connection" per provider that calls a cheap endpoint and
  reports ok / invalid.

### Migration path

1. Ship the key ring in `lib/encryption.ts` (backwards compatible: unprefixed
   values decrypt with the current key).
2. Add the table (additive migration) and `getSecret()` with env fallback. No
   behaviour change: the table is empty, env still wins by default.
3. Move Leexi from plaintext `SystemConfig` into the table (one-shot script,
   then delete the two `SystemConfig` rows).
4. Convert call sites provider by provider (Allo, Qonto, Pappers, OpenAI,
   Gemini, SMTP, …), each behind the env fallback so a half-migrated instance
   keeps working.
5. Manager UI "Intégrations" listing configured / not configured, with set,
   replace and remove.
6. Once the control plane writes secrets through the instance API, stop
   injecting the corresponding env vars.
