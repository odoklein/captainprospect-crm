# Téléphone intégré (Twilio)

SDRs can call prospects straight from the CRM, from the browser, with a headset.
Allo stays fully supported: while Twilio is not configured, every phone link
keeps opening `tel:` exactly as before.

## What it does — and what it does not

| Exists | Does not exist (on purpose) |
| --- | --- |
| Click a number (action queue, fiche, rappels, missed inbound call) → the call starts in the browser | No auto-dialer / power-dialer, no call queue |
| Call bar: status, timer, mute, DTMF keypad (switchboards, IVR), hang up, redial | No inbound calls on Twilio (inbound stays on Allo + the incoming-call panel) |
| Twilio's real outcome after hang-up (Pas de réponse, Occupé, Terminé · 2 min 14) | No transcription of Twilio recordings yet |
| The call attaches itself to the qualification the SDR saves next for that prospect: duration + recording (« Écouter ») | |
| Optional recording, with a spoken notice to the prospect | |

## Flow

```
SDR clicks a number
  └─ POST /api/telephony/calls            number validated (country allowlist, no premium rate) → TelephonyCall row
  └─ Device.connect({ callId })            Twilio Voice JS SDK, WebRTC, edge "dublin"
       └─ Twilio → POST /api/webhooks/twilio/voice     signed; checks the row belongs to that user, is fresh, unseen
            └─ <Dial callerId answerOnBridge> <Number>stored number</Number>
                 ├─ /api/webhooks/twilio/status?leg=child   ringing / answered / completed
                 ├─ /api/webhooks/twilio/status?leg=dial    final outcome
                 └─ /api/webhooks/twilio/recording          (if recording) media URL
SDR saves the qualification (POST /api/actions, channel CALL)
  └─ linkCallToAction: latest unlinked call to that contact/company in the last 3 h
       → Action.duration, Action.callRecordingUrl (streamed by /api/actions/[id]/recording)
       → the Allo enrichment search is skipped for that action
```

The browser never tells Twilio what to dial: it only sends the id of a row the
server created after validating the number. A stolen token alone cannot dial
an arbitrary number.

## Setup (once per agency)

1. **Twilio console**
   - Buy a French number (or verify an existing one as a Caller ID).
   - Create an **API Key** (Account → API keys): keep the SID (`SK…`) and the secret.
   - Create a **TwiML App** (Voice → TwiML Apps): Voice Request URL =
     `https://<app-url>/api/webhooks/twilio/voice`, method `POST`.
   - Voice → Settings → Geo permissions: allow only the countries you call.
2. **CRM — Paramètres → Intégrations → Téléphonie** (or the container env):
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY_SID`,
   `TWILIO_API_KEY_SECRET`, `TWILIO_TWIML_APP_SID`, `TWILIO_CALLER_ID` (default `+33…`).
3. **Per user (optional)** — Utilisateurs → fiche → « Numéro Twilio sortant ».
   Empty = the default number. One number per SDR avoids the shared line being
   flagged as spam.
4. `APP_URL` (or `NEXTAUTH_URL`) must be the public HTTPS URL: webhooks are
   signed against it.

## Container env switches

| Variable | Default | Effect |
| --- | --- | --- |
| `TWILIO_RECORD_CALLS` | off | `1` records answered calls (dual channel). The prospect first hears « Cet appel est susceptible d'être enregistré. » — CNIL requires informing them; also mention it in the agency's privacy notice. |
| `TWILIO_ALLOWED_COUNTRIES` | `FR,BE,CH,LU,MC` | Destinations that may be dialled. Premium-rate / shared-cost numbers are always refused. |
| `TWILIO_EDGE` | `dublin` | Twilio edge the browser connects to (EU latency). |

## Browser requirements (next.config.ts)

- CSP `connect-src` must allow `wss://*.twilio.com` (the SDK's signalling websocket,
  `voice-js.<edge>.twilio.com`) and `media-src` `https://sdk.twilio.com` (ringback tones).
  Symptom when missing: error 31000 and « Connexion… » in the dock.
- `Permissions-Policy` must allow `microphone=(self)`. Symptom: error 31401.

## Where the call lives: the island

There is one call surface: the **island** at the top of the screen
(`components/telephony/CallIsland.tsx`, mounted by `SoftphoneProvider`). It is
a black pill while calling (name, timer, live level, last sentence heard);
hover or click opens it (live transcript, keypad, micro, hang up), Échap folds
it. When the call ends it becomes the outcome card (Twilio's issue, the AI
summary when it is ready, Rappeler). It stays centred over the page, never
over a docked pane (`--cp-pane-w`).

Pages can put their own status in it while no call is live with
`useIslandExtra({ tag, text, countdown, actions })` — Mode auto uses it for
« Appel de X dans 3 s · Annuler · Passer · Arrêter ».

The former bottom call band is gone: `--softphone-dock-h` stays at `0px` and is
kept only so existing offsets still compile.

## Per page

| Page | Layout | Dock | Island |
| --- | --- | --- | --- |
| Appeler (`/sdr/action`, table) | list + **docked action pane** on the right (Appel · Fiche · Script tabs; the script tab comes up while calling, Appel when the call ends) | floating, bottom left | call + Mode auto status |
| Mode Focus (`/sdr/focus`) | full height: session rail · prospect · outcome | shortcuts listed in the rail (lg+), floating below | call |
| Mes appels / Journal d'appels | full height: list + **detail pane** following `j` / `k` (drawer on narrow screens) | floating | call |

