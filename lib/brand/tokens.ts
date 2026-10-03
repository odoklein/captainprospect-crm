// ============================================
// BRAND → CSS. Serialises the brand palette as CSS custom properties.
//
// The root layout injects the result in <head> (components/brand/BrandStyle),
// so these are the only colour values the CSS ever needs from the config.
// app/globals.css builds the semantic layer (--ds-primary, --ds-ink, --ds-line…) and the
// Tailwind utilities (bg-primary-600, text-ink-2, …) on top of them.
// ============================================

import { SHADES, hexToChannels, type Ramp } from "./color";
import { brand } from "./index";

function rampVars(name: string, ramp: Ramp): string[] {
    return SHADES.map((s) => `--brand-${name}-${s}:${ramp[s]};`);
}

/** `:root{--brand-primary-50:#…;…}` — every brand-derived colour variable. */
export function brandCss(): string {
    const p = brand.palette;
    const vars = [
        ...rampVars("primary", p.primary),
        ...rampVars("accent", p.accent),
        ...rampVars("neutral", p.neutral),
        `--brand-primary:${p.primarySeed};`,
        `--brand-primary-fg:${p.onPrimary};`,
        `--brand-primary-rgb:${hexToChannels(p.primarySeed)};`,
        `--brand-accent:${p.accentSeed};`,
        `--brand-accent-fg:${p.onAccent};`,
        `--brand-accent-rgb:${hexToChannels(p.accentSeed)};`,
    ];
    return `:root{${vars.join("")}}`;
}
