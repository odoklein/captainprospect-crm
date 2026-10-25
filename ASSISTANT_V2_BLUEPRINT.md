# Assistant Projet v2 — Implementation Blueprint

**Status:** proposal for approval · 25 October 2026
**Companion:** `ASSISTANT_AGENT_REVIEW.html`
**Scope:** the manager-facing Assistant Projet in this CRM. The SDR/help assistant and its
documentation corpus are out of scope.

This blueprint keeps every safety decision already in the codebase and adds the four missing
loops: **plan, evidence, verification, memory**. It is additive. No rewrite of the tool
catalogue, the guard or the confirmation flow.

---

## 0. Premise

Today the assistant is a supervised tool loop:

- one bound project per conversation;
- 34 tools behind an allowlist;
- a pure guard for role, permission, project and budget;
- confirm tools that stop the loop and wait for a click;
- a stored pending action re-read and re-validated on execution;
- secrets scrubbed from every payload;
- cost and trace stored with each turn.

It is safe enough to run. It is not yet able to:

1. keep the evidence it retrieved;
2. say which evidence supports a figure;
3. plan a request that needs several sources;
4. check its own answer before the manager reads it;
5. remember project facts between threads;
6. prove that a prompt or model change did not regress quality.

**Non-goals.** General computer use, shell or filesystem access, autonomous outbound email,
cross-project memory, open-ended loops, self-graded success.

---

## 1. Design principles

1. **Scope is structural.** The project comes from the envelope, never from model arguments.
2. **No fact without evidence.** Every number, date or named entity in an answer maps to an
   evidence id the manager can open.
3. **Plan only when needed.** Single-tool requests keep today's latency. Planning is a branch,
   not a tax on every turn.
4. **Bounded autonomy.** Reads run freely, safe writes are budgeted and reversible,
   irreversible actions wait for a human.
5. **Context is compiled.** System, tools, history, evidence and output live inside one declared
   budget. Nothing is appended "just in case".
6. **Verify, then speak.** A failed check repairs once, then reports the limit honestly.
7. **Measure or don't ship.** A prompt, tool or model change without an eval run is an opinion.

---

## 2. Target module map

```text
lib/ai/
  agent/
    envelope.ts        # moved from tools/context.ts; same AssistantContext contract
    planner.ts         # classify + PlanStep[] + exit condition
    runtime.ts         # moved from tools/loop.ts; step execution, parallel reads, cancel
    models.ts          # role → model id, fallback, per-run token ceiling
  context/
    compiler.ts        # assemble the model input within budget
    budget.ts          # section accounting and truncation policy
    tool-groups.ts     # agency | project | access | comms | all
  tools/
    registry.ts        # unchanged: one list, one review checkpoint
    guard.ts           # unchanged: pure allow/deny
    executor.ts        # add evidence id + timing to ToolExecutionResult
    definitions/*      # unchanged tool bodies
  evidence/
    ledger.ts          # append, digest, lookup, expire
    citation.ts        # answer span → evidence id
  verify/
    extract.ts         # numbers, dates, entities, claims
    checks.ts          # trace, scope, card, policy
    verifier.ts        # pass | repair | block
  memory/
    summary.ts         # rolling conversation summary
    facts.ts           # durable project facts and decisions
  actions/
    broker.ts          # outbox, idempotency, expiry, undo
  observability/
    trace.ts           # AgentRun spans
    metrics.ts         # groundedness, re-fetch, cost, latency
evals/agent/
  golden/*.json
  run.ts
  judge.ts
```

**Rule:** `verify/` may read `evidence/`; `evidence/` never imports `verify/`. `memory/` may
read evidence ids but never payloads. `context/` is the only module allowed to decide what the
model sees.

---

## 3. Core contracts

