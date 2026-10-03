# Brand — cloning this CRM for another agency

Everything that says "who we are" lives in this folder plus `public/brand/`.
A clone for a new agency should not need to touch a component.

## 1. Checklist

| Step | File | What to change |
|---|---|---|
| 1 | `brand/brand.config.ts` | Names, tagline, app URL, sender and support emails, locale |
| 2 | `brand/brand.config.ts` → `colors` | Two seed colours: `primary` (structure) and `accent` (highlight) |
| 3 | `public/brand/*` | Replace the 6 images and keep the file names (see below) |
| 4 | `brand/fonts.ts` | Optional: swap the Google font families; keep the `variable` names |
| 5 | `app/favicon.ico` | Optional: export your favicon as `.ico` (browsers that ignore `<link rel=icon>`) |
| 6 | `.env` | `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL`, `EMAIL_FROM`, SMTP; these override the config URLs |

Then run the app and open **/design-system** (any signed-in user). It shows
the generated ramps, contrast checks and every component in your brand.

## 2. Colours

You give two seeds. `lib/brand/color.ts` derives everything else in OKLCH:

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
brand.config.ts ─▶ lib/brand/color.ts (ramps) ─▶ components/brand/BrandStyle (<style> :root vars)
                                                     │
app/globals.css  roles: --ds-primary --ds-accent --ds-ink --ds-line --ds-surface …
                 Tailwind: bg-primary  text-ink-2  border-line  bg-accent-50 …
```

Server code (emails, PDFs) reads the same hex values from
`brand.palette.primary[900]` etc. (`import { brand } from "@/lib/brand"`).

**Rules for components:** use role utilities (`bg-primary`, `text-ink-3`,
`border-line`, `bg-success-soft`). Never write a brand hex in a component.
Older screens that still use `indigo-*`, `violet-*` or any grey family
follow the brand anyway, because those families are aliased in `globals.css`.

## 3. Logos (`public/brand/`)

| File | Used for | Notes |
|---|---|---|
| `logo.png` | Full logo on light backgrounds (login, PDFs) | Set `logos.fullWidth/fullHeight` to its pixel size |
| `logo-inverse.png` | Full logo on the primary colour (sidebar, dark emails) | Same size as `logo.png` |
| `mark.png` | Square symbol on light backgrounds | 512×512, transparent |
| `mark-inverse.png` | Square symbol on the primary colour | 512×512, transparent |
| `favicon.png` | Browser tab | 512×512 |
| `apple-touch-icon.png` | iOS home screen | 180×180, opaque |

In code, always render the logo with `<BrandLogo />`
(`components/brand/BrandLogo.tsx`); never `<img src="/logo…">`.

## 4. Text

`brand.name`, `brand.productName`, `brand.tagline`, `brand.companyName`,
`brand.email.*` and `brandUrl("/path")` replace every hard-coded agency name
and URL in the UI, emails, PDFs, exports and AI prompts. Search for the old
agency name after cloning; anything left is a bug.
