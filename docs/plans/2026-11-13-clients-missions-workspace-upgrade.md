# Clients & Missions workspace — analysis and upgrade plan

**Date:** 2026-11-13
**Audience:** the implementing agent (Claude Opus 5.5) and the product owner.
**Scope:** the manager "Espace clients" at `/manager/clients` — client directory, client workspace, mission workspace — plus the APIs and legacy routes they depend on.
**Out of scope (follow-ups in §9):** client portal (`app/client/portal/*`), BD pages (`app/bd/*`), SDR views, billing, the assistant.

**How this was produced.** A code read of `feat/assistant-brain` at `8455b6f`. That head already contains two same-day reworks of this area — `4cf4fb1` (*document-style client workspace*) and `1a52f1e` (*mission pulse*). This plan starts from that state: it does not redo what they shipped, it finishes what they left. The app was not run and nothing was viewed in a browser, so visual judgements are inferred from markup and CSS. Line numbers will drift; re-grep before editing.

---

## 0. Instructions for the implementing agent

1. **Read first:** `app/manager/clients/page.tsx`, `components/drawers/ClientDrawer.tsx`, `components/missions/MissionWorkspace.tsx`, `components/missions/MissionPulse.tsx`, `app/manager/clients/workspace.css` (its header comment defines the layout contract), `lib/manager/attention.ts`, `lib/missions/{readiness,pulse}.ts`, `docs/ui/SHADCN.md`, and the commit messages of `4cf4fb1` and `1a52f1e`.
2. **The new shell is the standard.** Tree = scope, crumb = location, `.cw-doc` = the work read as a document, `.cw-rail` = properties and next action. Colours only from `--ds-*`. Everything this plan touches must end up in that language. `MissionPulse.tsx`, `MissionSetupPanel.tsx`, `ReadinessPanel.tsx`, `components/manager/workspace/*` are the reference implementations.
3. **Work phase by phase (§6).** Each phase is reviewable and leaves the app working. Extract first, then change.
4. **UI copy is French**, with the existing vocabulary (*base de prospects*, *ciblage*, *lancement*, *référent*, *interlocuteur*, *intégration*, *avis SDR*, *à traiter*, *RDV visés*).
5. **No invented data.** No placeholder metrics or sample rows in application components. If the API lacks a number, add it to the API or omit the element.
6. **Schema changes** are marked **[migration]** and need the owner's go-ahead.
7. **Preserve URLs.** `?client=&mission=&tab=&espace=&page=` is a contract (bookmarks, the redirects in `app/manager/missions/**`, the "Reprendre" entry in localStorage, `Attention.tab` in `lib/manager/attention.ts`, `MISSION_PANEL_LABELS` in `ClientDrawer.tsx`). Any rename needs an alias and a test.
8. **Preserve authorization.** Writes stay on existing `requireRole` routes; status changes keep `canTransitionMissionStatus`.
9. **Verify each phase:** `npx tsc --noEmit` compared with a baseline taken before starting (the repo has unrelated known errors — see `ts_errors*.log`), `npx eslint <touched files>`, the `tsx --test` suites (existing: `lib/missions/pulse.test.ts`, `lib/manager/attention.test.ts`, `lib/client-pages/blocks.test.ts`; plus those you add), and a Playwright pass at 1440 / 1024 / 390 px against stubbed API responses with real mutations blocked (the approach recorded in `docs/plans/2026-11-03-captain-workspace-implementation.md`).
10. **Report honestly** at the end of each phase: what changed, what was verified and how, what was not.

---

## 1. Current state

### 1.1 What the two recent commits already delivered — do not redo

