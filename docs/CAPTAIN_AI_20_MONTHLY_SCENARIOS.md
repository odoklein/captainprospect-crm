# Captain AI: 20 recurring operating scenarios and the experience they require

3 November 2026 · Product and architecture study · Companion to `CAPTAIN_AI_ENHANCEMENT_REVIEW_2026-11-03.md`.

## Product conclusion

Captain must support the whole operating month: prepare work, handle daily exceptions, keep delivery moving, publish evidence, and prepare the next commercial decision. The launch workflow is one of twenty scenarios, not the organizing principle for every screen.

Use a **decision desk** for cross-client action and a **client-month workspace** for sustained client review. Both open the same work items, operation previews, business services, and receipts. Conversation remains available in context. It should not be a required detour for approving a meeting, correcting an owner, or reviewing a prepared report.

## What this study does and does not establish

The scenarios are grounded in current repository capabilities, rules, and UI paths. Cadence is an operating hypothesis, not an observed frequency: production event counts, manager observation, and time studies have not been collected. Some events happen across a portfolio every month without happening to every client every month. Recurrence, time savings, proposed thresholds, and business importance must be calibrated with managers.

Existing features listed below are CRM/domain capabilities, not claims that Captain already exposes an action tool for them. Proposed automation must reuse permissions and business rules. The existing 237 passing assistant tests from the earlier review remain a baseline; no new production capability is implemented by this study.

Current source was preferred to help documents when they differed. Examples: mission APIs support multiple channels; staffing derives coverage from actual schedule blocks; the billing schedule uses first-call cycles and external invoice tracking, independently of the separate Invoice/Engagement modules.

## The twenty-scenario map

| ID | Recurring situation | Expected cadence | What a faster Captain lets the manager do |
|---|---|---|---|
| S01 | Start the day across all clients | Daily | Resolve a ranked decision queue with evidence and inline actions |
| S02 | A new client must be launched | On a win | Review one sourced launch plan and apply approved steps |
| S03 | Onboarding is stuck | Daily while onboarding | Resolve the actual dependency and assign the missing action |
| S04 | A client changes the brief, contact, or objective | Whenever a request arrives | Review a field diff and downstream impact together |
| S05 | Build next month's SDR plan | Monthly, adjusted weekly | Simulate coverage across clients and approve a conflict-checked allocation |
| S06 | An SDR absence creates a delivery gap | On absence/change | Review feasible replacements and notify affected people |
| S07 | Planned delivery diverges from the commitment | Weekly and before period close | Reconcile contracted, delivered, and planned days at the correct scope |
| S08 | A prospect list is running out or stalled | Daily/weekly check | Replenish or repair the right list before capacity is wasted |
| S09 | New sourced/imported prospects need validation | Each batch | Review exceptions, exclusions and duplicates before release |
| S10 | A client adds a blacklist or do-not-contact request | On request/import | Preview matching scope and apply the exclusion with a receipt |
| S11 | A mission's results fall behind plan | Weekly or on deviation | Diagnose the likely constraint and approve a measured recovery plan |
| S12 | An SDR needs coaching or a script adjustment | Weekly or after an issue | Review call evidence and assign one concrete coaching action |
| S13 | Warm prospects and callbacks are being missed | Daily | Review overdue follow-ups with owners and deadlines |
| S14 | A booked meeting awaits manager validation | Daily/as booked | Inspect qualification, correct details, and validate without page changes |
| S15 | Client meeting feedback or a no-show decision is due | Daily, deadline-driven | Triage by the real deadline and record only verified outcomes |
| S16 | A meeting is cancelled or must be rescheduled | On event | Review a before/after calendar change and its notification effects |
| S17 | A client meeting creates decisions and action items | Each client session | Approve a recap and convert selected commitments into owned tasks |
| S18 | Weekly reports must be prepared and published | Weekly | Review a batch of grounded drafts and publish selected reports |
| S19 | A client billing cycle needs attention | Per anniversary cycle/due date | See invoice/payment evidence and prepare the right follow-up |
| S20 | Close the month and decide the next period | Monthly; renewal when due | Reconcile results and open commitments, then prepare continuation or a change |

## Scenario details

### S01 — Daily portfolio triage

**Trigger and owner:** manager starts work, or a meaningful event changes priority.

