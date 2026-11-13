# Clients & Missions workspace — analysis and upgrade plan

**Date:** 2026-11-13
**Audience:** the implementing agent (Claude Opus 5.5) and the product owner.
**Scope:** the manager-side "Espace clients" at `/manager/clients` — the client directory, the client workspace, and the mission workspace nested inside it — plus the APIs and legacy routes they depend on.
**Out of scope (listed in §9 as follow-ups):** the client portal (`app/client/portal/*`), BD pages (`app/bd/*`), the SDR views, billing, the assistant.

**How this was produced:** a read of the code on `feat/assistant-brain` at commit `75be5d1`. The app was not run and nothing was inspected in a browser, so every visual judgement below is inferred from markup and CSS. Line numbers are from that commit and will drift; treat them as pointers, and re-grep before editing.

---

## 0. Instructions for the implementing agent

1. **Read before writing.** Start with `app/manager/clients/page.tsx`, `components/drawers/ClientDrawer.tsx`, `components/missions/MissionWorkspace.tsx`, `app/manager/clients/workspace.css`, `docs/ui/SHADCN.md`, and the token section of `app/globals.css`.
2. **Work phase by phase (§6).** Each phase is one or more reviewable commits and leaves the app working. Do not start a phase by rewriting a whole file; extract, then change.
3. **UI copy is French.** Keep the existing vocabulary: *base de prospects*, *ciblage*, *lancement*, *référent*, *interlocuteur*, *intégration*, *avis SDR*. Never introduce English strings in the UI.
4. **No schema change without saying so.** Almost everything here is achievable with the current Prisma models. Where a migration is proposed it is marked **[migration]** and must be confirmed with the owner first.
5. **No invented data.** Do not add placeholder metrics, fake health scores, or sample rows to application components. If a number is not available from the API, add it to the API or leave the element out.
6. **Preserve URLs.** `?client=&mission=&tab=&espace=` is a public contract (bookmarks, redirects from `/manager/missions/[id]`, the "Reprendre" card in localStorage). Renaming a tab requires an alias in both `app/manager/missions/[id]/page.tsx` (`TAB_ALIASES`) and the workspace itself.
7. **Preserve authorization.** All writes go through existing routes guarded by `requireRole`. Mission status changes must keep using `canTransitionMissionStatus` (`lib/constants/missionStatus.ts`).
8. **Verification per phase:** `npx tsc --noEmit` on touched files (the repo has known unrelated errors — see `ts_errors*.log`; compare against a baseline taken before you start rather than demanding zero), `npx eslint <touched files>`, the new `tsx --test` suites you add, and a Playwright pass at 1440, 1024 and 390 px wide using stubbed API responses (the pattern used in `docs/plans/2026-11-03-captain-workspace-implementation.md`). Block real mutations in browser checks.
9. **Report honestly.** End each phase with what changed, what was verified and how, and what was not verified.

---

## 1. What exists today

### 1.1 Navigation model

One route, `/manager/clients`, renders three levels driven by query params:

| Level | URL | Rendered by |
|---|---|---|
| Directory | `/manager/clients` | `ClientsPageInner` in `app/manager/clients/page.tsx` (528 lines) |
| Client workspace | `?client=<id>&espace=<tab>` | `ClientDrawer` in `components/drawers/ClientDrawer.tsx` (2 430 lines) — despite the name it is a full-page shell, not a drawer |
| Mission workspace | `?client=<id>&mission=<id>&tab=<tab>` | `MissionWorkspace` in `components/missions/MissionWorkspace.tsx` (4 313 lines) |

Navigation is `window.history.pushState` (no Next router transition). The layout switches into a dedicated visual mode when `pathname === "/manager/clients"`: `components/layout/AppLayoutShell.tsx:186` adds `.manager-client-studio` and wraps children in `.cw-app-canvas`. All workspace styling lives in `app/manager/clients/workspace.css` (740 lines, `cw-*` classes, container queries `client-shell` / `client-canvas` / `client-list`).

`/manager/missions` and `/manager/missions/[id]` are server redirects into this workspace.

### 1.2 Directory (`app/manager/clients/page.tsx`)

- Left tree: filters *Tous / À suivre / Actifs / En pause / Arrêtés* with counts.
- Table: client (monogram, name, industry), status pill, mission count + "n en cours", attention label.
- Right rail: *Reprendre* (last location from localStorage), *À suivre* (top 3).
- Actions: *Importer un playbook* (drawer → `PlaybookImportWorkspace`), *Nouveau client* (`ClientOnboardingModal` → `components/manager/client-onboarding/*` wizard).
- Leexi recaps block: matched / unmatched call recaps, "Créer client" from a recap.
- Data: `GET /api/clients?view=workspace&page=N&limit=100`, fetched in a `while(true)` loop until exhausted, then filtered and searched client-side.
- "À suivre" is computed locally by `getAttention()`: a DRAFT mission, or an ACTIVE mission ending within 14 days. Nothing else.

### 1.3 Client workspace (`ClientDrawer.tsx`)

Tree: *Missions* (default, with up to 6 missions nested), *Informations client* (`apercu`), *Intégration* (`onboarding`), *Accès* (`acces`); then under "Suivi du client": *Activité*, *Avis SDR*, *Sessions*.