| Area | Delivered |
|---|---|
| Shell | Tree / crumb with sibling switchers (`CrumbSwitcher`, `CrumbSlot`) / document canvas / rail. `workspace.css` (1 350 lines) is based on `--ds-*` with a single stray hex. Focus follows navigation (`components/manager/workspace/focus.ts`). |
| Directory | Cross-client **À traiter** inbox (`InboxItem`, `collectAttention`), filter tree, client table, rail with *Reprendre*, portfolio figures and Leexi recaps (opened in a drawer). |
| Client home | *À traiter* for the client, missions grouped by stage with quick commands (`MissionLine`), **Pages** (new `ClientPage` model, `/api/clients/[id]/pages`, `/api/client-pages/[pageId]`, block editor `ClientPageEditor` with autosave and stale-save detection), properties rail, onboarding progress, shortcuts. |
| Mission | The eight tabs became **one brief**: framing (`MissionSetupPanel`), launch checklist (`ReadinessPanel`), bases, ciblage & scripts, team, activity. Heavy editors open in a `Drawer` selected by `?tab=` (`PANELS` in `MissionWorkspace.tsx`). The rail explains why *Démarrer* is disabled. |
| Mission pulse | For a running mission: pace verdict vs `Mission.targetMeetings` (*RDV visés*, migration shipped), one prioritised next action, funnel *en base → appelés → joints → intéressés → RDV* with a 90-day agency benchmark and "maillon faible", daily rhythm bars, team contribution. Logic in `lib/missions/pulse.ts` with tests. |
| Shared rules | `lib/missions/readiness.ts` (used by the mission API and the workspace list API), `lib/manager/attention.ts` with tests. |

### 1.2 What is still the old code

Measured at `8455b6f`:

| File | Lines | `useState` | `fetch(` | React Query hooks | Hardcoded Tailwind colour utilities | `cw-*` uses |
|---|---|---|---|---|---|---|
| `components/missions/MissionWorkspace.tsx` | 4 487 | 85 | 38 | 0 | 541 | 144 |
| `components/drawers/ClientDrawer.tsx` | 2 411 | 21 | 12 | 7 | 180 | 130 |
| `components/manager/ClientDetailWorkspace.tsx` | 4 753 | 82 | 30 | 0 | 555 | 0 |
| `components/missions/StrategyByListTab.tsx` | 1 024 | 10 | 4 | 0 | inline styles | 0 |
| `components/missions/NewMissionDialog.tsx` | 738 | 9 | 2 | 0 | 100 | 0 |
| `app/manager/clients/page.tsx` | 424 | 9 | 2 | 4 | 0 | 70 |
| `components/missions/MissionPulse.tsx` | 277 | 3 | 0 | 0 | 0 | 67 |

So the **surface** of each level is new, and the **interior** is not:

- **Mission drawers** (`MissionWorkspace.tsx` ≈ 2183–3427): the panels `audience`, `strategies`, `strategy`, `equipe`, `feedback`, `reglages` are the former tab bodies moved into a drawer unchanged — slate/emerald/teal cards, `rounded-2xl shadow-sm`, 18 px headings, their own buttons.
- **Mission modals** (≈ 3429–4480): create-template and edit-template modals are two near-identical ~270-line blocks (≈ 3429–3699 and 3700–3971); plus add-template, preview, AI suggestions, mailbox, portal-launch, delete confirmations.
- **Mission leftovers in the brief**: a block with *Statuts et workflow* and *Comptes email* in the old card style (≈ 2050–2130); `Sparkline` / `KpiTile` helpers (≈ 296–470) from the old design.
- **Client tab views** (`ClientDrawer.tsx`): `OverviewTab` (≈ 802), `AccessTab` (≈ 1122), `InterlocuteursTab` (≈ 1243), `ActivityTab` (≈ 1480), `SdrFeedbackTab` (≈ 1530), `SessionsTab` (≈ 1634), `EngagementSection`/`EngagementModal` (≈ 2111–2411) are old JSX constants inside the one component.
- **State and data**: the mission component is still one function with 85 state variables and 38 raw fetches, refetching the whole mission after most mutations.

### 1.3 URL model (unchanged)

| Level | URL | Component |
|---|---|---|
| Directory | `/manager/clients` | `ClientsPageInner` (`app/manager/clients/page.tsx`) |
| Client | `?client=<id>` (`espace=missions` is the home; other `espace` values: `apercu`, `onboarding`, `acces`, `activite`, `avis-sdr`, `sessions`) | `ClientDrawer` — a full-page shell despite its name |
| Client page | `?client=<id>&page=<id>` | `ClientPageEditor` |
| Mission | `?client=<id>&mission=<id>` (`tab=general` is the brief; `lancement` scrolls to the checklist; `audience`, `strategies`, `strategy`, `equipe`, `feedback`, `reglages` open the drawer) | `MissionWorkspace` |