```ts
// ---- existing, unchanged shape ----
export interface AssistantContext {
  userId: string;
  userName: string;
  role: UserRole;
  isActive: boolean;
  permissions: string[];
  project: ProjectBinding | null;   // { clientId, clientName, missionId, missionName }
  resolvedAt: Date;
  autoWriteBudget: number;
  conversationId: string | null;
}

// ---- planning ----
export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface PlanStep {
  id: string;                 // "s1"
  intent: string;             // imperative, one line
  tool?: string;              // optional: a step can be pure synthesis
  args?: Record<string, unknown>;
  dependsOn?: string[];       // step ids; empty/undefined = parallel-safe
  status: StepStatus;
  error?: string;
}

export interface Plan {
  mode: "simple" | "multi";
  steps: PlanStep[];          // 1..6
  exit: "answer" | "action_card" | "clarify";
  createdAt: string;
}

// ---- tools + evidence ----
export interface ToolResult<T = unknown> {
  tool: string;
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
  durationMs: number;
  evidenceId?: string;        // set on success
}

export interface EvidenceItem {
  id: string;                 // "ev_..."
  runId: string;
  conversationId: string;
  clientId: string;
  missionId: string | null;
  tool: string;
  argsHash: string;           // sha256 of canonical JSON args
  summary: string;            // ≤ 600 chars, model-safe digest
  payloadRef: string;         // storage key; never sent to the model
  createdAt: string;
  expiresAt: string | null;
}

export interface EvidenceDigest {
  id: string;
  tool: string;
  at: string;                 // ISO
  summary: string;
  truncated: boolean;
}

// ---- answer ----
export interface AgentAnswer {
  text: string;
  citations: string[];        // evidence ids present in text
  plan: Plan;
  action?: PendingAction;
  verified: boolean;
  verification?: {
    checked: number;
    traced: number;
    repaired: boolean;
    failures: string[];
  };
}

// ---- memory ----
export interface ProjectFact {
  id: string;
  clientId: string;
  missionId: string | null;
  key: string;                // "contract_days_per_week"
  value: string;
  sourceEvidenceId: string | null;
  confidence: "stated" | "inferred";
  updatedAt: string;
  expiresAt: string | null;   // null = durable until contradicted
}

// ---- actions ----
export type ActionState = "pending" | "executing" | "confirmed" | "failed" | "cancelled" | "expired";

export interface PendingAction {
  id: string;
  conversationId: string;
  messageId: string;
  tool: string;
  args: Record<string, unknown>;
  idempotencyKey: string;     // sha256(conversationId + tool + canonical args)
  state: ActionState;
  createdAt: string;
  expiresAt: string;          // proposed: 24 h
  undoToken?: string;         // safe_write only
}

// ---- evals ----
export interface EvalCase {
  id: string;
  category: "lookup" | "synthesis" | "followup" | "action" | "scope" | "security";
  input: string;
  context: { clientId: string; missionId: string | null } | null;
  expectedTools: string[];
  forbiddenTools: string[];
  expectedFacts: Array<{ label: string; value: string }>;
  rubric?: string;
}
```

---

## 4. Request lifecycle

```ts
// app/api/manager/assistant/chat — shape after P2
const ctx = await buildAssistantContext(...);          // unchanged
const history = await loadHistory(...);                 // text + digests
const plan = await planRequest({ ctx, history, message });
const input = await compileContext({ ctx, plan, history, message });
const run = await executePlan({ ctx, plan, input });     // tools + ledger
const draft = await writeAnswer({ ctx, plan, run });
const verdict = await verifyAnswer({ ctx, run, draft }); // may repair once
const saved = await persistTurn({ ctx, plan, run, verdict });
return verdict.blocked ? honestLimit(verdict) : answerWithCitations(saved);
```

### 4.1 Classification

`planRequest` returns `mode: "simple"` when all of these hold:

- one intent, no comparison, no period-over-period, no list-then-act;
- at most one tool group is needed;
- the request does not name more than one client, mission or person.

Otherwise `mode: "multi"`, max 6 steps. The classifier is a cheap model call with a strict JSON
schema, and a deterministic keyword fallback. A misclassification costs one extra step, not a
failed request.

### 4.2 Execution