| Tab id | Content |
|---|---|
| `missions` | Searchable mission rows (`MissionRow`: inline status, script popover → `ScriptModal`), closed missions toggle, right rail "Contexte partagé" |
| `apercu` | Inline-editable fields (`_inline/InlineField.tsx`): name, industry, email, phone, booking URL; production figures (planned days/month, days/week, days with calls, first call); per-mission planning (`MissionPlan`); `EngagementSection` (offer, dates, overrides, renew); ICP/persona |
| `onboarding` | `OnboardingChecklist` + draft missions to launch + `AccessLinksCard` (vault) |
| `acces` | Portal users, Cal credentials (`_sections/ClientCalCredentials.tsx`), portal permission toggles (call history, database, export, RDV notifications), default mailbox, interlocuteurs |
| `activite` | Month KPIs (calls, RDV, days with calls), calls by day (`components/activity/CallActivity`), derived administrative timeline |
| `avis-sdr` | Recent SDR daily reports; "all" opens `SdrFeedbackWorkspace` in a full-size drawer |
| `sessions` | Compact CR/session list with CR and summary-email tabs; "manage" opens the legacy `ClientDetailWorkspace` with `sessionsOnly` in a full-size drawer |

Also: client status pill menu (ACTIVE / PAUSED / STOPPED), "Gérer le client" → `ClientManagementDrawer` (profile, contacts, portal — 135 dense lines), `NewMissionDialog` (738 lines, multi-step with AI script generation), `WeeklyBilanModal`, delete client.

Data: React Query for client detail (`clientDetailQueryKey`), onboarding checklist, mailboxes, sessions; raw `fetch` for mutations.

### 1.4 Mission workspace (`MissionWorkspace.tsx`)

Header: name, client · n bases · n SDR, save indicator, `StatusSelect`, "Préparer / Voir le lancement", overflow menu. Amber banner while portal visibility is delayed.

| Tab id | Label | Content |
|---|---|---|
| `general` | Paramètres | `MissionSetupPanel` (read view ↔ edit form with dirty tracking, 216 lines, clean), then three `KpiTile`s with a hand-rolled SVG `Sparkline` (actions, RDV, opportunities; 30 d vs previous 30 d), then a `<details>` with status-workflow and mailbox settings |
| `lancement` | Lancement | `ReadinessPanel` (144 lines, clean): next blocker, per-list readiness, checklist, start button → portal-launch modal |
| `equipe` | Équipe | Team lead select, assigned SDRs with per-SDR stats, assign picker, **and a "Campagnes" list** |
| `audience` | Bases de prospects | Lists: activate, archive, contacts view toggle, 24 h cooldown toggle, per-list commercials (`ListCommercialsPicker`), bulk commercial assign, CSV import, `MissionAudienceDrawer`, right-click delete |
| `strategies` | Ciblage et scripts | `StrategyByListTab` (1 024 lines): strategy per list, duplicate, link; edits in `StrategyEditorDrawer` (506 lines) |
| `strategy` | Stratégie avancée | Inline ICP/pitch editor, script editor with base / additional / AI-enhanced variants and "share" states (`script-companion` API), **email templates** (list, reorder by drag, create/edit/preview/AI modals) |
| `feedback` | Avis SDR | SDR daily feedback for the mission with a date range |
| `reglages` | Administration | `ProspectCreationSettingsCard`, danger zone (delete with typed confirmation) |

Data: **no React Query**. 84 `useState`, 38 `fetch(` calls, one `fetchMission()` refetch after most mutations. `GET /api/missions/[id]` returns the whole mission (client + interlocuteurs, campaigns, lists, assignments, stats, 30-day series, team stats, readiness).

### 1.5 Supporting pieces already in good shape

- `components/missions/MissionSetupPanel.tsx`, `ReadinessPanel.tsx` — small, typed, use only `cw-*` classes. **These are the reference for the target style.**
- `lib/constants/missionStatus.ts` — status config, transitions, role permissions.
- `components/ui/shadcn/*` — Radix-based layer (dialog, sheet, drawer, command, popover, tabs, tooltip, select, dropdown-menu, …). `docs/ui/SHADCN.md` says: build new UI from this layer, don't mix with legacy `components/ui` in one screen.
- Design tokens `--ds-*` in `app/globals.css`, derived from brand tokens `--brand-*` (white-label aware, see `lib/brand`, `docs/WHITE_LABEL.md`).
- Existing signal logic that the directory ignores: `lib/agent/watch/signals/client-attention.ts`, `lib/agent/watch/rules/client_at_risk.ts`, `lib/manager-home/rules.ts`, `lib/client-insights.ts`, `lib/staffing/clientStaffing.ts`, `lib/sdr-pace/*`.

---

## 2. Findings

Severity: **H** blocks quality work or is user-visible today, **M** real cost, **L** polish.

### 2.1 Structure and code health

