# Suzalink: business context, current-state audit and product roadmap

Status: **proposal for review. Nothing in this document has been implemented.**
Audit date: 2026-11-16. Repository: `odoklein/captainprospect-crm`, branch `claude/festive-cerf-ltiuti`.

Labels used throughout:
- **[Verified]** seen in the code, run locally, or stated in a repo document.
- **[Stated]** told to me by the Product Owner, not checkable in the repo.
- **[Hypothesis]** my inference, to be confirmed.
- **[Unknown]** not established.

---

## 1. Business context (corrected)

### 1.1 The ecosystem

| Entity | Role |
|---|---|
| **Suzali Conseil** | The existing company. Provides commercial infrastructure, business development, management and operational resources, and financial and organisational support for technology work. |
| **Captain Prospect** | The prospecting and sales-operations side: B2B prospecting, lead generation, SDR operations (phone, email, LinkedIn), qualification, appointment setting, CRM-based sales operations. It is the first real user of the CRM and the source of its workflows. |
| **Suzalink** | The technology and product business. It develops products, supports Suzali Conseil and Captain Prospect, turns operational problems into reusable software, and commercialises that software externally. |

### 1.2 What "Suzalink" is in the repository [Verified]

- Suzalink is the **commercial brand of the Captain Prospect CRM**. The repo is still named `captainprospect-crm`. Migration `20261111120000_rebrand_suzalink` and the `suzalink-site/` marketing site show the rename.
- `suzalink-site/CLAUDE.md` describes the product as "le CRM d'exécution outbound de Suzali Conseil".
- Suzalink sells two things, both running on the same CRM:
  1. **The CRM itself**, white-label, to prospecting agencies and sales teams (`suzalink-site/content/pricing.ts`: Indépendant, Small Business, Medium Business).
  2. **An outsourced SDR service** (`suzalink-site/content/offers.ts`: Sprint test, Mission mensuelle, 100 % résultat). These prices are marked "TODO: proposed, to validate".

### 1.3 Ownership and people [Stated]

- The Product Owner is Tech Lead at Suzali Conseil, Product Owner of Suzalink and holds 30 % of Suzalink.
- **Ownership of the product is between the Product Owner and Jeff.** Jeff contributed substantial product vision to the CRM.
- **There are no signed terms yet.** No shareholder agreement, no IP assignment, no revenue-sharing arrangement exists on paper.
- Suzali Conseil provided time, space, resources and investment. How that investment is treated is undefined.
- Nothing in the repository documents any of this. Git authors are only "Odo Klein" (52 commits) and "Claude" (41 commits).

### 1.4 Commercialisation status

- External commercialisation has started [Stated].
- **First small-team client: €150** [Stated]. Whether this is monthly or one-off, and which pack it corresponds to, is **[Unknown]**.
- A first agency, **PingLead**, was provisioned and its data migrated on 26 Oct 2026 (12 seats, 3,948 companies, 1,977 contacts, 2,617 actions) [Verified in `work/SESSION_RECAP_2026-10-26.md`]. The recap says cutover from their old CRM was still pending. Current status is **[Unknown]**.
- **Production is app.suzalink.com ("v02")** [Stated]. The recap describes it as the v02 build deployed from the feature branch. The Console is at console.suzalink.com.
- The **Console code lives in the Product Owner's GitHub** [Stated]. I have not read it.
- Pricing of the third item, the exact limits to enforce, is **not decided** [Stated].

### 1.5 Business model implied by the architecture [Verified]

- **One database, one container and one storage bucket per agency.** There is no `tenantId`. Isolation is the database (`docs/WHITE_LABEL.md`, `docs/AGENCY_PROVISIONING_PLAN.md`).
- One Docker image for everyone. Brand, URLs and keys come from each instance's DB and env.
- A separate control plane (the Console) provisions, upgrades, backs up and suspends instances through a signed `/api/instance/*` API.
- This is sellable as "your own dedicated CRM instance" (data sovereignty), at the cost of per-instance operations.

---

## 2. Executive summary

**What it is.** A large French-language outbound sales-execution platform:
- 621 API routes, 172 pages, about 430,000 lines of TS/TSX, 167 Prisma models.
- Next.js 16.1.1, React 19.2.3, Prisma 6, NextAuth v4, BullMQ and Redis, Twilio, Allo and OnOff telephony, Mistral, OpenAI, Gemini and DeepSeek.

