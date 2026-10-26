# Provisioning an agency — runbook (Phase 1)

Create one working agency instance end to end, by hand-run script, on Dokploy.
This is the chain the Console will automate in Phase 2; running it first on a test
agency (`demo.<platform-domain>`) is how we prove each step. Plan and rationale:
`docs/AGENCY_PROVISIONING_PLAN.md`. What the instance does once it runs:
`docs/WHITE_LABEL.md`.

**Status:** written and tested against fakes (`npm run test:provision-agency`: step
order, resume, upgrade, custom-domain switch, signed calls, no secret in logs). **Not yet
run against a real Dokploy, Postgres, MinIO or GHCR**, and the Docker image has not been
built in CI yet. The first real run is the Phase 1 acceptance test (section 6); expect to
fix one or two calls, most likely in `dokploy.ts` (see "If a Dokploy call fails").

---

## 1. The image (CI)

`.github/workflows/image.yml`, on every push to `main` and every tag `v*`:

1. runs the white-label and provisioning tests;
2. builds the **migrate** image (`Dockerfile`, target `migrate`) and the **runtime** image;
3. pushes both to GHCR:

| Image | Tags |
|---|---|
| `ghcr.io/odoklein/captainprospect-crm` | `<sha7>`, `main`, and on a release tag `v2026.11.1` and `latest` |
| `ghcr.io/odoklein/captainprospect-crm-migrate` | the same |

Agencies run a **release tag** (`git tag v2026.11.1 && git push origin v2026.11.1`), never
`:main`. For the test agency the `<sha7>` of the commit you want is fine.

Packages are **private** by default. Create a GitHub token with `read:packages`
(a fine-grained or classic personal access token on a machine account, not a person) and use it
for `PROVISION_REGISTRY_TOKEN` (Dokploy pulls with it) and `docker login ghcr.io` (the migrate
step pulls with it).

Check before the first provisioning: the Actions run is green and both packages show the tag.

## 2. One-time infrastructure

| What | Needed for |
|---|---|
| Wildcard DNS `*.<platform-domain>` and `edge.<platform-domain>` pointing at the Dokploy server | `<slug>.<platform-domain>` works at once; agencies CNAME their own domain to `edge.` |
| A Postgres cluster reachable from the Dokploy containers and from this machine, plus an admin login with `CREATEROLE` and `CREATEDB` | one database and role per agency |
| MinIO, plus (recommended) `mc` installed here with an admin alias | one bucket per agency, and a key limited to it |
| Dokploy API key (Settings, Profile, API/CLI) | creating and deploying the app |
| GHCR token (above) | pulling the images |
| `docker` on this machine, logged in to `ghcr.io` (or `PROVISION_MIGRATE_MODE=local`) | migrations and seed |
| Optional now, needed before real agencies: the OAuth relay (`WHITE_LABEL.md` §13), a socket server that checks the handshake token (§14), the scheduler calling `/api/instance/cron` (§11) | mailboxes, realtime, cron jobs |

On our server the agencies Postgres and MinIO were created with `scripts/provision-agency/server/bootstrap-infra.mjs` (run on the server: Dokploy API on loopback, secrets written to `/root/provision/infra.env`, mode 600), and the Console with `console/deploy/bootstrap-dokploy.mjs` (Console repo).

## 3. Describe the agency and the infrastructure

Copy `scripts/provision-agency/examples/` and edit:

- `agency.json`: slug (3 to 32 chars: lowercase, digits, hyphens; becomes the database, bucket,
  app and sub-domain name), name, first manager, optional own domain, brand (colours, font preset,
  sender, e-mail domains), logos (PNG, SVG or WebP, paths relative to `agency.json`), licence
  (seats, `features`: `callVault`, `aiAssistant`, `whiteLabel`).
- `provision.infra.env` (git-ignored): the table in `infra.example.env`.
- `provision.shared.env` (git-ignored): what every agency shares (SMTP, OAuth apps, relay, socket,
  platform AI keys). The agency's own database, secrets, URL and bucket can never be overridden by it.

Dry run, which creates nothing and shows every name, address and env variable (secrets masked):

```bash
npm run provision-agency -- agency.json --infra provision.infra.env --tag <sha7> --dry-run
```

## 4. Run it

```bash
npm run provision-agency -- agency.json --infra provision.infra.env --tag <sha7>
```

