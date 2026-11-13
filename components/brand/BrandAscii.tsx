"use client";

import { useMemo, useSyncExternalStore, type ComponentProps } from "react";
import GradientASCII from "./GradientASCII";

// The Gradient ASCII field, painted in the instance's own brand.
//
// Colours are read at runtime from the ramps BrandStyle injects
// (--brand-primary-*, --brand-accent-*, --brand-neutral-*), so another agency's
// seeds restyle it without code. The ramp runs from quiet to loud — tinted
// neutral → primary → accent — so the brand's highlight lands on the densest
// glyphs. Light or dark comes from the real surface colour, and a brand or
// theme change repaints it. Callers decide how loud it is (see PRESETS).

export type BrandAsciiLook = { colors: string[]; light: boolean };

export function readBrandAsciiLook(): BrandAsciiLook | null {
    const root = getComputedStyle(document.documentElement);
    const token = (name: string) => root.getPropertyValue(name).trim();
    const light = luminance(token("--ds-surface") || "#ffffff") > 0.5;
    const pick = (names: string[]) => names.map(token).filter(Boolean);
    const colors = light
        ? pick(["--brand-neutral-50", "--brand-primary-100", "--brand-primary-300", "--brand-accent-300", "--brand-accent-500"])
        : pick(["--brand-primary-900", "--brand-primary-600", "--brand-accent-500", "--brand-accent-300", "--brand-neutral-50"]);
    return colors.length >= 3 ? { colors, light } : null;
}

/** Relative luminance of any CSS colour the browser understands. */
function luminance(color: string) {
    const probe = document.createElement("canvas").getContext("2d");
    if (!probe) return 1;
    probe.fillStyle = "#fff";
    probe.fillStyle = color;
    const match = /^#([0-9a-f]{6})$/i.exec(String(probe.fillStyle));
    if (!match) return 1;
    const [r, g, b] = [0, 2, 4].map((i) => {
        const c = parseInt(match[1].slice(i, i + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

let webgl2: boolean | null = null;
function supportsWebGL2() {
    if (webgl2 === null) {
        try {
            const canvas = document.createElement("canvas");
            const gl = canvas.getContext("webgl2");
            webgl2 = Boolean(gl);
            gl?.getExtension("WEBGL_lose_context")?.loseContext();
        } catch {
            webgl2 = false;
        }
    }
    return webgl2;
}

function subscribe(onChange: () => void) {
    // A brand or theme change (settings page, theme toggle) repaints the field.
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
}

function snapshot() {
    if (!supportsWebGL2()) return "unsupported";
    const look = readBrandAsciiLook();
    return look ? JSON.stringify(look) : "";
}

/** Brand look for the field; `unsupported` when the browser cannot draw it (show a fallback); null before hydration. */
export function useBrandAscii(): BrandAsciiLook | "unsupported" | null {
    const value = useSyncExternalStore(subscribe, snapshot, () => "");
    return useMemo(() => (value === "unsupported" ? "unsupported" : value ? (JSON.parse(value) as BrandAsciiLook) : null), [value]);
}

type FieldProps = Omit<ComponentProps<typeof GradientASCII>, "colors" | "lightMode">;

/** How loud the field is, per place. Ambient behind work; a statement on the login. */
export const BRAND_ASCII_PRESETS = {
    ambient: {
        shape: "horizon", characters: " ·:-+×", cellSize: 14, density: 0.56, glow: 0.12, flicker: 0.12,
        flow: 0.35, speed: 0.45, grain: 0.04, softness: 0.75, scrambleRadius: 0.08, clickEffect: "wave", dpr: 1,
    },
    hero: {
        shape: "rise", characters: " ·:-+=×#", cellSize: 16, density: 0.72, glow: 0.22, flicker: 0.18,
        flow: 0.5, speed: 0.6, grain: 0.05, softness: 0.6, scrambleRadius: 0.12, clickEffect: "wave", dpr: 1.5,
    },
} satisfies Record<string, FieldProps>;

const OPACITY = {
    ambient: { light: [0.75, 0.2], dark: [0.7, 0.45] },
    hero: { light: [0.85, 0.42], dark: [0.85, 0.6] },
} as const;

export function BrandAscii({ preset, look, ...overrides }: FieldProps & { preset: keyof typeof BRAND_ASCII_PRESETS; look: BrandAsciiLook }) {
    const [glyphOpacity, gradientOpacity] = OPACITY[preset][look.light ? "light" : "dark"];
    return (
        <GradientASCII
            key={look.colors.join(",")}
            colors={look.colors}
            lightMode={look.light}
            glyphOpacity={glyphOpacity}
            gradientOpacity={gradientOpacity}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            {...BRAND_ASCII_PRESETS[preset]}
            {...overrides}
        />
    );
}
