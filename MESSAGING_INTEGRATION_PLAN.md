# Messaging Integration Plan — Slack / Discord / Teams
**Two-way bridge between the CRM and a professional chat platform**

Status: proposal · Date: 2026-09-21

---

## 1. Why, in one paragraph

Today the CRM already pushes two events to Slack through a single incoming webhook
(`lib/slack/clientsLive.ts`: new support message, late no-show). It is one-way, one
channel, hard-coded, fire-and-forget, and silently does nothing if the webhook is missing.

The goal is a **provider-agnostic, two-way messaging bridge**: every meaningful RDV
and client-support event lands in the right channel, stays *alive* (the message is
edited as the RDV progresses instead of spamming new ones), and the team can **act
from the chat platform** — reply to a client, confirm an RDV, flag a no-show, open a
ticket — without opening the CRM.

The thing to build is not "a Slack notifier". It is an **event bus + an outbox + a
link table**, with Slack as the first adapter.

---

## 2. Current state (what exists, what it costs us)

| Piece | Where | Verdict |
|---|---|---|
| Slack incoming webhook | `lib/slack/clientsLive.ts` | Keep the *formatting* ideas (blocks, `esc()`, truncate, fr-FR dates). Replace the transport. |
| Call sites | `lib/notifications.ts:441` (`notifyManagersClientSupportMessage`), `app/api/manager/rdv-absences/route.ts:24` | 2 sites → become `emitCrmEvent()` calls. |
| Config | `lib/config.ts:95` (`SLACK_WEBHOOK_URL`, `SLACK_CLIENTS_LIVE_WEBHOOK_URL`) | Keep as legacy fallback for one release, then remove. |
| In-app notifications | `Notification` model + `lib/notifications.ts` | Untouched. Chat is an *additional* fan-out target, never a replacement. |
| Encryption at rest | `lib/encryption.ts` (AES-256-GCM), `VaultCredential` / `ClientCalCredential` pattern | Reuse verbatim for bot tokens and signing secrets. |
| Job infra | `bullmq` + `ioredis` + `workers/enrichment.ts`, `after()` from `next/server` | Reuse for the outbox worker. No new infra. |
| Rate limiting | `lib/rate-limit.ts` | Reuse on inbound webhooks. |
| Audit pattern | `VaultAuditEvent`, `EmailAuditLog`, `TicketHistory` | Mirror for inbound chat actions. |

**Structural weakness to fix:** the current calls are `void fn().catch(() => {})`. On a
serverless deploy the request can end before the fetch resolves — notifications are
lost with no trace. Everything outbound must go through a **durable outbox**.

---

## 3. Architecture

```
  write path (business logic unchanged)
  ActionService · support/service · rdv routes · tickets
                 │
                 │  emitCrmEvent({ type, entity, payload, actorId })
                 ▼
        ┌──────────────────────┐
        │   Event bus (typed)  │  lib/integrations/messaging/events.ts
        └──────────┬───────────┘
                   │ resolve routes (client / mission / severity / event type)
                   ▼
        ┌──────────────────────┐
        │  MessagingOutbox     │  durable rows: dedupeKey, serialKey, attempts
        └──────────┬───────────┘
                   │ BullMQ worker  (+ cron drain as a safety net)
                   ▼
        ┌──────────────────────┐        ┌───────────────────────────┐
        │  Provider adapter    │ ─────▶ │ Slack / Discord / Teams   │
        │  post · edit · thread│ ◀───── │ Events · Interactivity    │
        └──────────┬───────────┘        └───────────────────────────┘
                   │ persist (channelId, messageTs)
                   ▼
        ┌──────────────────────┐
        │   MessagingLink      │  CRM entity ⇄ chat message  (the keystone)
        └──────────────────────┘
                   ▲
                   │ inbound: thread reply / button / slash command
                   │ → resolve entity → authorise CRM user → apply mutation
        ┌──────────┴───────────┐
        │  Inbound dispatcher  │  app/api/integrations/messaging/[provider]/…
        └──────────────────────┘
```

### 3.1 The keystone: `MessagingLink`

