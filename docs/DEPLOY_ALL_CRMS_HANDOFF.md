# VPS CLI handoff: upgrade every CRM

Copy the following prompt to the CLI agent on the VPS. Give it the exact pushed commit SHA from the accompanying message. This is an upgrade of existing agencies, not provisioning of new ones.

---

You are on my VPS. Upgrade **all four existing CRM instances** to the exact CRM commit SHA I give you. Work through deployment and verification, report progress, and stop the rollout at the first failed agency. Do not ask me again for permission for the normal backup → migrate → deploy → verify sequence. Do not deploy an unpublished local commit or silently substitute a newer commit.

## Repositories and architecture

- CRM repository: `odoklein/captainprospect-crm`, branch `main`.
- Control plane: separate repository `odoklein/console`; it manages agencies, backup/migration/upgrade jobs and Dokploy deployments.
- One runtime image for the fleet; **each agency has its own database and runtime configuration**. Brand and customer data live in those databases. Keep env, secrets, domains, volumes, integrations, storage and branding unchanged during an upgrade.
- Inspect existing checkouts, running services, Compose/Swarm definitions, Console job state, registry references and CLI help to find the real paths and commands. The supplied logs omit the shell commands: do not invent Console subcommands, database addresses, service IDs or registry locations.
- Prefer the existing Console upgrade-job mechanism. Do not use the provisioning script to recreate existing agencies, and do not bypass a failed backup by directly replacing the runtime image.

## Last known state from the previous operator's logs

These are historical observations; verify the live state first.

| Agency | Last reported CRM version | Deployment order |
| --- | --- | --- |
| Démo | `a5a689a` | 1 |
| pinglead | `a5a689a` | 2 |
| Suzalink | `a5a689a` | 3 |
| Captain Prospect | `a5a689a` | 4 |

All four were reported healthy after that rollout, with successful pre-upgrade backups, no rollback, no queued jobs and migration history current (103 migrations). `2f86985` was the next main commit and only refreshed the graph. **The new target is the exact SHA supplied with this handoff, not either historical version.**

## Critical Console correction — preserve it

The Console was previously rebuilt from `6a1231e` and accidentally lost server-only changes that had existed in image `66133f6`. This broke backups and upgrades for Suzalink and Captain Prospect, while the CRMs kept running.

- Démo and pinglead used the shared `agencies-pg` infrastructure.
- Suzalink and Captain Prospect use **their own Postgres servers**. Their DB locations must come from the per-agency override (`state.overrides.db` in the historical implementation), not the shared default.
- The Console correction also restored external CRM linking (`link.ts`, `agency:link` and related changes in `adopt.ts`, `agencies.ts`, `plan.ts`, `run.ts`, `handlers.ts`, `rollouts.ts`). Verify actual names in the running source.
- The corrected Console image was last reported as **`console-agences:6a1231e-p2`**. Discover its full registry reference from the running service.
- Its backup client was changed to **`postgresql18-client` / `pg_dump 18.7`**, because Suzalink uses PostgreSQL 18. The older Console Dockerfile installed a PostgreSQL 17 client, which could not dump that server.
- The correction was saved at **`/root/backups/console/console-external-db-overrides-onto-6a1231e.patch`**, including the Dockerfile correction. At the end of the logs, pushing that patch to `odoklein/console` was still outstanding.
- The Console's default CRM tag was still **`74e3922`**. Do not let that historical default override this rollout's explicit target, and do not change the default as an unrelated action.

**Do not rebuild or redeploy the Console from its Git branch as part of a routine CRM upgrade.** First confirm the running version still has the DB overrides and compatible dump client. If the correction is missing, repair and test that specific problem before resuming. Never recreate `agency_suzalink` on `agencies-pg` to work around a wrong-host error, and never change the agencies' database credentials to make an incorrect connection succeed.

## 1. Establish the target and preflight

1. Fetch the CRM repository and resolve the supplied target to its full commit SHA. Confirm it is published on `origin/main` and inspect the diff from every agency's current version.
2. Inspect `Dockerfile`, `.github/workflows/image.yml`, `docs/WHITE_LABEL.md`, `docs/PROVISION_AGENCY.md` and the Console's live upgrade implementation. The older provisioning runbook predates the running Console; use it for architecture, not as evidence of current VPS paths.
3. Record each agency's current image tag **and digest**, service/application ID, actual database host/server version, health and outstanding jobs. Check for a rollout already running; do not enqueue duplicate upgrades.
4. Inspect changes to `prisma/schema.prisma` and `prisma/migrations` between the deployed version and target. The agency-invite/queue feature itself adds no schema migration and uses existing `SystemConfig` and mission JSON, but verify the complete release diff rather than assuming there are no migrations.
5. Confirm backups go to the correct database, a compatible `pg_dump` is available, registry authentication works, and there is enough disk/RAM for the build. Do not print secrets or full connection URLs.

