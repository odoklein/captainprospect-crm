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
  `useSoftphone()` / `useTelLinkHandler()`), `CallBar`
- Prisma: `TelephonyCall`, `User.twilioCallerId`
  (migration `20261105100000_add_telephony_calls`)

Tests: `npm run test:telephony`