**What it actually does** [Verified in code]:
- SDR action queue and Focus mode, softphone, a dialer state machine, call transcription and AI "fiche de RDV".
- Clients and missions workspaces, a planning engine, an Email Hub with sequences.
- Client portal, tickets and in-app support, agency billing (invoices, Factur-X, Qonto, Pappers).
- Public API v1 and MCP, and "Captain AI" assistant and agent workers.
- A white-label brand layer, instance licence (seats, suspension, 4 feature flags) and signed instance API.

**Maturity.** Rich and in daily use for the ecosystem's own operations. As a **product for external customers** it is early:
- The multi-agency chassis exists and was exercised once for real.
- Security, billing and operations have gaps listed below.

**Biggest strengths**
1. Features come from real SDR workflows and users.
2. A strong, sellable isolation model (one database per agency).
3. A working licence, brand and provisioning layer.
4. Real tests where they matter. I ran and saw pass: license 8, export 5, oauth-relay 7, socket-handshake 3, provision-agency 20, migrate-plan 5, telephony 43, dialer 48, api-v1 108.

**Biggest weaknesses**
1. Known critical security issues are still open in the current code.
2. Typecheck is disabled in the build and hides **184** TypeScript errors.
3. CI runs 6 of roughly 70 test scripts.
4. The commercial back office is thin: nothing in this repo bills agencies and the AI quota is unenforced.
5. No signed ownership terms between the owners.

**Commercial readiness.** Ready for **hand-held pilots** with a few agencies. Not ready for self-serve or wide onboarding until Phase 1 and part of Phase 2 are done.

---

## 3. Current-state audit

| Area | Current state | Issues | Priority |
|---|---|---|---|
| **Architecture** | Next.js monolith with domain modules in `lib/`. Workers: `worker/agent.ts`, `workers/enrichment.ts`, `workers/messaging.ts`. Standalone Docker image with `migrate` and `agent-worker` build stages (`Dockerfile`). | Very large components: `components/manager/ClientDetailWorkspace.tsx` (4,753 lines), `components/missions/MissionWorkspace.tsx` (4,531), `components/drawers/UnifiedActionDrawer.tsx` (4,328), `app/sdr/action/page.tsx` (3,802). A decomposition was parked as a patch (commit `fd7db30`). | P2 |
| **Database** | 167 models, about 100 enums, 103 migrations, one DB per agency. | The migration history cannot build an empty database (the first migration alters `User`, which no migration creates). `prisma/migrate-instance.ts` works around it with `db push` plus baselining. About 40 loose SQL files (`prisma/manual*`, root `*.sql`) signal drift. `supabase-full-schema.sql` is empty. | P1 |
| **Authentication** | NextAuth credentials, bcrypt, per-device `UserSession` with revoke, auth-event log, hashed reset tokens. | Still present, re-checked on 16 Nov: master-password bypass for any account (`lib/auth.ts:111-126`); `x-api-key` header bypasses middleware (`middleware.ts:12-14`); 6-character minimum password (`app/api/auth/reset-password/route.ts:10`); `Math.random` password generation (`app/api/users/route.ts:141`); in-memory LRU rate limiter (`lib/rate-limit.ts`); no MFA. Source: `SECURITY-AUDIT-login-and-apis.md`, 20 findings. | **P0** |
| **Authorization** | Roles: SDR, BOOKER, MANAGER, CLIENT, DEVELOPER, BUSINESS_DEVELOPER, COMMERCIAL. Permission, RolePermission and UserPermission models. Route helpers such as `requirePlanningAccess`. Middleware gates page prefixes by role. | Guards are applied by convention per route. The routes I read were guarded. The 24 Oct audit found no unguarded route among 481. Safe today, fragile as the code grows. | P1 |
| **UX/UI** | 172 pages, design system, runtime white-label brand, video tutorials, in-app changelog ("Nouveautés"). | UI consistency was not audited. Several very large page files. | P2 |
| **Core features** | See §4. Much is real. | `aiMonthlyQuota` exists in `InstanceLicense` but is "reserved", with no enforcement. Advertised limits (contacts, storage, vault hours, AI fiches) are not enforced. | P1 |
| **Integrations** | Allo, OnOff, Twilio, Mistral, OpenAI, Gemini, DeepSeek, Apollo, Apify, Pappers, Qonto, ReachInbox, Gmail and Outlook (OAuth relay), Google Drive, Cal.com and Calendly, Leexi, several notetakers. Keys are stored encrypted (`lib/integrations`). | Webhook authentication is uneven: Gmail, Outlook and ReachInbox webhooks fail open per the 24 Oct audit. | P1 |
| **Security (dependencies)** | `next` 16.1.1 (pinned in `package.json` and lockfile), React 19.2.3. | `work/security-audit-vps-2026-10-27.md` lists the Next/React version as an unauthenticated RCE needing next ≥ 16.4.1. `npm audit --omit=dev` reports 76 advisories (4 critical, 25 high), including `next`, `next-auth`, `@sentry/nextjs`, `nodemailer`, `zod`. I did not independently verify the advisory text. | **P0** |
| **Security (browser)** | Real security headers. | CSP allows `unsafe-inline` and `unsafe-eval` (`next.config.ts:74`). | P2 |
| **Observability** | Sentry config files exist. `AuditEvent`, `AiUsage` ledger and agent run logs. | `instrumentation.ts` registers only integration keys and carries a comment that Sentry is disabled. **[Hypothesis]**: server errors are not reported. | P1 |
| **Performance** | `PERFORMANCE_AUDIT.md`, `performance-indexes.sql`, API v1 indexes. Root layout is dynamic per request (deliberate, for runtime branding). | Not benchmarked by me. | P2 |
| **Deployment** | Image built per release (`.github/workflows/image.yml`), run per agency on Dokploy and Coolify on one Contabo VPS. Migrate image runs before traffic. | The recap says GitHub Actions was "locked by billing" and images are built on the server (about 25 min). Restore drill, suspend, export and scoped MinIO keys were "never run for real". The VPS audit lists public admin panels, Adminer, MinIO, SSH password login, and `docker.sock` mounted in the Console container. | **P0** |
| **Testing** | 143 test files, `node:test`, PGlite for SQL tests. | CI covers 6 suites. `tsc --noEmit` reports 184 errors (largest: `app/api/ai/pitch/organize/route.ts` 15, `app/api/sdr/callbacks/route.ts` 13, `lib/prospects/pipeline-service.ts` 9, `lib/email/providers/gmail.ts` 8). `npm run test:agent` has 2 failures (scheduler "first pass initialises nextRunAt…" and "queue stats"). | P0/P1 |

