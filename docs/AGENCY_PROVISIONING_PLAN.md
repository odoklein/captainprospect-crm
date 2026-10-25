# Agency provisioning — plan

Status: **plan only, nothing built.** Builds on the white-label work already on
`feat/assistant-brain` (BrandSettings, signed `/api/instance/*`, instance seed,
Docker `migrate` stage — see `docs/WHITE_LABEL.md`).

Goal: sell the CRM to other agencies. A **non-technical person on our team**
fills a short form ("Nouvelle agence"), and a few minutes later the agency has
its own CRM, with its logo and colours, on its own domain, and its manager
receives an invitation email. The same tool later upgrades, backs up, suspends
and deletes agencies.

---

## 1. The picture

```
                         ┌──────────────────────────────────────┐
  Our team (no code) ──▶ │  CONSOLE  (new app, own repo + DB)   │
                         │  wizard · fleet list · upgrades ·    │
                         │  backups · suspend · billing          │
                         └───────┬───────────┬───────────┬──────┘
                                 │           │           │
                  Dokploy API    │   Postgres admin   MinIO admin      DNS check
           (apps, env, domains,  │   (CREATE DATABASE (bucket + key    (CNAME / A
            deploy, TLS)         │    + role)          per agency)      lookups)
                                 ▼
   ┌──────────────── one server (Contabo, Dokploy + Traefik) ────────────────┐
   │  crm-captainprospect   crm-agence-nord   crm-agence-sud   …              │
   │  (same Docker image ghcr.io/odoklein/captainprospect-crm:<sha>)          │
   │        │                    │                  │                         │
   │  ┌─────▼────────────────────▼──────────────────▼──────┐   MinIO buckets  │
   │  │ Postgres cluster: db_captainprospect, db_agence_nord, …│  one per agency │
   │  └────────────────────────────────────────────────────┘                   │
   └──────────────────────────────────────────────────────────────────────────┘
        Shared, multi-tenant services: Lead Hub (key per agency), Mistral/OpenAI
        (platform keys, usage metered per agency), OAuth relay (Gmail/Outlook).
```

Principles:
- **One image for everyone.** CI builds it once per commit; every agency runs
  the same tag. No per-agency code, no per-agency build.
- **One database + one container + one bucket per agency.** No `tenantId`: an
  agency's data can never leak into another one's queries.
- **The Console never touches a CRM database directly** after creation. It
  talks to the CRM through the signed `/api/instance/*` API.
- **Captain Prospect itself becomes "agency #1"** of the same system once it
  has run on a test agency for a while (we eat our own cooking).

---

## 2. What the non-technical operator sees

### "Nouvelle agence" wizard (5 steps)

1. **Agence:** agency name, legal name, contact person and email of the first
   manager, language and time zone.
2. **Marque:** logo upload (light and dark versions), two colours (pickers with a
   live preview of the sidebar and login page), font (3 choices). Contrast
   warnings, as in the Identité panel.
3. **Adresse web:** two options:
   - **Immédiat:** `agence-nord.<platform-domain>`. Works at once (wildcard DNS).
   - **Domaine de l'agence:** `crm.agence-nord.fr`. The console shows one line
     to copy: *"Ajoutez un enregistrement CNAME `crm` → `edge.<platform-domain>`"*,
     with a **Vérifier** button. Until it resolves, the agency runs on the
     immediate address; the switch happens by itself when DNS is ready.
4. **Offre:** pack (seats included, options: call vault, AI quota, white-label),
   billing contact.
5. **Lancer:** a live checklist. Each line turns green, and any failure says in
   plain French what to do (retry button):
   - Base de données créée
   - Stockage créé
   - Application déployée
   - Schéma installé (migrations)
   - Données de référence installées
   - Marque appliquée
   - Adresse web active (certificat HTTPS)
   - Invitation envoyée au manager

### Fleet page
A table of agencies: name, domain, version, health (green/red), seats
used/included, storage used, last backup. Row actions: open, upgrade, back up
now, change domain, suspend/resume, export data, delete (two confirmations,
data export first).

---

## 3. What has to exist (by component)

### A. In the CRM repo ("Phase 0: make the CRM ready")

Gaps found while preparing this plan:

| Gap | Why it blocks | Fix |
|---|---|---|
| Prod builds with nixpacks from git | Not "one image": each deploy rebuilds | CI builds the Dockerfile → GHCR, tagged by commit; Dokploy apps pull the image |
| Gmail/Outlook OAuth callback = `${NEXTAUTH_URL}/api/email/oauth/*` | Every agency domain must be registered in our Google/Microsoft apps (Google also asks to verify each domain) | **OAuth relay**: one fixed callback `auth.<platform-domain>`, which forwards the code to the right instance (signed `state`) |
| Socket server broadcasts `online-users` to everyone | A shared comms server would show one agency's users to another | A namespace/room per instance (instance id in the handshake), or one socket container per agency |
| No seat or feature limits | Packs (8 seats, call vault hours, AI quota) can't be enforced | `InstanceLicense` pushed by the Console through `PUT /api/instance/license`; seat check on user creation; features hidden when off |
| No suspended mode | Unpaid agency can't be paused cleanly | License `status: suspended` → read-only banner, login allowed for export only |
| Cron jobs are per-deployment config (email sequences, reminders, exclusions, outbox, billing) | Non-tech operator would have to set 5 schedules per agency | Console runs one central scheduler that calls each instance's `/api/cron/*` with its `CRON_SECRET` |
| Workers (`worker:enrichment`, `worker:messaging`) are not started by nixpacks today | Same gap for every agency | Decide: run them as a second container per agency, or move their work to the cron routes |
| Supabase report storage (`lib/storage/supabase-report-storage.ts`) | Agencies won't have Supabase | Looks unused; confirm, then delete or move to MinIO |
| Transactional email sender | Each agency needs SMTP that delivers | Default: shared sending domain with the agency's name as display name; optional own domain with SPF/DKIM records shown in the Console |
| Data export | Needed for deletion and GDPR | `POST /api/instance/export` → zipped CSV/JSON in the agency's bucket |

#### Phase 0 status (built 2026-10-26, details in `docs/WHITE_LABEL.md` §10–14)

| Gap | State |
|---|---|
| OAuth relay | **Instance side done** (signed state, `OAUTH_RELAY_URL`, reference `resolveRelayCallback`). The relay service itself goes in the Console repo. |
| Socket isolation | **CRM side done** (signed handshake token). **The socket server is not in this repo and must still be changed** (rooms per instance, token check); until then one socket container per agency. |
| Seats, features, suspended mode | **Done** (`InstanceLicense`, `PUT /api/instance/license`). Migration `20261026100000_add_instance_license` **not applied anywhere yet**. |
| Central cron | **Done**: `GET/POST /api/instance/cron`. The scheduler itself is a Console job. |
| Workers | **Decided: neither runs.** Messaging worker = the `messaging-outbox` cron job; the enrichment file queue has no producer. |
| Supabase report storage | **Confirmed unused, file deleted** (working tree only, not committed). |
| Data export | **Done**: `POST /api/instance/export`. MinIO files (attachments, recordings) are not in the archive. |
| Transactional email | Already uses the brand sender name; the agency's own SMTP/domain is Console work (SPF/DKIM). Nothing to change here. |
| Image on GHCR, `prisma` CLI in the runtime image | Phase 1. |

#### Phase 1 status (written 2026-10-26, runbook `docs/PROVISION_AGENCY.md`)

CI workflow `.github/workflows/image.yml` (tests, then runtime + migrate images to GHCR) and `npm run provision-agency` (12 resumable steps, upgrade by new tag, custom-domain switch) are written and tested against fakes. **Neither has run for real yet**: the workflow has never executed and the script has never met a real Dokploy, Postgres or MinIO. Phase 1 is done when the test agency passes the runbook's section 6.

### B. Image pipeline
- GitHub Actions: on push to `main` → `docker build --build-arg GIT_SHA` →
  push `ghcr.io/odoklein/captainprospect-crm:<sha>` and `:main`. The same image
  also contains the `migrate` stage target (`…-migrate:<sha>`).
- Releases: we tag `v2026.11.1`; the Console upgrades agencies to a release
  tag, never to `:main`.

### C. The Console (new repo, like `lead-hub/`)
- Small Next.js app, own Postgres (agencies, domains, secrets, jobs, audit),
  login for our team with 2FA.
