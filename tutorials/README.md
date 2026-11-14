# Tutoriels vidéo — espace manager

Short, silent, captioned tutorials (French) for the manager pages, rendered **outside the app**
and served as static files. The CRM only ships a tiny route registry and a lazily loaded player.

```
tutorials/
├── capture/
│   ├── seed/            fictional data (local DB only — refuses any non-localhost DATABASE_URL)
│   ├── storyboards/     one file per tutorial: route, purpose, 3–5 steps, outcome (French text)
│   ├── capture.ts       Playwright: runs storyboards against the real UI, writes screenshots + boxes
│   ├── survey.ts        one screenshot per route (data/layout audit)
│   └── measure-js.ts    JS downloaded on first load per route (bundle impact)
├── video/               Remotion project (one template, one composition per capture)
│   └── src/             timeline.ts (single source of timing), camera.ts, scenes.tsx, parts.tsx
├── render.ts            render → compress → poster → WebVTT → chapters JSON → route registry
└── .claude/skills/      official Remotion agent skills (remotion-dev/skills, see skills-lock.json)
```

Published output (committed):

| File | What |
|---|---|
| `public/tutorials/<id>.mp4` | H.264 1280×720, CRF 29, `+faststart`, no audio track |
| `public/tutorials/<id>.jpg` | poster (title card) |
| `public/tutorials/<id>.vtt` | French captions, same text as the on-screen caption band |
| `public/tutorials/<id>.json` | chapters + transcript shown next to the player |
| `lib/tutorials/registry.generated.ts` | route patterns → tutorial (generated, do not edit) |

## Current tutorials

| id | Page | Routes |
|---|---|---|
| `accueil` | Accueil | `/manager/dashboard` |
| `listes` | Listes | `/manager/lists` (+ `new`, `import`) |
| `sas-rdv` | SAS RDV | `/manager/rdv` |
| `clients` | Clients | `/manager/clients` |
| `fiche-liste` | Fiche d'une liste | `/manager/lists/[id]` (+ `edit`) |
| `espace-mission` | Espace mission | `/manager/clients?mission=…` |
| `appels` | Appels (par mission) | `/manager/prospection` |
| `taches` | Tâches | `/manager/tasks` |

## Run it

Prerequisites: a local Postgres, the app built (`npm run build` at the root) and served on
`localhost:5000`, and the env of that local instance (`DATABASE_URL` on localhost, `NEXTAUTH_SECRET`).
Production cookies are `__Secure-…`: when serving plain HTTP locally, set
`NEXTAUTH_URL=https://localhost:5000` so the middleware reads the same cookie name.

```bash
cd tutorials/video && npm ci          # Remotion workspace (never installed by the app)
cd .. && npx tsx capture/capture.ts   # reseeds, then captures every storyboard (or pass ids)
npx tsx render.ts                     # renders and publishes (or pass ids)
```

- `capture.ts` reseeds first (steps change data, e.g. confirming a RDV); `--no-seed` skips it.
- Remotion downloads its own headless browser; where `remotion.media` is unreachable, point
  `REMOTION_BROWSER` at a local `chrome-headless-shell`.
- Preview while editing: `cd video && npx remotion studio`.

## Change a tutorial

- **Wording only**: edit the storyboard, then `npx tsx render.ts <id>`. Text is synced from the
  storyboard at render time; titles ≤ 46 characters, details ≤ 104 (one line in the caption band).
- **Steps or UI changed**: edit the storyboard, `npx tsx capture/capture.ts <id>`, then render.
- **New page**: add `storyboards/<id>.ts`, list it in `storyboards/index.ts`, capture, render.
  `match` patterns: `*` = one segment, `**` = any suffix, `?param` = query parameter required.

Rules the storyboards follow: describe verified behaviour only (each file notes where it was
checked in the code), one idea per step, 3–5 steps, an observable result. All data is invented.

## Motion rules

Everything is frame-driven (`useCurrentFrame` + `interpolate`), no CSS transitions. Per step:
camera and pointer travel (34 f) → focus ring (12 f) → press (8 f) → before/after crossfade (12 f)
→ camera settles on the result (30 f) → reading hold derived from the caption length.
Captions live in a band under the interface, so they never cover it. Zoom is capped at 1.7×
(captures are taken at 2× so text stays sharp).

## Notes

- Fonts (Bricolage Grotesque, Geist) are vendored in `video/public/fonts` so renders are offline
  and deterministic.
- Remotion is free for individuals and companies up to 3 people; larger companies need a
  company license (https://www.remotion.dev/license).
