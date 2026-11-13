# Clients & missions workspace — paused work

Plan: docs/plans/2026-11-13-clients-missions-workspace-upgrade.md

Done and on the branch: Phase 0 url.ts (+tests) and ui/ kit, shared fetch
helpers, legacy-link call sites, Phase 1 mission API (D1, ?view=brief,
/insights?period=, benchmark cache, /duplicate).

`wave1-partial.patch` holds unfinished, NOT type-clean work from the stopped
agents (apply with `git apply work/clients-workspace/wave1-partial.patch`):
- mission decomposition (components/manager/workspace/mission, lib/manager/workspace/mission) — not wired in; missing dialogs/PortalLaunchDialog
- client decomposition (components/manager/workspace/client, lib/manager/workspace/client) — not wired in
- attention rules extended (client-level items, `kind`) — breaks app/manager/clients/page.tsx until InboxItem/page are adapted
- lib/manager/workspace/directory types/api, action inventory draft

Still to do: Phase 1 clients workspace API, Phases 2–6.
Legacy /manager/clients/[id] still has Analytics, the ReachInbox embed and
session → project, which must be ported before Phase 6 deletes it.
