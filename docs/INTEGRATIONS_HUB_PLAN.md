# Integrations Hub Plan

Status: proposal · Date: 2026-10-25

A single place in the CRM where managers (and, for personal connectors, SDRs) can see which integrations are ON, connect new ones, test them, and disconnect them, organised by the module each one serves.

---

## 1. Current state

About 15 integrations already exist, but they are scattered and stored four different ways.

| How it's stored | Examples |
|---|---|
| **Env vars only** (no UI) | Allo, Mistral, Serper, Apify, Apollo, Explorium, Pappers, Qonto, Mapbox, Google Places, SendGrid, Slack webhook |
| **`SystemConfig` key/value** | Leexi (the only item in Manager → Settings → Intégrations, `app/manager/settings/PlatformPanels.tsx`) |
| **Dedicated tables** | `Mailbox` (Gmail/Outlook OAuth), `GoogleDriveSync` (per user), `Messaging*` (Slack; built, no hub UI) |
| **`ApiKey`** | Public API v1 and MCP |

Other findings:
- `/developer/integrations` is actually an email-accounts page; the name is misleading.
- `process.env.*` credentials are read in about 76 files.
- Reusable as-is: `lib/encryption.ts` (AES-256-GCM), the settings shell (`components/settings`), BullMQ/outbox infra (see `MESSAGING_INTEGRATION_PLAN.md`), audit-log patterns (`VaultAuditEvent`, `EmailAuditLog`).

## 2. Design

### 2.1 Code registry
One manifest per connector in `lib/integrations/registry/`: `id`, `category`, `modules[]`, `authType` (`oauth` | `apikey` | `webhook` | `env`), form `fields`, `test()`, `status()`. Adding a connector means adding one file.

### 2.2 Data model
- `IntegrationConnection`: `connectorId`, `scope` (`ORG` | `USER` | `CLIENT`) + owner id, `status`, non-secret `config` (JSON), `secretsEnc` (encrypted), `lastCheckedAt`, `lastError`, `connectedById`.
- `IntegrationEvent`: connect / disconnect / test / error log.
- Existing tables (`Mailbox`, `GoogleDriveSync`, `Messaging*`) are **not migrated**. Their manifests only report status into the hub.
- Schema ships as a SQL migration file. Not applied to any live DB without explicit approval.

### 2.3 Resolver
`getCredentials(connectorId, scope)` looks up DB → env → "not configured". Existing env-based features keep working and can move to the UI without a redeploy. Call sites are migrated incrementally.

### 2.4 Hub page
`/manager/integrations`, top-level nav entry.
- Tabs: Catalogue (filterable by module) and Connectées.
- Card: status pill (Connecté / À configurer / Erreur / Via variable d'env), Test button, connect drawer, "used by" modules, last sync.
- SDRs see only personal connectors (own mailbox, own calendar). Client-scoped connectors may later appear in the client portal.

### 2.5 Contextual gates
A small `<IntegrationGate connector="…">` banner inside each module ("Connect Serper to enable Maps sourcing → Configure") linking to the hub.

## 3. Connectors per module

✅ = exists today. Others are suggestions.

| Module | Connectors |
|---|---|
| Calls | ✅ Allo, ✅ call-vault, ✅ Leexi; later Aircall / Ringover |
| Sourcing / enrichment | ✅ Serper, ✅ Apify, ✅ Apollo, ✅ Explorium, ✅ Pappers, ✅ Google Places, ✅ Mapbox, ✅ Annuaire |
| Email | ✅ Gmail, ✅ Outlook, ✅ SMTP/IMAP, ✅ SendGrid; possibly ReachInbox |
| RDV / agenda | Google / Outlook Calendar (create event + invite on booking); Cal.com / Calendly |
| Client reporting | CRM push to the client's tool (HubSpot, Pipedrive, Salesforce) for qualified RDVs |
| Comms | ✅ Slack (needs UI), then Teams, Discord, WhatsApp |
| Files | ✅ Google Drive, then OneDrive |
| Billing | ✅ Qonto, ✅ Pappers; accounting export (Pennylane) |
| AI / developer | ✅ Mistral, ✅ MCP + public API keys; outbound webhooks and Zapier/Make |

## 4. Phases

Each phase is shippable on its own.

- **Phase 0, foundation.** Registry, table, resolver, read-only hub page showing the real status of everything that exists. No behavior change.
- **Phase 1, key-based connectors.** Connect forms with test buttons for Allo, Serper, Apify, Mistral and other API-key connectors, with env fallback.
- **Phase 2, OAuth wrappers.** Gmail/Outlook, Drive and Slack get connect / disconnect / health through the hub. Rename or redirect the misnamed `/developer/integrations`.
- **Phase 3, new connectors.** Calendar sync, outbound webhooks + Zapier, client CRM push.
- **Phase 4, health.** Cron re-testing connections, manager alerts on broken tokens, audit trail.

## 5. Open decisions

1. **Scope:** org-wide only, or per-client too? Default proposed: org plus optional per-client overrides.
2. **Who manages:** managers only, or also BD / developers?
3. **Location:** top-level `/manager/integrations`, or a section inside Settings?
4. **First new connectors:** Calendar sync, client CRM push, or webhooks/Zapier?