- Steps with no `dependsOn` run concurrently, capped at 4.
- A step whose dependency failed is marked `skipped`; the plan is revised once.
- Every successful tool call appends one `EvidenceItem`.
- The turn's tool budget is spent per step; the old global cap stays as a backstop.
- A `confirm` tool never executes: the runtime stops, returns a card proposal, and the plan's
  exit becomes `action_card`.

### 4.3 Answer + verify

- The answer is generated with the evidence digests in context and an explicit citation rule.
- `verifyAnswer` runs checks in order, cheapest first.
- One repair attempt is allowed with the failures appended as instructions.
- If the second draft still fails, the answer keeps only traced claims and states what could not
  be confirmed. It is never silently returned as if verified.

---

## 5. Context compiler

### 5.1 Budget

Proposed defaults, configurable per model:

| Section | Share of input budget | Rule |
|---|---:|---|
| System prompt | 15% | Fixed; versioned. |
| Tool schemas | 25% | One tool group, not all 34. |
| History | 20% | Last N turns + rolling summary. |
| Evidence | 30% | Digests ranked by recency and relevance. |
| Reserve | 10% | Room for one repair round. |

Start with a 12 000-token input budget. Measure before changing it. The budget is enforced by
the compiler, not by hope.

### 5.2 Tool groups

| Group | Tools | When |
|---|---|---|
| `agency` | overview, attention, agency metrics, cross-project search, help | no project bound |
| `project` | project overview, task boards, documents, recap, playbook | structural questions |
| `access` | credentials, gaps, proposals, activity, account actions | access questions |
| `comms` | drafts, read draft, send draft, onboarding send | email work |
| `tracking` | mission metrics, meetings, feedback, campaign status, lists | performance questions |
| `all` | everything accessible | explicit "I don't know where to look" or repair |

Selection is deterministic from the plan's intents, with `all` as the fallback. This alone cuts
the schema payload and improves tool choice.

### 5.3 Compaction

- After 12 messages, summarise the oldest half into a 150-word brief: decisions, figures,
  open questions, evidence ids.
- The summary is stored on the conversation, not regenerated each turn.
- Never summarise a pending action; its card is authoritative.
- History replayed to the model keeps user text verbatim and compresses assistant text.

### 5.4 Evidence digest format

```text
[ev_01HX…] get_mission_metrics · 2026-10-25T09:14Z
Appels 412 · connects 96 (23,3 %) · RDV 21 (21,9 % des connects) · période 30 j
```
One to three lines. The payload stays behind `payloadRef` and is fetched only when the model
asks a follow-up that needs detail, or when the manager opens the source.

---

## 6. Evidence ledger

**Write path:** `executor` → `ledger.append()` → returns `evidenceId` → runtime adds a digest to
the turn.

**Storage:** a table plus an object/file reference for payloads. Payloads may contain personal
data; they inherit the retention of the project and are never placed in the model context in
full.

**Expiry by tool class (proposed):**

| Class | TTL | Reason |
|---|---|---|
| Counts and metrics | 15 min | Changes with live activity. |
| Meetings and feedback | 1 h | Changes after calls. |
| Documents and recaps | 7 days | Stable source material. |
| Credentials metadata | 5 min | Sensitive and volatile. |
| Agency overview | 30 min | Aggregate. |

**Citations.** `citation.ts` maps claim spans to `evidenceId`. The UI shows a numbered source
chip per claim group; clicking opens the payload summary and timestamp.

**Re-fetch rule.** Before a tool call, the runtime computes `argsHash`. If a non-expired item
with the same tool and hash exists in this conversation, the digest is reused and the call is
skipped. This is the direct fix for the current "re-fetch what you already had" instruction.

---

## 7. Verifier

### 7.1 Checks, in order

1. **Scope.** Every entity in the answer belongs to the bound client/mission, or the answer
   explicitly says it is agency-wide.
2. **Trace.** Every number, date and currency amount appears in at least one evidence summary
   for this run. Normalise French formatting before comparison (`23,3 %` ↔ `23.3`).
