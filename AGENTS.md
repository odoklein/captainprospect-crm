# AGENTS.md: rules for AI coding agents (Codex, Claude Code…)

Captain Prospect CRM: Next.js (App Router) + Prisma/Postgres. The same code and the same Docker image
run several CRMs (Captain Prospect, Suzalink, agencies), each with its own database. A bad change here
can reach all of them, so keep changes small and checked.

## Working agreement

1. **Never work on `main`.** Create a branch first: `git switch -c codex/<short-topic>`.
2. **One task = one branch = one pull request.** Don't mix unrelated changes.
3. **Don't merge or push to `main` yourself.** Push your branch and stop; the owner reviews and merges.
4. **Never touch production.** `.env` must point at a local or test database, never at a production one.
   Never run `prisma migrate reset`, `db:reset`, or any seed script against a shared database.
5. **No secrets in code or commits** (`.env*`, keys, tokens, webhook URLs). Ask before adding an env variable.
6. If something is unclear or risky, ask before doing it.

## Commands

```bash
npm install
npx prisma generate            # after any change to prisma/schema.prisma
npm run dev                    # http://localhost:5000
npm run lint                   # eslint
npx tsc --noEmit               # type check (there is no typecheck script)
npm run build                  # prisma generate && next build
npm run test:<area>            # one script per area, see package.json (e.g. test:license, test:sdr-queue)
```

Run the tests of the area you changed, then `npx tsc --noEmit` and lint on the files you touched.
If a check was already failing before your change, say so; don't hide it and don't "fix" unrelated code.

## Database changes (Prisma)

- Edit `prisma/schema.prisma` **and** add a matching folder `prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql`.
  Use a timestamp later than the newest folder.
- **Additive only**: new tables, new nullable or defaulted columns. No drops, renames or type changes in the
  same release as the code that needs them. A rollback re-deploys the old code on the new schema.
- Never edit a migration that already exists.

## Things other systems depend on: change with care

- `app/api/instance/**` and `lib/instance/**`: signed API used by the Console (license, health, brand, keys,
  changelog, support). Keep request/response shapes backward compatible.
- `lib/license/**`: seats, suspension, features.
- `suzalink-site/`: the marketing site, a separate project (own `package.json`, own Dockerfile). Don't edit its
  `Dockerfile`, `next.config.ts` or `package.json` without the tech team. Its text lives in `suzalink-site/content/`.
- `Dockerfile`, `.github/workflows/`, `middleware.ts`, `prisma/migrations/`: ask before changing.

## Style

- Match the surrounding code. UI text is in French, with proper accents.
- Keep line endings as they are in the file (LF). If `git diff --stat` shows a whole file rewritten for a small
  change, your editor changed the line endings: undo that.
- Commit messages: `type(scope): what and why`, e.g. `fix(sdr): phone number no longer cut in the booking pane`
  (types: feat, fix, chore, docs, refactor, test).

## When you finish: pushing

```bash
git status                                  # only the files you meant to change?
git diff --stat                             # no huge unexpected diffs?
git add <the files you changed>             # not `git add .` if unrelated files show up
git commit -m "type(scope): message"
git push -u origin codex/<short-topic>
```

Then **stop and report to the owner**, in this shape:

1. What changed and why (3 to 5 lines, plain language).
2. Files touched.
3. Checks run and their result (tests, tsc, lint, build), and anything that failed or was skipped.
4. Does it include a database migration? Does it need a new env variable?
5. How to check it by hand (pages to open, what to click).
6. Risks, and what to watch after it is merged.

Merging into `main` may deploy to production automatically. Confirm how in the hosting tool (Dokploy) before relying on it.
