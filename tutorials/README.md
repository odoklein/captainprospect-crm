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
│   └── src/             timeline.ts (single source of timing), camera.ts, Stage.tsx, Band.tsx, parts.tsx
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
  For each step it records the before/after screens, the target's hover state, one screen per
  typed character and the options of dropdowns.
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

One continuous shot per tutorial: no cuts or crossfades between steps. Everything is
frame-driven (`useCurrentFrame` + `interpolate`), never CSS transitions; `video/src/timeline.ts`
holds every beat as an absolute frame.

- **Title sequence**: the real page floats in perspective behind the title, then settles flat
  into the stage while the caption band rises.
- **Camera**: zoom-and-pan interpolation that pulls back slightly on long pans (van Wijk),
  eased with a gentle launch and a long landing; it keeps drifting in a hair between moves.
  A control near the top or bottom of the page may bring the window edge into frame.
- **Pointer**: one glide per target on a shallow arc, decelerating into it, landing just after
  the camera. It dims once the result is what matters, and while text is typed.
- **Interaction**: the target shows its real hover state, the ring pops in, the press flashes,
  and the new state spreads from the click as a ripple. Typing plays one real screenshot per
  character; dropdowns show their options and the pick. A page that scrolled slides in.
- **Result**: a green ring glides from the control to what it changed, then the camera frames
  it (or the whole page when everything changed).
- **Captions**: a band under the interface, so they never cover it. Words sharpen in one by
  one; a chip names the gesture (Cliquez, Saisissez, Choisissez, Observez). A step lasts at
  least as long as its caption takes to read (~3.5 words/s).
- Springs have no bounce except on small accents (rings, the final check). Zoom is capped at
  1.7× (captures are taken at 2× so text stays sharp).

## Notes

- Fonts (Bricolage Grotesque, Geist) are vendored in `video/public/fonts` so renders are offline
  and deterministic.
- Remotion is free for individuals and companies up to 3 people; larger companies need a
  company license (https://www.remotion.dev/license).
