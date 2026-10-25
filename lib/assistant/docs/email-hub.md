---
routes: ["/manager/emails", "/manager/emails/inbox", "/manager/emails/sent", "/manager/emails/sequences", "/manager/emails/templates", "/manager/emails/campaigns", "/manager/emails/mailboxes", "/manager/emails/analytics", "/sdr/emails", "/sdr/emails/sent", "/sdr/emails/inbox", "/client/portal/emailing"]
roles: ["MANAGER", "SDR", "BOOKER", "BUSINESS_DEVELOPER", "CLIENT"]
keywords: ["email", "mailbox", "boîte mail", "séquence", "sequence", "template", "modèle", "Gmail", "Outlook", "IMAP", "SMTP", "ReachInbox", "campagne", "connect mailbox", "health", "santé mailbox", "send email", "envoyer email", "bounce", "rebond", "open rate", "taux ouverture", "email hub", "inbox", "boîte de réception", "réponse", "enroll", "inscrire", "étape", "relance automatique", "mes envois"]
priority: 9
---

# Email Hub

## Overview

Everything email lives in one hub: **Sidebar → Communication → Email Hub** (`/manager/emails`). The tabs are grouped by job:

| Tab | URL | What it is for |
|---|---|---|
| Vue d'ensemble | `/manager/emails` | What needs attention today: unread replies, bounces, mailboxes in error, sequences that can't send. Also mailbox health, sequences, templates and recent activity |
| Réception | `/manager/emails/inbox` | Prospect replies and conversations, with a CRM panel showing the linked contact, company, mission and client |
| Envoyés | `/manager/emails/sent` | Every email the team sent, with status filters (sent, opened, replied, bounced, failed) and CSV export |
| Séquences | `/manager/emails/sequences` | Automatic multi-step follow-ups |
| Templates | `/manager/emails/templates` | Shared email templates, assigned to missions |
| Campagnes | `/manager/emails/campaigns` | ReachInbox campaign statistics, and linking campaigns to clients |
| Boîtes mail | `/manager/emails/mailboxes` | Sending accounts: sync, daily limits, signatures, mission defaults |
| Analytics | `/manager/emails/analytics` | Opens, replies and bounces over time, by mailbox, mission, SDR, sequence or template |

The **Écrire** button in the tab bar opens the composer.

Old URLs (`/manager/email/...`, `/manager/emailing`, `/sdr/email`, `/client/portal/email`) redirect to the right tab.

### Deep links
- `/manager/emails/inbox?thread=<id>` opens a conversation (also `?folder=`, `?mailbox=team`, `?q=`, `?compose=1`).
- `/manager/emails/templates?template=<id>` opens a template; `?new=1` starts a new one; `?mission=<id>` filters by mission.
- `/manager/emails/mailboxes?mailbox=<id>` opens a mailbox's settings.
- `/manager/emails/sent?status=REPLIED&mission=<id>` gives a filtered list of sent emails.

---

## Inbox (Réception)

- **Folders:** Réception, Non lus, Favoris, Envoyés, Archives, Corbeille, Tous les messages, plus custom labels.
- **Managers** can switch to **Toute l'équipe** to read every mailbox.
- **CRM panel** (right side): shows the linked contact, company, mission and client, with links to their pages.
  - **Lier automatiquement** matches the conversation to a contact by email address.
  - You can also search and link by hand.
  - Labels and internal notes are in the same panel.
- **Reply, reply all, forward:** forward includes the original message.
  - The composer offers **mission templates** first, then the library.
  - Variables like `{{firstName}}` are filled in from the linked contact.
  - The AI draft uses the message you are replying to.
- **Keyboard shortcuts:**
  - `j`/`k`: next or previous conversation
  - `e`: archive
  - `s`: star
  - `r`: reply
  - `a`: reply all
  - `f`: forward
  - `c`: new email
  - `/`: search
  - `?`: list of all shortcuts

---

## Connecting a mailbox

Go to **Boîtes mail** and click **Ajouter une boîte**.
- **Gmail** or **Outlook / Microsoft 365**: complete the OAuth flow. You come back to Boîtes mail with a confirmation.
- **IMAP/SMTP**: enter the servers, then click **Tester** before saving.
- **ReachInbox**: connected from the **Campagnes** tab using your API key.

