# Support rollout: every CRM's tickets in console.suzalink.com

Brief for a Claude Code session **running on the server** (root@173.212.225.37). Written 2026-11-06.
Work autonomously; stop and ask only before something destructive (deleting data, dropping a
database, removing an app) or if a step below turns out to be wrong.

## Goal

Every CRM we run answers the Console's support API, and its Support Technique tickets show up in
`https://console.suzalink.com/support`:

1. **Agence Démo** and **pinglead** (Dokploy, already in the Console fleet).
2. **app.suzalink.com** and every agency under it (check the Dokploy project `agencies` and the
   Console fleet; anything we run that is a CRM).
3. **app.captainprospect.fr**, hosted on **Coolify** (not Dokploy). It is currently not working:
   find out why first (Coolify logs), fix it if the cause is clear and safe, report otherwise.

## What exists

- CRM repo `odoklein/captainprospect-crm` (public), branch `feat/assistant-brain`, commit
  `82b748f` or later: signed `/api/instance/support/*` API (`lib/instance/support*.ts`,
  `docs/CONSOLE_SUPPORT.md`, `docs/WHITE_LABEL.md` §15).
- Console repo `odoklein/console` (private), branch `feat/support-inbox`: the Support inbox.
  Already deployed on console.suzalink.com (Dokploy app `console-agences`).
- GitHub Actions cannot build images (billing lock: every run stops before starting). Build on
  this server instead: `docs/PROVISION_AGENCY.md` §8b of the CRM repo (local registry
  `127.0.0.1:5000`, capped buildx builder `capped`, about 25-30 minutes per build).
- Server files: `/root/provision/infra.env` (Dokploy API key, Postgres admin URL, MinIO),
  `/root/provision/console.env` (Console env, `PROVISION_IMAGE_REPO`). Dokploy API at
  `http://127.0.0.1:3000/api` with header `x-api-key`.

## Steps

1. **Image.** Clone the CRM branch, build and push both targets with the same tag:
   `127.0.0.1:5000/captainprospect-crm-migrate:<sha7>` (`--target migrate`) and
   `127.0.0.1:5000/captainprospect-crm:<sha7>`. Run in the background with `nice`, follow the log.
   Check `PROVISION_IMAGE_REPO` in `/root/provision/console.env` is `127.0.0.1:5000/captainprospect-crm`.
2. **Démo, then pinglead.** Upgrade through the Console, not by hand, so the pre-upgrade backup and
   the automatic rollback apply. The Console has no CLI for upgrades: queue the job the way the web
   app does (`src/jobs/queue.ts` `enqueue`, kind `upgrade`, params `{ tag }`, steps from
   `plannedSteps`), e.g. a small script run inside the `console-agences` container, or a fleet
   rollout (`src/rollouts.ts` `startRollout`, Démo first). Wait for success before the next.
   Then confirm `GET /api/instance/support/tickets` answers (the Console's Support page shows the
   agency without a red dot after a sync; `/support` → Synchroniser).
3. **app.suzalink.com and the rest.** For each CRM not yet in the Console fleet: if it is a Dokploy
   app created by provision-agency, adopt it (`npm run agency:adopt` in the Console). Otherwise it
   needs `INSTANCE_ADMIN_SECRET` (random, 32+ bytes) in its env, the new image, and a way for the
   Console to reach it (see 4).
4. **CRMs not on Dokploy (Coolify: app.captainprospect.fr).** The Console only knows Dokploy agencies
   today (`adoptAgency` requires `dokployAppId`). Add a minimal "external CRM, support only" mode to
   the Console: a CLI `npm run agency:link -- <slug> <name> <https url>` that stores the agency with
   its sealed `instanceAdminSecret` and `extra.external = true`; health and support sync work for it,
   and every Dokploy/Postgres/MinIO operation (upgrade, backup, restore, suspend, export, delete,
   keys) refuses it with a plain message and is hidden on its page. Tests in `test/` like the
   others (`npm test`, `npm run typecheck`), commit to `feat/support-inbox`, rebuild and redeploy the
   Console (README "Deploy"; only swap the image tag and redeploy, never rerun
   `deploy/bootstrap-dokploy.mjs`, which rewrites the app's env). Then on Coolify: set
   `INSTANCE_ADMIN_SECRET`, deploy the commit with the support API, run its migrations, link it.
5. **Check.** console.suzalink.com/support lists every CRM with no red dot; open one ticket per CRM
   and confirm the thread loads. Do not post test replies in real tickets.

## Report

One table: CRM, where it runs, version before → after, support API reachable (yes/no), what is
left and why. Include the Coolify diagnosis for app.captainprospect.fr.
