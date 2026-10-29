# shadcn/ui layer

Real shadcn/ui components (Radix primitives, copy-in source, current Tailwind 4 /
React 19 shape: function components, `data-slot` attributes, `cva` variants),
restyled on the design-system tokens of `app/globals.css`.

**Rule: build new UI from `components/ui/shadcn`. `components/ui` (Button,
Modal, Tooltip, Select…) stays for the older screens; don't mix the two inside
one new screen.**

## Where things are

| What | Where |
|---|---|
| Components (one file each, shadcn kebab-case names) | `components/ui/shadcn/<name>.tsx` |
| Barrel | `components/ui/shadcn/index.ts` |
| Shared menu row/panel classes (DropdownMenu, ContextMenu, Select) | `components/ui/shadcn/menu-styles.ts` |
| Focus ring recipe (`FOCUS_RING`) | `components/ui/recipes.ts` (reused, not copied) |
| `cn()` | `lib/utils.ts` (tailwind-merge already knows our radius/shadow/text tokens) |
| `--sh-*` tokens, `tw-animate-css` import, reduced-motion rule | `app/globals.css`, section « SHADCN/UI LAYER » |

Dependencies: `radix-ui` (unified package), `cmdk`, `vaul`,
`class-variance-authority`, `tw-animate-css`, plus the existing `clsx`,
`tailwind-merge`, `lucide-react`.

## Import

```tsx
// Preferred: per file, keeps the client bundle to what the screen uses
import { Button } from "@/components/ui/shadcn/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/shadcn/dropdown-menu";

// Also works (barrel)
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn";
```

The API is the ui.shadcn.com API: same component names, same props, `asChild`,
`variant` / `size`, `className` merged last through `cn`. Upstream docs and
examples apply; only the look differs.

## Token mapping

shadcn's semantic theme names (`background`, `popover`, `muted-foreground`,
`ring`, `destructive`…) are **not defined** here: `primary`, `accent`, `muted`,
`foreground` already exist with other meanings. Write our utilities directly.

| shadcn concept | Our utility |
|---|---|
| `bg-background` (page) | `bg-canvas` |
| `bg-card`, `bg-popover`, `bg-background` (on a panel) | `bg-surface` |
| `bg-muted`, `bg-secondary`, `bg-accent` (hover/selected row) | `bg-surface-3` (tracks, hover, selected row); `bg-surface-2` for tiles / quiet hover |
| `text-foreground`, `text-card-foreground` | `text-ink` |
| body / label text | `text-ink-2` |
| `text-muted-foreground` | `text-ink-3` (meta, descriptions), `text-ink-4` (placeholders, shortcuts, icons at rest) |
| `border-border`, `border-input` | `border-line` (hover: `border-line-strong`; dividers inside a panel: `border-line-subtle`) |
| `ring-ring` (focus) | `FOCUS_RING` from `components/ui/recipes` (`ring-focus` + offset); fields: `focus-visible:border-primary-400 ring-4 ring-primary-500/12` |
| `bg-primary text-primary-foreground` | `bg-primary text-primary-fg` (hover `bg-primary-hover`) |
| AI / Captain highlight | `bg-accent text-accent-fg`, soft: `bg-accent-soft text-accent-soft-ink border-accent-200` |
| `bg-destructive` / `text-destructive` | `bg-danger` / `text-danger`; soft: `bg-danger-soft text-danger-ink border-danger-line` |
| success / warning / info | `*-success`, `*-warning`, `*-info` with `-soft`, `-line`, `-ink` |
| `bg-black/50` (overlay) | `bg-sh-scrim` (`--sh-scrim`, ink at 45 %) + `backdrop-blur-[2px]` |
| `rounded-lg` (panels, menus, popovers) | `rounded-panel` (16px) |
| `rounded-md` (controls) | `rounded-control` (12px); h-8 controls `rounded-[10px]`, h-7 `rounded-lg`; menu rows `rounded-[10px]` |
| `rounded-xl` (cards, dialogs) | `rounded-card` (24px) |
| `rounded-full` chips | `rounded-chip` |
| `shadow-xs` (controls) | `shadow-2xs` |
| `shadow-sm` (cards) | `shadow-card` |
| `shadow-md` (popover, menu, dialog) | `shadow-overlay`; tooltips `shadow-raised` |
| `z-50` (overlays) | `z-(--sh-z-modal)` = 120, same as `Modal.tsx` |
| `z-50` (floating: menu, popover, tooltip, select) | `z-(--sh-z-popover)` = 125, above any modal, below toasts (130) |
| skeleton `animate-pulse bg-accent` | `bg-surface-3` + `[background-image:var(--sh-shimmer)]` + `motion-safe:animate-ds-shimmer` |