| # | Sev | Finding | Evidence |
|---|---|---|---|
| S1 | H | Two god components. `MissionWorkspace.tsx` holds 84 state variables, 38 fetches, 8 tabs and ~12 modals in one function; `ClientDrawer.tsx` builds 7 tabs as JSX constants inside one function. Any edit re-renders everything and risks unrelated regressions. | `grep -c useState` → 84 / 23 |
| S2 | H | A second, older client experience is still live. `/manager/clients/[id]` renders `ClientDetailWorkspace.tsx` (4 753 lines, 82 `useState`, its own tabs, mission list, portal access dialog, analytics). It is linked from at least: `dashboard-projet/page.tsx:368`, `rdv/_components/DetailPanel/FeedbackTab.tsx:114` (`?tab=sessions`), `assistant-ui/workspace/folder/ContextPanel.tsx:85,101`, `emailing/ReachInboxWorkspace.tsx:466`, `emailing/reachinbox-ui.tsx:341,349`, `email/mailboxes/MailboxSettingsDrawer.tsx:477`, `email/inbox/inbox-utils.ts:214`, `lib/reporting/weekly-bilan.ts:144` (`?bilan=`). Managers land in a different UI depending on where they clicked. It does not get the `.manager-client-studio` shell because the check is an exact path match. | `AppLayoutShell.tsx:186` |
| S3 | M | The new workspace mounts that same 4 753-line legacy component inside a full-size drawer just to manage sessions (`sessionsOnly`). | `ClientDrawer.tsx:7`, render near `:1830` |
| S4 | M | Legacy mission creation still reachable: `/manager/missions/new` (wizard, ~1 470 lines across `_components`) is linked from `components/accueil/ManagerDashboardView.tsx:232`, `ClientDetailWorkspace.tsx:1942` and `app/manager/testclient/page.tsx`. `/manager/missions/[id]/edit` (377 lines) and `app/manager/testclient/page.tsx` (989 lines) appear to be leftovers. Three ways to create a mission: that wizard, `NewMissionDialog`, and the client onboarding wizard. | grep in §1 |
| S5 | M | The create-template and edit-template modals are near-identical ~270-line blocks duplicated back to back. | `MissionWorkspace.tsx:3255–3525` vs `3526–3797` |
| S6 | M | No tests cover any of this UI or its pure logic (attention rule, readiness derivation, tab aliasing, URL state). Related server logic is tested (`lib/onboarding/*.test.ts`, `lib/agent/mission.test.ts`). | `git ls-files \| grep test` |
| S7 | L | Types are redeclared per file (`Mission`, `Client`, `MissionLite`, `ClientMission`…), each a different partial of the API response. | top of each file |
| S8 | L | Repo root is littered with scratch files (`console.log('Prisma`, `{if(l.includes('cp-sidebar')`, `ts_errors*.txt`, debug scripts). Not in scope, flagged for a separate cleanup. | `ls` |

### 2.2 Data and performance

| # | Sev | Finding | Evidence |
|---|---|---|---|
| D1 | H | `GET /api/missions/[id]` selects **every company of every list** (`companies: { select: { status, _count: { contacts } } }`) to compute counts in JS. A mission with large bases ships and iterates tens of thousands of rows on each load — and the workspace refetches the mission after most mutations. | `app/api/missions/[id]/route.ts` ≈ `:88–96` |
| D2 | M | The same handler runs its aggregate queries sequentially (`aggregate`, `count`, `count`, two `$queryRaw`, then a `Promise.all`). | same file `:176–290` |
| D3 | M | One monolithic mission payload feeds all eight tabs; changing a list toggle refetches stats, series and team stats. No cache, no optimistic update, so every toggle shows a spinner then a full reload. | `fetchMission` call sites |
| D4 | M | The directory downloads all clients page by page before first paint and searches client-side. Fine at tens of clients, wasteful beyond; and the table shows no activity data because the workspace view of the API returns none. | `page.tsx` `fetchClientsApi` |
| D5 | M | Insights window is hardcoded to 30 days server-side; there is no period selector. | `TREND_DAYS = 30` |
| D6 | L | `MissionWorkspace` fetches `/api/users?role=SDR,BUSINESS_DEVELOPER&status=active&limit=200`, mailboxes, templates and feedback with independent ad-hoc loaders, each with its own loading flag. | fetch list in §1.4 |

### 2.3 Information architecture and UX