3. **Entity.** Every named client, person or campaign appears in evidence, not invented.
4. **Action card.** If an action is proposed, the card was built by `describe()` and its args
   hash matches the proposed args.
5. **Policy.** No secret-shaped string in the output; no promise of an action that needs a click.
6. **Completeness.** Every plan step is `done`, `skipped` with a reason, or named as unresolved.

### 7.2 Failure policy

| Failure | Action |
|---|---|
| Untraced number | Repair once with the evidence and the offending span. |
| Untraced entity | Repair once; if still absent, remove the entity or state it is unconfirmed. |
| Scope violation | Block. Never repair by widening scope. |
| Card mismatch | Block the card, keep the prose answer. |
| Secret detected | Block the whole turn, log a security event. |
| Incomplete plan | Answer with an explicit "not covered" list. |

### 7.3 What the verifier is not

It is not a second opinion on tone, strategy or usefulness. It checks mechanical traceability
and policy. A model judge may score clarity in evals, but never gates a live answer on style.

---

## 8. Planner

**Input:** message, last 4 turns, active project, available tool groups.
**Output:** the `Plan` contract, strict JSON, one retry on schema failure.

Rules:

- 1–6 steps; a step has one intent and at most one tool.
- Reads are parallel unless a dependency is explicit.
- A write is always the last step and never automatic.
- The plan is shown in the trace, not in the answer, unless the manager expands it.
- The plan is persisted on `AgentRun` so a failed turn can be diagnosed later.

**Revision.** On a failed step: one revision may replace that step or add a prerequisite. The
revision cannot add a new tool group or exceed 6 steps.

---

## 9. Memory

Two layers, both project-scoped:

1. **Conversation summary** — rolling, 150 words, refreshed every 12 messages.
2. **Project facts** — key/value, source evidence, confidence, expiry.

Write a fact only when:

- the value comes from a tool result or an explicit manager statement;
- the key is on a small allowlist (contract days, ICP, playbook version, sender mailbox,
  decision, open issue, stakeholder role);
- the fact does not duplicate an existing value.

Invalidate a fact when a newer evidence item contradicts it. Never merge facts across clients.
Never store a password, token or full email body in memory.

The context compiler injects at most 12 facts, ranked by recency and relevance to the plan.

---

## 10. Action broker

State machine:

```text
proposed → pending → executing → confirmed
                    ↘ failed
         ↘ cancelled / expired
```

- `idempotencyKey` is unique in the database. A duplicate insert returns the existing action.
- Pending actions expire (proposed: 24 h); the UI shows "expired, ask again" instead of a dead button.
- Execution is guarded by `state = pending` in a conditional update, so two clicks cannot both win.
- Safe writes receive an `undoToken`; undo is a compensating tool, not a database rollback.
- Every transition is appended to the audit log with actor and timestamp.

---

## 11. Safety and policy

Preserve, do not reinterpret:

- allowlist registry;
- pure guard (no I/O, fails closed);
- role and permission gates;
- project binding from the envelope;
- risk tiers;
- confirm cards resolved from the database;
- secret scrubbing and the server → UI secret path;
- audit log.

Add:

- provenance tags on every untrusted string (`source: prospect_note | client_text | document`);
- the verifier's secret check as a second line;
- a per-run token ceiling and a per-user daily cap;
- a security event log for blocked turns.

The regex injection filter stays as defence in depth, but it is no longer described as the
boundary. The boundary is the tool allowlist plus the verifier.

---

## 12. Data model additions

