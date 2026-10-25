// ============================================
// BRAND FONTS — the families an instance can pick (BrandSettings.fontPreset).
//
// next/font needs literal calls at module scope and downloads the files at
// build time, so a runtime setting can only choose among the families loaded
// here. Each family exposes a --font-preset-* variable; lib/brand/types.ts
// FONT_PRESETS maps a preset onto them, and lib/brand/tokens.ts points the two
// runtime variables at the chosen ones. app/globals.css maps
//   --font-display → headings, hero figures (Tailwind: font-display)
//   --font-body    → everything else         (Tailwind: font-sans)
//   --font-code    → ids, codes, kbd          (Tailwind: font-mono)
// Adding a family = a new call here + a new FONT_PRESETS entry + a rebuild.
// ============================================

import { Bricolage_Grotesque, Geist, Geist_Mono, Inter, Manrope } from "next/font/google";

// Preset "default" (Captain Prospect)
const defaultDisplay = Bricolage_Grotesque({
    variable: "--font-preset-default-display",
    subsets: ["latin"],
    display: "swap",
});

const defaultBody = Geist({
    variable: "--font-preset-default-body",
    subsets: ["latin"],
    display: "swap",
});

// Alternatives: declared for every instance, downloaded only where used.
const inter = Inter({
    variable: "--font-preset-inter",
    subsets: ["latin"],
    display: "swap",
    preload: false,
});

const manrope = Manrope({
    variable: "--font-preset-manrope",
    subsets: ["latin"],
    display: "swap",
    preload: false,
});

export const codeFont = Geist_Mono({
    variable: "--font-code-face",
    subsets: ["latin"],
    display: "swap",
});

/** Class names to put on <html> so every preset variable exists everywhere. */
export const brandFontVariables = [defaultDisplay.variable, defaultBody.variable, inter.variable, manrope.variable, codeFont.variable].join(" ");