**Current foundation:** `lib/manager-home/today.ts` combines tasks, billing reminders, bilans and prospect submissions; `lib/tasks/feed.ts` combines manual, onboarding, session, AI, system and ticket work. Captain's `ManagerWork` separately combines agent runs/findings. Callback counts already exist in the task feed.

**Friction:** the same situation can appear as a task, finding, run and deadline on different screens. Reading multiple dashboards is not the same as deciding what to do next.

**Faster flow:** rank canonical work items by actual deadline, blocked delivery, impact, owner and readiness to act. Open a row into an adjacent context/decision area; execute the relevant domain action there. Show the most urgent items and a visible backlog count. Do not collapse distinct obligations simply because their titles resemble one another.

**Components:** `DecisionQueue`, `WorkRow`, `ScopeBar`, `EvidenceDrawer`, `OwnerPicker`, `DeadlineBadge`.

**Completion and measurement:** work remains open until its business outcome is verified. Measure time to first meaningful resolution, items reopened, missed deadlines, and duplicate items displayed. Loading or failed sources must be visible, never read as an empty healthy portfolio.

### S02 — New-client launch

**Trigger and owner:** a manager confirms a won client and the intended launch scope.

**Current foundation:** client onboarding wizard, transactional client/mission/campaign creation in `app/api/clients/route.ts`, checklist templates, files/transcripts, portal access and email tools.

**Friction:** sourcing a brief, setting up objects, access, tasks and staffing are related steps but not yet a complete conversation-controlled operation.

**Faster flow:** resolve the company, extract sourced facts, ask only blocking questions, prepare the launch, review objects and dependencies, apply approved steps, and show exact results. Internal draft assets and external communications have separate execution policies.

**Components:** `LaunchCanvas`, `SourceField`, `BlockingQuestions`, `ChangeSetPreview`, `ExecutionReceipt`.

**Completion and measurement:** launch readiness is based on agreed prerequisites and actual system state. Measure manager active time, re-entered fields, missing prerequisites, duplicate entities and recovery after interruption. Preparing a client is distinct from activating a mission or sending access emails.

### S03 — Blocked onboarding

**Trigger and owner:** a checklist due date passes, a prerequisite is missing, or launch is approaching. Assign the next action to the manager, SDR or client contact as appropriate.

**Current foundation:** `lib/onboarding/checklist-template.ts` separates contractualisation, cadrage, équipe and lancement; some steps derive from first-call and setup invoice/payment facts. Due dates already flow into tasks.

**Friction:** a checklist reveals what is unfinished but does not always explain which unresolved dependency actually prevents progress or who can unblock it.

**Faster flow:** show the blocking chain and the next actionable prerequisite. Prepare the missing document, request, reminder or assignment. If the next action belongs to the client, show it as waiting on the client rather than an unexplained internal overdue task.

**Components:** `ReadinessChecklist`, `DependencyStrip`, `WaitingOn`, `DraftMessageReview`.

**Completion and measurement:** check actual prerequisite evidence before marking a system-derived step complete. Measure blocker age, repeated reminders and time spent waiting by owner. Existing template offsets are implementation defaults, not universally validated service commitments.

### S04 — Client changes the brief or commercial contact

**Trigger and owner:** a client email, session decision or manager request changes an objective, contact, targeting, dates or scope.

**Current foundation:** client and mission editing, campaign assets, client sessions/tasks, email context and memory.

**Friction:** correcting a profile does not automatically make the effects on scripts, planning, access, reporting or commitments clear.

**Faster flow:** identify the requested fields, show their previous/new values and source, inspect dependent assets, and prepare separate approved changes. Flag anything requiring a commercial decision instead of silently modifying the agreed commitment.

**Components:** `FieldDiff`, `ImpactList`, `ContactEditor`, `VersionConflict`, `ApprovalFooter`.

**Completion and measurement:** approved fields and selected dependent assets are saved and reread; unrelated records are untouched. Measure repeat entry, missed downstream updates and corrections. CRM facts and contractual commitments must not be overwritten merely because an email was ambiguous.

### S05 — Next-month staffing

**Trigger and owner:** planning opens for the next period; manager or permitted planner allocates capacity.

**Current foundation:** `lib/planning/capacityMatrix.ts`, conflict engines, schedule blocks, absences, rebalancing proposals and `lib/staffing/clientStaffing.ts`.

**Friction:** the planner must compare client commitments, mission dates, actual schedules, availability and skills across several surfaces.

