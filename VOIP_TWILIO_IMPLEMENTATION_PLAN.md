# VoIP + AI Calling — Implementation Plan (Twilio migration)

> **Status:** proposal, no code written.
> **Scope decision taken:** migrate outbound calling from WithAllo (`tel:` handoff) to **Twilio Programmable Voice** with an in-browser softphone inside `/sdr/action`.
> **Golden rule:** the human speaks, the AI prepares, assists and files the paperwork.

---

## 1. Where we are today

| Capability | Today | File |
|---|---|---|
| Dialing | `tel:` handoff to the OS softphone. The browser never learns that a call happened. | `app/sdr/action/page.tsx:883` (+3 other `tel:` sites at 1941, 2816, 2965) |
| Call ↔ CRM linking | Heuristic. Polls WithAllo after the action is saved and matches on phone + a **whole-calendar-day** window. | `lib/call-enrichment/enrich-action.ts` |
| Trigger | Fire-and-forget `after()` on action create, in-process queue (concurrency 1). | `app/api/actions/route.ts:141`, `lib/call-enrichment/scheduler.ts` |
| Transcript / summary / recording | Fetched from WithAllo, written onto `Action`. | `Action.callSummary`, `callTranscription`, `callRecordingUrl`, `callEnrichmentAt`, `callEnrichmentError` |
| Fallback when matching fails | A manual "which Allo call was it?" picker in the SDR UI. | `alloDialogCalls` / `linkedAlloCall` state in the action page |
| Call intelligence (elsewhere) | Leexi — recaps, playbook generation. | `lib/leexi/service.ts`, `lib/playbook/generate-sales-playbook.ts` |
| LLM / STT in-house | Mistral (`mistral-large-latest`) + Voxtral for audio. | `lib/ai/mistral.ts`, `lib/ai/mistral-transcribe.ts` |

### The one problem worth fixing first

`enrich-action.ts` normalizes every phone shape (`+33` / `0033` / `07 57 59…`), pages up to 15 pages of WithAllo history, throttles itself to one line at a time (`LINE_GAP_MS = 400`), retries 429s six times — and still fails often enough that a manual picker had to be built.

**Every line of that exists because the CRM does not own the call.** Once the dialer lives in the browser, we hold a `providerCallSid` from the moment of dial. Matching stops being a heuristic and becomes a foreign key. That single change deletes more code than the rest of this plan adds.

---

## 2. Target architecture

```
  Browser (/sdr/action)
    └─ Twilio Voice JS SDK (WebRTC)  ──audio──▶  Twilio Voice
         │  device.connect({ To, params })            │
         │  returns call.parameters.CallSid           │
         ▼                                            ▼
   POST /api/voice/calls              POST /api/voice/webhooks/twilio/*
   (create Call row, status=DIALING)  (answered / completed / recording-ready)
         │                                            │
         └──────────────┬─────────────────────────────┘
                        ▼
                  Call (Prisma)  ──▶ transcription (Voxtral)
                        │          ──▶ extraction (Mistral large, JSON mode)
                        ▼
              Action autofill in the SDR modal → SDR confirms in one click
```

Deliberate omissions in v1: no live audio fork, no real-time co-pilot. Reasons in §7.

---

## 3. Schema

The current design hangs call data off `Action`. That breaks down as soon as the CRM owns the call, because:

- a call that goes unanswered produces **no** `Action`, yet we still want the attempt logged;
- one `Action` ("rappel demandé") may follow **three** dial attempts;
- the webhook fires **before** the SDR has saved the action.

So: a first-class `Call` model, with `Action` linking to it rather than the reverse.