Concentric radii: panel 16px with `p-1.5` → rows 10px; card 24px → inner tiles 16px.

## Components and our variants

`accordion`, `alert-dialog`, `avatar`, `badge`, `button`, `card`, `checkbox`,
`collapsible`, `command`, `context-menu`, `dialog`, `drawer` (vaul), `dropdown-menu`,
`hover-card`, `input`, `kbd`, `label`, `popover`, `progress`, `radio-group`,
`scroll-area`, `select`, `separator`, `sheet`, `skeleton`, `slider`, `switch`,
`tabs`, `textarea`, `toggle`, `toggle-group`, `tooltip`.

Additions on top of upstream (all optional, upstream usage still works):

- **Button** `variant`: `default | secondary | outline | ghost | destructive | link | ai`;
  `size`: `xs | sm | default | lg | icon-xs | icon-sm | icon | icon-lg` (h-7/8/9/10).
- **Badge** `variant`: upstream `default | secondary | destructive | outline`
  plus soft `success | warning | danger | info | ai`. `destructive` is solid red,
  `danger` is the soft red tag.
- **TabsList** `variant`: `default` (pill track = Accueil SegmentedControl) or
  `underline` (text tabs over a hairline, indicator slides to the active tab).
  Triggers inherit it.
- **Switch** `size`: `default` (20px) | `sm` (16px).
- **Checkbox** shows a minus for `checked="indeterminate"`.
- **Kbd** inside a `TooltipContent` switches to the dark style by itself.

Defaults that differ from upstream: `TooltipProvider` delay 300 ms (upstream 0);
`SelectContent` `position="popper"` (opens under the trigger);
`CommandDialog` `showCloseButton={false}` and French title/description; popover-family
`sideOffset` 6; dialog/sheet headers are left-aligned. Every built-in aria text is
French (« Fermer »).

## Motion

- Enter/exit use `tw-animate-css` (`data-[state=open]:animate-in fade-in-0 zoom-in-95
  slide-in-from-top-2`…), driven by Tailwind's `duration-*` and `ease-*`:
  write `duration-150 ease-snappy` (overlays and sheets `duration-200`). Keep
  durations 150–200 ms, ease `ease-snappy` (`--ease-snappy`); `ease-emphasized`
  only for large surfaces.
- Height animations: `animate-accordion-down/up` (Accordion does it),
  `animate-collapsible-down/up` on a `CollapsibleContent` with `overflow-hidden`.
- Reduced motion: `globals.css` turns off every `animate-in` / `animate-out` /
  accordion / collapsible / vaul animation under `prefers-reduced-motion: reduce`.
  Other transitions you add: prefix with `motion-safe:`.
- No gradients (the skeleton sweep is the one functional exception), no emoji, no
  decorative motion.

## Notes for integrators

- Radix components need a client boundary: every Radix/vaul/cmdk file starts with
  `"use client"`. `button`, `badge`, `card`, `input`, `textarea`, `skeleton`, `kbd`
  are server-safe.
- Each `Tooltip` brings its own provider (upstream behaviour); wrap a region in
  `<TooltipProvider>` only to share skip-delay between neighbours.
- `Sheet` = desktop side/top panel (mobile rail, run details); `Drawer` = mobile
  bottom sheet with drag-to-dismiss.
- Importing `tw-animate-css` also activates the ~50 `animate-in …` class lists that
  older screens already carried (they were inert before): those popovers now fade in.