---

## 4. Product analysis

### A. Product
- **Problem solved.** Outbound teams and prospecting agencies stack a CRM, a phone system, call analysis, an emailing tool and glue. Suzalink positions an execution-first, all-in-one tool (`OFFRES_ET_DIFFERENCIATION_MARCHE.md`). The competitor prices quoted there are the team's own estimates and I did not verify them.
- **Actual users.** SDRs and bookers, managers, agency clients on a portal, commercials (closers) who receive RDV, and platform support.
- **Primary workflows.** Open the call queue → call → one-click outcome → AI call summary and "fiche de RDV" → RDV booked → client portal and reporting. Around it: missions, lists, planning, email sequences, billing, tickets.
- **Core value proposition.** One tool for calling, recording, AI hand-off and reporting, on a dedicated instance.
- **Essential.** Call queue, outcome capture, call recording and transcription, RDV hand-off, mission and list management, client portal, manager dashboards, planning, import and exclusions.
- **Candidates for pruning or freezing.** Features with weak product-fit evidence: the large assistant and agent surface (Captain AI), the prospect-routing sandbox, HR module (`lib/hr`), project and task management overlap. **[Hypothesis]**: usage data is needed before deciding. `AiUsage` and the audit log can supply it.
- **Missing for a reliable external customer experience.** Self-service onboarding, enforced limits, a support loop across agencies, documented SLAs and data-processing terms.

### B. Technology
- The architecture suits the business. The per-instance model is a deliberate differentiator.
- Debt accumulates in: oversized components, migration history, hidden type errors, manual SQL, convention-only authorization, and a root directory full of scratch files, logs and prototypes.
- Leave alone: the licence, brand and instance-API layer, the dialer and telephony modules (well tested), API v1.
- Main security and scalability risks: §3 and §6.

### C. Commercialisation
- **Needed before onboarding more external customers:** the P0 items in §7, a restore drill, enforced limits, an onboarding checklist, and signed terms between the owners.
- **Organisations, subscriptions and permissions.** Organisation = one instance. Subscription state is pushed by the Console to the instance licence (status, plan, seat limit, features). Roles are inside the instance. This fits and should be kept.
- **Billing and support.** The repo's invoicing is agency-to-its-own-clients. **I found no Suzalink-to-agency subscription billing in this repo.** It may exist in the Console, which I have not read. Support: the CRM side of the cross-agency support API exists (`/api/instance/support/*`). The Console side was "not built yet" on 5 Nov (`docs/CONSOLE_SUPPORT.md`).
- **Possible differentiators** (positioning, not proven): dedicated instance and data sovereignty, built-in telephony with Call Vault, AI hand-off sheets, and a portal for the agency's own clients.
- **Pricing.** Public list on the site: Indépendant €59 to €69, Small Business €189 to €229, Medium Business €419 to €499 per month, with setup fees of €150, €350 and €750. I do not invent market data. The one real data point is the €150 first client.

