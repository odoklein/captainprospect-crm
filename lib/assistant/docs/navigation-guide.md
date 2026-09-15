---
routes: ["/", "/manager", "/sdr", "/bd", "/client", "/commercial", "/developer"]
roles: ["MANAGER", "SDR", "BOOKER", "BUSINESS_DEVELOPER", "CLIENT", "COMMERCIAL", "DEVELOPER"]
keywords: ["navigate", "find", "where", "menu", "sidebar", "page", "go to", "access", "lost", "trouver", "accéder", "naviger", "menu", "page", "où", "comment aller"]
priority: 10
---

# CRM Navigation Guide

## Sidebar Navigation

The **sidebar** on the left is your main navigation tool. It is role-specific — each role sees only the pages they have access to.

- **Collapse/expand** the sidebar using the toggle icon at the bottom.
- On mobile, use the **hamburger icon** to open it.
- Items marked with a badge show live counts (e.g. unread notifications).

---

## Manager: Finding Everything

### Dashboard
- Sidebar → **Accueil** → `/manager/dashboard`
- Shows: team stats, leaderboard, mission summary cards, weekly RDV goal bar

### Team & User Management
- Sidebar → **Équipe** → **Performance** → `/manager/team`
- To **manage users** (add/edit/delete): click the **Réglages** tab at the top of the page
- Direct URL shortcut: `/manager/team?tab=reglages`
- Note: `/manager/users` redirects automatically to Réglages

### Missions
- Missions live **inside the client**: Sidebar → **Suivi** → **Clients** → click a client → **Missions** tab → click a mission
- The mission workspace opens in the client drawer with Général (insights), Stratégies par liste, Stratégie & Scripts, BDD, Avis SDR and Réglages
- Deep link: `/manager/clients?client=<clientId>&mission=<missionId>`
- Create new: **"Nouvelle mission"** in that Missions tab

### Prospect Lists & Contacts
- Sidebar → **Prospection** → **Listes & Prospection** → `/manager/lists`
- Drill into a list to see contacts

### Calls / Actions (Prospection)
- Sidebar → **Prospection** → **Appels** → `/manager/prospection`
- Shows all logged calls and actions across the team

### Meetings (RDV)
- Sidebar → **Suivi** → **SAS RDV** → `/manager/rdv`
- Shows upcoming, scheduled, completed, cancelled meetings

### Analytics & Stats
- Sidebar → **Suivi** → **Statistiques** → `/manager/analytics`
- Filter by date range, mission, SDR

### AI Analysis
- Sidebar → **Suivi** → **Analyse IA** → `/manager/analyse-ia`
- Run and view AI-generated campaign analysis

### Email Hub
- Sidebar → **Suivi** → **Email Hub** → `/manager/emails`
- Manage mailboxes: `/manager/email/mailboxes`
- Manage sequences: `/manager/email/sequences`

### Team Messaging
- Sidebar → **Suivi** → **Messages** → `/manager/comms`

### Planning (Scheduling SDRs)
- Sidebar → **Équipe** → **Planning** → `/manager/planning`
- Conflicts: `/manager/planning/conflicts`

### SDR Feedback
- Sidebar → **Équipe** → **Avis SDR** → `/manager/sdr-feedback`

### Projects
- Sidebar → **Équipe** → **Projets** → `/manager/projects`

### Billing & Invoices
- Sidebar → **Admin Zone** → **Facturation** → `/manager/billing`
- Sub-tabs: Factures · Engagements · Clients · Offres · Paramètres

### API Keys & Integrations
- Sidebar → **Admin Zone** → **API & Intégrations** → `/manager/api`

### Email SMTP Settings
- Sidebar → **Admin Zone** → **Paramètres email** → `/manager/settings`

### Files
- Sidebar → **Admin Zone** → **Fichiers** → `/manager/files`

### Notifications
- Bell icon in top header → or directly `/manager/notifications`

---

## SDR: Finding Everything

### Dashboard
- Sidebar → **Accueil** → `/sdr`
- Shows: today's stats, mission carousel, quick start call button

### Make a Call / Log Action
- Sidebar → **Actions** → **Appeler** → `/sdr/action`
- The next contact auto-loads from the queue

### Callbacks (Rappels)
- Sidebar → **Actions** → **Rappels** → `/sdr/callbacks`
- Shows contacts scheduled to be called back, sorted by date

### My Schedule
- Sidebar → **Actions** → **Calendrier** → `/sdr/calendar`
- Visual blocks by mission

### Action History
- Sidebar → **Actions** → **Historique** → `/sdr/history`
- All past calls/emails/LinkedIn with filters

### My Meetings (RDV)
- Sidebar → **Actions** → **Mes RDV** → `/sdr/meetings`

### Email
- Sidebar → **Communication** → **Email Hub** → `/sdr/emails`

### Internal Messages
- Sidebar → **Communication** → **Messages** → `/sdr/comms`

### Prospect Lists
- Sidebar → **Organisation** → (or via mission dashboard) → `/sdr/lists`

### Planning
- Sidebar → **Organisation** → **Planning** → `/sdr/planning`

---

## Business Developer (BD): Finding Everything

### Dashboard
- Sidebar → **Accueil** → `/bd/dashboard`

### My Clients
- Sidebar → **Commercial** → **Mes clients** → `/bd/clients`

### New Client
- Sidebar → **Commercial** → **Nouveau client** → `/bd/clients/new`

### Missions
- Sidebar → **Commercial** → **Missions** → `/bd/missions`

### Calling & Callbacks
- BD can also prospect: **Appeler** → `/sdr/action` | **Rappels** → `/sdr/callbacks`

### Opportunities
- Sidebar → **Commercial** → **Opportunités** → `/sdr/opportunities`

---

## Client Portal: Finding Everything

### Dashboard
- Auto-lands on `/client/portal` after login
- Shows: action stats, meetings this month with date navigation

### Reports
- Sidebar → **Rapports** → `/client/portal/reporting`
- Select date range, click Generate, then Download or Print

### Meetings
- Sidebar → **Mes RDV** → `/client/portal/meetings`

### Database / Contacts
- Sidebar → **Base de données** → `/client/portal/database`

### Files
- Sidebar → **Fichiers** → `/client/portal/files`

### Sales Playbook
- Sidebar → **Sales Playbook** → `/client/portal/sales-playbook`

### Help
- Sidebar → **Aide** → `/client/portal/aide`

---

## Global Search

Use the **search bar in the top header** to find contacts, companies, missions, and tasks by name — available from any page.