**Faster flow:** start with uncovered client commitments; simulate a proposed allocation; show conflicts, uncovered days and affected clients; allow manual changes; validate again; approve the exact set. “Assigned” and “scheduled on actual dates” remain separate concepts.

**Components:** `CapacityBoard`, `CoverageMatrix`, `ScheduleDiff`, `ConflictPanel`, `AllocationEditor`.

**Completion and measurement:** actual dated blocks satisfy the approved plan, respecting business constraints and authorizations. Measure planning preparation time, unresolved conflicts and preventable uncovered days. Client-level days/week must not be applied independently to every mission and accidentally multiplied.

### S06 — Absence or SDR replacement

**Trigger and owner:** an absence, availability change or departure affects future schedule blocks.

**Current foundation:** planning absences, capacity checks, rebalancing, notifications and access assignments.

**Friction:** finding a free SDR is insufficient; mission assignment, dates, skills, access and existing workloads also matter.

**Faster flow:** list only affected future blocks; propose feasible replacements; display the trade-off and remaining uncovered work; review the affected people; apply and summarize notifications. Preserve past actual work rather than rewriting it as if the replacement performed it.

**Components:** `ReplacementPicker`, `AffectedWorkList`, `ScheduleDiff`, `NotificationPreview`.

**Completion and measurement:** each selected block is reassigned or explicitly unresolved. Measure time to restore coverage and avoidable conflicts. Do not claim a candidate is skill-qualified until the relevant skills/capability data exists; distinguish hard checks from manager judgment.

### S07 — Delivery and commitment reconciliation

**Trigger and owner:** a weekly check, a volume change or an approaching contract/period limit.

**Current foundation:** client days/week, mission contract-day fields, schedule/actual activity, planning counters and staffing overview.

**Friction:** “days scheduled,” “days with calls,” “days delivered,” and “days contracted” can look interchangeable even though their units and scopes differ.

**Faster flow:** show a ledger of commitment, verified delivery, future plan and unresolved variance, with explicit client/mission scope and day-count convention. Propose additions, cancellations or a discussion with the client. Keep projections visibly separate from facts.

**Components:** `DeliveryLedger`, `VarianceRow`, `PeriodScope`, `AdjustmentPlan`.

**Completion and measurement:** approved corrections update the right plan; any commitment change has its own confirmation and source. Measure avoidable under/over-allocation and reconciliation corrections. Do not infer an increased commercial commitment from an unusually busy scheduling month.

### S08 — List depletion or stagnation

**Trigger and owner:** a list-health check detects low usable stock, sustained inactivity or a likely runway issue.

**Current foundation:** `lib/services/ListHealthService.ts` computes health, velocity, ETA and actionable hints from contacts, companies and actions; sourcing and import flows exist.

**Friction:** contact totals do not tell the manager how much usable work remains, why progress stalled or what to replenish.

**Faster flow:** show usable remaining stock alongside scheduled demand and data limitations. Distinguish exhausted stock, poor reachability, repeated attempts and simple lack of activity. Prepare a sourcing brief or data repair for the relevant segment; approve release of validated prospects.

**Components:** `ProspectRunway`, `SegmentBreakdown`, `SourcingBrief`, `StockExceptionList`.

**Completion and measurement:** the approved target list gains qualified, contactable records or the blocking issue is resolved. Measure idle SDR time, replenishment lead time and bad-data rate. Runway is an estimate with a method and freshness, not a guaranteed depletion date.

### S09 — Validate new prospect batches

**Trigger and owner:** a source, import or SDR submission produces proposed records.

**Current foundation:** sourcing schemas/merge logic, prospect submissions/matching, exclusions and contact/company/list structures.

**Friction:** reviewing every row is slow, while releasing an unchecked batch risks wrong targeting, duplicates and excluded prospects.

**Faster flow:** summarize the batch and focus review on exceptions: ambiguous duplicate, incomplete phone, target mismatch or exclusion. Explain why a row is held. Allow selection of the valid subset only where policy permits; preserve original batch and row identifiers.

**Components:** `BatchReviewTable`, `ExceptionFilter`, `MatchComparison`, `ReleaseSummary`.

**Completion and measurement:** each row is released, rejected or held with a reason. Measure review effort per batch, rejected records after release and duplicate rates. A model's unsupported company judgment must not silently override deterministic exclusion matching.

### S10 — Exclusions and blacklist changes

**Trigger and owner:** a client or manager supplies a do-not-contact request or blacklist file.

