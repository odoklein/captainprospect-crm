// ============================================
// BRAND COLOUR MATHS — seed hex → full 50…950 ramp, in OKLCH.
//
// Pure, dependency-free and isomorphic: the root layout uses it to inject the
// CSS tokens, and server code (emails, PDFs) can use it to read the same hex
// values. A new agency gives two seed colours; every shade is derived here so
// the ramps keep Tailwind's rhythm (same lightness steps, same chroma curve)
// whatever the hue.
// ============================================

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Shade = (typeof SHADES)[number];
export type Ramp = Record<Shade, string>;

type Oklch = { l: number; c: number; h: number };

// ── sRGB ⇄ OKLab ⇄ OKLCH ────────────────────────────────────────────────────

function srgbToLinear(v: number): number {
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v: number): number {
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function parseHex(hex: string): [number, number, number] {
    const h = hex.trim().replace(/^#/, "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Invalid hex colour: ${hex}`);
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
}

export function toHex([r, g, b]: [number, number, number]): string {
    const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
    return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

export function hexToOklch(hex: string): Oklch {
    const [r, g, b] = parseHex(hex).map(srgbToLinear);
    const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
    const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
    const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
    const h = (Math.atan2(B, A) * 180) / Math.PI;
    return { l: L, c: Math.sqrt(A * A + B * B), h: h < 0 ? h + 360 : h };
}

/** OKLCH → linear sRGB (may fall outside [0,1] when out of gamut). */
function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
    const rad = (h * Math.PI) / 180;
    const A = c * Math.cos(rad);
    const B = c * Math.sin(rad);
    const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
    return [
        4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
        -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
        -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
    ];
}

function inGamut(rgb: [number, number, number]): boolean {
    return rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);
}

/** OKLCH → hex, reducing chroma (never lightness or hue) until it fits sRGB. */
export function oklchToHex(color: Oklch): string {
    let lo = 0;
    let hi = color.c;
    if (!inGamut(oklchToLinear(color))) {
        for (let i = 0; i < 24; i++) {
            const mid = (lo + hi) / 2;
            if (inGamut(oklchToLinear({ ...color, c: mid }))) lo = mid;
            else hi = mid;
        }
        color = { ...color, c: lo };
    }
    return toHex(oklchToLinear(color).map(linearToSrgb) as [number, number, number]);
}

// ── Ramps ───────────────────────────────────────────────────────────────────

// Lightness of each shade, measured on Tailwind v4's chromatic palettes.
const LIGHTNESS: Record<Shade, number> = {
    50: 0.971, 100: 0.936, 200: 0.885, 300: 0.808, 400: 0.704, 500: 0.62,
    600: 0.541, 700: 0.468, 800: 0.401, 900: 0.348, 950: 0.262,
};

// Relative chroma per shade (1 = the most saturated shade).
const CHROMA: Record<Shade, number> = {
    50: 0.1, 100: 0.2, 200: 0.38, 300: 0.62, 400: 0.86, 500: 1, 600: 1,
    700: 0.9, 800: 0.76, 900: 0.62, 950: 0.48,
};

// Neutral ramp: Tailwind slate's lightness/chroma, re-hued to the brand.
const NEUTRAL: Record<Shade, [number, number]> = {
    50: [0.984, 0.003], 100: [0.968, 0.007], 200: [0.929, 0.013], 300: [0.869, 0.02],
    400: [0.704, 0.035], 500: [0.554, 0.04], 600: [0.446, 0.038], 700: [0.372, 0.038],
    800: [0.279, 0.035], 900: [0.208, 0.035], 950: [0.129, 0.035],
};

/** The shade whose lightness is closest to the seed's — where the seed sits, unchanged. */
export function anchorShade(hex: string): Shade {
    const { l } = hexToOklch(hex);
    return SHADES.reduce((best, s) => (Math.abs(LIGHTNESS[s] - l) < Math.abs(LIGHTNESS[best] - l) ? s : best), 500 as Shade);
}

/**
 * Full ramp around a seed. The seed lands exactly on its nearest shade; the
 * other shades follow Tailwind's lightness steps, with the offset needed to
 * hit the seed fading out towards 50 and 950 so the ends stay usable.
 */
export function rampFromSeed(hex: string, anchor: Shade = anchorShade(hex)): Ramp {
    const seed = hexToOklch(hex);
    const ai = SHADES.indexOf(anchor);
    const dl = seed.l - LIGHTNESS[anchor];
    const peak = seed.c / CHROMA[anchor];
    const out = {} as Ramp;
    SHADES.forEach((s, i) => {
        if (s === anchor) {
            out[s] = toHex(parseHex(hex));
            return;
        }
        const span = i < ai ? ai : SHADES.length - 1 - ai;
        const fade = span === 0 ? 0 : 1 - Math.abs(i - ai) / span;
        out[s] = oklchToHex({ l: LIGHTNESS[s] + dl * fade, c: peak * CHROMA[s], h: seed.h });
    });
    return out;
}

/** Cool/warm grey ramp tinted with the brand hue (≈ Tailwind slate for a blue brand). */
export function neutralRamp(hueFromHex: string, tint = 1): Ramp {
    const { h } = hexToOklch(hueFromHex);
    const out = {} as Ramp;
    for (const s of SHADES) {
        const [l, c] = NEUTRAL[s];
        out[s] = oklchToHex({ l, c: c * tint, h });
    }
    return out;
}

/** WCAG relative-luminance contrast ratio between two hex colours. */
export function contrast(a: string, b: string): number {
    const lum = (hex: string) => {
        const [r, g, bl] = parseHex(hex).map(srgbToLinear);
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
}

/** White or near-black, whichever reads better on `bg`. */
export function readableOn(bg: string, dark = "#0B1220"): string {
    return contrast(bg, "#FFFFFF") >= contrast(bg, dark) ? "#FFFFFF" : dark;
}

/** `#RRGGBB` → `r g b` channels, for `rgb(var(--x) / 0.2)` style alpha use. */
export function hexToChannels(hex: string): string {
    return parseHex(hex).map((v) => Math.round(v * 255)).join(" ");
}