| # | Sev | Finding |
|---|---|---|
| U1 | H | **Mission tabs don't map to how a manager thinks.** Eight flat tabs; two are near-synonyms (*Ciblage et scripts* vs *Stratégie avancée*) and both edit ICP/pitch/script through different UIs. Email templates hide at the bottom of *Stratégie avancée*. A "Campagnes" list sits in *Équipe*. Mailbox and status-workflow settings sit in a collapsed `<details>` under KPIs in *Paramètres*. |
| U2 | H | **The mission has no overview.** The default tab is a settings form; the KPIs come after it. There is no single screen answering "is this mission healthy?" — pace vs. plan, RDV vs. objective, per-base progress, per-SDR contribution, blockers. |
| U3 | H | **The client has no overview either.** The default tab is the mission list; `apercu` is labelled "Informations client" and is an edit form. Health, engagement end date, onboarding progress, next RDV, last session and SDR sentiment are spread over five tabs. |
| U4 | M | **Three surfaces edit the same client data**: inline fields in *Informations client*, the *Accès* tab, and `ClientManagementDrawer` (profile / contacts / portal). Interlocuteurs can be edited in two of them with different forms. |
| U5 | M | **Directory is thin.** No sort, no columns for activity, RDV, onboarding, engagement end or owner; attention is limited to two rules while richer signals exist in `lib/agent/watch` and `lib/manager-home`. The right rail shows only three items. |
| U6 | M | The Leexi recaps block is styled with a different visual language (rounded-2xl, accent tints, 10 px text) dropped at the bottom of the `cw` page. |
| U7 | M | Mission rows in the client workspace expose status and a script popover but no dates, progress, channel, team or readiness — the things you scan a mission list for. |
| U8 | M | Many per-list controls (active, archived, contacts view, cooldown, commercials, strategy) are spread across *Bases* and *Ciblage et scripts*; the same toggles (`contactsViewEnabled`, `isActive`) are implemented twice. |
| U9 | L | Feedback after actions is inconsistent: toast in some places, inline "Enregistré" pill in the mission header, silent in others. |
| U10 | L | Loading states are centred spinners; `components/ui/Skeleton` exists and is unused here. Error states for the mission are absent (`if (!mission) return null`). |

### 2.4 Visual consistency and accessibility

| # | Sev | Finding | Evidence |
|---|---|---|---|
| V1 | H | **Two styling systems interleaved in the same screen.** `MissionWorkspace.tsx` has 570 hardcoded Tailwind colour utilities (`text-slate-*`, `bg-emerald-*`, `teal`, `amber`…) against 17 `cw-*` uses; `ClientDrawer.tsx` 210 vs 62. Panels inside one tab alternate between `cw-panel` (13 px radius, hairline border) and `rounded-2xl shadow-sm` cards. The result is the "half-migrated" look. | counts in analysis |
| V2 | H | **The workspace palette bypasses the brand tokens.** `workspace.css` defines its own hex values (`--cw-teal: #153c39`, `--cw-green`, `--cw-canvas`…) and forces `.cp-sidebar { background: #123436 }`. The product is white-label (`--brand-*` → `--ds-*`); this screen will not follow an agency's brand. | `workspace.css:2–24` |
| V3 | M | Raw `<button className="cw-button">` everywhere (91 in the mission file) instead of a component; the custom status menus are hand-built with a fixed-inset click catcher (no focus trap, no arrow keys, no Escape). Radix `DropdownMenu`/`Select` are already in the repo. | `ClientDrawer` status pill, `StatusSelect` |
| V4 | M | Table rows are click targets (`<tr onClick>`) with a nested button; drag-reorder of templates is mouse-only; the list context menu is right-click only. | `page.tsx` table, template list |
| V5 | M | Sub-12 px text (`text-[10px]`, 11 px labels) in several places; base font is 13 px. Check contrast of `--cw-muted` on `--cw-tree`. | workspace.css, Leexi block |
| V6 | L | Native `<details>`, `<progress>`, `<select>`, `<input type="date">` sit next to custom `DatePicker`/`Select` components. Decide per control (§4.3). |

---

## 3. Target experience

### 3.1 Principles

1. **Every level opens on an answer, not a form.** Directory → who needs me. Client → how is this account. Mission → is it on track and what blocks it.
2. **One place per job.** Each piece of data has exactly one editing surface; other places link to it.
3. **Launch is a state, not a tab among eight.** A draft mission *is* its launch checklist; an active mission shows operations.
4. **Calm, dense, consistent.** One panel style, one button, one pill, one table, one empty state — all on `--ds-*` tokens.
5. **Never lose work, never wait blindly.** Optimistic toggles, visible save state, skeletons, real error states, dirty-form guards.

### 3.2 Directory

- Table columns: **Client** (logo/monogram, name, industry) · **Statut** · **Missions** (active / total, channel icons) · **Activité 30 j** (actions sparkline or count) · **RDV ce mois** · **Intégration** (progress, only while incomplete) · **Engagement** (end date, "renouvellement dans n j") · **À suivre** (highest-priority signal + count).
- Sortable headers; search and filter server-side; the status filter moves into the tree as today; add "Mes clients" if an ownership notion exists (check `BusinessDeveloperClient`; otherwise skip).
- Density toggle (comfortable / compact) and column visibility, persisted per user in localStorage.
- Right rail: *Reprendre*; *À suivre* (grouped by signal type, all of them, scrollable); *Appels Leexi à rattacher* (replaces the bottom block, same `cw` language).
- Keyboard: `/` focuses search, ↑/↓ moves the row, Enter opens. Command palette (`components/ui/shadcn/command.tsx`) on ⌘K to jump to any client or mission.
- Rows become real links (`<a href="?client=…">`) so middle-click and "open in new tab" work.
- Empty and error states with an action.

**Attention signals** — replace `getAttention()` with a server-computed list reusing existing logic:
launch to prepare (DRAFT mission) · mission ending ≤ 14 d · engagement ending ≤ 30 d · onboarding step overdue · no call activity for n working days on an ACTIVE mission · under planned pace · active mission with zero ready bases · no SDR assigned · client meeting feedback pending. Each signal carries `{type, severity, label, target: {mission?, tab?, espace?}}`.

### 3.3 Client workspace