```prisma
enum CallDirection { OUTBOUND INBOUND }

enum CallStatus {
  DIALING RINGING IN_PROGRESS COMPLETED
  NO_ANSWER BUSY FAILED CANCELED
}

model Call {
  id              String        @id @default(cuid())
  providerCallSid String        @unique          // Twilio CallSid — the whole point
  provider        String        @default("twilio")

  sdrId     String
  sdr       User     @relation("SDRCalls", fields: [sdrId], references: [id])
  contactId String?
  contact   Contact? @relation(fields: [contactId], references: [id], onDelete: SetNull)
  companyId String?
  company   Company? @relation(fields: [companyId], references: [id], onDelete: SetNull)
  campaignId String?
  campaign   Campaign? @relation(fields: [campaignId], references: [id], onDelete: SetNull)

  direction CallDirection @default(OUTBOUND)
  status    CallStatus    @default(DIALING)
  fromNumber String
  toNumber   String
  startedAt  DateTime  @default(now())
  answeredAt DateTime?
  endedAt    DateTime?
  duration   Int?                              // seconds, billable leg

  recordingUrl      String?
  recordingSid      String?
  transcription     String?  @db.Text
  transcriptionAt   DateTime?
  aiSummary         String?  @db.Text
  aiExtraction      Json?                      // the structured post-call payload (§4, P2)
  aiError           String?

  // consent / retention (see §8)
  recordingConsent  Boolean  @default(false)
  purgeAfter        DateTime?

  action   Action? @relation(fields: [actionId], references: [id], onDelete: SetNull)
  actionId String? @unique

  createdAt DateTime @default(now())

  @@index([sdrId, startedAt])
  @@index([contactId])
  @@index([companyId])
  @@index([status])
}
```

`User` gains `twilioPhoneNumber String? @unique` alongside the existing `alloPhoneNumber`, so both providers can coexist during cutover.

**Keep** `Action.callSummary` / `callTranscription` / `callRecordingUrl` for the whole migration — the historical WithAllo data lives there, and `/api/client/calls`, `/api/clients/[id]/recent-calls` and the manager prospection views read them. New reads should fall back: `action.call?.aiSummary ?? action.callSummary`.

Migration files go in `prisma/migrations/` following the existing dated convention (`20260921140000_add_ticket_validation_queue`).

---

## 4. Phase plan

Estimates are dev-days for one engineer already fluent in this codebase, excluding review and QA. Twilio regulatory lead time runs in parallel and is **not** dev time.

### P0 — Foundations · 3–5 d (+ 1–3 weeks regulatory lead time)

1. Twilio account, sub-account per environment, TwiML App, API keys.
2. **French DID acquisition.** France requires proof of address / local presence for geographic numbers — start this first, it is the long pole. Decide port-vs-new per number (porting keeps the numbers prospects already recognize and have whitelisted; new numbers are instant but reset your answer-rate baseline).
3. `Call` model + migration + `User.twilioPhoneNumber`.
4. `lib/voip/` skeleton mirroring the provider-interface pattern already used in `lib/call-enrichment/provider.ts`, so Twilio sits behind an interface rather than being sprayed through the app.

**Gotcha — middleware will reject the webhooks.** `middleware.ts:72` matches `/api/((?!auth/).*)` and its `authorized` callback returns false without a session token or an `x-api-key` header. Twilio cannot set custom headers on status callbacks. Fix: extend the negative lookahead to `/api/((?!auth/|voice/webhooks/).*)` and validate `X-Twilio-Signature` inside the route instead. Do **not** rely on a secret in the query string alone.

### P1 — In-browser softphone · 5–8 d

- `components/voip/Softphone.tsx` — sticky panel in `/sdr/action`: mute, hold, DTMF keypad, hangup, live timer, device/mic picker.
- `lib/voip/useTwilioDevice.ts` — SDK lifecycle, token refresh (access tokens are short-lived; refresh on `tokenWillExpire`), reconnection, `device.on('error')` surfaced as toasts.
- `GET /api/voice/token` — mints a Voice access token scoped to the session SDR.
- `POST /api/voice/calls` — creates the `Call` row at dial time, returns its id; the client attaches `contactId` / `companyId` / `campaignId` as TwiML params.
- `POST /api/voice/twiml/outbound` — returns `<Dial callerId=...><Number>` with `record="record-from-answer-dual"` (dual channel matters for the talk-ratio metric in P5).
- Replace the four `tel:` sites, **keeping** `handlePhoneCallAttempt`'s "another SDR is working this prospect" confirm — that guard is doing real work.
- Feature flag `NEXT_PUBLIC_VOIP_PROVIDER=twilio|tel` so rollout is per-SDR.