| # | Step | What it does |
|---|---|---|
| 1 | `database` | creates role `agency_<slug>` and database `db_<slug>` on the cluster |
| 2 | `storage` | creates bucket `<slug>`; with `PROVISION_MINIO_MC_ALIAS`, a key limited to it |
| 3 | `migrate` | `prisma/migrate-instance.ts` (from the migrate image or this checkout): on an empty database it builds the schema from `schema.prisma` and records the 86 existing migrations as applied (the history alone cannot build a database); on a managed one it runs `prisma migrate deploy` |
| 4 | `seed` | reference data (permissions, statuses, endpoints, default brand row), no users |
| 5 | `app` | creates the Dokploy application, points it at the image, saves its env, attaches `<slug>.<platform-domain>` with Let's Encrypt |
| 6 | `deploy` | deploys it |
| 7 | `health` | waits (6 min max) for the signed `/api/instance/health` to report `dbOk` and a schema version |
| 8 | `brand` | `PUT /api/instance/brand` |
| 9 | `license` | `PUT /api/instance/license` |
| 10 | `logos` | uploads each logo |
| 11 | `custom-domain` | if `domain` is set: waits for the CNAME, then attaches it, redeploys with the new `NEXTAUTH_URL`, tells the instance |
| 12 | `bootstrap` | creates the first manager and **prints the 24 h invitation link once** |

Send the link to the manager yourself (the Console will e-mail it).

