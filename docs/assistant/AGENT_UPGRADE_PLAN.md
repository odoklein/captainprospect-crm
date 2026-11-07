# Assistant Projet — evidence-first upgrade: audit and plan

Date: 2026-10-25 · Scope: the manager Assistant Projet (`/manager/assistant`, project panel).
Companion docs (proposals, not verified): `ASSISTANT_V2_BLUEPRINT.md`, `ASSISTANT_AGENT_REVIEW.html`.

## 1. Verified architecture (read from code, not from the review)

| Layer | File | What it really does |
|---|---|---|
| Identity | `requireRole(["MANAGER"])` in every route | Session-derived; user row re-read in `buildAssistantContext` (role, isActive, permissions incl. per-user overrides). |
| Envelope | `lib/ai/tools/context.ts` | Project comes from the **stored conversation row**, never the request body. Mission/client mismatch → error. Any MANAGER may bind any client (consistent with the rest of the app). |
| Registry | `lib/ai/tools/registry.ts` | 34 tools: 23 read, 3 safe_write, 8 confirm. One list = review checkpoint. |
| Guard | `lib/ai/tools/guard.ts` | Pure: active → role → permissions → project → write budget; zod parse. |
| Executor | `lib/ai/tools/executor.ts` | Guard + execute + scrub; failures returned to the model, not thrown; safe writes logged to `AssistantActionLog`. |
| Loop | `lib/ai/tools/loop.ts` | ≤5 model round-trips, ≤8 tool calls, tools withdrawn at budget 0. A confirm tool in a batch ends the turn with a card. |
| Provider | `lib/ai/openai.ts` | Raw `fetch` to Chat Completions. **No timeout, no AbortSignal, no retry, no streaming.** |
| Routes | `app/api/manager/assistant/{chat,execute,conversations}` | History read from DB (last 20 msgs). Turn persisted in one `$transaction` **after** the loop. |
| UI | `components/assistant-ui/ChatWorkspace.tsx`, `Thread.tsx` | Single JSON response. `ThinkingStatus` shows steps **guessed from the question** (not real). "Stop" only stops waiting. |

### Request traces
- **Read** ("combien de RDV ?"): chat route → context → loop iter 1 (model → `get_mission_metrics`) → executor (guard, zod, Prisma scoped by `campaign.missionId`) → wrapped untrusted payload → iter 2 answer → one transaction writes USER + ASSISTANT messages.
- **Multi-tool**: same, tool calls of one model message run **sequentially**; trace accumulates; nothing of the tool payloads survives the turn.
- **Safe write** (`create_task`): executes inside the loop, budget −1, action log row written immediately — **outside** the turn transaction.
- **Confirm** (`send_draft`): loop sees risk=confirm → `describe(rawArgs)` → card stored on the ASSISTANT message as `action.state="pending"` → `/execute` re-reads the stored action, re-validates with `authorizeToolCall`, executes, sets `confirmed`.

## 2. Findings (each verified in code)

| # | Severity | Finding |
|---|---|---|
| F1 | **High** | `/execute` is check-then-act: two concurrent clicks both read `state=pending` and both execute (double email send). No atomic claim. |
| F2 | High | Confirm proposals call `describe()` with **unvalidated** model JSON and without the guard (role/permission/project). Invalid args crash into a leaked JS error message; the unvalidated args are what gets stored. |
| F3 | High | No provider timeout or turn deadline: a stalled OpenAI request holds the route until the platform kills it. |
| F4 | Medium | Client "Stop" does not cancel the server; tool calls and safe writes continue. |
| F5 | Medium | If the turn fails after a safe write, neither the user message nor the write appears in the conversation (log row only) → retry can duplicate the write. |
| F6 | Medium | Tool results vanish after the turn; follow-ups must re-fetch (prompt rule 8). No evidence, no citations. |
| F7 | Medium | No verification of numbers. Metrics tools expose only `periodeJours` (rolling), and the prompt/UI suggestions ask "ce mois-ci" → period mismatch is likely and invisible. |
| F8 | Low | Non-OpenAI errors return `error.message` to the browser (can leak Prisma text). |
| F9 | Low | Cost: stored usage has no `model`, so `/api/ai/usage` always prices at gpt-4o-mini. UI badge hard-codes the model name. |
| F10 | Low | Pending actions never expire; a week-old card can still be executed. |
| F11 | Info | Concurrent turns on one conversation are not prevented (double submit → double safe write). |
| F12 | Info | Test coverage: `guard.test.ts` only (25 pure tests, passing). Nothing covers loop, executor, routes, UI. |

