# Agency invitation and SDR queue

The agency shares one reusable invitation link. A new customer creates a CLIENT account and its own Client space, signs in through existing NextAuth credentials, and creates or edits mission briefs in the portal. Missions start DRAFT/isActive=false; managers retain activation. This app is one agency per database (BrandSettings), so the invitation belongs to the instance, not a Client.

1. Replace the unindexable company-history predicate in the shared SDR/card SQL, preserve legacy contact-action fallback, parallelize independent enrichment, and verify semantic equivalence and query plans on synthetic PostgreSQL data.
2. Store one revocable invitation in existing SystemConfig. Expose manager controls and a public, rate-limited registration endpoint. Create the user and client atomically; never attach new registrations to existing spaces by email or accept client-selected roles.
3. Add a client mission workspace and questionnaire. Derive ownership from the authenticated user, force draft status on create, and allow edits only while still a draft. Surface submitted briefs in the existing manager workspace.
4. Run targeted SQL, validation, authorization and transaction tests, TypeScript/lint checks and desktop/mobile browser checks. Use isolated test data; do not mutate the configured database or deploy.

Existing local edits are preserved on the preparation branch. The latest origin/main is integrated; its client cards, compact SDR pane and per-client onboarding links remain available. The reusable agency link lives at `/onboarding/invite/[token]`. The mission form reuses the existing pitch, offer and value questionnaire screens and stores their structured answers with the mission brief.

The SDR quick filter « Jamais contactés » requires no recorded action on either the row or its company, including actions by other SDRs and on sibling contacts. Activating it shows both contact and company-only rows while retaining search and company filters.

Review also restored non-modal drawers to the dialog stack (Escape and scroll-lock regression checks) and keeps the SDR table horizontally scrollable within the mobile viewport. The image workflow runs the questionnaire, self-service, queue and SQL performance regression suites before publishing images.