The studio layout applies only when `pathname === "/manager/clients"` (`components/layout/AppLayoutShell.tsx:186`).

---

## 2. Findings

Severity: **H** user-visible or blocks quality work, **M** real cost, **L** polish.

### 2.1 Structure

| # | Sev | Finding |
|---|---|---|
| S1 | H | `MissionWorkspace.tsx` is a 4 487-line single component (85 `useState`, 38 fetches, ~12 dialogs). `ClientDrawer.tsx` builds every view as JSX constants in one 2 411-line function. Any edit risks unrelated regressions and re-renders everything. |
| S2 | H | **A second client experience is still live.** `/manager/clients/[id]` renders the legacy `ClientDetailWorkspace.tsx` (4 753 lines: its own tabs, mission list, portal-access dialog, analytics) outside the studio shell. It is linked from: `app/manager/dashboard-projet/page.tsx:368`, `app/manager/rdv/_components/DetailPanel/FeedbackTab.tsx:114` (`?tab=sessions`), `components/assistant-ui/workspace/folder/ContextPanel.tsx:85,101`, `components/emailing/ReachInboxWorkspace.tsx:466`, `components/emailing/reachinbox-ui.tsx:341,349`, `components/email/mailboxes/MailboxSettingsDrawer.tsx:477`, `components/email/inbox/inbox-utils.ts:214`, `lib/reporting/weekly-bilan.ts:144` (`?bilan=`). Which UI a manager gets depends on where they clicked. |
| S3 | M | The new workspace mounts that same legacy component in a full-size drawer to manage sessions (`sessionsOnly`, `ClientDrawer.tsx` ≈ 2025). |
| S4 | M | Legacy mission creation is still reachable: `/manager/missions/new` (wizard in `app/manager/missions/new/_components`, ~1 470 lines) from `components/accueil/ManagerDashboardView.tsx:232`, `ClientDetailWorkspace.tsx:1942`, `app/manager/testclient/page.tsx`. `/manager/missions/[id]/edit` (377 lines) and `app/manager/testclient/page.tsx` (989 lines) look like leftovers. Three creation paths exist: that wizard, `NewMissionDialog`, the client onboarding wizard. |
| S5 | M | Duplicated create/edit template modals (see §1.2). |
| S6 | M | Three surfaces edit the same client data: inline fields in `OverviewTab`, the `acces` view, and `ClientManagementDrawer` (profile / contacts / portal). Interlocuteurs have two different forms. |
| S7 | L | Response types are redeclared per file (`Mission`, `Client`, `MissionLite`…), each a different partial. |
| S8 | L | Repo-root scratch files (`console.log('Prisma`, `{if(l.includes('cp-sidebar')`, `ts_errors*.txt`, debug scripts). Separate cleanup. |

### 2.2 Data and performance

| # | Sev | Finding |
|---|---|---|
| D1 | H | `GET /api/missions/[id]` still selects **every company of every list** (`companies: { select: { status, _count: { contacts } } }`, `app/api/missions/[id]/route.ts` ≈ 94) to count in JS. Cost grows with base size, and the workspace reloads this endpoint after most mutations. |
| D2 | M | The same handler now runs more queries (trend, funnel, prospects, 90-day agency benchmark, team, opportunities); several are sequential. The agency benchmark is recomputed on every mission load although it is the same for all missions. |
| D3 | M | One payload feeds everything; a list toggle refetches pulse, funnel and benchmark. No cache or optimistic update. |
| D4 | M | `GET /api/clients?view=workspace` loads `icp`, `pitch`, `script` **text** for every campaign of every mission of every client just to derive booleans, and the page fetches all pages in a loop before first paint, then searches client-side. |
| D5 | M | Insight window fixed at 30 days server-side; no period selector. |
| D6 | L | Ad-hoc loaders for users, mailboxes, templates, feedback, each with its own loading flag. |