Without it you have a notifier. With it you have an integration. It maps
`(entityType, entityId)` → `(workspace, channelId, messageTs)`, which buys:

- **Edit in place.** An RDV message carries a live status badge
  (`🟡 À confirmer` → `🟢 Confirmé` → `👻 Absent` → `⏸️ Stand-by`) instead of five
  separate messages burying each other.
- **Threading.** Every later event on the same RDV / conversation / ticket goes into
  *its* thread. The channel stays a readable board.
- **Reverse lookup.** A reply arriving in thread `1727…123456` resolves back to
  `SupportConversation#abc` — that is what makes two-way possible at all.
- **Echo suppression.** A message whose `ts` we wrote ourselves never re-enters the CRM.

---

## 4. Data model (Prisma)

```prisma
enum MessagingProvider { SLACK DISCORD TEAMS GOOGLE_CHAT GENERIC_WEBHOOK }
enum MessagingDeliveryStatus { PENDING SENDING SENT FAILED DEAD_LETTER SKIPPED }
enum MessagingEntityType { ACTION SUPPORT_CONVERSATION TICKET DIGEST MISSION CLIENT }
enum MessagingVisibility { INTERNAL CLIENT_SHARED }   // drives redaction

/// One installed workspace / guild / tenant.
model MessagingWorkspace {
  id             String            @id @default(cuid())
  provider       MessagingProvider
  externalTeamId String                       // Slack T…, Discord guild id
  teamName       String?
  /// AES-256-GCM via lib/encryption.ts. Never returned to the browser.
  botTokenEnc    String?
  signingSecretEnc String?
  botUserId      String?                      // echo suppression
  appId          String?
  scopes         String[]          @default([])
  isActive       Boolean           @default(true)
  installedById  String?
  installedBy    User?             @relation(fields: [installedById], references: [id], onDelete: SetNull)
  lastHealthyAt  DateTime?
  lastErrorAt    DateTime?
  lastError      String?           @db.Text
  routes         MessagingRoute[]
  links          MessagingLink[]
  identities     MessagingIdentity[]
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  @@unique([provider, externalTeamId])
}

/// Routing rule: which events, for which scope, go to which channel.
/// Most specific wins: mission > client > global.
model MessagingRoute {
  id           String              @id @default(cuid())
  workspaceId  String
  workspace    MessagingWorkspace  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  label        String
  channelId    String                            // C… / channel id / webhook url
  channelName  String?
  /// Empty = every event type. Otherwise ["rdv.booked", "support.*"] (glob ok).
  eventTypes   String[]            @default([])
  clientId     String?
  client       Client?             @relation(fields: [clientId], references: [id], onDelete: Cascade)
  missionId    String?
  mission      Mission?            @relation(fields: [missionId], references: [id], onDelete: Cascade)
  visibility   MessagingVisibility @default(INTERNAL)
  /// Only fire when severity >= this (e.g. NEGATIVE / NO_SHOW only).
  minSeverity  Int                 @default(0)
  isActive     Boolean             @default(true)
  /// Accept inbound replies from this channel back into the CRM.
  allowInbound Boolean             @default(true)
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
  @@index([workspaceId, isActive])
  @@index([clientId])
  @@index([missionId])
}

/// CRM entity ⇄ posted message. The keystone.
model MessagingLink {
  id           String              @id @default(cuid())
  workspaceId  String
  workspace    MessagingWorkspace  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  entityType   MessagingEntityType
  entityId     String
  channelId    String
  messageTs    String                            // Slack ts / Discord message id
  /// Parent when this row is a thread reply we posted.
  rootTs       String?
  /// Hash of the last rendered payload — skip a no-op edit.
  renderHash   String?
  isRoot       Boolean             @default(true)
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
  @@unique([workspaceId, channelId, messageTs])
  @@index([entityType, entityId])
  @@index([workspaceId, rootTs])
}

/// Durable outbound queue. Survives a serverless cold stop.
model MessagingOutbox {
  id            String                  @id @default(cuid())
  workspaceId   String
  routeId       String?
  eventType     String
  entityType    MessagingEntityType
  entityId      String
  /// Render-agnostic payload; the adapter formats at send time.
  payload       Json
  /// Same key = same logical message. Blocks double-posting on retry.
  dedupeKey     String                  @unique
  /// Rows sharing a serialKey are processed in order (one RDV = one lane).
  serialKey     String
  status        MessagingDeliveryStatus @default(PENDING)
  attempts      Int                     @default(0)
  nextAttemptAt DateTime?
  lastError     String?                 @db.Text
  sentAt        DateTime?
  createdAt     DateTime                @default(now())
  @@index([status, nextAttemptAt])
  @@index([serialKey])
  @@index([entityType, entityId])
}

/// Chat user ⇄ CRM user. Required before any inbound mutation is honoured.
model MessagingIdentity {
  id             String             @id @default(cuid())
  workspaceId    String
  workspace      MessagingWorkspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  externalUserId String                        // Slack U…
  externalName   String?
  userId         String
  user           User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  linkedAt       DateTime           @default(now())
  lastSeenAt     DateTime?
  @@unique([workspaceId, externalUserId])
  @@index([userId])
}

/// Inbound idempotency + audit of anything done from chat.
model MessagingInboundEvent {
  id              String   @id @default(cuid())
  workspaceId     String
  /// Slack event_id / Discord interaction id. Providers retry aggressively.
  externalEventId String   @unique
  kind            String                        // message | interaction | command
  rawPayload      Json
  handledAt       DateTime?
  resultSummary   String?
  error           String?  @db.Text
  createdAt       DateTime @default(now())
  @@index([workspaceId, createdAt])
}

/// Free-text note dropped in an RDV thread from chat. Actions have no comment
/// model today; this is the smallest addition that keeps the conversation
/// attached to the RDV. (See open question #3.)
model ActionComment {
  id        String   @id @default(cuid())
  actionId  String
  action    Action   @relation(fields: [actionId], references: [id], onDelete: Cascade)
  authorId  String?
  author    User?    @relation(fields: [authorId], references: [id], onDelete: SetNull)
  content   String   @db.Text
  /// "slack" | "crm" — so the UI can show the origin badge.
  origin    String   @default("crm")
  createdAt DateTime @default(now())
  @@index([actionId, createdAt])
}
```