Risks: headset/mic permissions in the browser, SDR laptops behind restrictive NATs (Twilio handles TURN, but budget a day of field testing), and audio quality complaints that were previously the softphone vendor's problem and are now yours.

### P2 — Zero-admin post-call · 4–6 d

- `POST /api/voice/webhooks/twilio/status` → update `Call.status`, `duration`, `answeredAt`, `endedAt`.
- `POST /api/voice/webhooks/twilio/recording` → store `recordingSid`; **do not** keep Twilio's media URL as the permanent link — fetch the media and push it to S3 via the existing `@aws-sdk/client-s3` setup, so recordings survive a provider change and sit under your own retention policy.
- Transcription via Voxtral — `transcribeAudioFr` in `lib/ai/mistral-transcribe.ts` already exists and already forces `fr`. Reuse it; do not add Deepgram.
- Extraction via `mistral-large-latest` in JSON mode, same call shape as `generateFicheFromTranscription` in `lib/call-enrichment/auto-enrichment.ts`. Target payload:

```json
{
  "detected_result": "CALLBACK_REQUESTED",
  "confidence": 0.82,
  "suggested_callback_date": "2026-09-28T10:00:00+02:00",
  "call_summary": "…",
  "key_objection": "Validation budget requise",
  "sentiment": "POSITIVE"
}
```

- **Constrain `detected_result` to the campaign's allowed codes.** `statusConfigService.getAllowedResultCodes({ campaignId })` is already the gate in `app/api/actions/route.ts` — feed that list into the prompt as an enum and validate the response against it again server-side. A hallucinated status code must never reach `createAction`.
- Do **not** auto-create the `Action`. Push the suggestion into the open modal and let the SDR confirm. `triggersOpportunity` / `triggersCallback` on `ActionStatusDefinition` already fire the downstream side effects once a real action is saved — keeping a human in that loop is what stops one bad transcription from creating a phantom opportunity.
- Delivery to the browser: **poll** `GET /api/voice/calls/:id` every 2s for ~30s after hangup. The SDR is sitting on the page waiting; this is a handful of requests and needs zero new infrastructure. The existing Socket.IO client (`lib/socket/comms-socket.ts`) points at a VPS at `173.212.231.174:4000` and is scoped to comms — do not widen it for this.

**Where the time actually goes:** prompt iteration on real French cold-call transcripts, not the plumbing. Budget half of P2 for that, and assemble an eval set of ~30 labelled real calls *before* tuning.

### P3 — Pre-call briefing · 3–4 d

Card above the dialer, generated on queue-item load (not on click — it must be there *before* the SDR dials):

- **Context** — last 3 `Action` rows for the contact/company (`note`, `result`, `createdAt`).
- **Angle** — from `Campaign.pitch` / `Campaign.script`.
- **Red flags** — prior `BARRAGE_SECRETAIRE` / `MAUVAIS_INTERLOCUTEUR` / `NUMERO_KO` results, plus time-of-day patterns from past attempts.

Cache per contact with a short TTL (`lru-cache` is already a dependency) — the SDR queue re-renders constantly and this must not become an LLM call per render. Degrade silently: no briefing is fine, a spinner blocking the dial button is not.

### P4 — Live co-pilot · 10–15 d + new infrastructure · **deferred**

Requires Twilio Media Streams → a persistent WSS endpoint → streaming STT → LLM → push to browser. Next.js on Vercel/Netlify cannot hold that socket; it needs a dedicated always-on service. Deferred deliberately — see §7.

### P5 — Call quality scoring · 3–5 d

Once `Call` rows accumulate: talk-to-listen ratio (free from dual-channel recordings — no LLM needed), script-compliance and objection-handling scores from the transcript, surfaced in `/manager/team`. Cheap because P2 already did the hard part.

---

## 5. Cutover

Never flip everyone at once.