- **Orchestrator:** each wizard run is a job made of idempotent steps (safe to
  retry), stored in the Console DB, with logs. Steps:
  1. `CREATE ROLE agence_nord …; CREATE DATABASE db_agence_nord OWNER agence_nord;`
  2. MinIO: bucket `agence-nord` + access key limited to that bucket.
  3. Generate secrets (`NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, `INSTANCE_ADMIN_SECRET`,
     `CRON_SECRET`), store them encrypted.
  4. Dokploy: create application from the image, set env, add the domain with
     Let's Encrypt.
  5. Run the migrate image once against the new DB (`prisma migrate deploy`).
  6. Run `db:seed:instance`.
  7. Deploy and wait for `/api/instance/health` → `dbOk: true`.
  8. `PUT /api/instance/brand` + logo uploads.
  9. `PUT /api/instance/license`.
  10. `POST /api/instance/bootstrap` → invite link → email to the manager.
- **Domain switch job:** DNS lookup until the CNAME points to us → add the
  domain in Dokploy → wait for the certificate → update `NEXTAUTH_URL`/`APP_URL`
  → redeploy → keep the old address as a redirect.
- **Upgrade job:** back up DB → run migrate image at the new tag → redeploy app →
  health check → automatic rollback of the app tag if health fails (the
  migration itself must stay backward compatible, as the BrandSettings one is).
- **Backups:** nightly `pg_dump` per agency → MinIO (platform bucket), 30-day
  retention, restore drill once a month.
- **Monitoring:** health polling every minute, alert (email/Slack) after 3 failures.
- **Billing (later):** Stripe subscription per agency, webhook → license status.

### D. Infrastructure
- One dedicated Postgres 17 cluster for agency databases (not the current
  Supabase; that one stays Captain Prospect's until migration).
- Wildcard DNS `*.<platform-domain>` and `edge.<platform-domain>` → the server.
- Capacity: one Next instance needs about 300–500 MB RAM. The current 24 GB
  server holds roughly 15–25 agencies next to our own services. Dokploy can
  add remote servers; the Console stores which server hosts each agency.

---

## 4. Phases

| Phase | What | Who can then do what |
|---|---|---|
| **0. CRM ready** | Section 3A gaps in this repo: OAuth relay, socket isolation, license and seats, suspended mode, central cron, export, workers decision | CRM can safely run for several agencies |
| **1. Image + manual replica** | CI image on GHCR; a written **runbook + script** (`scripts/provision-agency`) that a technical person runs to create one test agency end to end on Dokploy | We prove the whole chain on a real test agency (`demo.<platform-domain>`) |
| **2. Console MVP** | Wizard, orchestrator steps 1–10, fleet list, health, domain switch | A non-technical teammate creates an agency alone |
| **3. Operations** | Upgrades with rollback, backups and restore, suspend/delete/export, alerts | Fleet runs without us watching it |
| **4. Commercial** | Stripe billing, usage metering (AI calls, call-vault hours, storage), seat overage | Sold and billed automatically |
| **5. Captain Prospect joins** | Move our own CRM onto the image + Console (from Supabase to the cluster or keep Supabase as its DB) | One system for everyone |

Each phase ends with a demo on a test agency before the next one starts.

---

## 5. Decisions needed before building

1. **Platform domain** for the immediate addresses: a neutral domain (e.g.
   `crm-agence.fr`) so agencies' clients never see "Captain Prospect", or
   `*.captainprospect.fr`? *Recommended: neutral domain (it is white-label).*
2. **Database topology:** one database per agency on a shared Postgres cluster,
   or one Postgres container per agency? *Recommended: shared cluster
   (lighter, easier backups); a container per agency only for a premium tier.*
3. **Who uses the Console:** our team only, or agencies sign up themselves?
   *Recommended: our team only at first (sales-led), self-serve later.*
4. **Dokploy is the platform** (Coolify is still mentioned in old docs and the
   Dockerfile)? *Recommended: Dokploy, since prod already runs there.*
5. **Sending email for agencies:** shared sending domain by default, own domain
   as an option? *Recommended: yes.*
6. **Mailbox OAuth (Gmail/Outlook):** our shared Google/Microsoft apps behind a
   relay, or each agency brings its own? *Recommended: shared apps + relay
   (non-technical setup); Google verification of our app is a one-time cost.*
7. **Shared services per agency:** call vault (Allo transcripts) is
   single-tenant today: one vault per agency, or make it multi-tenant like the
   Lead Hub? *Recommended: start with "not included" for new agencies, add as
   an option later.*

---

## 6. Risks

- **Schema migrations across the fleet:** a migration that breaks old code
  breaks every agency at once. Rule: additive migrations only, code first,
  cleanup migrations one release later.
- **Server is a single point of failure** for all agencies: backups off-server
  (another region) from Phase 3, a second server before ~15 agencies.
- **Google OAuth verification** of the shared app can take weeks: start early.
- **Support load:** every agency issue lands on us. The Console's health and
  logs pages are what keep this manageable.