Optional per-client shortcut (avoids a route row for the common case):
`Client.messagingChannelId String?` + `Client.messagingSharedWithClient Boolean @default(false)`.

---

## 5. Event catalogue

Severity drives `minSeverity` routing: `0` info · `1` notable · `2` needs attention · `3` urgent.

### 5.1 RDV / meetings

| Event | Emitted from | Sev | Chat behaviour |
|---|---|---|---|
| `rdv.booked` | `ActionService.createAction` (`MEETING_BOOKED`) | 1 | **New root message** + `MessagingLink` |
| `rdv.rescheduled` | `app/api/manager/rdv/[id]`, `sendRdvRescheduledEmailNotification` | 2 | Edit root (new date) + thread note |
| `rdv.cancelled` | `MEETING_CANCELLED` + `cancellationReason` | 2 | Edit root → `🔴 Annulé` + reason in thread |
| `rdv.confirmation_changed` | `Action.confirmationStatus` (SAS RDV) | 1 | Edit root badge |
| `rdv.fiche_updated` | `Action.rdvFiche` | 0 | Thread note (throttled, 1 per 10 min) |
| `rdv.feedback_submitted` | `client` / `commercial` / `manager` `…/feedback` routes | 1–3 | Thread: outcome + recontact + client note. `NEGATIVE` / `NO_SHOW` → sev 3 |
| `rdv.no_show_reported` | `app/api/manager/rdv-absences` (`MANAGER_MANUAL`) | 3 | Edit root → `👻 Absent` + thread + `@here` on the alerts route |
| `rdv.stand_by` | `MeetingFeedback.standByAt` set / cleared | 1 | Edit root → `⏸️ Stand-by` + reason |
| `rdv.reminder` | `app/api/cron/meeting-reminders` | 1 | Thread ping at T-24h / T-1h |
| `call.enriched` | `lib/call-enrichment/enrich-action.ts` | 0 | Thread: AI `callSummary` + recording link |
| `opportunity.created` | `ActionService` (`INTERESTED`) | 1 | Root message on the opportunities route |