### D. Ecosystem integration
- **Suzali Conseil and Captain Prospect** are internal users of the same instance model. Captain Prospect was planned to become "agency #1".
- **Share infrastructure** (image, Console, integrations, Call Vault), **but not data or code paths.** Keep per-customer scripts and imports out of the product repo.
- **Avoid coupling:** the CRM must not depend on Suzali Conseil or Captain Prospect specifics, and the SDR service business must not drive core features without a second customer asking.
- Separate the categories explicitly:
  - **Core product:** queue, telephony, missions, portal, planning, licence.
  - **Customer configuration:** brand, statuses, scripts, result categories.
  - **Custom development:** one-off client scripts, which belong outside the product repo.
  - **Internal ecosystem tools:** staff-only tooling (Captain AI workflows, internal reports).
  - **Experimental:** agent playbooks, prospect sandbox, HR.

---

## 5. Product gaps

**Critical missing**
- Subscription billing from Suzalink to agencies (not seen in this repo).
- Enforcement of plan limits (contacts, AI fiches, vault hours, storage).
- A tested backup and restore.
- MFA and the open security items in §3.
- Signed ownership and revenue terms between the owners.

**Important**
- Agency first-run onboarding checklist.
- Console support inbox across agencies.
- Per-agency usage and health view (seats in use, last login, AI cost).
- Confirmed server-side error monitoring.

**Nice to have**
- Splitting the largest workspaces.
- Strict CSP.
- More white-label depth.
- Extending Captain AI features once usage data exists.

**Should not be built now**
- `tenantId` multi-tenancy. It discards the isolation model.
- A framework change or rewrite.
- More AI providers or integrations without a paying customer asking.
- Customer-specific features inside core.

---

## 6. Technical recommendations

1. **Keep the architecture.** Next.js monolith, one database per agency, one image.
2. **Fix the migration story before agency #3.** Squash or baseline so an empty database builds from migrations. Turn `prisma/manual*` SQL into real migrations. Add a CI job: build an empty DB, and upgrade a snapshot of an older one.
3. **Make authorization structural.** Wrap API routes in one role-checking wrapper and add a test that fails if a route lacks it.
4. **Treat hosting as a product risk.** One VPS runs the CRM, the Console and many unrelated apps. Separate agency hosting before the fleet grows, and remove `docker.sock` from the Console container.
5. **Keep AI cost visible and enforced.** `AiUsage` and a provider price catalogue exist. Add enforcement and a per-agency report. I could not measure real spend from the repo.
6. **No new dependencies.** Upgrade the ones in place.

---

## 7. Product roadmap

**Phase 1: Stabilise and secure.** Before any additional agency.
Upgrade Next and React; remove the master password and the `x-api-key` bypass; fix the password policy; use a shared rate limiter; re-enable typechecking; run CI on all suites; confirm Sentry; do one restore drill; close server exposures.

**Phase 2: Agency-ready.** Enforce plan limits; finish the Console support screen; agency first-run checklist; operator runbook; align the public pricing page with what is enforced; sign terms between the owners.

**Phase 3: Commercial growth.** Subscription billing to agencies; usage and health per agency; cutover playbook; customer feedback loop; retention signals (seat activity, login frequency).

**Phase 4: Scale, only when justified.** Fleet automation beyond one server; split large workspaces; measure Captain AI, fiche and agent features against real usage and AI cost before extending; shared integration module only if a second product appears.

---

## 8. Prioritised backlog

Priorities P0 to P3. Sizes XS, S, M, L, XL. Every item needs an owner, to be assigned by the Product Owner.