**Current foundation:** `lib/exclusions/service.ts`, matching/import helpers, explicit scopes and materialized exclusion flags used by production queues.

**Friction:** scope is consequential: a client exclusion and agency-wide exclusion can affect very different populations. A similar company name can match the wrong entity.

**Faster flow:** parse identifiers, present ambiguity and effective scope, preview impacted records, approve application, and verify suppression in relevant queues. Prioritize this work when active prospecting could contact affected people.

**Components:** `ExclusionScopePicker`, `MatchPreview`, `SuppressionReceipt`.

**Completion and measurement:** records are suppressed according to the authorized scope and results are recorded. Measure time until effective suppression and incorrect matches. Lifting an exclusion is an explicit separate action; never conflate “dismiss this alert” with “remove this exclusion.”

### S11 — Mission underperformance

**Trigger and owner:** a deviation from the agreed plan or expected operating baseline needs review.

**Current foundation:** mission metrics, SDR pace, client-risk watch rules, analytics, call transcripts, list quality and schedule data.

**Friction:** raw meeting counts can mask a capacity gap, poor data, poor reachability, qualification issues or missing instrumentation.

**Faster flow:** inspect actual delivery, contactability, conversations and qualified outcomes in order. Present evidence-backed hypotheses with uncertainty and a small recovery plan. Propose one or a few measurable changes with a follow-up date.

**Components:** `FunnelDiagnostic`, `EvidenceComparison`, `RecoveryPlan`, `FollowUpCheckpoint`.

**Completion and measurement:** approved action is applied and its later effect is reviewed against an appropriate comparison. Measure diagnosis time and verified recovery, not the number of suggestions. Avoid promising causal improvements from small samples or treating missing synced data as zero production.

### S12 — SDR coaching and script refinement

**Trigger and owner:** a weekly review, client concern or repeated observed objection; manager coaches the SDR.

**Current foundation:** call transcripts, analyse-IA workflows, SDR daily feedback and campaign scripts.

**Friction:** locating representative calls and turning a general critique into an actionable change takes time; an isolated bad call may be overinterpreted.

**Faster flow:** assemble a relevant sample with linked excerpts, distinguish factual observations from coaching interpretation, draft one concrete coaching task, and prepare a script diff if justified. Let the manager decide whether the issue is individual or campaign-wide.

**Components:** `CallEvidencePlayer`, `CoachingNote`, `ScriptDiff`, `CoachingCheckpoint`.

**Completion and measurement:** the assigned person receives the agreed task and any approved script revision is published to the intended campaign. Measure preparation time, task follow-through and subsequent relevant outcomes. Record the script version so later analysis compares the correct periods.

### S13 — Warm prospects and callbacks

**Trigger and owner:** a callback becomes due/overdue, a promising prospect has no next step, or an owner becomes unavailable.

**Current foundation:** unified task callback counts, SDR action queue, action history and contact context.

**Friction:** managers see a total but still need to discover which important opportunities are slipping and who owns them.

**Faster flow:** open the count into scoped contacts with last interaction, promised next step, due time, owner and priority rationale. Batch assign or change due dates only where permitted. Give the SDR a direct handoff into the existing action queue.

**Components:** `FollowUpQueue`, `ContactContextPeek`, `OwnerPicker`, `NextActionEditor`.

**Completion and measurement:** a follow-up has a valid owner and next action, or actual completion evidence. Measure overdue duration and lost warm opportunities. Opening a record or generating a draft must not mark the callback completed.

### S14 — Validate booked meetings

**Trigger and owner:** a new meeting awaits review by a manager.

**Current foundation:** SAS RDV, contact/call context, confirmation status and `lib/meetings/clientEmailGate.ts`.

**Friction:** the manager needs qualification, transcript evidence, correct participant/time and client-specific rules before confirming; a global dashboard does not provide this review context.

**Faster flow:** show a compact qualification review with required corrections next to the pending queue. Confirm, correct, or reject with a reason. Make notification consequences visible. Keep batch approval restricted to independent, eligible items with individually recorded outcomes.

**Components:** `MeetingReview`, `QualificationChecklist`, `ContactEditor`, `NotificationPreview`.

**Completion and measurement:** persisted meeting state and downstream notification behavior match the decision. Measure review time, correction/no-show rates and premature client messages. Existing code only permits automatic meeting emails when confirmation status is CONFIRMED; Captain must use that same gate.