```prisma
model AgentRun {
  id             String   @id @default(cuid())
  conversationId String
  plan           Json?
  status         String   // running | answered | blocked | failed
  model          String
  promptTokens   Int      @default(0)
  completionTokens Int    @default(0)
  costEur        Decimal  @default(0)
  latencyMs      Int      @default(0)
  verdict        Json?
  createdAt      DateTime @default(now())
}

model EvidenceItem {
  id             String   @id @default(cuid())
  runId          String
  conversationId String
  clientId       String
  missionId      String?
  tool           String
  argsHash       String
  summary        String
  payloadRef     String
  createdAt      DateTime @default(now())
  expiresAt      DateTime?
  @@index([conversationId, tool, argsHash])
}

model ProjectFact {
  id               String   @id @default(cuid())
  clientId         String
  missionId        String?
  key              String
  value            String
  sourceEvidenceId String?
  confidence       String
  updatedAt        DateTime @updatedAt
  expiresAt        DateTime?
  @@unique([clientId, missionId, key])
}

model PendingAction {
  id             String   @id @default(cuid())
  messageId      String
  conversationId String
  tool           String
  args           Json
  idempotencyKey String   @unique
  state          String
  createdAt      DateTime @default(now())
  expiresAt      DateTime
  undoToken      String?
}
```

`EvidenceItem.payloadRef` points to storage; the payload itself is not duplicated in Postgres.

---

## 13. Observability

Per run, record: plan, steps, tool calls, evidence ids, tokens by phase, cost, latency, verdict,
repair count, model ids.

Metrics:

- grounded answer rate;
- tool success rate by tool;
- re-fetch rate (same `argsHash` in one conversation);
- plan completion;
- cost per resolved question;
- confirmation acceptance rate;
- p50 and p95 latency, reported separately.

Trace review: 20 runs per week, failure labels, promote new shapes into golden cases.

---

## 14. Evals

### 14.1 Format

```json
{
  "id": "lookup-003",
  "category": "lookup",
  "input": "Combien de RDV avons-nous pris ce mois-ci ?",
  "context": { "clientId": "c_decathlon", "missionId": "m_q4" },
  "expectedTools": ["get_mission_metrics"],
  "forbiddenTools": ["get_agency_metrics"],
  "expectedFacts": [{ "label": "rdv", "value": "21" }],
  "rubric": "States the period and the source."
}
```

### 14.2 Runner

1. Seed a deterministic fixture database.
2. Run each case through the real planner, runtime and verifier (no mocks of the loop).
3. Rule assertions first: tools called, forbidden tools absent, facts present, citations valid.
4. A model judge only for clarity and explanation, never for fact correctness.
5. Fail the build on any rule assertion; report judge scores without gating.

### 14.3 Categories (proposed 40)

8 lookup · 8 synthesis · 6 follow-up · 8 action · 6 scope · 4 security.

Include at least one case per known failure shape and three deliberately ambiguous requests.

---

## 15. Phase checklist

### P0 — resilience (S)

- [ ] AbortSignal + timeout on the provider fetch.
- [ ] One retry with backoff on 429/5xx; typed error after the second failure.
- [ ] Model id and fallback from configuration.
- [ ] Streaming to the panel; cancellation closes the stream.
- [ ] Architecture doc corrected to the real provider, caps and loop.
- [ ] Per-user rate limit on `/chat`.

**Exit test:** kill the provider mid-call; the UI shows a typed error within the timeout; no
orphaned "thinking" state; a retry succeeds.

### P1 — evidence (M)

- [ ] `EvidenceItem` table + ledger module.
- [ ] Executor returns `evidenceId`; runtime appends a digest.
- [ ] History loads digests, not raw payloads.
- [ ] Re-fetch suppression by `argsHash`.
- [ ] Answer carries citations; panel shows a source tray.
- [ ] Retention/expiry job.

**Exit test:** ask a question, then a follow-up; the second turn reuses evidence and the number
matches; every figure has a source chip.

### P2 — planning + context (M)

- [ ] Tool groups and a deterministic selector.
- [ ] Compiler with section budget and truncation.
- [ ] Rolling summary after 12 messages.
- [ ] Planner with strict schema and 6-step cap.
- [ ] Parallel reads with a concurrency cap.
- [ ] Plan shown in the trace.

**Exit test:** a three-part question produces a plan, completes all steps, and stays inside the
declared token budget; a simple lookup still makes one model call.