### 5.2 Client support

| Event | Emitted from | Sev | Chat behaviour |
|---|---|---|---|
| `support.conversation_created` | `createClientConversation` | 2 | **Root message** — client, intent, subject, first message, action buttons |
| `support.client_message` | `postMessage` (role `CLIENT`) | 2 | Thread reply |
| `support.manager_reply` | `postMessage` (role `MANAGER`) | 0 | Thread reply marked "↩︎ répondu par X depuis le CRM" — keeps the Slack thread a faithful mirror |
| `support.attachment_added` | `SupportAttachment` | 0 | Thread, image unfurled via a signed short-TTL URL |
| `support.resolved` / `support.reopened` | `resolveConversation` / `reopenConversation` | 1 | Edit root badge → `✅ Résolu` |
| `support.sla_breach` | cron: no `MANAGER` reply within N min | 3 | Re-post in thread + `@here`, then DM the on-call manager |
| `ticket.created_from_support` | `Ticket.sourceSupportMessageId` | 1 | Thread + root message on the dev route |
| `ticket.status_changed` / `ticket.completed` | `TicketHistory` | 0–1 | Edit the ticket root badge |

### 5.3 Free wins once the bus exists

`sdr.daily_feedback_submitted` · `planning.conflict_detected` (`PlanningConflict`) ·
`mailbox.sync_failed` (`MailboxSyncStatus`) · `invoice.overdue` ·
`prospect.decision_logged` · `broadcast.sent` · `onboarding.step_completed`.

Ship the bus; each of these is ~20 lines afterwards.

---

## 6. Two-way: what the team can do from chat

### 6.1 Thread replies (the main one)

| Thread of | A plain reply becomes |
|---|---|
| Support conversation | `SupportMessage{ role: MANAGER, authorId: <linked user> }` → the client sees it in the portal immediately |
| RDV | `ActionComment{ origin: "slack" }` |
| Ticket | `TicketComment` |

Guards: the author must resolve through `MessagingIdentity` to a CRM user with the
right role; bot and own messages ignored; edits and deletions ignored in v1;
attachments on a support reply are downloaded and re-stored through `lib/storage`.

### 6.2 Buttons and modals

- **RDV**: `✅ Confirmer` · `👻 Marquer absent` · `⏸️ Stand-by` (modal: reason) · `📝 Fiche RDV` · `👤 Réassigner SDR`
- **Support**: `↩︎ Répondre` (modal) · `✅ Résoudre` · `🎫 Créer un ticket` (modal → `Ticket`) · `📌 Épingler`
- **Ticket**: `▶︎ Prendre` (assign to self) · status select · `✅ Terminé`

Every button re-checks CRM permissions server-side (`lib/permissions`). A chat button
is an untrusted request, not an authorisation.

### 6.3 Reaction shortcuts

`✅` on an RDV root = confirm. `👀` on a support root = "manager en cours" (a claim
marker the whole team can see). Cheap, and people actually use it.

### 6.4 Slash commands

`/crm rdv today [client]` · `/crm rdv <ref>` · `/crm client <name>` (live stats) ·
`/crm support open` · `/crm link` (identity linking via a signed magic link) ·
`/crm digest now`.

### 6.5 Ask the CRM

`@CRM combien de RDV pour Acme cette semaine ?` routes to the assistant that already
exists (`lib/ai`, `AssistantConversation`), answers in thread, logs to
`AssistantActionLog`. This is a new front door for a feature already built.

### 6.6 Link unfurling

Paste a CRM URL in Slack → `link_shared` → rich preview of the RDV / ticket / client,
**only** when the channel is authorised for that client. A nice touch that also
quietly forces the scoping model to be correct.

---

## 7. Digests and recaps (scheduled)

| Digest | Default schedule (Europe/Paris) | Destination |
|---|---|---|
| RDV du jour | 08:00, weekdays | per-client channel + `#rdv-live` |
| Recap de fin de journée | 18:30 | same — booked / confirmed / cancelled / no-show counts, top SDRs |
| Support ouvert | 09:00 and 15:00 | `#support` — open conversations by age, oldest first |
| Hebdo client | Monday 09:00 | client-shared channel (redacted) |
| Alertes SLA | every 15 min | `#alerts` |

