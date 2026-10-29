/**
 * Page geometry, fonts and colours of the assistant PDF. Colours come from the
 * instance brand (the same ramps as the app); the series palette starts with
 * the brand colour and continues with the app's fixed `--viz-n` slots.
 */

import type { Brand } from "@/lib/brand/types";

export const PAGE = { width: 595.28, height: 841.89, margin: 56 };
export const LEFT = PAGE.margin;
export const CW = PAGE.width - PAGE.margin * 2;
/** Content stops here; the footer lives below. */
export const CONTENT_BOTTOM = PAGE.height - PAGE.margin - 8;
export const CONTENT_TOP = PAGE.margin;

export const FONTS = {
    regular: "Helvetica",
    bold: "Helvetica-Bold",
    italic: "Helvetica-Oblique",
    boldItalic: "Helvetica-BoldOblique",
    mono: "Courier",
    monoBold: "Courier-Bold",
} as const;

/** The light-theme `--viz-2..8` slots of app/globals.css (slot 1 is the brand). */
const VIZ = ["#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

export interface Theme {
    brandName: string;
    primary: string;
    primaryStrong: string;
    primarySoft: string;
    primaryTint: string;
    ink: string;
    ink2: string;
    ink3: string;
    ink4: string;
    line: string;
    lineStrong: string;
    zebra: string;
    codeBg: string;
    track: string;
    white: string;
    up: string;
    down: string;
    warn: string;
    series: string[];
    seqLo: string;
    seqHi: string;
    ordinal: string[];
}

export function themeFor(brand: Brand): Theme {
    const P = brand.palette.primary;
    return {
        brandName: brand.name,
        primary: brand.palette.primarySeed,
        primaryStrong: P[800],
        primarySoft: P[50],
        primaryTint: P[100],
        ink: "#0F1216",
        ink2: "#3B424A",
        ink3: "#6B737D",
        ink4: "#A3AAB3",
        line: "#E6E8EB",
        lineStrong: "#CDD1D6",
        zebra: "#F7F8FA",
        codeBg: "#F1F3F5",
        track: "#EEF0F3",
        white: "#FFFFFF",
        up: "#1F8A4C",
        down: "#C2410C",
        warn: "#B45309",
        series: [brand.palette.primarySeed, ...VIZ],
        seqLo: P[50],
        seqHi: P[800],
        ordinal: [P[300], P[400], P[500], P[600], P[700]],
    };
}

export function seriesColor(theme: Theme, i: number): string {
    return theme.series[i % theme.series.length];
}

function rgb(hex: string): [number, number, number] {
    const clean = hex.replace("#", "");
    const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.slice(0, 6);
    const n = Number.parseInt(full, 16);
    if (!Number.isFinite(n)) return [0, 0, 0];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear mix of two hex colours, t in 0..1. */
export function mix(a: string, b: string, t: number): string {
    const [r1, g1, b1] = rgb(a);
    const [r2, g2, b2] = rgb(b);
    const k = Math.max(0, Math.min(1, t));
    const h = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, "0");
    return `#${h(r1, r2)}${h(g1, g2)}${h(b1, b2)}`;
}

/** Relative luminance, to pick a readable text colour on a fill. */
export function isDark(hex: string): boolean {
    const [r, g, b] = rgb(hex).map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}
