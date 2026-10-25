# Brand — defaults and runtime branding

The brand has two layers:

| Layer | Where | Who changes it |
|---|---|---|
| **Defaults** | `brand/brand.config.ts`, `brand/fonts.ts`, `public/brand/*` | Developers, at build |
| **Runtime brand** of an instance | `BrandSettings` table (one row) | The manager (**Paramètres → Identité**) or the control plane (`/api/instance/brand`) |

One image serves every agency: each instance has its own database and its own
`BrandSettings` row. An empty or missing table renders the defaults, i.e. the
Captain Prospect brand. Operating instances, the signed API, logo uploads and
env vars: **`docs/WHITE_LABEL.md`**.

## 1. Reading the brand in code

The runtime brand is per instance and comes from the database, so it cannot be
a module-level constant.

| Where | How |
|---|---|
| Server component, route handler, server action | `const brand = await getBrand()` (`@/lib/brand/server`, cached 60 s, never throws) |
| Client component | `const brand = useBrand()` / `useBrandHelpers()` (`@/lib/brand/client`) |
| Email, PDF, export, AI prompt helper | take a `brand: Brand` argument (optional, defaulting to the config brand); resolve it once at the route/worker boundary with `getBrand()` and pass it down |
| Logo | `<BrandLogo />` (`components/brand/BrandLogo.tsx`), already reads `useBrand()` |
| Per-instance browser config (socket, OpenReplay, feature flags) | `useRuntimeConfig()` / `getRuntimeConfig()` (`@/lib/runtime-config/client`) |

`import { brand } from "@/lib/brand"` still compiles everywhere, but it is the
**config defaults only**: anything that renders it shows Captain Prospect
values on another agency's instance. Treat a new bare `brand.*` in rendered
output as a bug. The helpers `brandUrl`, `brandSender`, `brandIcsProdId` and
`brandTitle` accept the runtime brand as their last argument.

Never read `process.env.NEXT_PUBLIC_*` literally: Next inlines it at build, in
server bundles too. Use `runtimeEnv()` (`@/lib/runtime-config/env`) on the
server and the runtime config on the client.

## 2. Defaults checklist (`brand.config.ts`)

These values are what a fresh or un-migrated instance shows, and what the
`BrandSettings` columns default to.

| Step | File | What to change |
|---|---|---|
| 1 | `brand/brand.config.ts` | Names, tagline, app URL, sender and support emails, locale |
| 2 | `brand/brand.config.ts` → `colors` | Two seed colours: `primary` (structure) and `accent` (highlight) |
| 3 | `public/brand/*` | Replace the 6 images and keep the file names (see below) |
| 4 | `brand/fonts.ts` | Optional: add a family as a new preset (see §5) |
| 5 | `app/favicon.ico` | Optional: export your favicon as `.ico` (browsers that ignore `<link rel=icon>`) |
| 6 | Container env | `NEXTAUTH_URL` (or `APP_URL`), `EMAIL_FROM`, SMTP; the env app URL overrides the stored one |

If you change a default, also change the matching column default in
`prisma/schema.prisma` (`BrandSettings`) so the two stay equal.

Then run the app and open **/design-system** (any signed-in user). It shows
the generated ramps, contrast checks and every component in the current brand.

## 3. Colours

You give two seeds (config defaults, or `primaryColor` / `accentColor` in
`BrandSettings`). `lib/brand/color.ts` derives everything else in OKLCH:

- **primary**: the darkest logo colour. Sidebar, hero cards, primary buttons.
  The seed lands on the shade that matches its lightness (Captain Prospect
  navy `#263460` → `primary-900`).
- **accent**: the lively logo colour. Active nav, selection, focus ring, AI.
  (Captain Prospect rose `#C64B8B` → `accent-500`).
- **neutral**: greys tinted with the primary hue (`neutralTint`, 0 to 1).

Status colours (success, warning, danger, info) mean the same thing for every
agency. They are fixed in `app/globals.css` and not derived from the brand.

How the colours reach the UI:

```
brand.config.ts + BrandSettings ─▶ lib/brand/resolve.ts ─▶ getBrand() ─▶ components/brand/BrandStyle (<style> :root vars)
                                                                              │
app/globals.css  roles: --ds-primary --ds-accent --ds-ink --ds-line --ds-surface …
                 Tailwind: bg-primary  text-ink-2  border-line  bg-accent-50 …
```

Server code (emails, PDFs) reads the same hex values from
`brand.palette.primary[900]` etc. on the brand returned by `getBrand()`.

**Rules for components:** use role utilities (`bg-primary`, `text-ink-3`,
`border-line`, `bg-success-soft`). Never write a brand hex in a component.
Older screens that still use `indigo-*`, `violet-*` or any grey family
follow the brand anyway, because those families are aliased in `globals.css`.

## 4. Logos

Defaults live in `public/brand/`; an instance can upload its own per slot
(PNG, WebP or sanitised SVG, ≤ 2 MB, ≤ 4096 px, stored in MinIO, served by
`/api/brand/assets/:slot`). A slot with no upload uses the default file.

| Slot | Default file | Used for | Notes |
|---|---|---|---|
| `full` | `logo.png` | Full logo on light backgrounds (login, PDFs) | Set `logos.fullWidth/fullHeight` (or `logoFullWidth/Height`) to its pixel size |
| `fullInverse` | `logo-inverse.png` | Full logo on the primary colour (sidebar, dark emails) | Same size as `logo.png` |
| `mark` | `mark.png` | Square symbol on light backgrounds | 512×512, transparent |
| `markInverse` | `mark-inverse.png` | Square symbol on the primary colour | 512×512, transparent |
| `favicon` | `favicon.png` | Browser tab | 512×512 |
| `appleTouchIcon` | `apple-touch-icon.png` | iOS home screen | 180×180, opaque |

In code, always render the logo with `<BrandLogo />`
(`components/brand/BrandLogo.tsx`); never `<img src="/logo…">`. Elsewhere (emails,
PDFs, metadata) use `brand.logos.<slot>` from the runtime brand.

## 5. Fonts

`next/font` downloads families at build, so an instance can only choose among
the presets loaded in `brand/fonts.ts` (`BrandSettings.fontPreset`):

| Preset | Display | Body |
|---|---|---|
| `default` | Bricolage Grotesque | Geist |
| `inter` | Inter | Inter |
| `manrope` | Manrope | Manrope |

Code always uses Geist Mono. To add a family: a new `next/font` call with a
`--font-preset-*` variable in `brand/fonts.ts`, an entry in `FONT_PRESETS`
(`lib/brand/types.ts`), then rebuild the image.

## 6. Text

`brand.name`, `brand.productName`, `brand.tagline`, `brand.companyName`,
`brand.email.*` and `brandUrl("/path", brand)` replace every hard-coded agency
name and URL in the UI, emails, PDFs, exports and AI prompts, always on the
runtime brand. `npm run brand:check` lists hard-coded names and colours left
in the code; anything it reports is a bug.