### 2.3 Experience

| # | Sev | Finding |
|---|---|---|
| U1 | H | **Opening a mission drawer is a visual break.** The brief is calm document typography; the drawer behind any "Gérer" is the old dashboard-card UI. This is now the most visible inconsistency in the product area. |
| U2 | H | Two strategy editors remain: `strategies` (*Ciblage et scripts*, `StrategyByListTab` + `StrategyEditorDrawer`) and `strategy` (*Stratégie avancée*, inline ICP/pitch/script with base / additional / AI variants). Both write the same campaign fields. Email templates and the mission mailbox are hidden inside *Stratégie avancée* and a leftover block in the brief. A "Campagnes" list still sits in the *Équipe* panel. |
| U3 | H | **The client level has no performance view.** Client home shows what to fix, missions and pages — good — but nothing on results: RDV this month, activity, days worked vs contracted, engagement end. Those live in old `apercu` / `activite` views. A running mission has a pulse; a client does not. |
| U4 | M | **Attention covers setup only.** `missionAttention` knows: no bases, open launch points, no SDR, ready to launch, ending ≤ 14 days. It ignores what `pulse.ts` already computes (pace `behind`, weakest funnel step) and other signals already in the repo (`lib/agent/watch/signals/client-attention.ts`, `lib/agent/watch/rules/client_at_risk.ts`, `lib/manager-home/rules.ts`): no calls for n working days, engagement ending, onboarding step overdue, meeting feedback pending. |
| U5 | M | The directory table has four columns (client, status, missions, à traiter) and no sort. Nothing about results, team, or engagement. Rows are `<tr onClick>` with a nested button rather than links, so no open-in-new-tab. |
| U6 | M | Per-list controls are split and duplicated: `isActive` and `contactsViewEnabled` toggles exist in both the `audience` panel and `StrategyByListTab`. |
| U7 | M | Sessions & CR: a compact read-only list in the client view, and the full manager behind a second full-size drawer running the legacy component. |
| U8 | L | Feedback is inconsistent: toast, the header "Enregistré" pill, or nothing. |
| U9 | L | Mission loading is a centred spinner and a missing mission renders nothing (`return null`); no skeleton, no error state with retry. |
| U10 | L | Template reorder is drag-only; list delete is right-click-only. |

### 2.4 Visual and accessibility

| # | Sev | Finding |
|---|---|---|
| V1 | H | ~720 hardcoded Tailwind colour utilities remain across `MissionWorkspace.tsx` and `ClientDrawer.tsx`. They ignore the agency brand (the product is white-label; see `docs/WHITE_LABEL.md`) while the shell around them follows it. |
| V2 | M | 111 raw `<button>` in the mission file with per-instance class strings; hand-built popovers (`StatusSelect`, client status menu) use a fixed-inset click catcher — no arrow keys, no focus management. Radix menus are already in `components/ui/shadcn`. |
| V3 | M | Old panels use 10–11 px text (`text-[10px]`, `text-xs` meta) and colour-only status. |
| V4 | L | `NewMissionDialog`, `MissionStatusWorkflowDrawer`, `StrategyEditorDrawer`, `ListCommercialsPicker`, `MissionPlanForm`, `EditMissionDialog` each carry their own palette. |

---

## 3. Target experience

### 3.1 Principles (extending the ones the shell already follows)

1. **Same language at every depth.** A drawer or dialog opened from a document page looks like that page: `cw-section`, `cw-rows`, `cw-props`, one button style, `--ds-*` only.
2. **One place per job.** One strategy editor, one interlocuteur form, one template dialog, one set of list toggles.
3. **Results sit next to setup.** Each level answers "how is it going" as well as "what is missing".
4. **Never wait blindly, never lose work.** Optimistic toggles, visible save state, skeletons, error states with retry, dirty-form guards.

### 3.2 Mission

Keep the brief + pulse + rail. Change what the brief opens:

| `?tab=` | Panel after this plan | Change |
|---|---|---|
| `audience` | **Bases de prospects** | One table: name, source, companies / contacts, progress by company status (from SQL), linked strategy with readiness marks, commercials, active switch. Row menu (keyboard reachable): settings sheet (contacts view, 24 h pause, commercials), archive, delete. Bulk: assign commercial, link strategy, activate. Toolbar: import CSV, new base. The duplicate toggles in the strategy view disappear. |
| `strategies` (alias `strategy`, `campaigns`) | **Ciblage & scripts** | Master–detail: strategies with the bases using each on the left; editor on the right with ICP, pitch, script and sub-tabs *Base / Complément / Version IA* including share state. One implementation built on `components/strategy/*` block editors. The inline editor in the old `strategy` panel is removed. |
| `emails` *(new; shown when the mission has the EMAIL channel)* | **E-mails** | Template sequence with move up / down as well as drag; single `TemplateDialog` (`mode: create \| edit`) with write / preview / AI; mission default mailbox; link to mailbox manager. |
| `equipe` | **Équipe** | Référent, assigned SDRs with contribution, searchable assign picker (shadcn `Command` in a popover), planning summary with a link to `/manager/planning`. Campaigns list removed. |
| `feedback` | **Avis SDR** | Same content in row style, date range in the header. |
| `reglages` | **Administration** | Statuses & workflow, prospect-creation settings, portal visibility, danger zone. The leftover workflow/mailbox block leaves the brief. |

Brief additions:
- Period selector on pulse and activity (7 / 30 / 90 days, since start).
- Per-base performance rows in the pulse (worked %, RDV) once D1 gives per-list counts.
- Mission actions in the header menu: **Dupliquer** (name, objective, channels, target, strategies, templates — not bases, not assignments), archive.
- Skeleton while loading; "Mission introuvable" and network-error states with retry.

### 3.3 Client

Keep home (*À traiter*, missions, pages, rail). Add and consolidate:

- **Résultats** section on client home, above missions, for clients with a running mission: RDV this month vs last, RDV vs summed *RDV visés* of running missions, days with calls vs contracted days (`contractedDaysPerWeek`, `lib/client-insights.ts`, `lib/staffing/clientStaffing.ts`), a per-mission pace line reusing `pace()` from `lib/missions/pulse.ts`. Compact — a hero figure and rows, in the pulse's visual grammar.
- **Rail**: add engagement (offer, end date, "renouvellement dans n j") and next client RDV.
- **Views** (tree order): *Accueil* (`missions`), *Activité* (`activite`), *Comptes rendus* (`sessions`), *Avis SDR* (`avis-sdr`), then *Intégration* (`onboarding`), *Contacts & accès* (`acces`), *Contrat* (`contrat`, new: `EngagementSection` + production plan), *Paramètres* (`apercu` aliased to `parametres`: profile, portal permissions, default mailbox, RDV e-mail test, delete).
- **Contacts & accès** becomes the only place to edit interlocuteurs and portal users (list + side sheet). `ClientManagementDrawer` is removed; rail "Contact" and menu items deep-link here.
- **Comptes rendus**: a real `ClientSessions` module extracted from the legacy component (list, create from Leexi transcript, AI CR, task extraction, summary e-mail), rendered in the page.

### 3.4 Directory

- Server-driven table: **Client** · **Statut** · **Missions** (running / total) · **RDV ce mois** · **Rythme** (worst pace verdict among running missions, as text + tone) · **Fin d'engagement** · **À traiter**. Sortable; search and status filter on the server.
- Rows are links. `/` focuses search; ↑ ↓ Enter navigate.
- ⌘K command palette (`components/ui/shadcn/command.tsx`) to jump to any client, mission or page.
- **Attention extended** (pure rules in `lib/manager/attention.ts`, tests updated): pace `behind`; no call for n working days on an ACTIVE mission; engagement ending ≤ 30 days; onboarding step overdue; client meeting feedback pending. Each carries a rank and a target (`tab` / `espace`). Inbox gains filter chips by kind once there is more than one kind.

### 3.5 New capabilities — the complete list

