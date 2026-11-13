# Console: Support inbox for every agency

Status: **CRM side built** (`/api/instance/support/*`, this repo, 2026-11-05). **Console side not built yet**: the Console lives in its own git repo (`console/`, not on GitHub), so this document is the brief for it. Read `console/README.md` first. That stack is Hono + postgres.js + server-rendered pages, and Postgres is the job queue.

Goal: our team handles the Support Technique tickets of **every** agency CRM from one screen in the Console. The screen should feel like a helpdesk: one inbox, filters, a conversation per ticket, and replies that reach the agency inside its own CRM.

---

## 1. The CRM API (already in every agency image)

Every request is HMAC-signed with the agency's `INSTANCE_ADMIN_SECRET`. Use `signInstanceRequest` (`lib/instance/auth.ts`, already vendored for provisioning). Rate limit: 30 requests/min per route and per IP.

### `GET /api/instance/support/tickets`

| Query | Meaning |
|---|---|
| `status`, `priority`, `category`, `scope`, `validation` | comma lists of enum values (unknown value → `422 validation_failed`) |
| `open=true` | every status but `COMPLETED` (ignored when `status` is set) |
| `q` | free text in title/description, or a reference `TC-0012` |
| `updatedSince` | ISO date: only tickets changed since (incremental sync) |
| `limit` | 1–200, default 50 |
| `cursor` | the previous page's `nextCursor` |

Response:

```json
{
  "ok": true,
  "tickets": [{
    "id": "clx…", "number": 12, "ref": "#TC-0012", "title": "Export CSV vide",
    "preview": "Depuis hier l'export…", "category": "BUG", "scope": "INTERNAL",
    "priority": "HIGH", "status": "TODO", "validation": "NOT_REQUIRED",
    "dueDate": null, "overdue": false, "completedAt": null,
    "createdAt": "…", "updatedAt": "…",
    "requester": { "name": "Sami", "role": "SDR" }, "assignee": null,
    "client": { "name": "Acme" }, "comments": 3, "attachments": 1
  }],
  "nextCursor": null,
  "counts": { "open": 9, "new": 2, "urgent": 1, "blocked": 0, "active": 5, "overdue": 1, "pendingValidation": 2, "unassigned": 3 },
  "serverTime": "2026-11-05T10:00:00.000Z"
}
```

Order: `updatedAt` desc, then `id` desc (keyset paging, stable while tickets move). No email addresses or user ids are returned.

### `GET /api/instance/support/tickets/:id`

The same fields, plus `description` (complete), `mission`, `attachments` (name, type and size only: the files need a CRM session), `releaseChecks`, `allowedStatuses` (the statuses this ticket may move to now), and `thread`: comments and history merged in date order.

```json
{ "kind": "comment", "id": "…", "at": "…", "author": { "name": "Support plateforme", "role": "DEVELOPER", "platform": true }, "content": "…" }
{ "kind": "event",   "id": "…", "at": "…", "author": { … }, "field": "status", "from": "TODO", "to": "IN_PROGRESS" }
```

`author.platform: true` marks our own messages.

### `POST /api/instance/support/tickets/:id`

```json
{ "action": "comment",  "content": "…", "operator": "Inès" }
{ "action": "status",   "status": "IN_PROGRESS", "comment": "On regarde", "operator": "Inès" }
{ "action": "priority", "priority": "URGENT", "operator": "Inès" }
```

Answers `{ ok, ticket }` (the detail shape above). If the CRM refuses the change, the answer is `422 rule_violation` with a French `message`. Examples: a forbidden status move, or `COMPLETED` while a role in the release checklist is still untested. Show that message as it is. `404 ticket_not_found` if the ticket was deleted. Each write sends a notification to the agency's requester, assignee and managers.

---

## 2. Console data and jobs

Table `support_ticket` (a cache, not the source of truth), keyed by `(agency_id, ticket_id)`: the list fields, plus `synced_at` and `last_platform_reply_at`.

Job `support-sync`, every 2 minutes, for each healthy agency that is not suspended:
`GET …/tickets?updatedSince=<agency.support_cursor>&limit=200`, follow `nextCursor`, upsert the rows, save `serverTime` as the new `support_cursor`, and store `counts` on the agency row. First run: no `updatedSince`, then page through everything. Deleted tickets: a nightly full pass with `open=true` drops rows that are no longer there. One failing agency marks itself `support_sync_error` and never blocks the others.

