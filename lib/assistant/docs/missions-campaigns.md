---
routes: ["/manager/clients", "/manager/campaigns", "/manager/lists"]
roles: ["MANAGER", "BUSINESS_DEVELOPER"]
keywords: ["mission", "campaign", "campagne", "créer mission", "nouvelle mission", "lancer", "client", "objectif", "script", "SDR assign", "assigner", "activer", "désactiver", "pause", "archiver", "statut mission", "liste", "prospect", "create mission", "new mission", "launch"]
priority: 9
---

# Missions & Campaigns

## What is a Mission?

A **mission** is a prospecting project for a client. It defines:
- The **client** it belongs to
- The **channel** (CALL, EMAIL, LINKEDIN)
- The **dates** (start → end)
- The **objective** (what you're trying to book)
- The **scripts** used by SDRs

Missions contain **campaigns**, which contain **lists** of contacts.

Hierarchy: **Client → Mission → Campaign → List → Company → Contact**

---

## Create a New Mission (3-Step Wizard)

**Navigate to:** `/manager/missions/new`, or **Clients** → click a client → onglet **Missions** → **Nouvelle mission**.

### Step 1 — Mission Details
- **Nom de la mission** — clear, descriptive name (e.g. "Prospection SaaS Q2 2025")
- **Objectif** — what the mission aims to achieve (e.g. "Qualifier des leads pour l'équipe commerciale")
- **Canal** — choose one: **CALL** (phone prospecting) | **EMAIL** (email outreach) | **LINKEDIN**
- **Date de début / fin** — defines the active period
- **Client** — assign to an existing client (create client first if needed)

### Step 2 — Scripts (for CALL missions)
- **Introduction** — opening line, how SDR introduces themselves
- **Découverte** — discovery questions to qualify
- **Objections** — how to handle common pushbacks
- **Closing** — how to book the meeting

For EMAIL or LINKEDIN missions, this step can be skipped or filled with messaging templates.

### Step 3 — Review & Launch
- Review all settings
- Click **Lancer la mission** — the mission becomes ACTIVE
- It now appears in SDR filters and dashboards

---

## After Creating a Mission: Next Steps

1. **Create a campaign** at `/manager/campaigns/new` → link it to the mission
2. **Create a prospect list** at `/manager/lists/new` → assign to the mission  
3. **Assign SDRs** via planning at `/manager/planning` → allocate the mission to SDR days
4. **SDRs** can now see the mission in their dashboard and start calling

---

## Mission Statuses

| Status | Meaning |
|--------|---------|
| DRAFT | Created but not launched yet |
| ACTIVE | Running — SDRs can work it |
| PAUSED | Temporarily halted |
| COMPLETED | Finished — still visible in history |
| ARCHIVED | Hidden from main views |

To change status: open mission → use the **status button** (top right of mission detail).

---

## Edit a Mission

1. Go to **Clients** → open the client → onglet **Missions** → find the mission
2. Click the mission row → opens mission detail
3. Click **Modifier** (Edit) button
4. Update fields → **Sauvegarder**

---

## Pause / Archive a Mission

- **Pause:** Mission remains visible but SDRs can't work it. Use during breaks.
- **Archive:** Mission moves to archived view. Use when fully completed.

Both options available via the **status dropdown** on the mission detail page.

---

## Campaigns

A **campaign** is a sub-project within a mission. It defines:
- **ICP** (Ideal Customer Profile) — who to target
- **Pitch** — the value proposition
- **Script** — specific call/email script for this segment
- **Rules** — qualification criteria

### Create a Campaign
1. Go to `/manager/campaigns/new`
2. Link to a mission
3. Fill: name, ICP, pitch, script
4. Set status to **Active** → SDRs can use it

### Pause / Activate a Campaign
- On the campaigns list (`/manager/campaigns`): click the **Play/Pause icon** on the campaign row
- ACTIVE = SDRs see it | PAUSED = hidden from SDR views

---

## Mission Performance

Check mission performance at `/manager/analytics`:
- Filter by **mission** to isolate stats
- View: actions count, meetings booked, conversion rate, SDR breakdown

Also visible at `/manager/dashboard` → mission summary cards at the bottom.

---

## Assign a Mission to SDRs

Missions are not directly "assigned" to SDRs — instead, you **schedule SDR days** for a mission:

1. Go to `/manager/planning`
2. Select the month
3. Click on an SDR row or day cell
4. **Add allocation** → select mission, set number of days
5. SDR now sees the mission in their schedule at `/sdr/calendar`

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Mission doesn't appear for SDR | Check it's ACTIVE and SDR has a schedule block for it this month |
| Can't find a mission | Open its client from `/manager/clients` → onglet **Missions** — check if it's archived |
| SDR sees wrong mission | Check their planning allocations at `/manager/planning` |
| Scripts not showing on call screen | Check campaign has a script and is ACTIVE |