1. Period selector on mission insights. 2. Per-base performance. 3. Duplicate mission. 4. Bulk actions on bases. 5. E-mails panel as a first-class place. 6. Client results section. 7. Extended attention rules. 8. Command palette and keyboard navigation. 9. Sortable, richer directory.
Anything beyond these goes to §9.

---

## 4. Target architecture

### 4.1 Files

```
app/manager/clients/page.tsx            thin: Suspense + <ClientsWorkspace/>
components/manager/workspace/           (exists — extend, don't fork)
  ClientsWorkspace.tsx                  URL state → level
  url.ts                                parse / build / alias (+ url.test.ts)
  ui/                                   Section, Rows/Row, Props, RailSection, Pill, Button,
                                        StatusMenu, SaveState, Skeletons, ErrorState, Sheet wrapper
  directory/                            DirectoryView, DirectoryTable, Inbox, LeexiDrawer, CommandPalette
  client/                               ClientShell, HomeView, ResultsSection, ActivityView,
                                        SessionsView/, SdrFeedbackView, OnboardingView,
                                        ContactsAccessView, ContractView, SettingsView
  mission/                              MissionShell, Brief, panels/{Bases,Strategy,Emails,Team,
                                        Feedback,Admin}Panel, dialogs/{TemplateDialog,PortalLaunch,
                                        Mailbox,DeleteMission}
lib/manager/workspace/
  types.ts  api.ts  queries.ts  mutations.ts
lib/manager/attention.ts                (exists — extend)
lib/missions/{readiness,pulse}.ts       (exist)
```

Rules: no file over ~400 lines; a panel owns its queries, mutations and dialogs; `MissionShell` holds no panel state; survivors (`MissionPulse`, `MissionSetupPanel`, `ReadinessPanel`, `ListCommercialsPicker`, `ClientPageEditor`, `CrumbSwitcher`, `InboxItem`) stay where they are or are re-exported so imports keep working until Phase 6.

### 4.2 Data

- React Query for all reads and writes (already used in `ClientDrawer` and `page.tsx`; keys in `lib/query-keys.ts`). Keys: `["mission",id,"brief"]`, `["mission",id,"insights",period]`, `["mission",id,"lists"]`, `["mission",id,"strategies"]`, `["mission",id,"templates"]`, `["mission",id,"team"]`, `["mission",id,"feedback",range]`, plus the existing client keys.
- Mission API. `GET /api/missions/[id]` is also called by SDR, client and BD roles — grep every caller before touching its shape, and only add:
  - fix D1 in place: per-list company/contact counts and status breakdown via one grouped SQL query; no `companies` rows selected;
  - `?view=brief` → header, framing, counts, readiness, team; no insights;
  - `GET /api/missions/[id]/insights?period=7|30|90|all` → series, pulse inputs, funnel, team stats;
  - agency benchmark: compute once and cache (module-level memo with a short TTL, or its own endpoint/query key with a long `staleTime`).
- Clients workspace API: derive readiness booleans in SQL (`icp <> ''` etc.) instead of selecting text; add `search`, `status`, `sort`; return per-client aggregates (RDV this month, worst pace, engagement end, attention inputs) from grouped queries; one request for first paint.
- Mutations: optimistic for switches (list active, contacts view, cooldown, assign / unassign, status) with rollback + toast on error; invalidate the narrowest key.

### 4.3 Design system

- `ui/` components wrap the existing `cw-*` classes so markup stops repeating class strings; menus, dialogs, sheets, popovers, command, tooltips, switches come from `components/ui/shadcn/*` per `docs/ui/SHADCN.md`, styled to the `cw` language.
- Target: **zero** `(text|bg|border|ring)-(slate|gray|zinc|emerald|green|teal|amber|red|rose|blue|indigo|violet)-N` and zero hex in `components/manager/workspace/**`, `components/missions/**` and `ClientDrawer`'s successors. Make that grep a phase check.
- Nothing under 12 px; tabular figures for numbers; status always text + tone.
- Native `<input type="date">` / `<select>` are fine inside dense forms (as `MissionSetupPanel` does).