Implementation: one `app/api/cron/messaging-digests` entry plus a schedule table.
`vercel.json` currently declares **one** cron — check the plan's quota before adding
five, or run them as BullMQ repeatable jobs on the worker (preferable, and independent
of the deploy target).

---

## 8. Provider adapters

```ts
export interface MessagingAdapter {
  readonly provider: MessagingProvider;
  post(ch: string, msg: RenderedMessage, opts?: { threadTs?: string }): Promise<PostResult>;
  edit(ch: string, ts: string, msg: RenderedMessage): Promise<void>;
  addReaction?(ch: string, ts: string, emoji: string): Promise<void>;
  openModal?(triggerId: string, modal: RenderedModal): Promise<void>;
  verifyInbound(req: Request, rawBody: string): Promise<VerifyResult>;
  parseInbound(payload: unknown): Promise<InboundEvent[]>;
  listChannels(): Promise<ChannelRef[]>;
}
```

`RenderedMessage` is provider-neutral (title, severity, fields, context, actions,
links); each adapter renders it — Slack Block Kit, Discord embeds + components, Teams
Adaptive Cards. Templates live in `lib/integrations/messaging/render/` and stay
testable without a network call.

| Provider | Outbound | Inbound free text | Buttons | Notes |
|---|---|---|---|---|
| **Slack** | ✅ `chat.postMessage` / `chat.update` | ✅ Events API | ✅ | First-class. Ship this. |
| **Discord** | ✅ webhook or bot REST | ⚠️ needs a **gateway** WebSocket — not serverless | ✅ Interactions endpoint (plain HTTP) | v1: buttons + slash commands only; free-text replies need the worker to hold a gateway session |
| **Teams** | ✅ Incoming webhook / Bot Framework | ✅ via Bot Framework | ✅ Adaptive Cards | Heaviest setup (Azure app registration) |
| **Google Chat** | ✅ | ✅ | ✅ Cards v2 | Cheap third option |
| **Generic webhook** | ✅ | ❌ | ❌ | Escape hatch: Mattermost, n8n, Zapier |

**Recommendation: Slack fully, Discord as an interaction-only second adapter, Teams
behind a flag.** Discord's gateway requirement is exactly why Slack goes first — the
repo does run a worker process (`workers/`), so a Discord gateway is feasible, but it
is not free.

---

## 9. Inbound endpoints

```
app/api/integrations/messaging/slack/events/route.ts         # Events API + url_verification
app/api/integrations/messaging/slack/interactivity/route.ts  # buttons, modals, shortcuts
app/api/integrations/messaging/slack/commands/route.ts       # /crm …
app/api/integrations/messaging/slack/oauth/callback/route.ts # install flow
app/api/integrations/messaging/discord/interactions/route.ts # Ed25519-verified
```

Hard rules:

1. **Verify before parsing.** Slack: `v0=` HMAC-SHA256 over `v0:{ts}:{rawBody}` with the
   signing secret, timing-safe compare, reject when `|now − ts| > 5 min` (replay).
   Discord: Ed25519 over `timestamp + body`. Both need the **raw** body — call
   `await req.text()` before any JSON parsing.
2. **Ack in under 3 s.** Return `200` immediately and do the work in `after()` (already
   used in this codebase) or enqueue it. Slack retries three times on timeout and shows
   users an error.
3. **Idempotency.** `MessagingInboundEvent.externalEventId` is unique → a retry is a no-op.
4. **Echo suppression.** Drop anything with a `bot_id`, or authored by
   `workspace.botUserId`, or whose `ts` already exists in `MessagingLink`.
5. **Rate limit** per workspace with `lib/rate-limit.ts`.

---

## 10. Security, privacy, scoping

- **Secrets**: bot tokens and signing secrets encrypted with `lib/encryption.ts`
  (AES-256-GCM), same discipline as `ClientCalCredential` / `VaultCredential`. Never
  serialised to the browser; the settings UI shows `xoxb-…abcd`.
