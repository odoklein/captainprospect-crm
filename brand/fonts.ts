// ============================================
// BRAND FONTS — swap the families here when cloning for another agency.
//
// next/font needs literal calls at module scope, so fonts can't live in
// brand.config.ts. Each font exposes a CSS variable; app/globals.css maps
//   --font-display → headings, hero figures (Tailwind: font-display)
//   --font-body    → everything else         (Tailwind: font-sans)
//   --font-code    → ids, codes, kbd          (Tailwind: font-mono)
// Keep the `variable` names; change only the imported families.
// ============================================

import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";

export const displayFont = Bricolage_Grotesque({
    variable: "--font-display-face",
    subsets: ["latin"],
    display: "swap",
});

export const bodyFont = Geist({
    variable: "--font-body-face",
    subsets: ["latin"],
    display: "swap",
});

export const codeFont = Geist_Mono({
    variable: "--font-code-face",
    subsets: ["latin"],
    display: "swap",
});

/** Class names to put on <body> so the three variables exist everywhere. */
export const brandFontVariables = [displayFont.variable, bodyFont.variable, codeFont.variable].join(" ");
