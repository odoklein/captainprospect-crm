# Sales Execution Engine

Appel → Analyse → Qualification → Action → Prochain prospect, built on the existing softphone, Mode Focus and File d'actions.

## 1. What existed (audit, Nov 2026)

| Area | Existing | Reused as |
|---|---|---|
| Softphone | Browser Voice SDK → TwiML App → `<Dial><Number>`; row created first (`POST /api/telephony/calls`), signed webhooks, monotonic status folding (`lib/telephony/status.ts`) | Agent leg of parallel sessions; call log of bridged calls |
| AI summary | Live transcription → recording fallback (Mistral) → JSON summary with mission-scoped suggested status (`lib/telephony/summary.ts`) | Extended with structured, evidence-checked fields |
| Post-call card | `suggestCallResult` + `PostCallSuggestion`: nothing saved without a click | Kept as the only path to save an outcome; follow-ups added under it |
| Queue | `/api/sdr/action-queue` (table) and `/api/actions/next` (Focus card): mission scope, 24 h cooldown, exclusions, SKIP statuses, absent-RDV recall | Single source of dialing candidates (loader extracted unchanged to `lib/sdr-queue/load-action-queue.ts`) |
| Saving an outcome | `ActionService.createAction` (allowed codes, required notes, side effects) | The only path the automation uses |
| Exclusions | Durable « ne plus contacter » rules, materialised `excludedAt` | Never bypassed; AI opt-out only *proposes* one |
| Audit | `audit()` / `auditSystem()` | Policy changes, proposal decisions |

Gaps found: no prioritisation beyond status order; no structured targeting (`Campaign.icp` is free text); no confidence or evidence on AI output; no multi-line dialing; no dialer state store; no AMD; no metrics on abandon rate or answer-to-bridge delay.

## 2. Architecture

```
lib/qualification/   explained score + state per prospect (pure)            → File d'actions, Mode Focus
lib/post-call/       evidence-checked summary → typed proposals → policy     → call card
lib/dialer/          attempt state machine · SQL store · orchestrator · Twilio REST · webhooks
lib/sales-engine/    manager metrics
```

Four concepts are kept apart: **qualification** (derived from actions + AI signals, never stored), **scheduling** (`Action.callbackDate`), **operational call status** (`DialAttempt` / `TelephonyCall`), **pipeline** (meetings, opportunities).

### Qualification
States: À qualifier → Prioritaire → Prêt à appeler → En cours → À relancer → Qualifié → RDV pris → Non pertinent. Score = 40 + Σ reasons, each with a source (`sdr`, `crm`, `ai`, `targeting`). Rules: AI signals weigh only with verified evidence and confidence ≥ 0.6; AI never disqualifies; a suspected opt-out holds the row out of *automatic* dialing and proposes an exclusion. Fit is scored only when a manager defined structured targeting (`SystemConfig mission.targeting:<missionId>` = `{"industries":[],"countries":[],"sizeBuckets":[]}`).

### Post-call
The model must quote the transcript verbatim; quotes not found in the transcript are dropped with the claims they supported. Proposal kinds and ceilings:

| Kind | Ceiling | Applied through |
|---|---|---|
| Outcome from the provider (no answer, busy) | auto | `ActionService.createAction` |
| Outcome read by the AI | suggest | existing call card → `POST /api/actions` |
| Task for an SDR commitment | auto | `Task` (source AI) |
| Email draft | suggest | a task holding the draft — never sent |
| Qualification facts | auto | the applied proposal is the record |
| Meeting | suggest | booking drawer |
| Exclusion | suggest | exclusion drawer |

Policy: `SystemConfig automation.postCall`; defaults to « suggest » everywhere.

### Parallel dialing

Twilio has no native parallel or predictive dialer. The design composes documented primitives:

1. The SDR's browser joins a per-session `<Conference>` through the existing TwiML App (`dialerSessionId` param → voice webhook).
2. The server places prospect legs with REST `Calls.create`, `MachineDetection=Enable`, `AsyncAmd=true`.
3. On answer, the prospect hears silence (`<Pause>` then `<Hangup>`, so a lost decision closes the line by itself) while detection runs.
4. Human (or unknown, by default) verdict → **atomic reservation** of the SDR → REST redirect of that call into the conference (recording notice first) → every sibling released (an answered sibling hears who called).
5. The prospect's `participant-join` is the only signal that counts a conversation; it opens the `TelephonyCall` row so recording, transcript fallback, AI summary and the call card work unchanged.

Invariants and how they are enforced:

| Invariant | Mechanism |
|---|---|
| One conversation per SDR | `UPDATE … SET agentState='RESERVED' WHERE agentState='READY' AND reservedAttemptId IS NULL RETURNING`; lines only ring while the SDR is READY |
| A number never rings twice at once (any SDR) | partial unique index `DialAttempt(toNumber) WHERE state <> 'ENDED'` |
| One live session per SDR | partial unique index `DialerSession(sdrId) WHERE status <> 'ENDED'` |
| Late / duplicate / out-of-order events are harmless | pure `fold()` + compare-and-set; side effects only for the writer that won the transition; `DialerEvent.dedupeKey` |
| No stuck line or SDR | sweeper (cron every minute + throttled from heartbeats): ring/AMD/bridge timeouts, silent sessions, orphan reservations |
| Answered ≠ connected | `CONNECTED` only on conference join |