- **Slack OAuth scopes (minimum)**: `chat:write`, `chat:write.public`, `channels:read`,
  `groups:read`, `channels:history`, `groups:history`, `users:read`, `users:read.email`,
  `commands`, `reactions:read`, `files:write`, `links:read`, `links:write`, `im:write`.
- **Authorisation is CRM-side.** Channel membership is not a CRM permission. Every
  mutation resolves `MessagingIdentity → User` and re-runs the normal permission check.
  An unlinked user gets an ephemeral "lie ton compte avec `/crm link`".
- **Client-shared channels** (Slack Connect) are both the killer feature and the biggest
  leak risk. A `CLIENT_SHARED` route must:
  - hard-filter on `clientId` in the route resolver, never trusting the renderer;
  - apply a **redaction profile** — no SDR internal notes, no `callTranscription`, no
    prospect phone or email, no other clients' names, no cancellation blame;
  - be visually distinct in the admin UI and require a second confirmation to enable.
- **PII by default**: prospect phone and email stay out of internal channels too. A deep
  link into the CRM is enough, and it keeps the access trail where it belongs.
- **Audit**: every inbound mutation writes `MessagingInboundEvent.resultSummary` plus the
  domain's own history row (`TicketHistory`, `SupportMessage.authorId`, …), so "who
  confirmed this RDV?" is answerable.
- **Blast radius**: revoking a workspace disables routes but preserves links, so history
  stays readable.

---

## 11. Reliability

- **Outbox with backoff**: attempts at 0 s, 30 s, 2 min, 10 min, 1 h, 6 h → `DEAD_LETTER`.
- **Serial lanes**: `serialKey = entityType:entityId`, so thread replies keep their order
  and an edit never overtakes the root creation.
- **Dedupe**: `dedupeKey = eventType:entityId:contentHash` → at most one post per logical event.
- **Slack limits**: `chat.postMessage` is roughly 1 message/second per channel. Per-client
  channels shard the fan-out naturally, but a bulk RDV import must collapse into one
  digest. Add a burst guard: more than N events for one route within 60 s → coalesce.
- **Slack is never a dependency.** A failing adapter cannot fail a client's support
  message. That property holds today — make it explicit in tests.
- **Health**: `lastHealthyAt` / `lastError` on the workspace, a badge in the settings UI,
  and a `Renvoyer` button on dead-lettered rows.

---

## 12. Admin UI — `/manager/settings/integrations/messaging`

1. **Connexion** — "Ajouter à Slack" OAuth button, workspace card, health badge, disconnect.
2. **Routage** — a matrix: rows are event groups (RDV, Support, Tickets, Digests), columns
   are channels. Per row: scope (global / client / mission), severity threshold, inbound
   on/off, visibility (interne / partagé client, with the warning).
3. **Aperçu et modèles** — live Block Kit preview per event, editable templates (same
   pattern as `SystemEmailTemplate`), `Envoyer un test` button.
4. **Identités** — table of `MessagingIdentity`, with a bulk "inviter à lier" action.
5. **Journal de livraison** — outbox rows, status, error, resend, filters by event and route.

Per-client override lives on the client sheet (`/manager/clients/[id]`): one channel
picker plus the "partagé avec le client" toggle.

---

## 13. File layout

```
lib/integrations/messaging/
  types.ts                # CrmEvent, RenderedMessage, adapter interface
  events.ts               # emitCrmEvent(), typed catalogue
  router.ts               # event + scope → MessagingRoute[]
  outbox.ts               # enqueue / claim / complete / retry
  identity.ts             # externalUserId → CRM user, magic-link flow
  redaction.ts            # visibility profiles
  render/
    common.ts             # esc(), truncate(), badges, fr-FR / Europe-Paris dates
    rdv.ts  support.ts  ticket.ts  digest.ts
  adapters/
    slack/   { index.ts, blocks.ts, verify.ts, oauth.ts, inbound.ts }
    discord/ { index.ts, embeds.ts, verify.ts }
    webhook/ index.ts
  inbound/
    dispatch.ts           # InboundEvent → handler
    handlers/ { supportReply.ts, rdvAction.ts, ticketAction.ts, command.ts, mention.ts }
app/api/integrations/messaging/[provider]/…
app/api/cron/messaging-outbox/route.ts     # drain safety net
app/api/cron/messaging-digests/route.ts
workers/messaging.ts                        # BullMQ consumer (+ Discord gateway later)
app/manager/settings/integrations/messaging/…
```

