# Assistant IA — Architecture

Design document. Nothing below is implemented yet except where marked **[built]**.

Source of requirements: call with Jeff (2026-09-15), plus the existing code in this
repo and the working tool framework in `ping-leadagency`.

---

## 1. What Jeff actually asked for

Extracted from the call, in his words, because every design decision below traces
back to one of these:

| # | Requirement | Quote |
|---|---|---|
| R1 | The assistant is a **project assistant** first, a reporting assistant second | *"Ce que je pense en termes d'assistant IA, avant tout, c'est un assistant projet. Et ensuite on le poussera en assistant suivi."* |
| R2 | **One project at a time**, no cross-project mixing | *"L'assistant, il gère un projet à la fois, il ne va pas mutualiser avec d'autres projets."* |
| R3 | A **project picker**, like ChatGPT Projects | *"Tu as une zone projet, et je sélectionne le projet que je veux, et là j'ai tous mes fichiers visibles en un coup d'œil."* |
| R4 | It must **read the project's documents, Leexi recaps and transcripts** | *"Les lexics, les transcripts… il a tout en mémoire, donc je peux prendre un max d'infos."* |
| R5 | It must reach **credentials** for the project | *"Tu le centralises en interne, il peut avoir accès à tout sur un projet."* |
| R6 | It must **write and send the onboarding email** to each commercial | *"Je veux que tu mettes l'accès à la plateforme, l'identifiant, le mot de passe, que tu rappelles qu'ils confirment le calendrier, qu'ils ont un chat en direct… et en plus je peux l'envoyer à chaque commercial automatiquement."* |
| R7 | It lives **inside the Dashboard Projet** | *"Là tu as mis le dashboard projet. Il faut l'assistant dedans."* |
| R8 | It can **cross-reference** commerciaux, calendars, campaigns | *"J'ai les Calendly, j'ai les calendriers des commerciaux, je peux croiser toutes mes informations."* |
| R9 | **Client is the only top-level zone**; mission lives inside it | *"Mission, limite, il n'a plus lieu d'être. Si on peut passer par client, dans client je vois mon client, je vois ma mission, et ici je vois tout mon dashboard mission."* |
| R10 | **Limited surface** — Odo's constraint, agreed on the call | *"Je ne peux pas faire un assistant IA et je lui laisse toute la base de données à gérer. Je dois le limiter, limiter les actions."* |

R9 is a navigation change, not an assistant change — tracked separately, but it
decides where the assistant mounts (§9).

---

## 2. Core concept

> **A project workspace with a model in it — not a chatbot with database access.**

It runs in two modes, same framework, same panel:

- **Vue agence** — no project bound. Cross-client questions, the clients that need
  attention, consolidated numbers, and product how-tos. No project detail, no actions.
- **Projet** — one client, optionally one mission. Everything below.

The mode *is* the binding: tools declare `requiresProject`, the guard enforces it,
and the picker at the top of the panel is what moves between them.

The unit of work is the **projet**: one `Client` + one of its `Mission`s.

Everything the assistant is allowed to see, remember and do is bound to the
active projet for the whole exchange. Switching project starts a different
conversation with a different context — the way a ChatGPT Project does, which is
the mental model Jeff already has and likes.

This one decision delivers R1, R2, R3 and half of R10 at once: isolation is not a
prompt instruction the model may forget, it is the shape of the request envelope.

