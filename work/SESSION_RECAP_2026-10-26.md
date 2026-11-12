# Session recap — 25–26 Oct 2026: agency platform, Console, PingLead

Handover note so a new account or session can pick up. No secrets in this file. Credentials live only on the server (paths below).

## 1. What we set out to do

Sell the Captain Prospect CRM to other agencies. Every agency runs the same image but gets its own database, file bucket, address (`<agence>.suzalink.com`) and white-label brand. A non-technical **Console** creates and runs agencies. The plan is in `docs/AGENCY_PROVISIONING_PLAN.md`, and the operator guides are `docs/WHITE_LABEL.md` and `docs/PROVISION_AGENCY.md`.

## 2. What is live now

| Address | What | Notes |
|---|---|---|
| https://console.suzalink.com | Console (team only) | Login is email + password, with no 2FA, as Odo asked. |
| https://app.suzalink.com | CRM **v02** test build (branch feat/assistant-brain) | Auto-deploys on every push to feat/assistant-brain. It replaced the old Coolify "Suzalink CRM" at this address; deleting `/data/coolify/proxy/dynamic/v02-app-suzalink.yml` gives the address back. |
| https://demo.suzalink.com | Demo agency | manager demo-manager@example.com, 3 seats |
| https://pinglead.suzalink.com | **PingLead** agency | created from the Console wizard, 12 seats, holds the imported PingLead data |
| suzalink.com / www | Suzalink website | untouched |

DNS is at Hostinger: an A record for `console`, plus the wildcard `*` → 173.212.225.37.

## 3. What happened, in order

### CRM repo (captainprospect-crm, branch feat/assistant-brain)
1. **Phase 0, agency-ready CRM** (68bf43c):
   - Instance licence: seats, suspension (read-only) and feature gates.
   - Signed instance API `/api/instance/{health,license,export,cron}`.
   - Streaming ZIP export, central cron, OAuth relay for Gmail/Outlook, socket handshake token.
2. **Phase 1, image + provisioning script** (b6973eb): `.github/workflows/image.yml`, `npm run provision-agency` (scripts/provision-agency/) and the runbook docs/PROVISION_AGENCY.md.
3. Assistant work in progress, committed as is (443ea1a), because Odo said "push all".
4. **Fixes from the first real run:**
   - per-agency route in Coolify's proxy (1a39752);
   - empty agency databases are built with `prisma/migrate-instance.ts`, which runs db push then records the baseline. The old migration history could not build an empty database (005c979);
   - plain-HTTP Dokploy domains, health check ordering, and a server-side image build path (4d584e3).
5. 7a8fdba adds the agencies Postgres and MinIO bootstrap script. It is **committed but NOT pushed** (local branch is 1 ahead). Pushing redeploys v02 and blocks the Dokploy queue for a few minutes.

### Console (`console/`, its own git repo, **no remote yet**, ignored by the CRM repo)
- **Stack:** Node 24, Hono, postgres.js and Zod. It vendors a copy of scripts/provision-agency, and a test fails if the two copies drift.
- **Deployment:** runs in Dokploy as the app `console-agences`, with its own `console-pg` database. Redeploy with `console/deploy/bootstrap-dokploy.mjs`.
- **Proven for real:**
  - created PingLead from the wizard;
  - upgraded the demo end to end: backup → migrate → deploy → health, in 4 min 15 s;
  - deleted a test agency;
  - adopted the demo, which the CLI had created (`npm run agency:adopt`).
- **UI/UX pass:** phone layouts, readable errors and journal, 404 page. 2FA was removed (6b7c549). The Console got its own identity from Odo's logo mark (690fc50): ink sidebar, solar orange, Space Grotesk + Inter. It must stay distinct from the CRM's navy/rose.
- **Never run for real:** restore/drill, suspend, export, and scoped MinIO keys.