---

## 14. Phasing

| Phase | Scope | Outcome | Rough effort |
|---|---|---|---|
| **P0 — Foundation** | Prisma models + migration, event bus, outbox + worker, Slack adapter (post/edit), OAuth install, `MessagingLink`, routing resolver, settings page v1. Migrate the 2 existing call sites. | Feature parity with today, but durable, multi-channel, observable. | ~4–5 d |
| **P1 — RDV outbound, live** | All `rdv.*` events, edit-in-place badges, threads, per-client routing, redaction profiles. | The RDV board the team actually wants. | ~3 d |
| **P2 — Support two-way** | `support.*` events, Slack Events API inbound, identity linking, thread reply → `SupportMessage`, echo suppression, attachments. | Answer a client from Slack. | ~4 d |
| **P3 — Interactive** | Interactivity endpoint, buttons and modals for RDV / support / tickets, reactions, `/crm` commands. | Act without opening the CRM. | ~4 d |
| **P4 — Digests and SLA** | Scheduled recaps, SLA escalation, burst coalescing, delivery log UI. | Rhythm instead of noise. | ~2–3 d |
| **P5 — Extend** | Discord adapter (interactions, then gateway in the worker), Teams behind a flag, `@CRM` → assistant, link unfurling, client-shared Slack Connect channels. | Platform choice plus a client-facing live channel. | ~5 d |

P0 → P2 is the meaningful milestone; everything after is additive and independently shippable.

---

## 15. Environment

```
# Slack app (OAuth install replaces the single webhook)
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=
SLACK_APP_ID=
# Legacy, kept for one release as a fallback
SLACK_WEBHOOK_URL=
SLACK_CLIENTS_LIVE_WEBHOOK_URL=

DISCORD_APPLICATION_ID=
DISCORD_PUBLIC_KEY=
DISCORD_BOT_TOKEN=

MESSAGING_OUTBOX_MAX_ATTEMPTS=6
NEXT_PUBLIC_APP_URL=                 # already used for deep links
# Token encryption reuses the existing lib/encryption.ts key
```

Local dev runs on `localhost:5000` with no public URL — use **Slack Socket Mode** (or a
tunnel) for inbound during development; production uses the HTTP endpoints. The adapter
interface must not care which.

---

## 16. Testing

- Unit: renderers (snapshot the Block Kit JSON), `esc()` / truncate, route resolution
  precedence (mission > client > global), redaction profiles, severity filtering.
- Signature verification: valid, tampered body, stale timestamp, wrong secret.
- Idempotency: the same `externalEventId` twice → one mutation; the same `dedupeKey`
  twice → one post.
- Echo: a bot message in a watched channel creates nothing.
- Ordering: a root plus three thread replies enqueued together arrive in order.
- Failure: the adapter throws → the support message is still created and the row lands
  in the outbox as `FAILED`, not lost.
- The repo runs `tsx --test` suites (`npm run test:tickets` style) — add
  `npm run test:messaging`.

---

## 17. Open questions

1. **Slack or Discord as target #1** — Slack assumed (Jeff's feedback already lives in
   Slack, `#clients-live` exists). Confirm.
2. **Client-shared channels** — in scope for v1, or internal-only first? It changes how
   much redaction work lands in P1.
3. **RDV thread replies** — is `ActionComment` acceptable, or should they land in the
   existing Comms module (`CommsThread` / `CommsMessage`)? `ActionComment` is smaller;
   Comms is more unified.
4. **One workspace or many?** The model supports N (an agency could run a workspace per
   large client). The v1 UI can assume one.
5. **Cron budget** on the current deploy target (`vercel.json` has one entry) — decides
   whether digests run on crons or on the BullMQ worker.