| # | Task | Business justification | Technical justification | P / size | Depends on | Acceptance criteria | Files |
|---|---|---|---|---|---|---|---|
| 1 | Upgrade `next` and `react` to patched versions | A paying client's data is on the production instance. | VPS audit rates the current version as unauthenticated RCE. `npm audit` flags `next` critical. | P0 / S | none | Build passes. `npm audit --omit=dev` shows no critical for `next`. Smoke test of login, SDR queue, manager dashboard and client portal. | `package.json`, `package-lock.json` |
| 2 | Remove the master-password fallback | One leaked string signs in as any user, including managers and clients. | Bypass sits in the login path. | P0 / S | none | No password bypass in `lib/auth.ts`. Master-password API route and UI removed. If break-glass is kept, it is per user, time-boxed, audited and alerted. | `lib/auth.ts`, `app/api/system-config/master-password/` |
| 3 | Remove the `x-api-key` bypass in middleware | Any request with any header value skips the session gate. | Safety of 600+ routes depends on each route's own check. | P0 / S | none | Middleware no longer passes on a non-empty `x-api-key`. API v1 and MCP still accept valid keys. Regression test. | `middleware.ts`, `lib/api-v1/auth.ts` |
| 4 | Password policy and secure generation | Weak passwords on accounts holding client data. | 6-character minimum, `Math.random`, bcrypt cost 10, reset does not revoke sessions. | P0 / S | none | 12-character minimum or stricter rule, `crypto.randomBytes`, reset revokes all sessions. | `lib/auth.ts`, `app/api/users/route.ts`, `app/api/auth/reset-password/route.ts` |
| 5 | Shared rate limiter | Brute force protection resets on every deploy and multiplies per replica. | In-memory LRU, spoofable IP. Redis is already a dependency. | P0 / M | none | Limits survive restarts, cover login, forgot and reset, and use a trusted client IP. | `lib/rate-limit.ts`, `lib/geo-ip.ts` |
| 6 | Close server exposures | Public admin panels hold every agency's infrastructure. | Items 2 to 8 of the VPS audit. | P0 / M | server access | Public ports closed and verified from outside. Adminer removed or bound locally. SSH keys only. `docker.sock` removed from the Console container. | infrastructure (not in this repo) |
| 7 | Re-enable typechecking | 184 hidden errors may be real bugs. | `ignoreBuildErrors: true`. | P1 / M | none | `tsc --noEmit` is green. `ignoreBuildErrors` removed. CI blocks on it. | `next.config.ts`, files listed in §3 |
| 8 | Broaden CI and fix the 2 agent test failures | A broken release reaches every agency. | CI runs 6 suites out of about 70. | P1 / S | #7 | CI runs all `test:*` scripts. The two failing agent tests are fixed or explained. | `.github/workflows/image.yml`, `lib/agent/` |
| 9 | Confirm error monitoring | You need to know before a customer tells you. | Sentry looks disabled. | P1 / XS | none | A test error from server and client appears in Sentry, per instance. | `instrumentation.ts`, `sentry.*.config.ts` |
| 10 | Backup and restore drill | One bad upgrade without a tested restore loses a customer. | Restore was never run for real. | P1 / M | Console access | Restore of one agency DB and bucket into a fresh instance, documented and timed. | Console repo, `docs/PROVISION_AGENCY.md` |
| 11 | Console repo: private, backed up, key secured | The Console holds every agency's sealed secrets. | Encryption key location was a single server file. | P1 / XS | none | Repo private. `CONSOLE_ENCRYPTION_KEY` in a team vault. Access list reviewed. | Console repo |
| 12 | MFA for managers and developers | These roles reach billing, vault and user admin. | No second factor anywhere. | P1 / M | #4 | TOTP with recovery path for MANAGER and DEVELOPER. | `lib/auth.ts`, login UI |
| 13 | Webhook authentication fails closed | Forged webhooks could inject email events. | Gmail, Outlook, ReachInbox accept unsigned calls. | P1 / S | none | Missing or invalid secret returns 401. Tests added. | `app/api/email/webhooks/*` |
| 14 | Decide and enforce plan limits | You cannot sell limits you do not enforce. | `aiMonthlyQuota` unused. | P1 / L | pricing decision | Chosen limits enforced with a clear manager message. Usage visible per instance in the Console. | `lib/license/*`, `lib/ai/usage.ts`, `AiUsage` |
| 15 | Sign terms between the owners | Billing and code decisions encode who gets paid. | n/a | P1 / S (non-code) | legal advice | Written agreement on ownership of code, revenue share, and Suzali Conseil's contribution. | n/a |
| 16 | Agency billing and subscriptions | The first client pays €150. Every further one needs invoicing and suspension on non-payment. | Not found in this repo. May belong in the Console. | P1 / L | #14, #15 | Plan, seats and extras produce a recurring invoice. Non-payment suspends the instance through the licence API. | Console repo, `lib/license/*` |
| 17 | Fix the migration story | A bad upgrade is expensive at N instances. | History cannot build an empty DB. About 40 manual SQL files. | P1 / M | none | Empty DB builds from migrations. CI upgrades an old snapshot. Manual SQL folded in. | `prisma/migrations`, `prisma/manual*` |
| 18 | Structural authorization wrapper | New routes must not ship unguarded. | Guards are per-route convention. | P2 / M | none | Every route uses the wrapper. A test fails on a route without one. | `lib/api-utils.ts`, `app/api/**` |
| 19 | Agency first-run checklist | Onboarding is currently hand-held. | n/a | P2 / M | #14 | A new manager sees a checklist for brand, users, telephony and first mission. | `lib/onboarding/*` |
| 20 | Console support inbox | One team must handle tickets of every agency. | CRM API exists. Console screen did not on 5 Nov. | P2 / M | Console repo | Tickets of all agencies in one view with replies reaching the agency. | `docs/CONSOLE_SUPPORT.md`, Console repo |
| 21 | Per-agency usage and health view | Retention and cost control. | `AiUsage` and `AuthEvent` exist. | P2 / M | #14 | Seats in use, last login, AI cost per month, per agency. | `AiUsage`, `AuthEvent`, Console repo |
| 22 | Tighten CSP | Limits XSS impact. | `unsafe-inline` and `unsafe-eval`. | P2 / M | #1 | Nonce-based policy with the app working. | `next.config.ts` |
| 23 | Reduce root clutter | Logs, dumps and prototypes hide real code. | Many scratch files at repo root. | P3 / S | none | Root holds only config and README. Docs under `docs/`. | repo root |
| 24 | Split the largest workspaces | Maintainability. | Four files over 3,800 lines. | P3 / XL | #7 | No page file over about 1,500 lines, behaviour unchanged. | the four files in §3 |