### S15 — Feedback and no-show deadline

**Trigger and owner:** a confirmed meeting has taken place without client feedback, or a no-show is reported.

**Current foundation:** feedback reminders/history, portal absence handling and the current 48-hour reporting window in `lib/meetings/noShowWindow.ts` and `feedbackReminder.ts`.

**Friction:** deadline-sensitive cases may be mixed with routine feedback. Incorrectly inferred attendance can affect reporting and billing classifications.

**Faster flow:** show the actual meeting date, deadline, evidence and missing input; prioritize the soonest actionable deadline. Prepare a reminder or review the client's reported outcome. Separate “feedback missing,” “reported absent,” and “outcome verified.”

**Components:** `DeadlineQueue`, `AttendanceEvidence`, `FeedbackForm`, `OutcomeDiff`.

**Completion and measurement:** the verified report is recorded under current application rules and dependent views agree. Measure deadline misses and corrected classifications. The 48-hour behavior is a current product rule, not a legal claim; do not let the model invent attendance or reset the reporting clock.

### S16 — Meeting cancellation and rescheduling

**Trigger and owner:** prospect/client availability changes or a meeting is cancelled.

**Current foundation:** client meeting cancellation/rescheduling routes, absence/rebooking helpers, meeting history and email gating.

**Friction:** time, participant, ownership, calendar state, notifications and meeting outcomes must stay consistent; changing just a callback date is insufficient.

**Faster flow:** show old and proposed time in explicit time zones, validate availability and current meeting state, show which calendar/email effects will occur, apply the approved change, and confirm each effect. If no calendar is connected, say availability is unverified.

**Components:** `RescheduleEditor`, `AvailabilityPeek`, `CalendarDiff`, `ExecutionReceipt`.

**Completion and measurement:** the meeting and connected systems agree or show a specific reconciliation problem. Measure time to rebook and duplicate notifications. Handle uncertain provider results explicitly; do not retry a send or booking blindly after losing its response.

### S17 — Client session recap and commitments

**Trigger and owner:** a kickoff, check-in or client session ends.

**Current foundation:** `lib/client-sessions/create.ts` stores sessions, creates project tasks from action items, and optionally sends the recap email; notetaker providers are available.

**Friction:** commitments must move from recordings into tasks and updates without losing who agreed to what, or creating duplicates on every summary regeneration.

**Faster flow:** prepare a sourced recap with editable decisions, action, owner and date per commitment. Match already-existing tasks and propose updates instead of new copies. Preview recipients and the exact recap separately from internal tasks.

**Components:** `SessionReview`, `CommitmentTable`, `ExistingTaskMatch`, `EmailPreview`.

**Completion and measurement:** the approved session and selected task changes exist; email has its own sent/failed state. Measure recap preparation time, owner/date completeness and duplicate tasks. Current session code already separates session creation from email success; retain that distinction in Captain.

### S18 — Weekly report production

**Trigger and owner:** weekly reporting becomes due; manager reviews and publishes.

**Current foundation:** weekly-bilan dataset/rendering/AI services, agent report playbook and publication proposal. `weekly-bilan-week.ts` treats Friday–Sunday as the current reporting window and Monday as the previous week's overdue report.

**Friction:** repeatedly assembling numbers, writing commentary and switching client context slows portfolio reporting. A batch should not hide a client-specific exception or wrong reporting week.

**Faster flow:** prepare drafts across authorized clients, surface missing data and notable changes, review each grounded report, and publish selected ready reports with exact recipients. Preserve an editable saved draft and evidence references.

**Components:** `ReportBatchDesk`, `ReportPreview`, `MetricEvidence`, `RecipientReview`.

**Completion and measurement:** publication and delivery receipts distinguish draft, published and emailed. Measure active minutes per report, corrected figures, late reports and send failures. Explicitly show coverage dates; do not equate Monday's report with a new incomplete week.

### S19 — Billing-cycle attention

**Trigger and owner:** a setup or client anniversary cycle becomes due, unbilled, unpaid or disputed; authorized finance/manager role acts.

**Current foundation:** `lib/billing/cycle-schedule.ts`, schedule store/service and manager-home billing slots. The separate Invoice/Engagement and payment services also exist but are not the schedule's source of truth.

**Friction:** calendars, external accounting records, manual billing/payment ticks and internal invoice objects can disagree. Defaulting to calendar month-end would misstate client-specific cycles.