```
                    ┌─────────────────────────────────────────┐
   Manager  ───────▶│  Panel assistant (Dashboard Projet)     │
                    │  · project picker  · thread  · cards    │
                    └────────────────┬────────────────────────┘
                                     │  { projectScope, message[] }
                                     ▼
                    ┌─────────────────────────────────────────┐
                    │  /api/manager/assistant/chat            │
                    │  1. auth: MANAGER only                  │
                    │  2. resolve AIRequestContext            │
                    │     + activeProject { clientId,         │
                    │                       missionId }       │
                    └────────────────┬────────────────────────┘
                                     ▼
       ┌──────────────────────── TOOL LOOP ─────────────────────────┐
       │                                                            │
       │   Mistral Large  ──names a tool──▶  GUARD                  │
       │        ▲                            · role                 │
       │        │                            · permission           │
       │        │                            · read/write class     │
       │        │                            · budgets              │
       │        │                            · zod args             │
       │        │                                 │                 │
       │        │                                 ▼                 │
       │        │                            EXECUTOR               │
       │        │                            · scoped Prisma query  │
       │        │                              (project only)       │
       │        │                                 │                 │
       │        └────wrapped, scrubbed payload────┘                 │
       │                                                            │
       │   write tool named ──▶ LOOP STOPS ──▶ confirmation card    │
       └────────────────────────────────────────────────────────────┘
                                     │
                          manager clicks "Confirmer"
                                     ▼
                    /api/manager/assistant/execute  ──▶ audit log
```

---

## 3. Layers

Ported from `ping-leadagency/lib/ai/tools`, which already runs this design with a
590-line security test suite. We do not reinvent it; we move it here and widen
the catalogue.

| Layer | File | Responsibility |
|---|---|---|
| **Context** | `lib/ai/tools/context.ts` | The one place that does I/O to build the envelope: user, role, permissions, and the resolved project. Scope resolution lives here rather than in its own module because every tool is MANAGER-only today; it splits out the day a second role is allowed in. |
| **Registry** | `lib/ai/tools/registry.ts` | The exhaustive list of what the AI can do. Not in this file = unreachable. The review checkpoint for every future expansion. |
| **Guard** | `lib/ai/tools/guard.ts` | Pure allow/deny: active account, role, permissions, project binding, write budget, then zod-parse the model's arguments. Covered by `npm run test:ai-tools` (25 cases, no database needed). |
| **Executor** | `lib/ai/tools/executor.ts` | Runs one call, scrubs the result, returns errors as data so the model can recover. |
| **Redact** | `lib/ai/tools/redact.ts` | Drops credential-shaped keys from any payload; neutralises prompt-injection markers in free text written by prospects and clients. |
| **Loop** | `lib/ai/tools/loop.ts` | Mistral round-trips, capped. Stops dead when a write tool is named. |
| **Definitions** | `lib/ai/tools/definitions/*.ts` | One file per domain. Each tool declares its own roles, permissions, schema and scoped query. |

**The model never touches Prisma.** It can only emit a tool name and a JSON blob.
Ids it did not receive from a scoped tool result do not resolve.

---

## 4. The scope envelope

```ts
interface AIRequestContext {
  userId: string;
  role: UserRole;          // MANAGER only, for now (§8)
  permissions: string[];

  /** The bound project. Null missionId = client-wide questions. */
  activeProject: { clientId: string; missionId: string | null };

  /** Everything reachable. For MANAGER this is global, but... */
  isGlobalScope: boolean;

  writeBudgetRemaining: number;   // default 3
  conversationId: string;
}
```

**The rule that makes R2 real:** every project-scoped tool derives its `where`
clause from `ctx.activeProject`, not from its own arguments. If the model passes
a `clientId` for a different client, the tool ignores it and returns the bound
project's data — or refuses, for tools where silently answering about the wrong
thing would be worse than an error.

A manager *is* global-scope in this CRM, so this is not a security boundary
against the manager. It is a **correctness and focus boundary**: it is what stops
the assistant answering a question about Decathlon with Cuisaline's numbers,
which is exactly the failure Jeff pre-empted.

Switching project = new `conversationId`. No shared memory across projects.

---

## 5. Tool catalogue

Grouped by domain. **R** = read, auto-executed inside the loop. **W** = write,
stops the loop and produces a confirmation card.

### 5.1 Projet — structure & context (R4, R8)