### P3 — verification + evals (L)

- [ ] Claim extraction and trace checks.
- [ ] Scope, card, policy and completeness checks.
- [ ] One repair round with explicit failure reasons.
- [ ] Golden set + runner + CI job.
- [ ] Metrics dashboard.

**Exit test:** an injected wrong figure is blocked or repaired; a prompt change that breaks a
golden case fails CI.

### P4 — memory + actions (M)

- [ ] Project facts with source and expiry.
- [ ] Fact invalidation on contradiction.
- [ ] Outbox with idempotency key and expiry.
- [ ] Undo for safe writes.
- [ ] Memory review screen for the manager.

**Exit test:** a new thread knows an agreed fact; a duplicated click cannot send twice; an undo
restores the previous state.

---

## 16. File-by-file change list

| File | Action |
|---|---|
| `lib/ai/tools/context.ts` | Move to `agent/envelope.ts`; keep the contract. |
| `lib/ai/tools/loop.ts` | Move to `agent/runtime.ts`; replace the fixed iteration loop with step execution; keep confirm stopping. |
| `lib/ai/tools/registry.ts` | Keep; add group metadata per tool. |
| `lib/ai/tools/guard.ts` | Keep; no semantic change. |
| `lib/ai/tools/executor.ts` | Add evidence append + `evidenceId` + timing. |
| `lib/ai/tools/redact.ts` | Keep; add provenance tags. |
| `lib/ai/openai.ts` | Add timeout, abort, retry, streaming; remove the hard-coded default from callers. |
| `app/api/manager/assistant/chat/route.ts` | Orchestrate plan → context → run → verify → persist; stream. |
| `app/api/manager/assistant/execute/route.ts` | Route through the broker; keep the stored-action re-read and 409. |
| `lib/assistant/projet/systemPrompt.ts` | Version, add answer shape, citation rule, failure rule, two examples. |
| `components/assistant-ui/*` | Source tray, plan disclosure, streamed text, expired card state. |
| `AI_ASSISTANT_ARCHITECTURE.md` | Rewrite to match the code; mark proposals separately. |
| `package.json` | Add `test:agent-evals`. |

---

## 17. Risks and open decisions

| Decision | Recommendation |
|---|---|
| Payload storage for evidence | Object storage with project-scoped retention, not a Postgres JSON column. |
| Planner model | Strongest available; cheap deterministic fallback if the call fails. |
| Streaming protocol | SSE from the route; keep JSON as a fallback for old clients. |
| Fact allowlist | Start with 7 keys; expand only with review. |
| Pending-action expiry | 24 h, configurable; show expiry in the card. |
| Eval fixture data | Synthetic, versioned, never production personal data. |

**Open question for the product owner:** should the manager be able to see and edit project
facts (the memory review screen), or should facts stay invisible and only surface as citations?
Recommendation: visible and editable, because a wrong memory is worse than no memory.

---

## Appendix A — prompt additions

Add to the system prompt, in this order:

1. **Answer shape.** "For any figure: value, period, source. If a figure is missing, say so.
   Never estimate a number that a tool could return."
2. **Citation rule.** "Every number, date and named entity must come from a tool result in this
   turn. The system attaches the citations; do not invent identifiers."
3. **Failure rule.** "If a check rejects a claim, repair once using the evidence. If it still
   fails, remove the claim and state what could not be confirmed."
4. **Two worked traces.** One read (question → tool → figures → answer), one confirm (proposal →
   card → no execution).
5. **Unknowns.** "Say 'je n'ai pas cette donnée' rather than filling the gap with a plausible
   value."

## Appendix B — tool description template

```text
<What it returns, in one sentence.>
Use when: <the question shape that should trigger it>.
Do not use when: <the neighbouring tool that fits better>.
Returns: <fields, units, period semantics>.
Scope: <project | agency>; <read | safe_write | confirm>.
```

Every definition should carry this template. Descriptions are part of the interface, not
comments.