---

## 9. First 30 / 60 / 90 days

**Assumptions (to be corrected by the Product Owner):**
- One main developer (the Product Owner) with part-time help and AI-assisted coding.
- A handful of agencies, no dedicated ops person, one VPS.
- Daily operations of Suzali Conseil and Captain Prospect continue in parallel.

### Days 1 to 30: make it safe
- **Deliverables:** backlog #1 to #6, #9, #11.
- **Outcome:** no known critical vulnerability in the production code or on the server. Console secured.
- **Dependencies:** server access; a short regression pass on production.
- **Risks:** the Next/React upgrade may break pages. Server hardening may break the Dokploy and Coolify setup.
- **Success indicators:** `npm audit` shows no critical for `next`. Master password and header bypass removed. Ports verified closed from outside.

### Days 31 to 60: make it reliable
- **Deliverables:** #7, #8, #10, #12, #13, #15.
- **Outcome:** green typecheck and CI. One restore actually performed. MFA live. Signed terms.
- **Dependencies:** time for the type errors; legal advice for #15.
- **Risks:** the 184 type errors may expose real bugs and be open-ended, so give them a fixed budget.
- **Success indicators:** CI blocks on type errors and tests. A documented restore time. Signed agreement.

### Days 61 to 90: make it repeatable
- **Deliverables:** #14, #16, #17, #19, then #20 and #21 if time allows.
- **Outcome:** a new agency can be onboarded, limited and invoiced consistently with the public pricing.
- **Dependencies:** the pricing and limits decision; #15.
- **Risks:** pricing is "proposed, to validate" in `suzalink-site/content/offers.ts`, so limits cannot be finalised until someone decides.
- **Success indicators:** the second external agency is onboarded with no code changes and is invoiced automatically. Plan limits match the public site.

---

## 10. Open questions

1. Is the €150 first-client payment monthly or one-off, and which pack does it correspond to?
2. What is the status of the PingLead cutover?
3. What exactly is the intended split between the owners, and how is Suzali Conseil's contribution treated?
4. Which limits will be enforced for each pack, and who decides?
5. Who is the legal data controller or processor for each instance, and is there a data-processing agreement template?
6. Is the Console a separate private repository? Auditing it is the next useful step.

---

## 11. Working rules for the roadmap

1. Inspect before changing. Distinguish verified facts from hypotheses.
2. No implementation until this document is reviewed and approved.
3. Preserve working functionality. Each fix is its own commit with its own test.
4. Prefer configuration over custom code. Customer-specific work lives outside the product repo.
5. No new dependencies unless a backlog item requires one.
