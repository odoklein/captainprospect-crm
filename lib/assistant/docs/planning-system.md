---
routes: ["/manager/planning", "/manager/planning/conflicts", "/sdr/calendar", "/sdr/planning"]
roles: ["MANAGER", "SDR", "BOOKER"]
keywords: ["planning", "planification", "schedule", "pinceau", "brush", "gomme", "absence", "congé", "maladie", "formation", "demi-journée", "half day", "copier la semaine", "planifier la semaine", "doublon", "duplicate", "contrat", "jours contrat", "mission day", "jours mission", "SDR sans planning"]
priority: 9
---

# Planning (staffing board)

## Overview

The planning answers one question: **which SDR works on which mission, which day**.
Each cell of the board is one SDR on one working day. A cell holds one mission for
the whole day, or two missions for half a day each (½ matin + ½ après-midi).
Hours are not edited on the board: a day is 09:00–17:00, a half day 09:00–13:00
or 13:00–17:00.

- Manager: **Équipe → Planning** → `/manager/planning`
- SDR with the `pages.planning` permission (team leads): `/sdr/planning` — same board
- SDRs see their own schedule at `/sdr/calendar`

---

## The screen

- **Top bar** — period arrows, zoom **Semaine / 2 semaines / Mois**, the **?** help
  panel, and **Planifier la semaine**.
- **Alerts row** — only real problems, each one clickable:
  - *N SDR sans planning* → click to show only those SDRs (click again to show everyone)
  - *Reprendre la semaine précédente* → appears when most of the team is unplanned
  - *N missions finissent* → list of missions ending in the period, with a **Planifier** button
  - *N doublons* → the same mission posted twice the same day for the same SDR;
    **Supprimer les doublons** cleans them (the contract was counted twice)
  - *N créneaux le week-end · Afficher* → weekends are hidden unless something is planned there
- **Board** — one row per SDR (with the planned / available days of the period under
  the name), one column per working day. Test accounts are hidden (link under the board).
- **Dock** (bottom) — one chip per mission running in the period, with a ring showing
  contract use (days used + planned / contract days). A red dot = ends within 7 days with
  days left; an amber dot = contract exceeded. Then **Absence** (managers), the **brush**
  and the **eraser**.

---

## Planning days

### With the brush (fastest)
1. Click a mission chip in the dock (or press **1–9**).
2. Click-and-drag across cells — several days and several SDRs in one stroke.
3. **Click an SDR's name** to fill their whole row for the period.
4. Hold **Maj (Shift)** while dragging to place a **half day** (the other half keeps
   the mission already there).
5. **Échap** to stop painting.

Painting a full day on a cell that already has another mission **replaces** it.
Cells where the SDR is absent, or outside the mission's dates, are skipped (the
confirmation says how many).

### By clicking
- Click an empty cell → choose Journée / ½ matin / ½ après-midi, then the mission.
  "Ses missions" lists the missions that SDR already works on.
- Click a mission on the board → switch full / half day, **Changer de mission**, or **Retirer**.
- Drag a mission to another cell (another day or another SDR) to move it.

### Erasing
Eraser (**E**), then drag over the cells to empty them.

### Undo
Every action shows a confirmation with **Annuler**; **Ctrl+Z** undoes the last actions
one by one.

---

## Planifier la semaine (bulk)

**Planifier la semaine** opens the week (arrows to pick another week):
- **Reprendre la semaine précédente** — each SDR gets back the missions they had the
  week before, same weekday, same duration, **only on days still free**. Nothing already
  planned is changed; finished missions and absences are skipped. The preview shows how
  many days will be copied before anything happens. The copy can be undone.
- **Planifier à la main** — opens that week with the brush ready.

---

## Absences (managers only)

- Paint with the **Absence** chip (default: Congé), or click an empty cell →
  *Absence ce jour : Congé / Maladie / Formation*.
- Click an absence to change its type or remove it.
- An absent day cannot receive missions; painting an absence on a planned day removes
  the missions of that day.
- **Absences are also read by the HR module** (working days, payroll) — record only real ones.

---

## Contract days

The ring and the mission details count **days used** (before today) + **days planned**
(today onward) against `totalContractDays` of the mission. An SDR-day counts once: a
day split between two missions counts ½ for each, and duplicates count once.
Missions without contract days show "pas de contrat renseigné".

---

## Notifications

Each change sends **one notification per SDR concerned**, summarising the days added
or removed from today onward (past corrections don't notify).

---

## Shortcuts

| Key | Action |
|-----|--------|
| 1 – 9 | Choose a mission (dock order) |
| E | Eraser |
| Échap | Stop painting / close |
| Ctrl + Z | Undo |
| ← → | Previous / next period |
| T | Back to today |
| ? | Help panel |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| SDR doesn't appear | Must be active with role SDR or Business Developer; test accounts are hidden (link under the board) |
| A mission isn't in the dock | It isn't active, or doesn't run during the shown period (check its start/end dates) |
| "Ignoré : SDR absent" | Remove the absence first (click it → Retirer) |
| "Ignoré : hors dates de mission" | The day is before the mission start or after its end |
| "déjà planifié" | The SDR already has that mission that day — no duplicate is created |
| Contract ring looks wrong | Check the mission's contract days in its settings |
| Can't edit absences | Only managers can; SDR team leads plan missions only |
