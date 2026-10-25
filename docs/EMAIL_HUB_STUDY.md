# Email Hub: usage study and redesign (2026-10-25)

## 1. How email is actually used (live Supabase, read-only, 2026-10-25)

| Surface | Live data | Verdict |
|---|---|---|
| Templates | 71 templates, all by managers, created every month since February. 61 mission assignments over 19 missions (about 4 per mission). Only 2 used in a send | The real investment. It needs a proper library, and a path from template to send. |
| Inbox | 115 threads, 155 inbound emails (replies on the IMAP and ReachInbox mailboxes). Read by 2 manager-level users. 0 of 115 threads linked to a contact or mission | Used, but blind: no CRM context, and you can't reach it from the nav. |
| ReachInbox | 4 campaign↔client links over 3 clients, the latest added 2026-10-07. Its mailbox is in sync ERROR | This is the real outbound channel. The CRM shows stats and receives replies. |
| Mailboxes | 3 in total (2 IMAP, 1 ReachInbox). 0 belong to SDRs. 0 missions or clients have a default mailbox | Setup is the blocker for any SDR send. |
| Sequences | 3 drafts made in April, 0 enrolments, 0 sends | Never worked: no engine ran, edits didn't save, enrolment was a 404. |
| Sent / analytics | 2 outbound emails ever. The analytics table is empty | Analytics read a table that nothing ever filled. |
| SDR quick-send (call screen) | 0 recorded sends. 5 template "uses" that produced no email | Broken by the missing mission mailbox, and the send was never linked back to anything. |

**Who uses it:** 2 or 3 managers and 1 BD, out of 23 SDRs, 26 commercials and 38 clients. The hub is built for that core group first. SDRs get two simple pages: what they sent, and replies.

## 2. Jobs to be done

**Manager (daily):**
1. "Who replied, and what do I do about it?" → Vue d'ensemble › À traiter → open the thread → see the contact, company and mission → reply with a mission template.
2. "Are my sending accounts healthy?" → health block → mailbox settings (`?mailbox=`).
3. "Prepare the outreach for a new mission" → Templates (`?mission=`) → assign templates to the mission → set the mission's default mailbox → SDRs can quick-send from the call screen.
4. "Run a follow-up cadence" → Séquences → build the steps from templates → enrol contacts from a mission or list → activate (checklist) → the engine sends within the send window, Paris time → it stops when the contact replies.
5. "How are the campaigns doing for client X?" → Campagnes (ReachInbox) → campaign → linked client page.

**SDR:** call screen → result "Envoie mail" → QuickEmailModal with the mission mailbox and mission templates → toast "Voir la conversation" → Mes envois / Réception.

**BD (owns a mailbox):** Email Hub → lands on Réception.

**Client:** Emailing → tabs Campagnes and Emails envoyés, with a real CSV export.

## 3. Information architecture

Before, there were three route trees with nearly identical names, and none linked to the others:
`/manager/email` (full-screen inbox, in no nav), `/manager/emails` (dashboard plus placeholder tabs), and `/manager/emailing` (a second ReachInbox dashboard). Templates were orphaned, sequence links returned 404, and the SDR tabs pointed at pages that didn't exist.

After, there is one hub. The tabs are grouped by job:

```
Communication › Email Hub   /manager/emails
  Lire & suivre   Vue d'ensemble · Réception · Envoyés
  Prospecter      Séquences · Templates · Campagnes
  Configurer      Boîtes mail · Analytics
SDR / BD         /sdr/emails → Mes envois · Réception
Client           /client/portal/emailing → Campagnes · Emails envoyés
```

Old URLs redirect (next.config.ts), including the OAuth return URLs.

## 4. Internal link map (deep links every page accepts)

| URL | Opens |
|---|---|
| `/manager/emails/inbox?thread=<id>` | that conversation (also `?folder=`, `?mailbox=`, `?q=`, `?compose=1`) |
| `/manager/emails/templates?template=<id>` / `?new=1` / `?mission=<id>` | the editor, a blank template, or the list filtered to a mission |
| `/manager/emails/mailboxes?mailbox=<id>` | the settings drawer for that mailbox |
| `/manager/emails/sequences/<id>` | the sequence (steps, enrolled contacts, stats, settings) |
| `/manager/emails/sent?status=&mission=&sdr=&q=` | the filtered list of sent emails |

What links where:
- Overview rows → thread, mailbox, sequence, template.
- Sent row → conversation, contact, mission, template, sequence.
- Inbox context panel → contact, company, mission, client.
- Contact and company drawers → email history → conversation.
- Mission workspace → templates and mailboxes filtered to that mission.
- Settings › Email → Boîtes mail.

## 5. What was changed

- **Hub:** one frame (`components/email/EmailHubLayout.tsx` + `EmailHubPage.tsx`) with grouped tabs, an unread badge and an "Écrire" button. The inbox is now inside the app frame with the sidebar. The page bodies moved to `components/email/**`; the routes are thin wrappers. Nav: Communication › Email Hub + Broadcasts. The BD role gets the hub, and `/sdr/emails` lands on Réception for mailbox owners.
- **Vue d'ensemble:** one `/api/email/dashboard/overview` endpoint with per-block errors; À traiter, mailbox health, sequences, templates, activity, KPIs computed from the Email table.
- **Inbox:** state lives in the URL (`?thread=`, `?folder=`, `?mailbox=team`, `?q=`, `?compose=1`) and keyboard shortcuts work. The CRM context panel is real (link/unlink/auto-link, labels, notes). Composer: templates and variables, quoted forward. Attachment download route. Managers can reply from any mailbox.
- **Linking:** conversations are linked to the contact, mission and client when they are created and when they are synced (the linking service was rewritten). Contact and company drawers show email history. Quick-send returns the conversation and the toast links to it.
- **Sequences:** a Redis-free engine (`/api/cron/email-sequences`, every 5 min, fails closed without `CRON_SECRET`) with Paris-time sending windows, daily limits, stop on reply/bounce and retries. A step editor with timeline, templates, server preview and test send. Contact enrolment with skip reasons, an activation checklist and an engine-health warning.
- **Templates:** library with mission assignment in the editor, live preview using the same renderer as sending (`lib/email/template-render.ts`), categories normalised.
- **Mailboxes:** settings drawer (`?mailbox=`), health line, mission defaults, a single ReachInbox connect flow.
- **ReachInbox:** two dashboards merged into `components/emailing/ReachInboxWorkspace.tsx`; the client portal gets one Emailing page with Campagnes + Emails envoyés tabs and a real CSV export.
- **Sent / Analytics:** a shared table with status tabs and URL filters; real CSV; resend that actually sends; delete removed. Analytics computed from the Email table with recharts.
- **Security fixes found on the way:** a client-scope leak in `/api/client/sent-emails` when filtering; `/api/email/send` trusted a `sentById` coming from the browser; the dashboard APIs had no role check.

## 6. Still to do

- **Production cron:** schedule `curl -H "Authorization: Bearer $CRON_SECRET" -H "x-api-key: cron" https://<domain>/api/cron/email-sequences` every 5 minutes on Dokploy, and set `CRON_SECRET`. Without it no sequence email goes out, and the Séquences page says so.
- **Mission default mailboxes:** set them, otherwise SDRs can't quick-send.
- **Not built:** draft saving, scheduled sending, A/B variants, storing attachment contents during sync, and a `User.title` field for `{{senderTitle}}`.