### Server (173.212.225.37, running Coolify AND Dokploy)
- **Proxy:** Coolify's Traefik owns ports 80/443, and Dokploy's Traefik sits on :8090. Each agency host therefore needs a route file in `/data/coolify/proxy/dynamic/`.
- **Agency infrastructure:** Dokploy project `agencies`, with a private Postgres 17 and MinIO (`pgsty/minio`).
- **Image builds:** GitHub Actions is locked by billing, so images are built on the server into a local registry (`127.0.0.1:5000`), about 25 min per build (runbook §8b).
- **Files under `/root/provision/` (mode 600):**
  - `infra.env`: agencies Postgres/MinIO admin.
  - `console.env`: contains **CONSOLE_ENCRYPTION_KEY**. Copy it to a team vault; without it, every agency's sealed secrets are lost.
  - `state/`
  - `backup/`
  - `pinglead-import.sh`
  - `.src-…url`: the PingLead Neon URL, kept for the final re-sync.

### PingLead migration (26 Oct, 12:22 Paris)
- **Source:** the real PingLead CRM, in a separate repo, live at crm.ping-leadagency.fr, with its database on Neon.
- **Backups first:** a full pg_dump of the source and of the empty target, both in `/root/provision/backup/`.
- **Copy:** shared tables and columns only, because the two schemas drifted. 9,863 of 9,897 rows were copied.
- **Counts identical** between old and new:
  - 3,948 companies, 1,977 contacts, 2,617 actions
  - 3 missions, 3 clients, 76 opportunities, 71 planning rows
  - 11 users: 2 managers, 6 SDRs, 3 clients
- **Checks:** 0 orphans. Users keep their old passwords.
- **Not carried over** (still in the backup):
  - assistant conversations, support tickets, client daily reports, pending invitations;
  - telephony settings (Ringover/OnOff).
- **It's a snapshot.** The old CRM keeps writing to Neon. On cutover day, re-run `pinglead-import.sh` (backup → stage → dryrun → run → cleanup), then switch DNS. Anything typed into the new site before then is overwritten.

### Communication prepared
- **Manager recap page + PingLead message and e-mail** (French): `work/pinglead-point-agences.html`. It is also published as a private artifact on the old account: https://claude.ai/artifact/2dnkGh41JsgkTbBwFSfcsw. The new account may not be able to open it, so use the local file.
- **WhatsApp voice-note script and Chahinez's brief:** Chahinez (account follow-up) contacts Valentin, PingLead's owner, for a 20-min onboarding call. On the call:
  - share the link and check his data;
  - show logo and colours in Paramètres → Identité;
  - tell him to stay on the old CRM until cutover;
  - ask whether he wants his own domain.
- **Own domain for PingLead:** they add a CNAME `crm` → `pinglead.suzalink.com`. We then add the route, the certificate and NEXTAUTH_URL on cutover day.

## 4. Open items (by priority)
1. **Rotate** the server root password and the Dokploy API key. Both were pasted in chat.
2. **Copy CONSOLE_ENCRYPTION_KEY** from `/root/provision/console.env` to a vault.
3. **Off-server backups.** Everything, backups included, is on one machine.
4. **Integrations for agencies:** SMTP, Mistral and Allo keys aren't set, so no "mot de passe oublié" e-mails yet.
5. **PingLead cutover:** pick a date → final re-sync → optional own domain → stop the old CRM.
6. **Isolation gaps:** MinIO key shared across agencies, and the socket server doesn't verify the handshake token yet. That fix belongs outside this repo.
7. **Push** CRM commit 7a8fdba, and give `console/` a git remote.
8. **Migration not applied in the main Supabase CRM:** `20261026100000_add_instance_license`. Agency databases get it through migrate-instance.
9. **Decide on image builds:** stay on the server (free, about 25 min per build) or fund GitHub Actions.

## 5. Rules learned (keep following them)
- Never `git stash`. Odo edits the same working tree.
- A Dokploy domain behind Coolify's proxy must be `https:false`, or you get a 308 loop.
- Dokploy deploys run one at a time, and a push to feat/assistant-brain occupies the queue.
- Dokploy's cleanup can delete local images such as `provision-runner`; rebuild it when it disappears.
- A certificate that failed before DNS existed isn't retried on a cosmetic edit. Rename the routers to force a new order.
- A provisioning fix goes in BOTH `scripts/provision-agency/` and `console/src/provision/`.
- Never put credentials in the repo or in memory.
