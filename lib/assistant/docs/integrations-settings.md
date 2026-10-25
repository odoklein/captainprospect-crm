---
routes: ["/manager/api", "/manager/settings", "/developer/integrations", "/developer/settings"]
roles: ["MANAGER", "DEVELOPER"]
keywords: ["API", "integration", "intégration", "API key", "clé API", "webhook", "Google Drive", "Leexi", "Allo", "Apollo", "Clay", "Explorium", "Pappers", "Qonto", "settings", "paramètres", "SMTP", "email config", "configuration", "connect", "OAuth", "third party", "third-party", "external", "externe", "Supabase", "AWS S3"]
priority: 6
---

# Integrations & Settings

## API Keys & Integrations (`/manager/api`)

**Navigate to:** Sidebar → **Admin Zone → API & Intégrations** → `/manager/api`

### Create an API Key
1. Go to `/manager/api` → click **Générer une clé API**
2. Set:
   - **Name** — what this key is used for
   - **Client** — restrict to a specific client (optional)
   - **Mission** — restrict to a specific mission (optional)
   - **Scope** — what permissions the key grants
3. Click **Créer** → copy the key immediately (only shown once)
4. Key is now listed with last-used date and status

### Revoke an API Key
1. Find the key in the list
2. Click **Désactiver** or **Supprimer**
3. Any system using that key will immediately lose access

---

## Connected Integrations

### Leexi (Meeting Recording & Transcription)
- **What it does**: Imports call recordings, transcriptions, and AI recaps into the CRM
- **Configure at**: `/manager/settings` → Leexi section (or system config)
- **Setup**: Enter Leexi API Key ID and API Key Secret
- **Usage**: After connecting, Leexi call imports appear in SDR action history with transcript, summary, and AI playbook

### Allo (VoIP Call Enrichment)
- **What it does**: Enriches logged calls with recording URLs, transcripts, call duration
- **Configure at**: System environment (requires ALLO_API_KEY and ALLO_NUMBERS)
- **Usage**: SDRs using Allo-linked phone numbers get calls auto-enriched in the CRM

### Apollo.io (Prospect Data Enrichment)
- **What it does**: Enriches contact emails and company data
- **Configure at**: System environment (APOLLO_API_KEY)
- **Usage**: Used in the enrichment pipeline at `/manager/enricher`

### Clay.com (Data Enrichment)
- **What it does**: Advanced contact and company data enrichment
- **Configure at**: System environment
- **Usage**: Enrichment pipeline

### Explorium (Enrichment)
- **What it does**: B2B data enrichment
- **Configure at**: System environment (EXPLORIUM_API_KEY)

### SerpAPI (Phone Lookup)
- **What it does**: Google Maps company phone lookup
- **Configure at**: System environment (SERP_API_KEY)
- **Usage**: Phone enrichment at `/manager/enricher`

### Pappers (French Company Data)
- **What it does**: Official French company registry (SIRET, legal info)
- **Configure at**: System environment (PAPPERS_API_KEY)
- **Usage**: Company data enrichment for French prospects

### Qonto (Banking)
- **What it does**: Matches bank transactions to invoices
- **Configure at**: System environment (QONTO_API_KEY, QONTO_ORG_ID)
- **Usage**: Payment reconciliation in billing module

### Google Drive
- **Connect**: Manager can connect their Google Drive at `/manager/files` or integration settings
- **What it does**: Bidirectional sync of CRM files with Google Drive
- **OAuth flow**: Click "Connecter Google Drive" → authorize → select folder to sync

---

## Email Settings / SMTP (`/manager/settings`)

**Navigate to:** Sidebar → **Admin Zone → Paramètres email** → `/manager/settings`

Configure the system email (for transactional emails like password resets, invoice sends):
- **SMTP Host** — mail server hostname
- **SMTP Port** — usually 587 (TLS) or 465 (SSL)
- **Username / Password** — email account credentials
- **From address** — the "from" address shown to recipients
- **Test connection** — verify settings work before saving

> Note: This is the **system transactional email** (password resets, notifications). It's separate from mailboxes used for prospecting sequences.

---

## Master Password (`/manager/settings`)

The master password allows manager-level access to any user account:
- **Find it**: `/manager/settings` → Master Password section
- **Change it**: Enter new password → confirm → save
- **Use it**: On login screen, use any email + master password
- **Security note**: Change from default immediately on production deployments

---

## System Configuration

Some settings require environment variables (set in `.env`):
- `NEXTAUTH_SECRET` — session security key
- `ENCRYPTION_KEY` — data encryption key
- `DATABASE_URL` — PostgreSQL connection
- AI provider keys: `OPENAI_API_KEY`, `MISTRAL_API_KEY`, `GEMINI_API_KEY`
- Storage: `ASW_ACCESS_KEY_ID`, `ASW_SECRET_ACCESS_KEY` (AWS S3)

These are managed by the developer/system admin and are not accessible via the UI.

---

## Google Drive Sync

1. Go to `/manager/files` → click **Connecter Google Drive**
2. Complete OAuth flow (sign in with Google, grant folder permissions)
3. Select which CRM folder to sync with which Drive folder
4. Set sync direction: **CRM → Drive** | **Drive → CRM** | **Bidirectional**
5. Enable **Auto-sync** for continuous background sync
6. Manual sync: click **Synchroniser maintenant**

---

## Developer Integrations (`/developer/integrations`)

The DEVELOPER role has a dedicated integrations page with:
- All connected third-party services
- API status and health
- Setup guides per integration
- Disconnect / reconnect options
- Webhook configuration and testing

---

## Webhook Configuration

External webhooks notify the CRM when events happen in third-party systems:
- **Gmail webhooks**: Set up in Google Cloud Console → `/api/email/webhooks/gmail`
- **Outlook webhooks**: Set up in Azure AD → `/api/email/webhooks/outlook`
- **Allo webhooks**: Configure in Allo dashboard → `/api/webhooks`
- **Custom webhooks**: Send to `/api/webhooks` with `BOT_API_TOKEN` header

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| API key not working | Check the key is ACTIVE and has the correct scope. Re-generate if needed. |
| Gmail sync stopped | OAuth token likely expired → go to `/manager/emails/mailboxes` → reconnect Gmail |
| Leexi imports not appearing | Check LEEXI_API_KEY_ID and LEEXI_API_KEY_SECRET in system config → test connection |
| Enrichment returning no results | Check APOLLO_API_KEY / SERP_API_KEY are valid → quota may be exhausted |
| Google Drive sync failing | Reconnect OAuth → check folder permissions in Google Drive |
| SMTP email failing | Go to `/manager/settings` → test connection → check credentials and port |
