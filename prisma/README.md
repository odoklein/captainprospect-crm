# Database — migrations and seeds

The schema is `prisma/schema.prisma`; its history is `prisma/migrations/`.

## Fresh white-label instance

Run once per new database, in this order (the control plane does it with the
one-shot `migrate` image before switching traffic):

| Step | Command | What it does |
|---|---|---|
| 1 | `npm run db:migrate:deploy` | `prisma migrate deploy`: applies every pending migration |
| 2 | `npm run db:seed:instance` | `prisma/seed-instance.ts`: reference data only (below) |
| 3 | signed `POST /api/instance/bootstrap` | first `MANAGER` + 24 h invite link (see `docs/WHITE_LABEL.md`) |
| 4 | signed `PUT /api/instance/brand` | the instance's name, colours, sender…; logos via `/api/instance/brand/assets` |

`db:seed:instance` is idempotent (upserts only) and safe to re-run on every
deploy. It writes:

- the `BrandSettings` row `default` (column defaults = `brand/brand.config.ts`; never overwritten),
- permissions and role permissions,
- result categories, then the GLOBAL action status definitions that point at them,
- the external API endpoint registry.

It creates no user, no client, no prospect data and no secret. `SystemConfig`
is not seeded: every key the app reads has a default in code.

The reference data lives in `prisma/reference-data.ts`, imported by both
`seed-instance.ts` and `seed.ts` (and `seed-endpoints.ts`) so they cannot drift.

## Local development

| Command | Use |
|---|---|
| `npx tsx prisma/seed.ts` | reference data **plus** demo client, users (`test123`), mission, list, companies |
| `npm run db:seed-endpoints` | endpoint registry only |
| `npm run db:reset` / `npm run db:verify` | see `prisma/RESET_README.md` |

Never point these at a production `DATABASE_URL`.

## Root `.sql` files

They predate `prisma/migrations` and were run by hand in the Supabase SQL
editor. None is needed for a new instance.

| File | Status | Superseded by |
|---|---|---|
| `supabase-setup.sql` | historical | `prisma/migrations` |
| `supabase-from-schema.sql` | historical (schema snapshot) | `prisma/migrations` |
| `supabase-full-schema.sql` | empty file | — |
| `alter-enum.sql` | historical | `prisma/migrations` |
| `performance-indexes.sql` | historical, not part of the migration history | — (check a database before relying on these indexes) |
| `add-reachinbox-campaign-links.sql` | historical | `prisma/migrations` |
| `add-statuses.sql` | superseded | `seedActionStatusDefinitions` in `reference-data.ts` |
| `migrate-missions-to-global.sql` | one-off data migration, done | — |
| `check-statuses.sql` | read-only diagnostic | — |
| `seed-data.sql`, `seed-data-extended.sql` | demo data | `prisma/seed.ts` |
| `fix-passwords.sql` | demo-only (sets test users to `test123`) | `prisma/seed.ts`; never run on production |
| `seed-admin.sql` | superseded, emptied | `POST /api/instance/bootstrap` |

### Leaked credential

`seed-admin.sql` used to insert `admin@captain-prospect.fr` with a bcrypt hash
and the clear-text password in a comment. Both are still in git history.
If that account exists on any database, **rotate its password** (or disable
it). The file now contains no credential.

## Two result-category sets

`prisma/seed-result-categories.ts` seeds a different, French-coded set
(`RDV_PRIS`, `RAPPEL`, …) from `reference-data.ts` (`MEETING_BOOKED`,
`CALLBACK_REQUESTED`, …). The GLOBAL statuses reference the latter, so the
instance seed uses it. Which set a given database holds is not decided here;
check before running `seed-result-categories.ts` anywhere.