Click a mailbox to open its settings. You can change:
- display name and signature
- daily send limit
- tracking domain
- which missions use it as their **default mailbox** (SDRs send from the mission's default mailbox on the call screen)
- team access

You can also run **Synchroniser maintenant** and see the last error. Warmup is done in ReachInbox, not in the CRM.

A mailbox in **sync error** shows up in red on Vue d'ensemble and on its card, with the error message and a **Réessayer** button.

---

## Templates

- **Library:** search, filter by category or mission, sort by most recent or most used. Each card shows its missions and how often it has been used.
- **Editor:** a form on the left and a live preview with a fictional contact on the right.
  - Click a variable to insert it at the cursor.
  - Unknown variables are flagged.
  - **Générer avec l'IA** is available.
  - Missions are assigned inside the editor.
- **Categories:** Prospection, Relance, Nurturing, Closing, Autre.
- A template with **no mission** is not visible to SDRs on the call screen. The library warns about these.

### Variables
- **Contact:** `{{firstName}}`, `{{lastName}}`, `{{fullName}}`, `{{title}}`, `{{email}}`, `{{phone}}`
- **Company:** `{{companyName}}`, `{{industry}}`, `{{website}}`
- **Sender:** `{{senderName}}`, `{{senderFirstName}}`, `{{senderEmail}}`, `{{senderPhone}}`
- **Mission:** `{{missionName}}`, `{{clientName}}`
- **Date:** `{{currentDate}}`

Fallback: `{{firstName|Madame, Monsieur}}` is used when the value is empty. French aliases such as `{{prenom}}` and `{{entreprise}}` also work.

---

## Email sequences

A sequence sends several emails automatically, spaced over days, and stops when the contact replies.

### Create
1. **Séquences → Nouvelle séquence.**
2. Build the **timeline** of emails (Jour 0, +3 jours…). For each email you can:
   - start from a template;
   - insert variables;
   - preview it with a sample or a real contact;
   - use **M'envoyer un test**.
   An email with an empty subject is sent as a reply in the same conversation.
3. In **Réglages**, set:
   - the mailbox;
   - sending hours and days, and the timezone (Europe/Paris by default);
   - stop when the contact replies or the email bounces;
   - tracking.

### Enrol contacts
On the sequence page, go to **Contacts inscrits → Inscrire des contacts**, choose a mission, then optionally a list. Search and select contacts.
- The screen shows who is skipped and why: no email, excluded, unsubscribed, already enrolled.
- Draft or paused sequences accept contacts but send nothing until they are activated.

### Activate
**Activer la séquence** only works once the checklist is complete:
- an active mailbox
- complete emails
- at least one contact waiting
- no `[…]` placeholder left in the text

### Statuses
| Sequence | Meaning |
|---|---|
| Brouillon | Being built, sends nothing |
| Active | The engine sends the due emails within the sending window |
| En pause | Nothing is sent; contacts keep their position |
| Archivée | Finished, read-only |

| Contact | Meaning |
|---|---|
| En cours | Will receive the next email |
| En pause | Paused for this contact |
| Terminé | Received every email |
| A répondu | Replied, so the sequence stopped |
| Rebond | The address bounced, so the sequence stopped |
| Désinscrit / Retiré | Opted out, or removed by hand |

### The sending engine
- The engine runs every 5 minutes.
- It respects each mailbox's daily limit: when the limit is reached, the rest moves to the next day.
- It retries 3 times on error.
- If the Séquences page shows **"Le moteur d'envoi n'a pas tourné depuis…"**, the scheduled job is not running: no sequence email is being sent. Tell the tech team (the `/api/cron/email-sequences` job and `CRON_SECRET`).

---

## Sending an individual email

### From the call screen (SDR)
1. On `/sdr/action`, choose the result **Envoie mail**.
2. The composer opens with the **mission's default mailbox** and the **mission templates**.
3. Click **Envoyer**. A message offers **Voir la conversation**.

If the SDR sees "Aucune boîte", the mission has no default mailbox: a manager sets it in **Boîtes mail** (mailbox settings) or in the mission.

### From contact or company drawers
Each drawer has an **Emails** section showing the history of conversations with that contact or company. Click a conversation to open it.

---

## SDR / BD: Email Hub (`/sdr/emails`)
- **Mes envois**: emails you sent, with status (sent, opened, replied, bounced), filters and CSV export. Click a row to see its content and open the conversation.
- **Réception**: replies to your emails, plus the mailbox you own if you have one.
- People who own a mailbox open on Réception; the others open on Mes envois.

## Client portal: Emailing (`/client/portal/emailing`)
Two tabs:
- **Campagnes**: ReachInbox statistics.
- **Emails envoyés**: emails the team sent for your missions, with filters and CSV export.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| A mailbox is in sync error | Boîtes mail → open the mailbox → read the last error → **Réessayer**. For Gmail or Outlook, reconnect the account (OAuth expired) |
| An SDR can't send from the call screen | Check the mission has a default mailbox (mailbox settings → Missions) and the SDR is assigned to the mission |
| Sequence emails aren't going out | The sequence must be **Active**, the contact **En cours**, and the mailbox under its limit and within the sending window. Also check the engine warning on Séquences |
| A contact stopped receiving the sequence | Check their status: A répondu, Rebond, Désinscrit |
| Open rate shows "—" | No email in the period was tracked (tracking off) |
| A variable came out empty | Missing on the contact: use a fallback `{{firstName|Bonjour}}` |