The review's main claims (allowlist, pure guard, re-validation at execute, scrubbing, project from envelope) hold. Its "re-read and re-validate" claim holds for execution but not for proposal (F2), and it does not mention F1.

## 3. Plan

Small, layered changes; the registry, guard, zod schemas, risk tiers and tool bodies stay.

1. **Baseline** (before any change): `lib/ai/agent/evals/` scenarios + fixture tools (no DB), run against the current loop with the real model → `docs/assistant/baseline.json`.
2. **Phase 0 reliability** — `lib/ai/openai.ts` (signal, timeout, typed retryable errors, streaming parser), `lib/ai/agent/{models,retry,deadline}.ts`, runtime with cancellation, NDJSON streaming from `/chat` (JSON kept for non-stream callers), `maxDuration`, persistence of partial/failed/cancelled turns.
3. **Fixes F1, F2, F10, F11** — atomic claim (`executing` state via conditional update), validated `describe`, 24 h expiry, one running turn per conversation.
4. **Phase 1 evidence ledger** — `AssistantRun` + `AssistantEvidence` (one migration, additive). Per read: argsHash, scope ids from ctx, status OK/EMPTY/ERROR, compact summary, numeric facts, period, digest; payload snapshot only for a short TTL (reuse window), nulled on expiry; retention 90 days; cascade on conversation delete. Model sees per-turn labels `E1…`, never DB ids. `GET /api/manager/assistant/evidence/[id]` re-checks ownership + scope.
5. **Verification** — deterministic claim extraction (numbers, %, periods, entities, dates) against evidence facts with unit, period and entity checks and recomputed ratios/sums; one bounded repair call; remaining failures marked inline and listed. Structured contract `{answer, citations, status, unverifiedClaims, verification}`.
6. **UI** — streamed text, real tool progress (replaces guessed steps), real cancel, typed errors + retry, citation chips with evidence popover, verification badge. Same design system.

### Acceptance criteria (measurable)
- A1 First streamed byte < model TTFB + 100 ms; text visible before the final event (asserted in runtime test).
- A2 Provider stall → turn ends with `timeout` within `ASSISTANT_TURN_DEADLINE_MS` (+1 s) (fake-clock test).
- A3 429/5xx/network retried ≤ `ASSISTANT_MAX_RETRIES` with backoff; 400/401/validation/authorization never retried (tests).
- A4 Every executed read produces a persisted evidence row before the final event; evidence endpoint denies other users / other scopes (tests).
- A5 Numeric claims verified only with matching value, unit, period and entity; mismatches flagged (tests incl. period and denominator traps).
- A6 After a failed repair the answer carries inline "non vérifié" markers and `status: "partial"` (test).
- A7 Existing 25 guard/redaction tests still pass; new tests for duplicate execute, describe validation.
- A8 Baseline vs post-change eval numbers in `docs/assistant/EVAL_RESULTS.md`.

### Risks
- Migration must be applied before evidence is persisted; code degrades (answers still verified in-memory, citations not openable, flagged) if the tables are missing.
- Verification is heuristic on French text: false "non vérifié" flags are preferred over false confirmations.
- Live eval spends a few cents of OpenAI on synthetic fixtures only; no CRM data leaves.