1. **Dual-run.** Both providers live. `NEXT_PUBLIC_VOIP_PROVIDER` per SDR; start with 2 volunteers for a full week.
2. **Freeze `lib/call-enrichment/`.** Do not port it to Twilio — it exists to solve a problem Twilio removes. It stays running, untouched, for SDRs still on WithAllo.
3. **Measure before widening:** connect rate, answer rate, audio-quality complaints, and `Action` completeness vs the WithAllo cohort. If answer rate drops after a number change, that is a business problem worth a rollback, not a bug to debug.
4. **Retire** WithAllo per-SDR as each migrates. Keep `ALLO_API_KEY` set until every historical recording URL has been mirrored to S3 — Allo-hosted media likely dies with the contract.
5. Delete the manual Allo-call picker from the action page **last**, and only for migrated SDRs.

---

## 6. Cost

Verify against current Twilio pricing before committing — these are order-of-magnitude, and French mobile termination is the dominant term:

- WebRTC client leg: ~$0.004/min
- Outbound FR landline: low cents/min; **FR mobile: several times higher** — and B2B cold-calling in France hits a lot of mobiles
- Recording storage + Voxtral transcription + Mistral extraction: small relative to the above
- DID rental: per number, per month

Model it at your real monthly dial-minutes and compare against the WithAllo contract **plus** the Leexi seats, because P2 makes some of what Leexi does redundant for cold calls. The honest question is whether this consolidates spend or adds a fourth vendor alongside three you already pay for.

---

## 7. Why the live co-pilot is deferred

1. **Infrastructure.** It needs a persistent WSS service that does not exist and that this deployment model cannot host.
2. **Legal.** Real-time processing of a prospect's voice, in France, needs consent handling that batch post-call recording (with an announcement) does not. That is a legal decision, not an engineering one.
3. **Ergonomics.** Objection cards appearing mid-sentence compete for attention with the human conversation. The failure mode — an SDR reading off a card instead of listening — is the exact opposite of the stated goal.
4. **Sequencing.** P2 produces the labelled transcript corpus needed to make a live co-pilot any good. Building it first means guessing at the objection taxonomy instead of deriving it.

Revisit after ~1,000 `Call` rows with transcripts.

---

## 8. Open questions and risks

| # | Item | Owner |
|---|---|---|
| 1 | **Recording consent.** French/GDPR practice: announce recording at call start and log the announcement. Needs a legal sign-off, a retention period on `Call.purgeAfter`, and a deletion job. Blocks P2 going live, not P2 being built. | Legal / Odo |
| 2 | Port vs. new numbers — affects answer rates and the migration timeline. | Ops |
| 3 | Does Leexi stay for cold calls once P2 ships, or is it scoped to closing calls only? | Product |
| 4 | Inbound handling: prospects **will** call the Twilio DIDs back. v1 needs at minimum a routing rule to the SDR who owns the contact, or a voicemail. Currently unplanned. | Product |
| 5 | Repo hygiene: this touches `prisma/schema.prisma` and `app/api/actions/`, both already modified on `main`. Land the in-flight ticket/messaging work first. Note also that the build runs with `ignoreBuildErrors` over a large backlog of latent TS errors — typecheck the new files in isolation rather than trusting a clean build. | Dev |
| 6 | `docs/MANUAL_MIGRATION_USER_OUTBOUND_PHONE.sql` references `User.outboundPhoneNumber`, which no longer exists (it is `alloPhoneNumber`). Stale doc — delete it rather than let it confuse the P0 schema work. | Dev |

---

## 9. Sequenced summary

| Phase | Deliverable | Days | Depends on |
|---|---|---|---|
| P0 | Twilio account, DIDs, `Call` model, middleware fix | 3–5 | regulatory lead time |
| P1 | In-browser softphone replacing `tel:` | 5–8 | P0 |
| P2 | Webhooks → transcript → extraction → one-click autofill | 4–6 | P1 |
| P3 | Pre-call briefing card | 3–4 | — (can run in parallel) |
| P5 | Manager call-quality scoring | 3–5 | P2 + data |
| P4 | Live co-pilot | 10–15 | deferred |

**~15–23 dev-days to the point where an SDR dials in-browser and files a call in one click.** The regulatory lead time on French DIDs, not the code, sets the earliest possible start.