New tree (ids in parentheses; aliases keep old URLs working):

```
Vue d'ensemble   (apercu)        ← new default
Missions         (missions)
Suivi
  Activité       (activite)
  Sessions & CR  (sessions)
  Avis SDR       (avis-sdr)
Compte
  Intégration    (onboarding)     ← badge while incomplete
  Contacts & accès (acces)
  Contrat        (contrat)        ← engagement + production plan, moved out of apercu
  Paramètres     (parametres)     ← profile fields, portal permissions, mailbox, danger zone
```

- **Vue d'ensemble**: header (identity, status, owner, engagement chip); KPI row (RDV this month vs last, actions 30 d, days with calls vs planned, active missions); "À suivre" for this client; missions snapshot (cards with status, dates progress bar, readiness, team avatars); next client RDV; last session CR excerpt; latest SDR sentiment; onboarding progress while incomplete. Every card links to its tab.
- **Missions**: table/cards toggle; columns status, channels, period with elapsed-time bar, bases ready/active, team, RDV. Filter chips by status; closed missions collapsed; a simple timeline view (missions as bars on a month axis) as a stretch item.
- **Contacts & accès**: one list of interlocuteurs, each row showing role, emails/phones, booking link, portal access state; row opens a side sheet to edit. Portal users and Cal credentials below. `ClientManagementDrawer` is removed; its forms become the sheets used here and in Paramètres.
- **Sessions & CR**: extract a real `ClientSessions` module from `ClientDetailWorkspace` (list, create from Leexi transcript, AI CR, task extraction, summary email) rendered in-page — no legacy component in a drawer.
- **Contrat**: `EngagementSection` + production plan (`MissionPlan` rows), with a link to billing.
- **Paramètres**: profile, portal permission matrix, default mailbox, RDV email test, delete.

### 3.4 Mission workspace

Header: name (inline rename), client link, status control, **channel chips**, **period with elapsed bar** ("J 23 / 90"), team avatars, save state, primary action that depends on status (DRAFT → *Démarrer*, ACTIVE → *Mettre en pause* in menu, etc.), overflow menu (duplicate, archive, portal visibility, delete).

New tabs (old ids aliased):

| New id | Label | Replaces | Content |
|---|---|---|---|
| `apercu` (default; alias `general`) | Vue d'ensemble | KPIs from `general` + parts of `lancement` | **DRAFT:** the launch checklist is the page (ReadinessPanel, promoted). **ACTIVE/PAUSED/COMPLETED:** period selector (7/30/90 d, mission to date); KPI tiles (actions, RDV, conversion rate, opportunities) with trend and delta; per-base table (size, worked %, RDV, readiness); per-SDR table (actions, RDV, recent activity); blockers strip; objective and key settings summary with "Modifier". |
| `bases` (alias `audience`, `lists`) | Bases de prospects | `audience` + list controls from `strategies` | One table: name, type/source, companies/contacts, progress by status, linked strategy + readiness pills, commercials, active switch; row expands or opens a sheet for settings (contacts view, cooldown, commercials, archive, delete). Bulk select: assign commercial, link strategy, activate/deactivate. Import CSV / create base in the toolbar. |
| `strategie` (alias `strategies`, `strategy`, `campaigns`) | Ciblage & scripts | `strategies` + ICP/pitch/script part of `strategy` | Master–detail: strategies on the left (with the bases using each), editor on the right (ICP, pitch, script with base / complément / version IA sub-tabs and share state). One editor implementation — keep `components/strategy/*` block editors, retire the inline duplicate. |
| `emails` | Emails | templates + mailbox from `strategy`/`general` | Shown only when the mission has the EMAIL channel. Template sequence (keyboard-reorderable), single create/edit dialog, preview, AI assist; mission default mailbox. |
| `equipe` (alias `assignments`) | Équipe | `equipe` minus campaigns | Référent, assigned SDRs with stats, assign picker (Command popover), and the mission's planning (`MissionPlan`/month plan) if editable here — otherwise a link to `/manager/planning`. |
| `avis` (alias `feedback`) | Avis SDR | `feedback` | Unchanged content, restyled, date range in the toolbar. |
| `parametres` (alias `reglages`) | Paramètres | `general` form + `reglages` + `<details>` | Mission details form (`MissionSetupPanel`), statuses & workflow, prospect-creation settings, portal visibility, danger zone. |

`lancement` remains a valid URL: for a DRAFT mission it resolves to `apercu`; for an active one it opens `apercu` scrolled to the readiness section.

### 3.5 New capabilities worth adding (all on existing data unless marked)

1. Period selector on mission and client insights (`?days=` on the API).
2. Conversion rate, RDV per day worked, and comparison to the previous period.
3. Per-base progress (company status breakdown — computed in SQL, see D1).
4. Duplicate mission (name, objective, channels, strategies, templates; not lists, not assignments).
5. Bulk actions on bases.
6. Command palette and keyboard navigation.
7. Server-computed attention signals shared by directory, client overview and mission overview.
8. Mission objective as a number — e.g. target RDV — to show progress. **[migration]** `Mission.targetMeetings Int?`. Ask first; skip if declined.
9. Activity log per mission/client from the existing `audit` trail (`lib/audit`) — check what is recorded before promising it.