| Tool | Class | What it returns |
|---|---|---|
| `list_projects` | R | The manager's clients and their missions, for the picker and for "quel projet ?" |
| `get_project_overview` | R | The bound project: client, mission, dates, status, channels, objective, SDRs assigned, commerciaux, default mailbox, contracted days |
| `list_project_documents` | R | `File` rows for the project (name, type, size, folder, uploader, date, tags) — Jeff's *"mes fichiers visibles en un coup d'œil"* |
| `read_project_document` | R | Text content of one document, truncated and sanitised. Only for text-like types |
| `get_call_recap` | R | The `LeexiCallImport.rawRecap` + extracted data for the mission — the transcript memory Jeff wants |
| `get_playbook` | R | `Mission.playbook` — ICP, pitch, objections, sequence |

### 5.2 Équipe & accès (R5) — **[built]** as `lib/assistant/access`, to be folded in

| Tool | Class | What it does |
|---|---|---|
| `list_credentials` | R | Stored accesses for the project. Metadata only — `hasPassword`, never a password |
| `list_access_gaps` | R | Commerciaux with no portal account, credentials with no password, never-rotated logins |
| `propose_email_addresses` | R | Free addresses on a domain, skipping ones already taken |
| `list_access_activity` | R | Who revealed / rotated / sent what, and when |
| `create_portal_account` | W | Creates the COMMERCIAL portal account + files the credential |
| `save_credential` | W | Stores an external access (mailbox, agenda, CRM client) |
| `reveal_password` | W | Shows one password, audited |
| `rotate_password` | W | New password; re-hashes the portal account in the same transaction |
| `send_credentials_email` | W | Sends the login to its owner |
| `delete_credential` | W | Removes the vault entry |

### 5.3 Communication (R6) — the piece Jeff cares about most

| Tool | Class | What it does |
|---|---|---|
| `draft_email` | R | Writes a French email for a stated purpose and audience. Returns subject + body as **a draft to review**, no send |
| `send_onboarding_emails` | W | Jeff's exact flow: for each commercial of the project — portal link, identifiant, mot de passe, "confirme ton calendrier", "tu as un chat en direct". One card listing every recipient; one click sends the batch |
| `send_email_to_commerciaux` | W | Same machinery, free subject/body from a draft the manager approved |

`draft_email` being a **read** tool is deliberate: drafting is free and iterative,
sending is the irreversible step that needs the click.

### 5.4 Suivi & performance (R1 "assistant suivi")

| Tool | Class | What it returns |
|---|---|---|
| `get_mission_metrics` | R | Calls, connects, RDV, conversion over a period, per SDR |
| `get_activity_summary` | R | What happened on the project in the last N days |
| `list_meetings` | R | RDV booked for the project: date, contact, SDR, commercial, outcome, no-show |
| `get_meeting_feedback` | R | Client / commercial feedback on RDVs — the gap Jeff flagged (*"je n'ai pas les feedbacks qui remontent"*) |
| `get_list_health` | R | Volume left, completeness, cooldown state of the project's lists |
| `get_campaign_status` | R | Campaigns of the mission, email + call, with their numbers |

### 5.5 Organisation

| Tool | Class | What it does |
|---|---|---|
| `create_task` | W | A task on the project, assigned, with a due date |
| `set_credential_mission` | W | Files an access under a specific mission |

**Built: 34 tools — 23 read, 3 automatic writes, 8 confirmed writes. Six work with no project bound (vue agence).** The registry file is the only way to add
one, which keeps §10 reviewable.

---

## 6. Guardrails — the answer to R10

Seven independent limits. Each one is a different failure this prevents:

1. **Allowlist, not database access.** The model names a tool; it cannot write a
   query. A capability absent from `registry.ts` does not exist.
2. **Role gate.** Every tool declares `allowedRoles`. Today: `["MANAGER"]`
   everywhere (§8).
3. **Permission gate.** Tools touching money, credentials or users additionally
   require a permission code, so a limited manager account stays limited.
