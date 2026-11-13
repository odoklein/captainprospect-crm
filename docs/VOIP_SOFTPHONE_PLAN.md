# Internal VOIP — in-CRM browser softphone (pilot)

Status: PLAN, nothing built. Written 2026-10-30 for an implementer (Opus 5.5) working on the V02 branch.
Read this whole file before touching code. Section 2 lists what already exists so you extend it instead of rebuilding it.

---

## 1. Goal and locked decisions

Replace the "click a `tel:` link → Allo app on the SDR's phone" flow with a **WebRTC softphone inside the CRM tab**, so that every call is placed, received, logged, recorded and supervised from the CRM itself.

Decisions taken by Odo (do not re-litigate):

| # | Decision |
|---|---|
| D1 | **Browser softphone replaces Allo** for outbound and inbound (not "on top of Allo"). Internal SDR↔manager calling was *not* chosen — out of scope. |
| D2 | Engine = **managed CPaaS** (WebRTC SDK + SIP trunk + numbers + recording + webhooks). No self-hosted PBX. |
| D3 | Outcomes that must really work: **zero-click call logging**, **inbound screen-pop & routing**, **live supervision**. (Power dialer was selected as a goal but see D6.) |
| D4 | **Pilot only**: 3–5 SDRs behind a per-user flag, **new numbers**, Allo stays untouched in parallel. Target ~20 SDRs later. |
| D5 | SDRs are in **Algeria, France and Madagascar** (and potentially anywhere), all calling **French prospects**. **Hard requirement (Odo, 2026-10-30): the number pool must include BOTH French mobile (06/07) and fixed (01–05/09) numbers, and an SDR must get the same quality and the same caller ID regardless of where they physically are.** Number type and SDR location are independent: a number is assigned to a person/role, never to a country. |
| D6 | Dialer v1 = **click-to-call only**. Auto-next power dialer is a later phase, not in this build. |
| D7 | **Record all calls, no announcement** (matches today's Allo behaviour). Make the announcement a config switch (default OFF) so it can be flipped without code — see risk R3. |
| D8 | Rollback must be instant: turning the user flag off returns them to the existing `tel:` + Allo path. Nothing about Allo, call-vault or the Allo webhook is removed or modified in behaviour. |

---

## 2. What exists today (verified in code 2026-10-30)

- **Outbound**: SDR cockpit `app/sdr/action/page.tsx` does `window.location.href = \`tel:${phone}\`` at lines ~1020 (click handler, after the "recently contacted" guard at ~1002) and ~1058 (confirm handler of the already-contacted modal). Raw `tel:` anchors also at ~2180, ~3036, ~3219. Other `tel:` links exist in manager/portal pages (`app/manager/rdv/...`, `app/manager/prospects/[id]`, `app/commercial/portal/...`, `app/client/portal/...`) — pilot scope is the **SDR cockpit only**; do not touch client/commercial portals.
- **Result logging is manual**: the SDR saves an `Action` (`prisma/schema.prisma` model `Action`, ~line 1184) with `result`, `note`, `duration`; call enrichment fields (`callSummary`, `callTranscription`, `callRecordingUrl`, `callEnrichmentAt`) are filled later by an async job.
- **Enrichment**: `lib/call-enrichment/provider.ts` picks `VaultProvider` (call-vault client `lib/call-vault-client.ts`, license feature `callVault`) else legacy `AlloProvider`. It matches by phones + `alloNumbers` + time window. call-vault (sibling repo `../call-vault`) owns the Allo connection and maps `User.alloPhoneNumber` → SDR line (see memory `call-vault-sdr-linking`).
- **Inbound**: `app/api/webhooks/allo/route.ts` → `lib/incoming-calls/allo-webhook.ts` (Standard-Webhooks signature + `parseAlloEvent` normalising to `received | answered | completed | ignored`) → `lib/incoming-calls/service.ts` `handleAlloCallEvent` (idempotent, tolerant of lost/reordered events, writes `IncomingCall` rows, resolves caller via `caller-lookup.ts`, notifies on missed). UI: `components/incoming-calls/IncomingCallPanel.tsx` mounted once in `components/layout/AppLayoutShell.tsx:358`, polling hook `useIncomingCalls.ts`.
- **Per-user numbers**: `User.alloPhoneNumber` (schema ~479), plus `User.outboundPhoneNumber` (unique, manual-migration doc `docs/MANUAL_MIGRATION_USER_OUTBOUND_PHONE.sql`).
- **Keys**: encrypted integration keys, `integrationKey("NAME")` (`lib/integrations/keys.ts`), catalogued in `lib/integrations/catalog.ts` (group `telephony` already has `ALLO_API_KEY`, `ALLO_WEBHOOK_SECRET`).
- **Licensing**: `lib/license/resolve.ts` `LICENSE_FEATURES = ["callVault","aiAssistant","whiteLabel","agent"]`, read synchronously via `peekFeature`.
- **Realtime**: Socket.IO client `lib/socket/comms-socket.ts` (separate VPS), otherwise polling is the norm.
- **Business rules the dialer must keep** (these live in the `tel:` handler's callers): "already contacted recently" modal, shared-phone warning (`lib/sdr-queue/shared-phone.ts`), 24 h queue pause (memory `queue-24h-pause`), phone line-type rule (+33 6/7 = mobile, judge the displayed number — memory `phone-line-type-rule`).
- Conventions: migrations are Prisma folders under `prisma/migrations/` **and** hand-applied SQL on the live DBs (never apply anything yourself; hand Odo the SQL — memory `local-db-is-not-prod`). Repo has ~226 latent TS errors; verify only your own files typecheck (memory `tsc-preexisting-debt`). Never `git stash` (shared working tree). The "booking modal" is `BookingDrawer` opened from `UnifiedActionDrawer`.

---

## 3. Target architecture

```
SDR browser tab                         CPaaS (Telnyx recommended)              CRM server (Next, Coolify)
┌────────────────────┐   WebRTC/SRTP    ┌──────────────────────┐   webhooks     ┌─────────────────────────┐
│ SoftphoneProvider  │◄────────────────►│ SIP trunk / PSTN     │───────────────►│ /api/webhooks/voip      │
│  (SDK, call state) │                  │ numbers, recording   │  call.initiated│  verify signature       │
│ CallBar + wrap-up  │   JWT login      │ call-control API     │  answered      │  normalise → VoipEvent  │
└─────────┬──────────┘◄─────────────────│ (supervise/bridge)   │  hangup        │  handleVoipEvent()      │
          │  POST /api/voip/token       └──────────────────────┘  recording.saved└───────────┬─────────────┘
          └────────────────────────────────────────────────────────────────────────────────►│ VoipCall rows,
                                                                                            │ Action link,
                                                                                            │ IncomingCall rows
```

### 3.1 Provider abstraction — `lib/voip/`
Mirror the call-enrichment pattern so the CPaaS is swappable per agency (white-label/multi-agency is a stated future):

- `lib/voip/provider.ts` — `interface VoipProvider { mintClientToken(user): Promise<{token, expiresAt}>; verifyWebhook(headers, rawBody): boolean; parseEvent(body): VoipEvent; startSupervision(callId, mode:'listen'|'whisper'|'barge', supervisorUserId): Promise<void>; recordingUrl(callId): Promise<string|null> }`.
- `lib/voip/events.ts` — normalised `VoipEvent = initiated | ringing | answered | hangup | recording_ready | ignored`, same shape discipline as `AlloCallEvent`. **Pure functions, unit-tested** (copy the test style of `lib/incoming-calls/allo-webhook.test.ts`).
- `lib/voip/telnyx.ts` — first adapter. (If the Phase-0 spike picks Twilio or another, only this file changes.)
- `lib/voip/index.ts` — `getVoipProvider()` reading `integrationKey("VOIP_*")`; returns null when unconfigured → feature off.
- Add to `lib/integrations/catalog.ts` group `telephony`: `VOIP_API_KEY`, `VOIP_WEBHOOK_SECRET` (or public key), `VOIP_CONNECTION_ID`, `VOIP_DEFAULT_CALLER_ID`. Console/agency key editor then works for free.
- Add license feature `voip` to `LICENSE_FEATURES` (default true in `DEFAULT_LICENSE`, update `license.test.ts` expectations).

### 3.2 Data model (new migration, SQL handed to Odo, not applied)
```prisma
model VoipLine {            // a pilot number; an SDR may own several (one MOBILE + one FIXED)
  id        String  @id @default(cuid())
  userId    String
  user      User    @relation(...)
  kind      VoipLineKind        // MOBILE (06/07) | FIXED (01-05/09) — derived from e164 with lib/phone-utils rules, never from the SDR's country
  isDefault Boolean @default(false)
  e164      String  @unique
  providerRef String?        // provider's number/credential id
  active    Boolean @default(true)
}

model VoipCall {            // one row per call leg that touches a VoIP line, in or out
  id             String   @id @default(cuid())
  providerCallId String   @unique   // idempotency key for webhooks
  direction      VoipDirection      // OUTBOUND | INBOUND
  status         VoipCallStatus     // DIALING | RINGING | ANSWERED | COMPLETED | MISSED | FAILED
  sdrId          String
  fromNumber     String
  toNumber       String
  numberKey      String?            // phoneKey() of the *prospect* number, same helper as IncomingCall.callerKey
  // CRM context captured at dial time (plain ids, like IncomingCall — survive re-imports)
  contactId      String?
  companyId      String?
  campaignId     String?
  missionId      String?
  actionId       String?            // set when an Action is attached (see 3.4)
  startedAt      DateTime
  answeredAt     DateTime?
  endedAt        DateTime?
  durationSec    Int?               // talk time (answered→end), not ring time
  hangupCause    String?
  recordingUrl   String?            // provider URL, short-lived; see 3.5
  recordingStored String?           // durable copy
  quality        Json?              // MOS/jitter/packet-loss reported by the client at hangup
  createdAt DateTime @default(now())
  @@index([sdrId, startedAt]) @@index([actionId]) @@index([numberKey, startedAt])
}
```
Plus `User.voipEnabled Boolean @default(false)` (the pilot flag; managers toggle it in the user settings tab next to the Allo number, same place as `alloPhoneNumber` in `app/manager/utilisateurs/[id]`).
Do **not** add columns to `Action` in v1: link through `VoipCall.actionId`; copy `duration`, `callRecordingUrl` into the existing Action fields at attach time so every existing report keeps working unchanged.

### 3.3 Client softphone — `components/voip/`
- `SoftphoneProvider` (client context) mounted next to `IncomingCallPanel` in `AppLayoutShell`, **only when** `session.user.voipEnabled && license voip && /api/voip/token` succeeds. Exposes `dial({phone, contactId, companyId, campaignId})`, `hangup`, `mute`, `hold`, `sendDtmf`, `state`, `activeCall`.
- **One active softphone per user**: elect a leader tab with `BroadcastChannel` + `navigator.locks` so two open tabs don't both register and both ring on inbound. Non-leader tabs show "Appel actif dans un autre onglet".
- `CallBar` — fixed bottom/top bar: prospect name + company (from the dial context), timer, mute, hold, keypad, hangup, input/output device picker, live quality dot (SDK stats). Restyle with the Accueil/brand tokens (`--ds-*`, `components/ui`); follow memory `accueil-design-system` and `de-slop-pass` (no gradients/emoji).
- **Audio preflight** at `/sdr/voip-check` (also linkable from the bar): mic permission, device test, echo test call to the provider's echo number, ICE/TURN connectivity, round-trip latency, "TURN over TCP/443 reachable?" verdict. Runs before a user is enabled; result stored on the user for the manager to see. **This is the most important pilot tool** because of R1.
- Entry points: replace the two `window.location.href = tel:` sites in `app/sdr/action/page.tsx` with `softphone.dial(...)` **when the softphone is available**, else the existing `tel:`. Keep the "already contacted"/shared-phone guards exactly where they are (they run before the dial). Same for the three raw `tel:` anchors in that file (turn them into buttons calling the same function).

### 3.4 Zero-click logging (D3 #1)
Lifecycle for an outbound call:
1. `dial()` → client POSTs `/api/voip/calls` with the CRM context; server creates `VoipCall(status=DIALING)` and returns a `clientState` token; the SDK passes it to the provider so every webhook carries it back (correlation without guessing by phone like Allo enrichment has to).
2. Webhooks (`/api/webhooks/voip`, signature-verified, raw-body, idempotent on `providerCallId` + event id) advance status, set `answeredAt/endedAt/durationSec/hangupCause`.
3. On hangup the cockpit **auto-opens the existing result drawer** (`UnifiedActionDrawer`) pre-filled: channel CALL, contact/company/campaign from the call, `duration` from the call, recording attached. The SDR only picks the result (and note). On save, the existing `/api/actions` POST creates the Action and the client then PATCHes `VoipCall.actionId` (or send `voipCallId` in the action payload and link server-side inside the same transaction — preferred, atomic).
4. **Orphan calls**: answered calls ≥ N seconds with no Action after 10 min surface in a "Appels à qualifier" list in the cockpit (badge on the softphone bar) and in the manager audit. A call must never be silently unlogged. Unanswered/short calls: auto-create nothing; they appear in the list as "no answer" with a one-click NO_RESPONSE (check actual result codes in use — memory `result-codes-reality`, teams use RAPPEL/RELANCE/PROJET_A_SUIVRE, not the CALLBACK_REQUESTED family).
5. Enrichment: for VoIP calls skip phone/time matching. Add a `VoipProvider`-style branch in `lib/call-enrichment/enrich-action.ts`: if the Action has a linked `VoipCall` with a recording, use that directly. Transcription/summary: see 3.5.

### 3.5 Recording, storage, transcription
- Provider records dual-channel on all calls (D7). On `recording_ready` download the file server-side and store it durably (decision for Phase 0: reuse call-vault's ingestion if `../call-vault` exposes one, else object storage already used by `app/api/actions/[id]/upload-audio` / `recording` routes). Never persist the provider's presigned URL; serve through a CRM proxy like `vaultRecordingProxyUrl` / `/api/actions/[id]/recording` does today, with the same access rules.
- Transcript/summary: reuse the existing AI pipeline that fills `callSummary/callTranscription`. Check call-vault first: if it can transcribe an uploaded recording keyed to the CRM action, use it (keeps one transcript store for the MCP `search_transcripts`); otherwise add a transcription step in the CRM worker. **Decide in Phase 0, do not build both.**

### 3.6 Inbound screen-pop & routing (D3 #3)
- Each pilot SDR's `VoipLine` DID rings that SDR's registered browser (provider routes DID → the user's WebRTC credential). If the user has no live registration: fallback chain = ring group of the other pilot SDRs → voicemail → `MISSED` row + existing `notifyMissed` notification.
- Reuse, don't fork, the screen-pop: write `handleVoipInboundEvent` that produces the **same `IncomingCall` rows** (status RINGING/ANSWERED/COMPLETED/MISSED, caller match via `caller-lookup`) so `IncomingCallPanel`, `CallerDossierView` and `useIncomingCalls` work unchanged. Refactor `service.ts` only enough to share `createResolvedRow` / `notifyMissed` (export them); keep Allo behaviour byte-identical (its tests must still pass).
- For a call answered **inside the softphone**, the panel's "answer" is the SDK's answer; the CallBar and the panel must not show two competing UIs — the panel becomes the ring/dossier view, the bar becomes the in-call controls.
- Also write the inbound call into `VoipCall` (direction INBOUND) so reporting covers both directions.

### 3.7 Live supervision (D3 #4)
- Live board: manager page (extend the planned `/manager/live` from the activity-monitoring initiative, memory `activity-monitoring-initiative`) listing SDRs with `VoipCall.status IN (DIALING,RINGING,ANSWERED)`: who, with which prospect/company, how long, mute state. Poll every 3–5 s from `VoipCall` (simple, matches the repo's polling norm); upgrade to the Socket.IO channel only if latency hurts.
- Listen / whisper / barge: provider call-control API "supervisor" modes (Telnyx call control bridge/conference; Twilio conference + `coach`). MANAGER/ADMIN roles only, **every supervision action is audited** via `lib/audit.ts` (`audit(request, session, {...})`) and the SDR sees a discreet "Supervisé" indicator for whisper/barge (CNIL proportionality, same reasoning as the live-board memory). Listen mode: the indicator is a config switch; default shown.
- Manager can also hang up / transfer? **Not in v1.**

### 3.8 Numbers and caller ID (D5)

**Requirement: mobile AND fixed French numbers, independent of SDR location.**

**What is known / not known (web check 2026-10-30, partial — treat as unverified until the provider confirms in writing):**
- Arcep has reserved 06/07 for *interpersonal* communication (rule effective 2023-01-01, business/automated traffic pushed to 09 or long virtual mobile numbers; Sinch and Callr summaries). A human SDR placing one-to-one click-to-call calls is arguably interpersonal, **power-dialer/automated traffic is not** — another reason D6 (click-to-call only) is the right v1 and why the later dialer needs its own compliance review.
- Arcep decision 0881 / the call-authentication work targets spoofed or non-genuine caller IDs; one source says the caller must be able to guarantee the agent is genuinely calling **from France** for geographic/mobile CLIs. That collides with SDRs in Algeria/Madagascar and is the main compliance risk for "no matter where the SDR is" (R2).
- Some French operators hold 07 ranges attributed by Arcep (e.g. Voip telecom), so virtual 06/07 numbers exist on the market (Kavkom sells them) — but I could not confirm that the big CPaaS (Twilio/Telnyx) hand out 06/07 for outbound VoIP at all. Do not assume it.
- The Bird & Bird note says the Conseil d'État struck part of the numbering-plan restrictions in 2021 — conflicting; needs a telecom lawyer or the provider's compliance team.

**Design that makes location irrelevant (technical):**
- The SDR's browser only carries a WebRTC leg to the provider. The PSTN call is **originated by the provider's French/EU infrastructure** with a CLI the *account* owns; the SDR's IP and country are never presented to the carrier or the prospect. This is the same model as any hosted French call-centre product.
- Caller ID is a property of the **pool/number assignment**, not of the user's location. Server selects it per call; the SDR can't override it.
- Number pool per agency: N mobile (06/07) + M fixed (01–05, 09). Assignment policy (Phase 1): each pilot SDR gets one fixed + one mobile line (`VoipLine.kind = MOBILE | FIXED`); the cockpit picks the CLI for each outbound call by rule, default **mobile when the dialed prospect number is mobile**, fixed when it's a landline (matches the +33 6/7 vs rest rule in memory `phone-line-type-rule`), with a manager override per mission. Do **not** rotate numbers to dodge spam labelling — that is exactly what the authentication rules target.
- Inbound callbacks: either number rings the owning SDR wherever they are (DID → WebRTC registration), same fallback chain as 3.6.
- Media: EU edge, **Opus** with a low bitrate cap, PCMU/PCMA fallback, TURN over TCP/443 for restrictive networks (R1). Same softphone code path for every country and for VPN on/off — no per-country branches.

**Clarified by Odo (2026-10-30): all SDRs are French people working for a certified French company; they use a VPN (Private Internet Access, French exit); and it is acceptable for the softphone to expose the SDR's real IP.** Consequences:
- The account and number holder is a French registered company, so KYC/Arcep paperwork is straightforward. The legal basis for presenting French CLIs is that entity and its agents, not the VPN. Keep one Phase-0 question for the provider anyway: does their acceptable-use policy allow agents connecting from outside France (their IP may show Algeria/Madagascar)? Written answer, not assumed.
- **The softphone must be network-agnostic.** It works with the VPN on or off, full- or split-tunnel, and the WebRTC media is allowed to go **directly** from the SDR to the provider's EU media edge. That is usually *better* audio than hair-pinning through a shared PIA exit (fewer hops, no shared-IP congestion). No kill-switch/full-tunnel requirement, no real-IP-leak detection.
- The CRM itself and the provider's signalling/webhooks are unaffected by the VPN choice.
- What still matters for quality, and is therefore measured by the preflight (`/sdr/voip-check`) and the pilot dashboard: selected ICE path (host / srflx / relay-UDP / relay-TCP), RTT to the media edge, jitter and packet loss over a 10 s echo test, and whether UDP is allowed. If direct UDP is blocked or lossy the SDK falls back to **TURN over TCP/443**; if audio is still poor the SDR gets the **phone-bridge fallback** (3.9).
- PIA specifics (general knowledge, to confirm in the spike): avoid the PIA *browser extension* for audio testing (it proxies browser HTTP only and its WebRTC-leak protection can block candidates), prefer the desktop app (WireGuard) if the VPN is kept on; PIA exits are shared IPs that some providers rate-limit — if the provider refuses them, tell SDRs to exclude the provider's media/signalling domains from the VPN (split-tunnel) since real-IP exposure is accepted. The preflight records exit IP/ASN so this is visible in the data.
- Pilot metrics (section 5) are tracked by connection profile (country, VPN on/off, ICE path), not by country alone.

**Phase 0 must answer, in writing from each candidate provider:**
1. Can they provision **06/07** numbers on a SIP/WebRTC outbound trunk, under which Arcep allocation, with what paperwork (identity, French registered entity, KYC)?
2. May the CLI be presented on calls placed by a **WebRTC agent whose IP is outside France** (French company, French staff, working remotely)? Any "agent must be in France" clause? Does the provider accept PIA/shared VPN IP ranges for signalling?
3. Do these numbers carry call-authentication (STIR/SHAKEN-style / French MAN) attestation, and what do the French carriers show to the callee (spam-labelled?)
4. Per-minute price per number type and per destination (FR mobile / FR fixed), plus monthly number fees.
5. Can numbers be ported **in** later (so the pilot numbers become the real ones).

**Fallback if the big CPaaS can't give 06/07 or won't allow non-France agents:** evaluate French-licensed operators/virtual-PBX vendors that expose SIP/WebRTC (Kavkom, Callr, Ringover, Aircall-type) — the `VoipProvider` interface (3.1) is built so only `lib/voip/<provider>.ts` changes. If **no** provider allows mobile CLIs for non-France agents, stop and ask Odo: the options are (a) fixed numbers for non-France SDRs, (b) a legally reviewed arrangement through a French operator, (c) accept the risk knowingly. Do not silently ship (c).

### 3.9 Resilience — the call must survive bad networks (enhancement)
- **Reconnect without losing the call**: on `online/offline` and network-change events trigger an ICE restart; re-register the WebRTC credential automatically with backoff; the CallBar shows "Reconnexion…" and keeps the timer. Provider-side hold the leg ~10 s before hanging up.
- **Phone-bridge fallback ("Rappelez-moi")**: if preflight fails or quality drops (MOS/packet-loss threshold during a call), one button makes the provider call the SDR's own phone first and then bridge to the prospect (provider call-control dial+bridge). Same `VoipCall` row, same logging, same CLI. This is also the safety net for SDRs with no usable headset/mic and removes any hard dependency on WebRTC working on every connection.
- **Live quality meter** in the CallBar (traffic-light from `getStats()`), and a one-click "audio mauvais" report that stamps the call with stats — the raw material for the pilot data.
- **Webhook-loss safety**: a sweeper (cron/worker, same pattern as the Captain agent worker/`app/api/cron/*`) closes any `VoipCall` stuck in DIALING/RINGING/ANSWERED for > 3 h using the client-reported end or a provider `GET call`.
- **Browser edge cases**: mic permission denied, device unplugged mid-call (switch device without dropping), autoplay policy (unlock audio on first click), laptop sleep, tab discard (the leader-tab lock releases and another tab takes over).

### 3.10 Guardrails — cost, fraud and rules (enhancement)
- **Destination policy** enforced **server-side** when creating the call (never trust the client): allow only French mobile/fixed destinations by default; block premium/special-rate (08x/118/surtaxés), international and satellite ranges unless a manager allows a country per mission. Per-SDR and per-agency **daily minute/spend caps** with a hard stop and a manager alert — a leaked token or a bug must not be able to run up a telecom bill.
- **Pre-dial guards reuse existing logic**: excluded/opt-out numbers (`lib/exclusions/matching.ts`, same `phoneKey`), already-contacted, shared-phone, 24 h pause. Guards run in one server function `canDial(user, phone)` used by both the UI and `/api/voip/calls`, so the cockpit and the API can't disagree.
- **Concurrency**: one outbound call per SDR at a time; a second dial is rejected with a clear message.
- **Number health dashboard** (manager): per number — calls, answer rate, avg talk time, share of calls ending < 5 s; a sudden drop flags a number as possibly spam-labelled. Manual action only (swap/retire the number); never automatic rotation.

### 3.11 Making it really useful in the call (enhancement)
- **Script & notes stay open**: the existing `components/sdr/ScriptCompanionDrawer.tsx` and the contact fiche remain usable while the CallBar is active; the bar must not cover the cockpit (reserve layout space). Live notes typed during the call are timestamped relative to call start and saved into the Action note on wrap-up.
- **Wrap-up in one screen**: result buttons + callback date picker + note + (when relevant) the BookingDrawer, opened by hangup. Suggested result from the transcript (AI) is a *suggestion only*, shown after enrichment, never auto-saved.
- **Callback ↔ inbound**: when a prospect calls back one of the pilot numbers, the screen-pop shows the last Action, note, recording snippet and the one-click "rappeler" from the same line (CLI continuity: call back with the number they dialled).
- **Click-to-call everywhere an SDR sees a number** (queue rows, fiche, company drawer, list view) through one shared `<DialButton phone context />` component so guards, CLI choice and fallback to `tel:` live in one place.
- **Manager value**: per-SDR talk time, calls/hour and answer rate from `VoipCall` (accurate, no manual entry) feeding the existing SDR pace indicator and stats pages, with the talk-time-vs-Allo-duration difference documented (R7).

---

## 4. Phases (each ends in something demonstrable; ship in order)

**Phase 0 — Spike & decisions (gate; ~1–2 days, mostly Odo + a throwaway page)**
1. Shortlist Telnyx vs Twilio vs one French provider on: French numbers incl. mobile-type availability + regulatory paperwork, per-minute price to FR fixed/mobile, WebRTC SDK quality, recording + webhook model, call-control (supervisor) API, EU data residency, DPA/RGPD.
2. Build a throwaway `/sdr/voip-spike` page with the chosen SDK: register, call an echo number and a real French mobile and landline, from an Algerian and a Malagasy connection, each with **VPN off, VPN on (PIA app) and PIA extension**. Record: setup success, one-way-audio incidents, MOS/latency, ICE path chosen, whether UDP is blocked and TURN-TCP saves it. Pick the recommended setup per country from the data.
3. Resolve the two open choices: recording/transcript storage (call-vault ingest vs CRM) and number type.
4. Output: a short `docs/VOIP_DECISIONS.md` (provider, number plan, storage). **Stop and ask Odo if the Algeria/Madagascar test fails** — it changes the product (e.g. require TURN/TCP, or route SDRs through a relay).

**Phase 1 — Foundation**: schema + migration SQL (handed over, not applied), `lib/voip/*` with event normaliser + signature verify + unit tests, catalog keys, license feature, `POST /api/voip/token` (auth: session user with `voipEnabled`; short-lived provider JWT, never expose the API key), `POST /api/webhooks/voip` (excluded from auth middleware like the Allo route, signature is the only gate; refuse everything when the secret is unset), `voipEnabled` toggle + line assignment in the manager user page, audit events for enabling/disabling.

**Phase 2 — Outbound softphone**: `SoftphoneProvider`, leader-tab election, `CallBar` (quality meter, reconnect), device picker, audio preflight page (ICE path/RTT/loss, no VPN assumptions), shared `<DialButton>` with server-side `canDial` guards + destination policy and spend caps (3.10), phone-bridge fallback (3.9), cockpit entry points with fallback to `tel:`.

**Phase 3 — Zero-click logging**: `VoipCall` lifecycle, post-call drawer prefill + atomic Action link, orphan-calls list, enrichment branch, recording ingest + proxy route, quality stats capture.

**Phase 4 — Inbound**: DID routing, shared `IncomingCall` pipeline, ring group/voicemail/missed fallbacks, panel/bar coordination.

**Phase 5 — Supervision**: live board, listen/whisper/barge, audit + SDR indicator, number-health dashboard, stuck-call sweeper.

**Phase 6 — Pilot run & decision**: enable 3–5 SDRs (mix of the three countries), 2-week comparison vs Allo cohort. Later, not in this plan: power dialer (D6), wider rollout, replacing Allo/call-vault dependencies, internal calling, multi-agency provisioning of per-agency CPaaS keys through the Console.

---

## 5. Pilot metrics (decide go/no-go on data)
- % of calls with working two-way audio (client `getStats` + SDR "mauvaise qualité" one-click report in the bar).
- Mean/95th percentile MOS, jitter, packet loss, per connection profile (country, VPN on/off, ICE path) and per number type (mobile vs fixed).
- Call setup failure rate; one-way-audio incidents; reconnect count.
- **% of answered calls that ended with an Action within 10 min** (target ≥ 95 %) and orphan-call count.
- Answer rate and talk time per SDR vs the same SDR's previous Allo weeks (caller-ID effect).
- Inbound: ring→answer latency, % missed, % that popped the right fiche.
- Cost per connected minute vs Allo seat cost.

## 6. Risks
- **R1 — Network quality (Algeria / Madagascar, through a French-exit VPN).** The VPN probably sidesteps ISP VoIP blocking but adds latency and may drop UDP; WebRTC may be choppy or one-way. Mitigate: TURN over TCP/443 fallback, preflight page, Opus low bitrate, a reconnect-on-network-change handler, and the Phase-0 gate. Without a green preflight a user cannot be enabled.
- **R2 — Caller-ID, number type and "location-independent" (D5).** Mobile 06/07 numbers + agents outside France is the single biggest regulatory/commercial unknown: Arcep restricts 06/07 to interpersonal use and is tightening caller-ID authenticity checks; some carriers may flag or block calls whose CLI is French-mobile but whose origin isn't. Mitigation: provider confirmation in writing (Phase 0 questions 1–5), origination from the provider's French infrastructure, no number rotation, and a pilot metric comparing answer rate and spam-labelling per number type and per SDR country. How Allo handles this today is not documented in this repo — ask what Allo does (Allo numbers already work from Mada/Algeria) since it's the baseline we must match.
- **R3 — Recording with no announcement (D7).** Odo's decision stands, but French law (RGPD/CNIL, secret des correspondances) generally requires informing the person being recorded; prospecting calls are not exempt. Ship the announcement as an off-by-default per-agency switch and flag it to Odo in the final report; the legal call stays his.
- **R9 — Toll fraud / runaway spend.** Mitigated by server-side destination policy, spend caps and one-call-at-a-time (3.10); alert on cap hit.
- **R4 — Double ringing / duplicate registration** across tabs → leader-tab election (3.3).
- **R5 — Webhook ordering/loss.** Same discipline as the Allo service: idempotent, tolerant, create-on-complete when `initiated` was missed, fall back to client-reported end if the hangup webhook never arrives (close the row after a timeout).
- **R6 — Browser constraints.** Mic permission, autoplay policy, laptop sleep, headset hot-swap; test Chrome + Edge + Firefox on Windows.
- **R7 — Reports reading `Action.duration`** (SDR pace, HR, stats redesign) must keep working; VoIP calls give *talk time*, Allo gave a different measure — note the difference in the pilot comparison.
- **R8 — Security.** Token endpoint must be per-user and short-lived; webhook is public → signature + timestamp tolerance; supervision restricted and audited; no provider keys in the client bundle. The 2026-10 server compromise (memory `server-compromise-2026-10`) is a reason to keep this surface minimal.

## 7. Verification plan
- Unit tests: event normaliser (all event types, malformed payloads), signature verify (good/bad/expired/rotated), `handleVoipEvent` idempotency and out-of-order delivery (mirror `allo-webhook.test.ts`); existing Allo tests must still pass untouched. Run only the pure tests — never `hr-integration.test.ts` (writes to live DB).
- Typecheck only the files you add/change (repo has latent TS debt).
- Webhook replay script in `work/` (ignored by git — public repo, never commit `work/`) that POSTs signed sample events to a local dev server.
- Manual test matrix: outbound answered / busy / no answer / hung up by prospect; inbound answered / missed / voicemail; two tabs; network drop mid-call; mic denied; Algeria and Madagascar connections; supervisor listen/whisper/barge.
- Visual check of CallBar and drawer with the existing visual harness (memory `visual-harness`).
- DB: write the migration, a standalone SQL file for Odo, and do not run it; test against a local DB only (memory `local-db-is-not-prod`).

## 8. Definition of done for the pilot build
A flagged SDR can: pass the preflight; click a number in the cockpit and talk; see the call end and the result drawer open pre-filled; save with one click and find the recording/transcript on the Action; receive a callback on their new number with the fiche popped; and a manager can see them live and listen in with an audit trail. A non-flagged SDR sees zero change. Flag off ⇒ everything reverts to `tel:` + Allo.

## 9. Open items for Odo (need answers before/during Phase 0)
0. **Mobile + fixed, any SDR location (new, D5):** ask the provider the five Phase-0 number questions in 3.8; this decides the provider, not price. Also: what do Allo numbers look like today for the Mada/Algeria SDRs (mobile or fixed, which carrier shows what to prospects)?
1. Provider preference, if any (Telnyx is the default recommendation, but it is **not confirmed** to offer 06/07 — a French-licensed provider may win).
2. Budget ceiling per connected minute and for numbers.
3. Which 3–5 SDRs and their countries for the pilot.
4. Whether the supervision "Supervisé" indicator may be hidden in listen mode (legal/ethical call is his).
5. Confirmation of the recording-without-announcement position given R3.