The two partial indexes live only in the migration (Prisma cannot express them). `prisma migrate dev` may propose dropping them: keep them.

## 3. Twilio: capabilities and limits to respect

- **AMD is probabilistic.** Verdict latency is typically a few seconds; `unknown` is frequent; people can be classified as machines and vice versa. The engine measures answer-to-SDR delay and abandon rate rather than assuming accuracy; `uncertain = bridge` by default.
- **Dead air** between « allô » and the bridge is inherent to AMD. Mitigations: short AMD timeout (6 s default), conservative line count, abandon ceiling with automatic fallback to one line.
- **Outbound calls per second**: new accounts default to 1 CPS. Parallel with N SDRs × 2 lines needs the account's CPS checked or raised.
- **Caller-ID reputation**: per-number daily quota (150 by default). Carrier spam labelling and branded calling (Voice Integrity, SHAKEN/STIR where applicable) are not handled here.
- **Webhook retries**: Twilio does not retry status callbacks by default. Correctness relies on idempotent folding and the sweeper, not on retries. Connection-override fragments were deliberately not used: their interaction with signature validation is unverified.
- **Recording** of bridged calls uses REST `Calls/{sid}/Recordings` (dual channel) after the notice. Live transcription of conference calls is not started: the summary uses the existing recording → transcription fallback (adds latency to the analysis).

## 4. Rollout and rollback

| Switch | Where | Default | Effect |
|---|---|---|---|
| `SMART_QUEUE` | container env | `shadow` | `off`: no scoring · `shadow`: explanations shown, legacy order · `on`: queue and Focus ordered by score |
| `DIALER_PARALLEL` | container env | unset (off) | Required for any parallel session. **Rollback = unset it**: open sessions end on their next heartbeat, webhooks are acknowledged and ignored |
| `parallelEnabled` | Paramètres → Téléphonie | false | Organisation opt-in |
| Post-call kinds | Paramètres → Téléphonie | suggest | Per-kind automation, capped |

Migration: `prisma/migrations/20261112100000_add_sales_execution_engine` (new tables only + two indexes on `TelephonyCall`; idempotent).

Cron: `dialer-sweep` every minute (registered in `lib/instance/cron-jobs.ts`).

## 5. Validation before enabling parallel mode (provider-dependent, not done yet)

1. One SDR, `maxLinesPerSdr = 1`, internal numbers: verify the agent leg joins, AMD callbacks arrive with `AnsweredBy`, the redirect bridges, recording completes and the call card shows the summary.
2. Two internal phones answering within one second of each other: exactly one bridged, the other hears the abandon message, `DialAttempt` outcomes `CONVERSATION` / `ABANDONED`.
3. Voicemail, busy, unreachable, rejected numbers: outcomes `VOICEMAIL` / `BUSY` / `FAILED` / `NO_ANSWER`, no SDR reservation.
4. Close the tab mid-ring and mid-conversation; kill network for 2 min: session ends, lines cancelled, nothing left live after the sweep.
5. Measure on 200+ real attempts: median and p90 answer-to-SDR delay, abandon rate, AMD verdict distribution, `unknown` share. Only then consider 2 lines.
6. Under load through the production pooler: concurrent reservations (PGlite proves the logic, not lock behaviour under the pooler).
7. Legal: confirm for each market the rules on abandoned calls, calling hours, B2B vs consumer prospecting, recording consent wording and opt-out handling.

## 6. Tests

```
npm run test:qualification   # engine + loader SQL on PGlite
npm run test:post-call       # policy, proposals, evidence verification, metrics SQL
npm run test:dialer          # state machine, store SQL, orchestrator end to end (fake Twilio)
```

The orchestrator suite covers: concurrent answers, duplicate and late events, voicemail, uncertain detection, provider failure, agent leaving, pause with a live call, sweeper timeouts, calling hours, a number ringing for another SDR, caller-id quota, organisation switch off. Mutation check: removing the `READY` guard of the reservation fails 4 tests.

## 7. Not done / next

- Live verification against a Twilio account (section 5).
- Per-mission targeting editor (stored format documented above; no UI yet).
- Confirmed facts (`RECORD_FACTS` applied) are not yet fed back into the qualification score.
- Real-time transcription and in-call assistance for conference calls.
- Unanswered parallel attempts are counted in `DialAttempt` but only become `Action`s when the provider-outcome kind is automatic; until then the queue's attempt history does not see them (the dialer itself never redials them within 24 h).
- Email drafts land in a task, not in the Email Hub (needs mailbox resolution).