---

## 4. Target architecture

### 4.1 File layout

```
app/manager/clients/
  page.tsx                      thin: Suspense + <ClientsWorkspace/>
  workspace.css                 tokens + layout only (see 4.3)
components/client-workspace/
  ClientsWorkspace.tsx          reads URL state, picks the level
  url-state.ts                  parse/build/alias  (+ url-state.test.ts)
  directory/   DirectoryView, DirectoryTable, AttentionRail, LeexiRail, ResumeCard
  client/      ClientShell (tree + crumb), OverviewTab, MissionsTab, ActivityTab,
               SessionsTab/, SdrFeedbackTab, OnboardingTab, ContactsAccessTab,
               ContractTab, SettingsTab, sheets/
  mission/     MissionShell (header + tabs), OverviewTab, BasesTab, StrategyTab,
               EmailsTab, TeamTab, FeedbackTab, SettingsTab, dialogs/
  shared/      Panel, PageHead, Pill, StatusMenu, KpiTile, Sparkline, EmptyState,
               ErrorState, SaveState, PropertyList, DataTable bits
lib/client-workspace/
  types.ts                      one source of response types (zod-inferred where routes use zod)
  api.ts                        typed fetchers that throw on !success
  queries.ts                    query keys + useQuery hooks
  mutations.ts                  useMutation hooks with optimistic updates
  attention.ts                  pure signal rules (+ attention.test.ts)
  readiness.ts                  shared with the API route (+ readiness.test.ts)
```

Rules: no file over ~400 lines; a tab component owns its own queries and dialogs; `MissionShell` holds no tab state. `components/missions/*` files that survive (`MissionSetupPanel`, `ReadinessPanel`, `StrategyEditorDrawer`, `ListCommercialsPicker`, `NewMissionDialog`) move or are re-exported; keep import paths working until the last phase.

### 4.2 Data layer

- React Query everywhere (already the pattern in `ClientDrawer`; keys in `lib/query-keys.ts`). Keys: `["clients","workspace",params]`, `["client",id]`, `["client",id,"sessions"]`, `["mission",id,"summary"]`, `["mission",id,"insights",days]`, `["mission",id,"lists"]`, `["mission",id,"strategies"]`, `["mission",id,"templates"]`, `["mission",id,"team"]`, `["mission",id,"feedback",range]`.
- Split the mission endpoint, keeping the old response shape alive for other consumers (SDR and client roles call `GET /api/missions/[id]` too — check every caller before changing its payload):
  - `GET /api/missions/[id]` → add `?view=summary` returning header fields, counts, readiness rollup; no companies.
  - `GET /api/missions/[id]/insights?days=30` → series, current/previous, team stats.
  - `GET /api/missions/[id]/lists` → lists with counts and status breakdown from one `GROUP BY` query, readiness per list.
- Fix D1 regardless: replace the nested `companies` select with a grouped SQL count; run independent aggregates in `Promise.all`.
- `GET /api/clients?view=workspace` → accept `search`, `status`, `sort`, `attention=1`; return per-client aggregates (active missions, actions 30 d, RDV this month, onboarding progress, engagement end, signals) computed with grouped queries, reusing `lib/client-insights.ts`. Keep pagination; use `useInfiniteQuery` or a single page of 100 with server search.
- Mutations: optimistic for toggles (list active, contacts view, cooldown, assign/unassign, status), invalidate the narrow key only; roll back and toast on error.

### 4.3 Design system alignment

- Re-base `workspace.css` variables on tokens: `--cw-ink: var(--ds-ink)`, `--cw-line: var(--ds-line)`, `--cw-surface: var(--ds-surface)`, `--cw-canvas: var(--ds-canvas)`, greens → `--ds-success*`, amber → `--ds-warning*`, focus → `--ds-focus`, primary → `--ds-primary`. Remove the hardcoded sidebar override or express it with `--ds-inverse`. Verify with a non-default brand (see `docs/WHITE_LABEL.md`) that the workspace follows it.
- Promote the recurring `cw-*` patterns to React components in `components/client-workspace/shared/` (`Panel`, `PageHead`, `Pill`, `SideCard`, `PropertyList`, `Checklist`) so markup stops repeating class strings. Buttons, menus, dialogs, sheets, tabs, tooltips, switches, selects, command: use `components/ui/shadcn/*` per `docs/ui/SHADCN.md`.
- Purge hardcoded Tailwind colours from the workspace files: target **zero** `text|bg|border-(slate|emerald|amber|teal|red|…)-N` in `components/client-workspace/**`. Add this grep to the phase checks.
- Type scale: nothing below 12 px; 13 px body; tabular figures for numbers (`cw-figures`).
- One motion rule (`--cw-motion`), honouring `prefers-reduced-motion` (already present).
- Native vs custom controls: keep native `<input type="date">` and `<select>` inside dense forms (they work and are accessible); use shadcn `Select`/`Popover` for menus that need icons or search; replace `<details>` used as layout with real sections.

### 4.4 Accessibility baseline