The ticket detail is always fetched live when a ticket is opened, so the conversation is never stale. After a `POST`, upsert the returned ticket into the cache at once.

Alert (existing alert channels): a new `URGENT` ticket in any agency, or a ticket with no reply from us 24 h after creation.

---

## 3. UI: the Support inbox

New sidebar item **Support**, with a badge showing the open ticket count for the whole fleet. The layout has three columns on desktop and becomes a stack on mobile (list → ticket).

```
┌────────────┬───────────────────────────────┬──────────────────────────────────────┐
│ VUES       │ [🔍 Rechercher… TC-0012]  ⟳    │ Agence Nord · #TC-0012        [HIGH▾]│
│ Tous   42  │ [Agence ▾][Statut ▾][Priorité▾]│ Export CSV vide                      │
│ Non lus 5  │ ───────────────────────────────│ BUG · Interne · Sami (SDR) · il y a 2h│
│ Urgents 1  │ ● Agence Nord  #TC-0012   2h  │ [Statut: À faire ▾]  → En cours ✓     │
│ Sans rép.3 │   Export CSV vide       HIGH  │ ─────────────────────────────────────│
│ En retard1 │   Sami · 3 💬 · 📎1            │ Sami · il y a 2h                      │
│ Bloqués 0  │ ───────────────────────────────│   Depuis hier l'export…              │
│ ────────── │   Agence Sud   #TC-0031   5h  │ ◦ statut  Nouveau → À faire (Lina)    │
│ AGENCES    │   Rappels en double     MED   │ ▌Support plateforme · Inès · 1h      │
│ Nord    4  │ …                              │ ▌  Corrigé en v2026.11.2…            │
│ Sud     2  │                                │ ─────────────────────────────────────│
│ …          │ [Charger plus]                 │ [ Répondre…                    ]     │
│            │                                │ [Réponses types ▾]  [Envoyer ⌘↵]      │
└────────────┴───────────────────────────────┴──────────────────────────────────────┘
```

**Left: views and agencies.** Saved views, each with a live count: Tous, Non lus (changed since I last opened it), Urgents, Sans réponse (no platform reply yet), En retard, Bloqués, À valider. Below them, the agencies sorted by open tickets, each with its brand colour as a dot. Clicking one filters the list.

**Middle: list.** One row per ticket shows the agency (with its colour dot), reference, title, the time since the last update, a priority chip, and a second line with the requester plus comment and attachment counts. Unread rows are bold and carry a dot. A sync error on an agency shows a small banner at the top of the list with "Réessayer". Filters live in the URL, so a view can be shared. Keyboard: `j`/`k` move, `Enter` opens, `/` focuses search, `r` replies, `e` sets the status to Testing.

**Right: ticket.** The header shows the agency, reference, title and metadata. It also holds a priority menu and a status menu that offers only `allowedStatuses`. Then comes the thread as one conversation:
- the agency's messages sit on the left;
- our messages sit on the right, with the accent colour and the "Support plateforme · <operator>" label;
- history events are small grey inline lines ("Lina a passé le statut de Nouveau à À faire").

The release checklist (roles ✓/✗) and the attachment names go in a collapsible side section. When the agency CRM refuses a change, the composer shows the `rule_violation` message in place.

**Composer.** It's a textarea that grows as you type, with `⌘/Ctrl+Enter` to send and a draft kept for each ticket. A "Changer le statut en…" checkbox sends `action: status` with `comment`, so one click both replies and moves the ticket. A "Réponses types" menu offers canned replies (table `support_macro`: title and body, editable by the team). Sending shows the message straight away as pending and confirms it once the POST returns. On error the message stays in the composer.

**Empty and loading states.** Skeleton rows while loading. Zero tickets shows "Aucun ticket ouvert dans la flotte 🎉". When a single agency is unreachable, the view says so and still shows its cached tickets, marked "données du <heure>".

**Fleet page and agency page.** Add a "Support" column to the fleet table (open count, plus a red dot when something is urgent). Add a "Support" tab on the agency page with the same list filtered to that agency.

**Journal.** Each reply or change from the Console is written to the Console journal: operator, agency, ticket and action.

---

## 4. Tests to add in the Console

- Sync with a fake instance: first full pass, incremental pass, paging, a deleted ticket, one agency down while the others still sync.
- Signing: the request is signed over the exact path and query string.
- Reply: a pending message turns into the real one; `422` shows the CRM's message; `operator` is the logged-in teammate.
- Views: the "Sans réponse" and "Non lus" counts.