### 4.4 Accessibility baseline

Links for navigation rows; Radix menus instead of hand-rolled popovers; dialogs trap and restore focus (respect `components/ui/dialogStack.ts`); reorder and row actions keyboard-reachable; `role="status"` on save/loading; 4.5:1 text contrast; keep the focus-follows-navigation behaviour (`data-focus-key`).

---

## 5. Decisions for the owner (default in bold)

1. Remove legacy pages: **redirect `/manager/missions/new` and `/manager/missions/[id]/edit`; delete `/manager/testclient` only after confirmation.**
2. Merge *Ciblage et scripts* and *Stratégie avancée* into one editor — **yes**.
3. Duplicate mission — **include**.
4. Client *Résultats* on the home page — **yes, compact**.
5. Planning editing inside the mission team panel — **no; read-only summary with a link**.

---

## 6. Phases

Phases 0–2 are behaviour-neutral on purpose, so regressions are attributable.

### Phase 0 — Safety net
- Baselines: tsc error list, eslint on the files in §1.2, screenshots of directory / client home / each client view / mission brief (draft and running) / each mission drawer at 1440 and 390 px with stubbed APIs. Keep the script under `work/`.
- Fixtures: clients workspace list; client detail; missions — DRAFT with blockers, ACTIVE with pulse data, empty.
- **Action inventory:** list every user action in `MissionWorkspace.tsx` and `ClientDrawer.tsx` (each mutation call site and what triggers it). This checklist is ticked in Phases 2, 3 and 4.
- `components/manager/workspace/url.ts` + tests (parse, build, aliases); use it from `page.tsx` with no behaviour change.

**Accept:** tests green, inventory written, no UI diff.

### Phase 1 — API
- D1 fix; parallelise; `?view=brief`; `/insights?period=`; benchmark caching.
- Clients workspace API: SQL booleans, search / status / sort, aggregates.
- Extend `lib/manager/attention.ts` with the new rules and tests (rules only; UI in Phase 5).
- Keep all existing response fields.

**Accept:** readiness and attention tests pass; old vs new list counts match on fixtures (a pglite test in the style of `lib/api-v1/sql.pglite.test.ts` if it fits); no `companies` row select in the mission handler; role checks untouched.

### Phase 2 — Decompose, no redesign
- Add `lib/manager/workspace/{types,api,queries,mutations}.ts`.
- Move each mission panel out of `MissionWorkspace.tsx` unchanged in looks, in this order: Team → Feedback → Admin → Bases → Strategy → templates (merge the two modals into `TemplateDialog`) → Brief. Type-check and compare screenshots after each.
- Split `ClientDrawer.tsx` into `client/*` views the same way; export `ClientShell` (keep the old name re-exported).
- Extract `ClientSessions` from `ClientDetailWorkspace.tsx` (including `buildCRPrompt`) and use it in the *Comptes rendus* view instead of the drawer-mounted legacy component.
- Replace loading flags with mutation state; add optimistic updates for switches.

**Accept:** no workspace file over ~400 lines; every action in the inventory still sends the same request (assert by recording requests against stubs); screenshots match apart from loading states.

### Phase 3 — Mission panels in the document language
- Build `ui/` components.
- Redesign each panel per §3.2 (Bases table with row menu and bulk actions; single Strategy editor; E-mails panel; Team; Feedback; Admin). Add aliases `strategy → strategies`, `campaigns → strategies` and update `TAB_ALIASES` in `app/manager/missions/[id]/page.tsx`, `PANELS`, `MISSION_PANEL_LABELS`.
- Restyle dialogs (`TemplateDialog`, mailbox, portal launch, delete) and the satellite components in V4.
- Period selector; per-base rows in the pulse; skeleton and error states; duplicate mission (`POST /api/missions/[id]/duplicate`, same guard as creation, in a transaction).
- Remove `Sparkline` / `KpiTile` if unused afterwards.

**Accept:** colour grep is zero in mission files; inventory fully ticked; all `?tab=` values past and present resolve; DRAFT mission can be completed and started, running mission shows pulse with a working period selector; usable at 390 px; keyboard-only pass through each panel.