Real links for navigation rows; visible focus on every interactive element; Radix menus instead of hand-rolled popovers; `aria-current` on tree and tabs (already partly done); dialogs trap focus and restore it; reorder and context-menu actions available from a keyboard-reachable menu; status never conveyed by colour alone; `role="status"` for save/loading messages; 4.5:1 text contrast.

---

## 5. Decisions needed from the owner (defaults in bold if no answer)

1. Client default tab: **Vue d'ensemble** or keep Missions?
2. Delete the legacy pages (`/manager/missions/new`, `/manager/missions/[id]/edit`, `/manager/testclient`) — **redirect the first two, delete `testclient` only after confirmation**.
3. Numeric mission objective (`targetMeetings`) **[migration]** — **skip until confirmed**.
4. Duplicate mission — **include**.
5. Does the planning (`MissionPlan`) get edited inside the mission *Équipe* tab or stay in `/manager/planning`? — **link out, show read-only summary**.

---

## 6. Phased implementation

Each phase lists goal, tasks, and acceptance. Phases 0–2 change no visible behaviour beyond bug fixes; that is deliberate.

### Phase 0 — Baseline and safety net

- Record baselines: `npx tsc --noEmit` error list, `npx eslint` on the files in §1, screenshots of directory / each client tab / each mission tab at 1440 and 390 px with stubbed APIs. Save the Playwright script under `work/` (the folder already used for QA scripts).
- Build JSON fixtures for `GET /api/clients?view=workspace`, `GET /api/clients/[id]`, `GET /api/missions/[id]` (a DRAFT mission with blockers, an ACTIVE one with data, an empty one).
- Add `lib/client-workspace/url-state.ts` (+ tests): parse and build `{client, mission, tab, espace}`, alias table for old tab ids. Use it from `page.tsx` without changing behaviour.

**Accept:** tests pass; screenshots stored; no UI diff.

### Phase 1 — API correctness and performance

- D1/D2: rewrite the list counting in `app/api/missions/[id]/route.ts` with grouped SQL; parallelise aggregates. Move `computeReadiness` to `lib/client-workspace/readiness.ts` with tests; import it from the route.
- Add `?view=summary`, `/insights?days=`, `/lists` (§4.2). Validate `days` ∈ {7, 30, 90, all}.
- Extend `GET /api/clients?view=workspace` with search/status/sort and aggregates; add `lib/client-workspace/attention.ts` (+ tests) and return `signals[]` per client.
- Keep existing response fields so current UI keeps working.

**Accept:** unit tests for readiness and attention; for a seeded mission the old and new list counts match; handler no longer selects `companies` rows; role checks unchanged (test CLIENT and SDR access paths by reading the code and, if a pglite harness fits, a test in the style of `lib/api-v1/sql.pglite.test.ts`).

### Phase 2 — Decompose without redesign

- Create `lib/client-workspace/{types,api,queries,mutations}.ts`.
- Split `MissionWorkspace.tsx` tab by tab into `components/client-workspace/mission/*`, each tab owning its queries/mutations and dialogs. Order: Team → Feedback → Settings (reglages) → Bases → Strategy → Emails (merge the two template modals into one `TemplateDialog` with `mode`) → Overview/general. After each tab: type-check, compare screenshot with baseline.
- Split `ClientDrawer.tsx` the same way into `client/*`; rename the export to `ClientShell` (keep a re-export under the old name until Phase 7).
- Extract `ClientSessions` from `ClientDetailWorkspace` (sessions list, new/edit session modals, Leexi transcript, AI CR, task extraction, `buildCRPrompt`). Use it in the Sessions tab in place of the drawer-mounted legacy component.
- Replace per-action loading flags with mutation state; add optimistic updates for toggles.

**Accept:** no file in `components/client-workspace/**` over ~400 lines; `MissionWorkspace.tsx` and `ClientDrawer.tsx` are thin shells or gone; screenshots match baseline apart from loading states; all mutations still hit the same routes with the same bodies (assert in Playwright by recording requests against stubs).

### Phase 3 — Design-system pass

- Re-base `workspace.css` on `--ds-*` (§4.3); remove hardcoded hex.
- Build the `shared/` components; replace raw class-string markup and all hardcoded Tailwind colours in the workspace.
- Swap hand-rolled menus for shadcn `DropdownMenu`/`Select`; dialogs for shadcn `Dialog`/`Sheet`; add skeletons and `ErrorState` (mission not found, network error with retry).
- Unify feedback: inline `SaveState` for field edits, toast for discrete actions, never both.
- Restyle the Leexi block into a right-rail card.

**Accept:** colour-utility grep returns zero in the workspace folder; switching brand tokens re-colours the workspace; axe (via Playwright, `@axe-core/playwright` only if already available — otherwise manual keyboard pass and documented) shows no critical issues on the three levels; nothing under 12 px.

### Phase 4 — Mission workspace redesign