**Resume.** A failed step prints what went wrong and stops. Fix it and run the same command:
finished steps are skipped (state and secrets are in `provision-out/<slug>.json`, mode 0600,
git-ignored; **keep a copy in a vault**, it holds the agency's secrets and is the only record).
`--only health,brand` runs just those steps.

**Custom domain pending.** Step 11 reports `ATTENTE` with the exact record to give the agency
(`CNAME crm.agence-nord.fr -> edge.<platform-domain>`). The agency keeps working on the platform
address. Run the same command again once DNS has propagated.

**Upgrade.** Same command with a new `--tag`: it runs the new migrate image (migrations, then the
idempotent seed), re-points the app and redeploys. Migrations must stay additive, because the old
container keeps serving until the new one is up. **Take a `pg_dump` of the agency database first**
(Phase 3 automates the backup and the rollback of the app tag if health fails).

## 5. Check it by hand

- `https://<slug>.<platform-domain>/login` shows the agency's name, colours and logo, not Captain Prospect's.
- The invitation link opens a set-password page; the manager lands in `/manager`.
- `Settings, Identité` shows the brand; creating more users than `seatLimit` is refused.
- A signed `GET /api/instance/health` reports the image sha as `version`.
- Send a test mail from Settings (SMTP), connect a mailbox (relay), open the Email Hub.
- The scheduler's first `email-sequences` run answers `200`.

## 6. Phase 1 acceptance (the test agency)

Phase 1 is done when `demo.<platform-domain>` passes section 5 after a **single** command run from
a clean `provision-out/`, and a second run with the same tag changes nothing but the health probe.
Then upgrade it once (new tag) and check it stays up. Write down every manual fix you had to make
and fold it back into the script before Phase 2.

## 7. Removing a test agency (by hand, Phase 3 automates it)

Export first if it holds anything real (`POST /api/instance/export`). Then: delete the application in
Dokploy; `DROP DATABASE db_<slug>; DROP ROLE agency_<slug>;` on the cluster; remove the bucket and key
(`mc rb --force`, `mc admin user remove`); delete `provision-out/<slug>.json`.

## 8. If a Dokploy call fails

`scripts/provision-agency/dokploy.ts` follows Dokploy's public API reference, but its response
shapes are only partly documented. A failure prints the route, status and body. Compare with your
instance's Swagger UI (`<dokploy>/swagger`) and fix that one call; the tests use a fake, so also
update the fake's expectation. Known soft spots: finding the project's environment id (set
`PROVISION_DOKPLOY_ENVIRONMENT_ID` to skip it), the `application.create` response (a re-run finds the
application by name), and whether `saveDockerProvider` also switches the source type to Docker.

## 8b. Building the image without GitHub Actions (free)

When Actions is unavailable (billing lock, no credit), build on the server into a local registry. Done on our server on 2026-10-26; the image `127.0.0.1:5000/captainprospect-crm:005c979` was built and pushed this way, and the demo agency runs from it.

1. **Registry** (once): `docker run -d --name local-registry --restart unless-stopped -p 127.0.0.1:5000:5000 -v /root/provision/registry:/var/lib/registry registry:2`. Docker accepts plain HTTP for localhost, and Dokploy pulls from the same machine, so no credentials are needed (leave `PROVISION_REGISTRY_USER` unset).
2. **Capped builder** (once), so the build cannot starve the other apps on the box: `docker buildx create --name capped --driver docker-container --driver-opt network=host --driver-opt memory=6g --driver-opt cpu-quota=300000 --driver-opt cpu-period=100000`.
3. **Source**: `git archive <commit>` of the commit you want, shipped to `/root/provision/src` (leave out `docs`, `work`, `.github`, root PDFs and screenshots, as `.dockerignore` does). Use the **same commit** as the runner kit (`prisma/schema.prisma` must match the image).
4. **Build**: `nohup nice -n 15 docker buildx build --builder capped --push -t 127.0.0.1:5000/captainprospect-crm:<sha7> --build-arg GIT_SHA=<sha7> . > build.log 2>&1 &`. It took about 25 minutes at 3 CPUs (webpack is the slow part, 4 GB of RAM).
5. In `provision.infra.env`: `PROVISION_IMAGE_REPO=127.0.0.1:5000/captainprospect-crm`, and run with `--tag <sha7>`. Migrations run in `local` mode from the runner kit (no migrate image needed).

Careful: Dokploy's scheduled Docker cleanup removed the `provision-runner` image once; the registry (a volume) and the running services survive it. Rebuild the runner from `/root/provision/kit` if it is gone.

## 9. What the first real run taught us (2026-10-26, our server)

**Result: the demo agency came up end to end** (`https://demo.<ip>.sslip.io`): database, bucket, schema, seed, Dokploy app, public route, deploy, health, brand, license and first manager, from one command, with a valid Let's Encrypt certificate issued by the public proxy. Idle footprint of an agency app: about 230 MB.

- **Dokploy domains must be plain HTTP** behind the public proxy. Created with HTTPS (the default), Dokploy's Traefik redirects http to https and the proxy talks to it over http: an endless 308 loop. Fixed in `dokploy.ts` (`https:false`, `certificateType:"none"`).
- Dokploy ignores the `appName` we pass to `application.create` and generates one (`app-navigate-primary-card-8qr23s`): look the service up by the name stored in the state file, not `crm-<slug>`.
- `application.update` with `command` replaces the container **entrypoint**, not its arguments: give the full command (`minio server /data ...`), not `server /data ...`.
- `minio/minio` is no longer pullable from Docker Hub; use an image already in use on the server (`pgsty/minio`).

- **`prisma migrate deploy` cannot build an empty database.** The first migration alters `"User"`, which no migration creates (68 `CREATE TABLE` for 142 models). Fixed with `prisma/migrate-instance.ts` (rules in `prisma/migrate-plan.ts`, tested). On a fresh database the baseline took several minutes on a loaded server. Verified: 143 tables, 86 migrations recorded, seed present, and a second run takes the managed path with nothing pending.
- **Coolify's proxy owns ports 80/443** and Dokploy's Traefik is only on :8090, so a Dokploy domain alone is unreachable. The `route` step writes `agency-<slug>.yml` into the proxy's watched directory (`PROVISION_PROXY_DYNAMIC_DIR`), so the script must run on that server.
- **Dokploy deploys one job at a time** (a queue): a build in progress delays every deploy, ours included. The API answers `200` with an empty body and nothing visible until the queue reaches the job.
- The Dokploy calls for project, application and domain behaved as `dokploy.ts` assumes, and so did the ones used to create the private Postgres, the MinIO start command and its volume. `project.all` lists databases by id only.
- The runner (`provision-runner`: Node, a few packages, the generated Prisma client) joins `dokploy-network` to reach the private Postgres, MinIO and Dokploy by service name.
- Set `SOCKET_URL` to a dead address in the shared env of any test agency: the app's default is the production socket server, which does not check the handshake token yet.

## 10. Known limits

- Without `mc`, every agency gets the MinIO admin key (the script says so in the step output).
- Migrations run from this machine: it must reach the cluster (VPN or an allowed IP).
- `docker run` of the migrate image needs the cluster to be reachable from where Docker runs.
- The script never deletes or rotates anything; a changed `shared.env` reaches an existing agency with `--only app,deploy,health` (step 5 re-saves its env).
- No Dokploy domain removal or rollback; the plan's upgrade job (Phase 3) adds both.