**Faster flow:** show the actual anchor/cycle, due date, recorded evidence, responsible person and reference; prepare the missing request or follow-up. Match records deliberately before offering accounting actions. Clearly label a manager-recorded payment versus a matched bank event.

**Components:** `BillingCycleRow`, `AccountingEvidence`, `PaymentMatchReview`, `ReminderDraft`.

**Completion and measurement:** the authoritative workflow records the action and supporting reference; sending a reminder does not equal payment. Measure missed billing deadlines, reconciliation time and wrong payment flags. Respect billing permissions and the actual external-accounting workflow; do not silently migrate it into internal Invoice rows.

### S20 — Monthly close and next-period decision

**Trigger and owner:** an operating month closes or an engagement approaches a decision date; account manager leads the review.

**Current foundation:** client activity/reporting, staffing/planning, session history, billing records, engagement dates/statuses and mission lifecycle.

**Friction:** the manager must reconstruct delivery, outcomes, feedback, open promises and commercial terms before deciding whether to continue, change, pause or renew.

**Faster flow:** prepare a period review that reconciles outcomes and scope, links unresolved commitments and labels data limitations. Show next-period options and their capacity/target implications. Draft the client discussion and next-period plan. Renewal is a proposal until the agreement is actually confirmed.

**Components:** `ClientMonthReview`, `DeliveryLedger`, `CommitmentCarryover`, `NextPeriodPlan`, `RenewalDraft`.

**Completion and measurement:** the decision and source are recorded, approved next-period work is linked, and outstanding items are carried forward explicitly. Measure preparation time, missed renewal discussions and lost commitments. No automatic renewal, new commercial terms or false indication that an agreement has been signed.

## What makes these workflows slow

The common friction is repeated context reconstruction: which client and mission, which period, what changed, which source is trustworthy, who acts next, and whether anything was actually applied. Moving that information into another large chat transcript would preserve the same burden.

Across the scenarios, reduce five kinds of delay:

1. **Navigation:** open the relevant decision next to its queue rather than route through multiple hubs.
2. **Re-entry:** populate typed editable fields from verified existing records and sources.
3. **Comparison:** put old/new state, plan/actual and evidence/decision side by side when the task requires comparison.
4. **Waiting:** prepare work in advance, identify the actual dependency and preserve it across sessions.
5. **Recovery:** keep execution receipts, retry only failed eligible steps and reconcile uncertain external results.

Do not report estimated time saved as measured. Observe these five costs first and compare the same task with the new design.

## Two layouts derived from the scenarios

### Decision desk — default for daily portfolio work

Best for S01, S03, S06, S08–S16, S18 and S19.

- **Left rail:** Aujourd'hui, À décider, En cours, Clients, Calendrier; counts are real, scoped and named. Detailed automations stay in secondary settings. Preserve canonical CRM navigation for specialized work.
- **Top scope bar:** client/mission selection, responsible owner, relevant period and source freshness. A work item's own deadline/cycle must remain visible even when a portfolio period filter is selected.
- **Work queue:** compact rows with title, client/mission, next action, owner, deadline, evidence state and blocker. Saved practical views replace repeated filter setup.
- **Adjacent work area:** relevant review editor, comparison or simulation. The selected item stays highlighted and stable in the queue.
- **Optional assistant:** explain, refine or prepare additional work in the same scope. It does not occupy permanent width if the manager is simply reviewing ready work.
- **Action footer:** exact action and outcome count; show blocked/held items separately. Complete, partial, failed and uncertain results remain explicit.

At approximately 1440px, test a 208px rail and a remaining queue/work split around 40/60. At narrower desktop widths collapse the rail and make the queue dismissible. These are proposed starting dimensions, not verified production breakpoints. On mobile, use a queue → full-screen work → receipt flow with preserved selection/back position and no stack of nested drawers.

### Client month — sustained account review

Best for S02, S04, S05, S07, S11, S17, S18 and S20.

- **Client header:** accountable manager, active missions, agreed commitment, actual readiness and next important date.
- **Month overview:** delivery versus commitment with units; a dated list or timeline of milestones, sessions, reporting and next-period decisions.
- **Work sections:** delivery, team, prospects, meetings, commitments and commercial. These are focused sections of the client workspace, not duplicate standalone products.
- **Selected work area:** reuse exactly the same editors and receipts as the decision desk. A staffing issue opened from the month review is the same work item seen in the daily queue.
- **Evidence and discussion:** available without obscuring the current comparison or losing an unfinished draft.