## 2. Build once for the fleet

Use published, successful CI images for the exact target if available. Otherwise build from a clean checkout of that SHA on the VPS, using the existing registry conventions and memory guard. Prior builds took roughly 10–14 minutes; do not treat a quiet build as success or failure. Create log/guard files before launching the guard, monitor memory, and inspect the final exit status.

The CRM Dockerfile has these targets:

```bash
# Set these from the resolved commit and the existing deployment configuration.
# TARGET_SHA = full published commit; TAG = its first seven characters.
# RUNTIME_IMAGE and MIGRATE_IMAGE = existing registry repository names, without tag.
docker build --target migrate --build-arg GIT_SHA="$TAG" -t "$MIGRATE_IMAGE:$TAG" .
docker build --target runtime --build-arg GIT_SHA="$TAG" -t "$RUNTIME_IMAGE:$TAG" .
docker push "$MIGRATE_IMAGE:$TAG"
docker push "$RUNTIME_IMAGE:$TAG"
```

Run each command only after the previous command succeeds. Verify both manifest digests and that the image version matches the intended commit. Build and push `--target agent-worker` at the same tag if the fleet actually runs that worker; discover and preserve its existing deployment method. CI also publishes a worker image.

The documented GHCR names are `ghcr.io/odoklein/captainprospect-crm`, `ghcr.io/odoklein/captainprospect-crm-migrate` and `ghcr.io/odoklein/captainprospect-crm-agent`. Confirm the live fleet's registry references before using them. Pin the commit tag/digest; do not roll out mutable `:main` or `:latest`.

## 3. Upgrade sequentially

For **Démo → pinglead → Suzalink → Captain Prospect**, wait for completion of every agency before starting the next:

1. Create a fresh pre-upgrade DB backup through the correct agency connection. Verify completion, non-empty dump and readable metadata; record its location. A backup failure stops the upgrade.
2. Run the matching migrate image against that agency's database with its existing `DATABASE_URL` and `DIRECT_URL`. Its entrypoint is `prisma/migrate-instance.ts`; the runtime image deliberately does **not** migrate at startup. Verify migration status and stop on failure.
3. Deploy the matching runtime tag/digest through the Console/Dokploy job, changing the image version only. Update an enabled worker consistently if required by the existing rollout mechanism.
4. Wait for the terminal deployment/job result and stable service replicas. A transient `2/1` during rolling replacement was previously observed on Captain Prospect; check it converges.
5. Verify signed instance health reports the intended `GIT_SHA`, database connectivity and migration status. `/api/instance/health` requires the Console's existing HMAC signing; an unsigned curl failure is not a health result.
6. Check `/login` returns 200, the expected brand/domain is retained and `/tutorials/espace-mission.mp4` returns 200. Compare Captain Prospect's `BrandSettings` before/after without overwriting it.
7. Check the legacy `/onboarding/<invalid-token>` returns 404. The new `/onboarding/invite/<token>` is a signup page; an invalid agency invitation shows its unavailable state, and `/api/onboarding/<invalid-token>` should return 404. Do not publish or log real invitation tokens.
8. With an authorized test account, check **Clients → Inviter un client**, client signup and client-owned draft missions, and the SDR **Jamais contactés** filter. It must exclude a contact if either it or its company has **any recorded action by anyone**, including actions on sibling contacts. Existing company/contact filters, callbacks and prior history must still behave correctly. If credentials are unavailable, explicitly mark those authenticated checks unverified; never claim an end-to-end pass based only on HTTP status checks.

The historical Onoff webhook smoke check returned **503** on all four instances before and after upgrades. Record the actual response and compare configuration/baseline; do not call 503 healthy or silently change integration secrets to fix it.

## 4. Failure handling and final report

- Stop the fleet rollout on the first failed agency; leave later agencies untouched.
- Follow the Console's existing rollback procedure. For an application-only failure, restore the previous runtime image/digest where schema compatibility allows. Do not automatically restore a database over new writes or attempt destructive down-migrations.
- Preserve logs, failed-job details and backup references. Do not mark failed jobs successful to continue.
- Finish with a table: agency, previous → target version/digest, backup, migrations, stable replicas, signed health, login, branding, video, onboarding checks and any rollback. Confirm no rollout remains running/queued.
- List unresolved issues separately. Historical open items were the unpushed Console patch, stale default tag, Captain Prospect `TC-0124` and pinglead `TC-0003`; verify whether they remain open rather than treating the old logs as live state.

Proceed using this runbook and the exact target SHA supplied by the user. Do not deploy the Console, reset data, reprovision agencies or modify branding as part of this CRM rollout.

---

Sources: the user's VPS CLI deployment transcript (last reported rollout `a5a689a`), this repository's Dockerfile, image workflow, white-label guide and provisioning runbook. VPS state and the Console code are not accessible from this local checkout and must be verified by the VPS agent.
