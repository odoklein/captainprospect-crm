# Captain workspace implementation

Implement the approved conversation-first designs in the existing Next/React workspace. Reuse the current thread, streaming, files, evidence, memory, proposal and run APIs. Existing uncommitted edits are the starting point.

1. Add URL-backed Captain, Pilotage, client and operations views. Keep a single thread instance for full and docked conversation, preserving its identity and stream when changing layouts. Explicit scope changes start/reopen only the appropriate conversation.
2. Update the navigation and full conversation presentation. Expose actual memory, sources and client context in a desktop inspector; retain accessible mobile context controls.
3. Build the decision desk from existing findings/runs, with filters, selection and inline review. Reuse existing proposal approval controls and run details; do not add placeholder business actions.
4. Build the client overview using existing authorized live context. Label reporting periods, planned-day estimates and booked meetings accurately. Reuse the decision/review surface for client work.
5. Expose operation review with actual plans, steps, proposals and outcomes. Keep all writes behind existing server authorization and confirmation paths.
6. Verify scope/navigation/filters with meaningful logic tests, targeted type checking and lint, existing assistant and playbook suites, and desktop/mobile browser checks using synthetic API fixtures where needed. Do not write real business records for UI QA.

Baseline: assistant UI tests 98 passing. Targeted TypeScript check started before edits. Hosted skill instructions for UI craft/planning/verification are unavailable in this session; use repository contracts and the approved design briefs directly.

Not part of this UI implementation: new client/mission/planning mutation tools, durable business-operation schema, billing workflows, or automatic client outreach. Those require the separate service/recovery work described in the architecture review. The UI must not imply those actions exist.

## Applied

- `/manager/assistant?view=captain`: dedicated conversation with existing streaming/messages/composer and a desktop context inspector for actual memory, instructions and files.
- `?view=pilotage`: real findings/runs, decision filters, selection and inline review, with a persistent contextual discussion on wide screens.
- `?view=client&folder=<id>`: authorized client activity, mission objectives, scoped decisions and conversation. Planned-day estimates and booked-meeting definitions remain explicit.
- `?view=operations&run=<id>`: conversation on the left and a larger plan/proposal review canvas, with existing approvals and detailed run controls.
- Old conversation/folder URLs still resolve. Full/docked conversation uses the same mounted thread; explicit work scope is retained when a client conversation is expanded. Mobile discussion opens as a focused workspace with a return action and retained draft.
- Existing onboarding, delegation, conversation controls, citations, file handling, feedback and visual canvas are reused. Synthetic design data was not introduced into application components.

## Verification

- `npm run test:assistant-ui`: 107 passing, including new navigation/scope and decision-filter coverage.
- `npm run test:agent-playbooks`: 36 passing.
- `npm run test:assistant`: 103 passing.
- Targeted TypeScript: `npx tsc --project work/tsconfig.captain-review.json --pretty false`.
- ESLint on all touched application/logic/test files; whitespace/diff check on edited tracked files.
- `work/qa-captain-workspace.py` exercises the actual local Next UI with all browser API data synthetic and all mutations/model requests blocked. It verifies same composer DOM/draft across full/docked/full transitions, agency queue restoration, client isolation, client overview, inline operation review, and responsive widths 1920, 1440, 1280, 768, 390 and 320px. Mobile draft retention and reduced-motion presentation are included.
- Final browser run: no uncaught page errors and no mutation/model requests. Screenshots and machine-readable results: `.codex-screenshots/captain-workspace-applied/`.

Validation is local and fixture-backed, not a live-data production acceptance test. Root layout logs existing missing BrandSettings/InstanceLicense tables and uses its configured fallbacks. No database schema or authentication policy was changed for this implementation.