The docked pane is `<Drawer docked>`: no backdrop, Esc still closes it; from
`xl` the page makes room for it (`:root[data-pane-docked]` sets
`--cp-pane-w`, `.cp-main` pads by it), below it overlays.

## Security notes

- `/api/webhooks/twilio/*` are outside the auth middleware; `X-Twilio-Signature`
  (HMAC with the Auth Token, over the public URL) is their only gate. Missing
  config → 503, bad signature → 403.
- `/api/telephony/calls` is limited to 12 dials per user per minute.
- A TwiML request is accepted once per row, only from the row's own user
  identity, within 2 minutes of its creation.
- Recordings are never exposed: the stored `api.twilio.com` URL is streamed by
  `/api/actions/[id]/recording` with the account credentials, after the usual
  per-action access check.

## Code map

- `lib/telephony/` — `phone.ts` (dial gate), `status.ts`, `config.ts`, `twilio.ts`
  (token, signature, TwiML), `service.ts` (all DB writes), `telephony.test.ts`
- `app/api/telephony/` — `config`, `token`, `calls`, `calls/[id]`
- `app/api/webhooks/twilio/` — `voice`, `status`, `recording`, `notice`
- `components/telephony/` — `SoftphoneProvider` (mounted in `AppLayoutShell`,
  `useSoftphone()` / `useTelLinkHandler()` / `useIslandExtra()`), `CallIsland`,
  `CallInsights` (transcript feed, AI summary view)
- Prisma: `TelephonyCall`, `User.twilioCallerId`
  (migration `20261105100000_add_telephony_calls`)

Tests: `npm run test:telephony`

## Live transcription & AI summary (`TWILIO_TRANSCRIBE_CALLS=1`)

- `<Start><Transcription>` (fr-FR, both tracks, engine/model via
  `TWILIO_TRANSCRIPTION_ENGINE` / `TWILIO_TRANSCRIPTION_MODEL`, default
  `google` / `telephony`) runs before `<Dial>`; the prospect hears the notice.
- `/api/webhooks/twilio/transcription` stores final sentences
  (`TelephonyTranscriptLine`, speaker `sdr` = inbound track, `prospect` =
  outbound track). The dock's « Transcription » panel follows them.
- When Twilio stops the transcription (or lazily, 20 s after the call ended,
  if that callback was lost), `lib/telephony/summary` writes the summary:
  summary, key points, objections, next steps, **qualification** (need,
  current solution, timing, decision-maker, budget — null when not said) and a
  **suggested status** chosen only among the mission's statuses. Runs once
  (claim on `aiSummaryStatus`); too-short calls are `skipped`, never padded.
- Copied onto the qualification (`Action.callSummary` / `callTranscription`)
  without overwriting what the SDR wrote.

## SDR: Mode Focus (`/sdr/focus`)

One prospect at a time from the smart queue (`/api/actions/next`, which now
accepts `skipContact` / `skipCompany`). AI pre-call brief, cancellable
auto-dial, outcome by key 1–9, callback presets, Entrée = save and next, the
AI's suggested outcome tagged « IA » with « Appliquer ». Shortcuts: `?`.

Pre-call brief: `GET /api/sdr/brief` (`lib/sdr-assistant/brief`), built from
the CRM only, cached per prospect × mission against a hash of its inputs
(`ProspectBrief`).

## Manager: Journal d'appels (`/manager/appels`)

Every logged call with status, duration, recording, AI summary and
transcript; filters in the URL; facets by status / SDR / mission; search
also matches what was said (transcripts, summaries, notes). « Sans statut »
lists integrated-phone calls with no status after 10 minutes.
API: `GET /api/manager/calls`, `GET /api/manager/calls/[id]`.

Migrations: `20261107100000_add_call_transcripts`, `20261108100000_add_prospect_briefs`.

## When live transcription gives nothing: the recording fallback

If the call was answered and the live transcript is empty or too short, the
summary engine transcribes the **Twilio recording** instead
(`transcribeAudioFr`: `WHISPER_API_URL` if set, else OpenAI), stores it as one
line (speaker `mixed`, « Conversation (enregistrement) »), then summarises it.
It needs `TWILIO_RECORD_CALLS=1`. While the recording is not delivered yet the
summary waits; the recording webhook restarts it.

Manager → Journal d'appels → **Diagnostic** shows each prerequisite and, for
the last calls, what Twilio actually delivered (reached Twilio, answered,
recording, transcript lines, summary state and reason). Transcription errors
sent by Twilio are logged in full (`[webhooks/twilio/transcription]`).

## SDR: Mes appels (`/sdr/appels`) and Mode auto

- « Mes appels » is the journal limited to the signed-in SDR
  (`GET /api/sdr/calls`). Under « Sans statut », « Qualifier » opens the action
  drawer for that call; the saved result is linked to **that exact call**
  (`telephonyCallId` on `POST /api/actions`), whatever its age.
- Appeler (table view) → **Mode auto**: opens the next row with a number,
  calls it after a 3 s countdown (Échap cancels), shows the outcome when the
  call ends (AI summary; its suggested status is applied only on « Appliquer »),
  and moves to the next row once a result is saved. « Passer » skips,
  « Arrêter » or closing the drawer stops.