4. **Project scope.** The `where` clause comes from the envelope, not the
   arguments (§4).
5. **Confirmation for writes.** A write tool never runs inside the loop. It
   returns a card describing the real consequence, resolved from the database —
   not the model's summary of it. The click is the authorisation.
6. **Budgets.** Max 6 tool calls and max 3 writes per user message; max 4 model
   round-trips. One sentence cannot become a burst of thirteen emails.
7. **Redaction in both directions.**
   - Outbound: `password|secret|token|apikey|credential|smtp|...` keys are
     stripped from every payload before the model sees it. A revealed password
     goes server → UI card, never through the model.
   - Inbound: prospect notes and client-typed text are wrapped in an explicit
     *untrusted data* envelope with injection markers neutralised.

Everything a write tool does is written to an audit trail with the manager's
identity — already true for the vault **[built]**, to be generalised.

---

## 7. Memory & conversations

Per **project**, not per user:

```
AssistantConversation
  id, clientId, missionId?, createdById
  title, summary, lastMessageAt
AssistantMessage
  conversationId, role, content
  toolTrace Json?     // which tools ran, ok/ko, ms
  action    Json?     // proposed write + its outcome
```

- Opening a project resumes its last conversation; a conversation never spans two
  projects (R2).
- Only `role` + `content` are replayed to the model. Tool results from earlier
  turns are **not** in context — the model re-fetches. This is a real constraint
  and the system prompt says so explicitly (ping learned this the hard way; see
  their rule 8 in `buildToolUsagePrompt`).
- Executed actions **are** replayed as `[Action exécutée] …` so the model does
  not propose the same account creation twice **[built]**.

Documents are **not** embedded or vector-indexed in v1. `list_project_documents`
+ `read_project_document` on demand is enough for the volumes here and keeps the
answer traceable to a named file. Revisit if a project exceeds ~50 documents.

---

## 8. Who can use it

**MANAGER only**, at every layer:

- `middleware.ts` already restricts `/manager/*` to `role === "MANAGER"`
- every route: `requireRole(["MANAGER"])`
- every tool: `allowedRoles: ["MANAGER"]`
- the nav entry sits behind a permission code

The existing `/api/assistant/chat` (SDR/CLIENT/BD help assistant) stays as it is.
It answers "how do I use the CRM"; this one operates on a project. Different
audiences, different risk, deliberately separate — but they share
`lib/ai/tools/` once the framework is in place, so a future SDR-facing tool is a
role flag, not a second system.

---

## 9. UI

Mounts in **Dashboard Projet** (R7), plus the standalone Coffre d'accès page
**[built]**.

```
┌──────────────────────────────────────────────────────────┐
│  Client ▾ Decathlon     Projet ▾ Mission Q4 — Appels     │  ← the binding, always visible
├───────────────────────────────┬──────────────────────────┤
│  Dashboard projet             │  Assistant               │
│  · staffing, RDV, perf        │  ┌────────────────────┐  │
│  · documents                  │  │ 3 sources ▾  1.2 s │  │  ← tool trace, expandable
│  · accès (coffre)             │  ├────────────────────┤  │
│                               │  │ answer (markdown)  │  │
│                               │  ├────────────────────┤  │
│                               │  │ ⚠ Créer 3 comptes  │  │  ← confirmation card
│                               │  │   [Confirmer]      │  │
│                               │  └────────────────────┘  │
└───────────────────────────────┴──────────────────────────┘
```

Visual language ported from `ping-leadagency` `AssistantPanel` — scoped CSS
tokens on the panel root, collapsible tool trace with per-tool timing, thinking
orb + shimmer skeleton, composer with model chip and ⌘-hints, markdown answers
rendered as React nodes (no `dangerouslySetInnerHTML`). Captain Prospect accent
`#C64B8B`, the same one ping uses for this brand.

---

## 10. Schema changes