- New tab set and aliases (§3.4) in `url-state.ts` and `app/manager/missions/[id]/page.tsx`.
- Header: channel chips, elapsed-period bar, team avatars, status-dependent primary action, overflow menu.
- **Vue d'ensemble**: status-dependent layout; period selector wired to `/insights`; KPI tiles with conversion; per-base and per-SDR tables; blockers strip from readiness + signals.
- **Bases**: unified table with expandable row / sheet, bulk actions, keyboard-accessible row menu (replaces right-click-only delete).
- **Ciblage & scripts**: master–detail; single editor; remove the inline duplicate editor and the second copy of list toggles.
- **Emails**: conditional tab; keyboard reorder (move up/down in row menu) in addition to drag.
- **Équipe**: remove campaigns list; Command-based assign picker; planning summary.
- **Paramètres**: gather settings; danger zone last.
- Duplicate mission (decision 4): `POST /api/missions/[id]/duplicate` guarded like mission creation, wrapped in a transaction.

**Accept:** every action available before is still reachable (keep a checklist from §1.4 and tick each); old URLs with `tab=general|lancement|audience|strategies|strategy|feedback|reglages|assignments|campaigns|lists` land on the right place; a DRAFT mission opens on its checklist and can be started; an ACTIVE mission opens on metrics; works at 390 px.

### Phase 5 — Client workspace redesign

- New tree and aliases (§3.3); default tab per decision 1.
- **Vue d'ensemble** built from client detail + signals + missions summary.
- **Missions** table/cards with filters; richer rows.
- **Contacts & accès** as the single editing surface; delete `ClientManagementDrawer`; move profile/permissions/mailbox to **Paramètres**, engagement/plan to **Contrat**.
- Wire `?bilan=<week>` to open `WeeklyBilanModal` (used by `lib/reporting/weekly-bilan.ts`).

**Accept:** each client field has one editor; all items in §1.3 reachable; `espace=apercu|missions|onboarding|acces|activite|avis-sdr|sessions` still resolve.

### Phase 6 — Directory redesign

- Server-driven table with the columns in §3.2, sortable, with search debounce and `keepPreviousData`.
- Attention rail from server signals; Leexi rail; Resume card.
- Rows as links; keyboard navigation; ⌘K palette (clients + missions; reuse the workspace endpoint).
- Density and column preferences in localStorage (wrapped in try/catch as today).

**Accept:** first paint needs one request; search and sort hit the server; palette opens any client/mission; 390 px layout collapses the table into stacked rows via the existing container queries.

### Phase 7 — Retire legacy, finish

- `/manager/clients/[id]` → server redirect to `/manager/clients?client=<id>` mapping `?tab=sessions` → `espace=sessions`, `?bilan=` passthrough. Update the ~10 call sites listed in S2 to the new URL anyway.
- `/manager/missions/new` → redirect to `/manager/clients` (with `?client=` if `clientId` given) and open `NewMissionDialog` via a `?nouvelle-mission=1` param; `/manager/missions/[id]/edit` → redirect to the mission's `parametres` tab. Update `ManagerDashboardView.tsx:232`.
- Delete `ClientDetailWorkspace.tsx`, `ClientManagementDrawer.tsx`, the old wizard `_components`, `EditMissionDialog` if unused, and (after decision 2) `testclient`. Run `grep` for every deleted export first.
- Update `lib/assistant/docs/missions-campaigns.md` and `lib/assistant/docs/client-portal.md` if they describe the old tabs (the assistant reads these), and `docs/MANAGER-VIEW-AND-ROLES.md`.
- Final pass: bundle check on the route (dynamic-import heavy tabs: strategy editors, sessions, feedback), full verification list, written report.

**Accept:** no imports of deleted files; no link in the app points to a removed route; all three levels verified at three widths; tests green; report lists anything unverified.

---

## 7. Risks and how to contain them

| Risk | Containment |
|---|---|
| Regressing one of ~60 small actions buried in the god components | Build the action checklist from §1.3/§1.4 in Phase 0; tick it in Phases 2, 4, 5. Phase 2 is behaviour-neutral precisely so regressions are attributable. |
| Changing `GET /api/missions/[id]` breaks SDR/client consumers | Add views/endpoints; do not remove fields. Grep all callers of `/api/missions/` first. |
| Tab renames break bookmarks and the localStorage "Reprendre" entry | Alias table with tests; normalise stored locations on read. |
| White-label regressions | Check with a non-default brand after Phase 3. |
| Scope creep in "enhance everything" | New capabilities are limited to §3.5; anything else goes to §9. |
| No real data in the sandbox | Fixture-backed browser checks; say so in reports; owner does a live smoke test per phase. |

## 8. Definition of done

- One client experience and one mission experience; no legacy duplicates reachable.
- No workspace file over ~400 lines; shared types; React Query for all reads and writes.
- Mission load no longer scales with the number of companies.
- Zero hardcoded colour utilities or hex in the workspace; brand tokens drive it.
- Directory, client and mission each open on an overview with real data.
- Keyboard-operable throughout; no critical accessibility issues.
- Unit tests for URL state, attention, readiness; Playwright script covering the three levels at three widths.
- Assistant and manager docs match the new structure.

## 9. Follow-ups outside this plan

- Client portal (`app/client/portal/*`: meetings page is 1 867 lines, database 1 088) deserves the same treatment and should reuse `shared/` components.
- BD pages (`app/bd/clients`, `app/bd/missions`) duplicate client/mission lists with a third UI.
- `MissionStatusWorkflowDrawer` (492 lines) and `StrategyByListTab` internals use their own inline styles; restyle when touched.
- Repo-root scratch files and stray logs.