### Phase 4 — Client views in the document language
- `ResultsSection` on home; engagement and next RDV in the rail.
- *Contacts & accès* as the single editor; remove `ClientManagementDrawer`; *Contrat* and *Paramètres* views; `apercu → parametres` alias.
- Restyle *Activité*, *Avis SDR*, *Comptes rendus*, *Intégration*.
- Wire `?bilan=<week>` to `WeeklyBilanModal` (needed by Phase 6 redirects).

**Accept:** each client field has exactly one editor; colour grep zero; all `espace` values resolve; inventory ticked.

### Phase 5 — Directory
- Server-driven table with the §3.4 columns, sort, debounced search, `placeholderData: keepPreviousData`.
- Inbox with the extended rules and kind filter.
- Rows as links; keyboard navigation; ⌘K palette.

**Accept:** one request to first paint; search / sort hit the server; palette reaches any client, mission, page; stacked layout at 390 px.

### Phase 6 — Retire legacy
- `/manager/clients/[id]` → server redirect to `/manager/clients?client=<id>`, mapping `?tab=sessions → espace=sessions` and passing `?bilan=`. Update the call sites in S2 to the new URL as well.
- `/manager/missions/new` → redirect into the workspace opening `NewMissionDialog` (e.g. `?nouvelle-mission=1`, with `client=` when `clientId` is given); `/manager/missions/[id]/edit` → the mission brief. Update `ManagerDashboardView.tsx:232`.
- Delete `ClientDetailWorkspace.tsx`, `ClientManagementDrawer.tsx`, the old wizard `_components`, `EditMissionDialog` if unused, and `testclient` if approved — grep every export first.
- Update `lib/assistant/docs/missions-campaigns.md`, `lib/assistant/docs/client-portal.md` (the assistant reads these) and `docs/MANAGER-VIEW-AND-ROLES.md` where they describe old tabs.
- Dynamic-import heavy panels (strategy editors, sessions, page editor); final verification and written report.

**Accept:** no import of a deleted file; no link to a removed route; three levels checked at three widths; all suites green; report states what was not verified.

---

## 7. Risks

| Risk | Containment |
|---|---|
| Losing one of the many small actions inside the two big components | Phase 0 inventory; request-recording checks; behaviour-neutral Phase 2. |
| Breaking SDR / client / BD consumers of `GET /api/missions/[id]` | Additive only; grep all callers first. |
| Tab aliases breaking bookmarks, "Reprendre", or `Attention.tab` | `url.ts` tests; normalise stored locations on read. |
| White-label regressions | After Phases 3 and 4, check with a non-default brand. |
| Conflicts with the parallel session that is actively committing to this branch in the same files | Fetch and rebase before each phase; keep commits small; if `MissionWorkspace.tsx` or `ClientDrawer.tsx` changed upstream, re-run the Phase 0 inventory for the changed parts. |
| No real data in the sandbox | Fixture-backed browser checks, stated as such; owner does a live smoke test per phase. |

## 8. Definition of done

- One client experience and one mission experience; no legacy duplicate reachable.
- Drawers, dialogs and views share the document language; zero hardcoded colours in the workspace; brand tokens drive everything.
- No workspace file over ~400 lines; shared types; React Query throughout.
- Mission load no longer scales with company count; directory paints from one request.
- One strategy editor, one template dialog, one interlocuteur form, one set of list controls.
- Client home shows results as well as setup; attention covers performance as well as setup.
- Keyboard-operable; no critical accessibility issue.
- Tests for URL state, attention, readiness, pulse; Playwright script for three levels at three widths.
- Assistant and manager docs match.

## 9. Follow-ups outside this plan

- Client portal (`app/client/portal/meetings/page.tsx` 1 867 lines, `database/page.tsx` 1 088) — same treatment, reuse `ui/`.
- BD pages (`app/bd/clients`, `app/bd/missions`) — a third UI for the same objects.
- Mission timeline across a client; activity log from `lib/audit`; saved directory views.
- Repo-root scratch files.