The month view is a perspective on work, not a new date model. Weekly reports, rolling staffing windows, contact follow-up times, no-show windows and anniversary billing cycles retain their own semantics.

**Recommendation:** make the decision desk the default for an established manager; use the client-month workspace after choosing a client. A chat-first empty state remains suitable when no work is ready or the manager begins an unusual request.

## Component system: build reusable task surfaces

| Component family | Used by | Behavior contract |
|---|---|---|
| `WorkRow` / `DecisionQueue` | All | Stable identity, owner, scope, due date, source status, one next action |
| `ScopeBar` / `PeriodScope` | All | Client/mission/period explicit; no accidental cross-client edits |
| `EvidencePeek` / `SourceField` | S02, S04, S11, S12, S14, S17, S18 | Exact source, date, freshness and uncertainty; edit without deleting provenance |
| `FieldDiff` / `ChangeSetPreview` | S02, S04–S07, S10, S12, S16 | Exact before/after, dependencies and record revisions |
| `BatchReviewTable` | S09, S13–S15, S18, S19 | Per-item eligibility/outcome; held items remain visible; no hidden select-all scope |
| `ReadinessChecklist` / `WaitingOn` | S02, S03 | Required/optional separate; actual blocker and responsible person |
| `CapacityBoard` / `ScheduleDiff` | S05–S07 | Simulation distinct from committed plan; live conflict revalidation |
| `DeliveryLedger` / `ProspectRunway` | S07, S08, S11, S20 | Units, scope, period, denominator and projection method explicit |
| `MeetingReview` / `DeadlineQueue` | S14–S16 | Current state and time zone; qualification and notifications visible |
| `CommitmentTable` / `OwnerPicker` | S03, S06, S13, S17, S20 | Owner and due date editable; unresolved external ownership supported |
| `ReportPreview` / `RecipientReview` | S17, S18 | Draft/published/sent states distinct; exact recipient preview |
| `BillingCycleRow` / `AccountingEvidence` | S19, S20 | Billing source and cycle explicit; role-scoped amounts/actions |
| `ExecutionReceipt` / `RecoveryPanel` | Every mutation | Verified IDs, partial results, safe retry, uncertain-outcome reconciliation |

Build the four most reused foundations first: canonical work rows, scope, review/diff, and receipts. Domain-specific editors follow actual scenario needs. Reuse existing Radix/shadcn controls and domain widgets where suitable; avoid twenty independent AI cards with their own behavior.

## New visual style: operational clarity

Recommended direction: **compact editorial workspace**. Preserve Captain's navy and magenta identity, use clean data rows and strong alignment, and reserve softer spacious surfaces for client summaries and report reading.

- **Hierarchy:** 14–15px operating text, 12–13px secondary metadata, 20–24px section headings; larger launch headlines only where they aid orientation. Use readable relative sizing and respect browser zoom.
- **Density:** start with approximately 56–64px desktop queue rows; provide comfortable touch targets on mobile. Expose essential client, deadline and owner in the row; expand supporting evidence on selection.
- **Grid:** use a consistent 4/8px spacing rhythm. Shared label, owner, date and action positions let managers scan a queue without opening every item.
- **Surfaces:** neutral canvas, white/light or equivalent dark working surfaces, subtle dividers and restrained elevation. Use a visible selection marker and surface tint; do not make every row a shadowed card.
- **Color:** magenta for the active scope/action emphasis; amber for attention, red for failed/urgent states, green for verified completion. Pair colors with text/icons. No decorative gradients competing with operational status.
- **Numbers:** tabular figures and aligned units; booked, confirmed, held and billable meetings are different labels. No large unexplained health score.
- **Action language:** “Review 4 meetings,” “Prepare replacement,” “Publish selected reports,” “Retry failed step.” Distinguish prepare, approve, apply and verify.
- **Style alternatives:** a compact decision desk for frequent operations and a calmer client-month review for reading/comparison. Use the same typography, tokens and component behavior; do not create separate brands or a cosmetic theme per scenario.

The working prototype illustrates spatial hierarchy and interaction only. Synthetic examples are labeled; it does not connect to live data or perform writes. Final product tokens and accessibility require production implementation checks.

## Motion and feedback

Use roughly 120–180ms for row selection and local feedback, 180–240ms for opening a review surface, and restrained 200–300ms layout changes when appropriate. These are design starting points to test, not measured optimal timings.