| Change | Why |
|---|---|
| `AssistantConversation`, `AssistantMessage` | §7. Replaces memory-in-`User.preferences`, which cannot be project-scoped. **Mapped to `AssistantProjetConversation` / `AssistantProjetMessage`**: tables named `AssistantConversation` and `AssistantMessage` already exist in the Neon database, created by the sister app's `add_support_tickets_and_assistant_transcripts` migration, with different columns and live rows. `@@map` keeps our model names while leaving those tables untouched |
| `VaultCredential`, `VaultAuditEvent` **[built]** | §5.2. Migration written, **not yet applied** |
| `AssistantActionLog` | One row per executed write: tool, args, actor, project, conversation, outcome. The generalisation of `VaultAuditEvent` |

No change to `Client` / `Mission` / `File` / `LeexiCallImport` — the assistant
reads what is already there.

---

## 11. Build order

| Phase | Content | Why this order |
|---|---|---|
| **P0 — done** | Coffre d'accès: 11 tools, encrypted vault, confirm-before-write, audit **[built]** | Proves the confirmation pattern on the riskiest domain |
| **P1 — done** | `lib/ai/tools/` framework: scope, context, guard, executor, redact, loop, registry. Vault tools re-expressed as definitions. Project envelope live | Everything after this is "add a definition file" |
| **P2 — done** | Projet context tools (§5.1), conversations (§7), the panel at `/manager/assistant` | R1–R4. R7 (embedding in Dashboard Projet) is one line — the panel takes `fixedClientId` |
| **P3 — done** | Communication (§5.3) — `draft_email`, `send_onboarding_emails`, `send_draft`, artifacts | R6, Jeff's headline use case |
| **P4 — done** | Suivi (§5.4) — metrics, RDV, feedback, campagnes | R1's second half, "assistant suivi" |
| **P5 — done** | Consolidation: one panel everywhere (the first access-assistant was deleted), one `SecretCard`, assistant opens from any Dashboard Projet row, guard test suite | Two chat UIs would have drifted apart within a month |
| **P6 — done** | Vue agence: 6 project-free tools, agency threads, global launcher in the manager layout. The previous docs-injection assistant (~1 170 lines, never mounted) retired; its 11 markdown files live on behind `search_help` | One assistant with two modes, instead of two assistants |
| **Next** | Apply both migrations to the database the app actually reads, then answer §12 | — |

P1 + P2 is the meaningful milestone to show Jeff.

---

## 12. Open questions for Jeff

These block nothing in P1 but shape P3–P4. Worth putting on Slack, as agreed on
the call:

1. **Onboarding email** — is there a template to follow, or does the assistant
   write it each time? Who is the sender: the manager's own address, or a
   platform address?
2. **Send to all 13 at once, or one by one?** The design proposes one card
   listing all recipients, one click. Confirm that is what he wants rather than
   13 confirmations.
3. **Calendars** — the Cal.com/Calendly links he cross-references live where
   today? `ClientInterlocuteur.bookingLinks`, or outside the CRM?
4. **"Vérifier les données de la base"** — he floated it. Which checks? (missing
   emails, duplicate contacts, stale lists?) That is a read tool, cheap to add
   once specified.
5. **Campaign generation** — he mentioned mail + phone campaigns from the
   assistant. Draft-only, or does it create the `Campaign` / `EmailSequence`
   rows? Big difference in scope.
6. **R9 navigation** — collapsing "Missions" into "Clients" is a separate piece
   of work. Confirm priority against the assistant.

---

## 13. What this does not do

Stated so nobody discovers it at demo time:

- **No mailbox provisioning.** It proposes an address and stores the credential;
  the box is created at the provider.
- **No autonomous action.** Nothing writes without a click, including reveals.
- **No cross-project answers.** By design (R2). "Compare Decathlon et Cuisaline"
  is refused with an explanation, not answered badly.
- **No document embedding** in v1 (§7).
- **The model never sees a password**, not even one it just caused to be
  generated.