Keep the queue stable during review, preserve scroll/focus, and announce the relevant status once. New results arrive through a badge or restrained highlight. A receipt appears after real confirmation. Show named steps for long work; avoid simulated progress percentages. Respect reduced motion, loading/error states and keyboard access. Refer to the [W3C guidance on interaction animation](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions) when implementing nonessential movement.

## Architecture implied by the scenarios

Extend the earlier persistent-operation proposal with a **canonical work projection** across existing domain records. Do not replace domain records with a second AI-owned database of truth.

Work item: stable key, scenario type, authorized actor/client/mission scope, underlying record references, trigger, owner, business deadline, time zone/period basis, priority reasons, evidence/freshness, current state, allowed next actions and linked operation. Store decisions where needed; derive actual state from the owning service.

Deduplicate by obligation, not text: one feedback request and one billing follow-up may refer to the same meeting but remain distinct obligations. Link them. Conversely an agent finding, system task and notification describing the same unresolved staffing gap should lead to one decision.

Use existing `lib/tasks/feed.ts`, manager-home source aggregators and Captain findings/runs as adapters into that projection. Keep independent source failures visible, permission-filter sensitive data before returning it, and retain specialized source views. Suggested UI state: needs review, ready, waiting on someone, scheduled, running, blocked, verified, dismissed, failed or uncertain. Map explicitly to source status rather than force every domain into a single state enum.

Business actions must use typed shared commands with revision checks, idempotency and receipts, as detailed in the earlier enhancement review. Add narrowly scoped tool bundles for planning, meeting review, prospect batches, reporting and billing attention. The active scenario and scope should influence tool discovery as well as prompt wording. Cached evidence is not permission to execute against stale records.

Follow the existing application deployment boundary and permissions. Agency-wide does not mean every manager can see payroll, credential secrets or finance data. HR/payroll reconciliation is a related domain that should remain in its own authorized workflow until its exact Captain use cases are validated; it is not silently bundled into monthly account review.

## Priorities and validation plan

Order here reflects reuse and concrete existing foundations, not measured ROI:

1. Unify canonical work rows and source health; build the decision desk with read-only drilldown for all twenty scenario types where evidence exists.
2. Implement complete review/action paths for meeting validation (S14), weekly reporting (S18), and staffing exceptions (S05/S06). These exercise review, publication and multi-step planning, respectively.
3. Add prospect stock/validation, callbacks, onboarding blockers and client changes. Expand mutation tools only as shared services and recovery contracts become ready.
4. Add the client-month workspace, commitment reconciliation, billing-cycle review and next-period decisions. Bring forward read-only views earlier where useful; do not wait for every mutation to exist.
5. Polish density, keyboard shortcuts, responsive behavior and motion after validating task completion and correctness.

This revises the earlier launch-first recommendation: the cross-client decision structure comes first, with several repeated task types validating it. New-client launch remains an important supported operation, not the only product focus.

For each scenario, observe several representative real cases with their owners, record active time, elapsed waiting, page changes, re-entry and corrections, and note any unavailable integrations. Then run the same task in the prototype and a controlled implementation pilot. Use medians and tail cases where the sample allows; do not extrapolate one easy task to a whole month.

Success measures: time to verified resolution, fewer context switches/re-entered fields, lower missed-deadline and correction rates, fewer duplicate effects, and accurate recovery. Cost/latency are secondary to the completion outcome but should be recorded per scenario.

Acceptance checks include partial source failure, ambiguous identity, unavailable integration, conflicting edits, permission changes, batch partial failure, worker interruption, uncertain external effects, deadline boundary/time zone, mobile/keyboard/reduced-motion operation, and preserved drafts. Existing domain tests are the starting point; integration and scenario-level tests must verify the new connected behaviors.

## Concept verification completed

The companion interactive concept contains both layout directions and all twenty scenarios. Browser checks exercised scenario selection, change-preview visibility and simulated approval receipts for every scenario in both layouts (40 combinations). Both layouts were checked at 1024, 768, 390 and 320px viewport widths in light and dark appearance (16 combinations), without document-level horizontal overflow. Desktop dark and mobile light screenshots were visually inspected; reduced-motion styling was checked. These checks validate the isolated concept's behavior, not production business execution or a complete accessibility audit. All examples and approvals are synthetic; no CRM records were changed.
