"use client";

import { useEffect, useState } from "react";
import GradientASCII from "@/components/brand/GradientASCII";
import { cn } from "@/lib/utils";

// Ambient background for the assistant's welcome: a slow field of glyphs in
// the instance's own colours. It only exists before the first message, never
// takes a click, and fades out before the suggestions and the composer.
//
// Colours are read at runtime from the brand ramps BrandStyle injects
// (--brand-primary-*, --brand-accent-*, --brand-neutral-*), so another agency's
// seeds restyle it without code. The ramp runs from quiet to loud: tinted
// neutral → primary → accent, the brand's highlight landing on the densest
// glyphs. Kept quiet on purpose: it frames the welcome, it never competes with
// it. Light or dark is decided from the real surface colour behind it.

type Look = { colors: string[]; light: boolean };

function readLook(): Look | null {
    const root = getComputedStyle(document.documentElement);
    const token = (name: string) => root.getPropertyValue(name).trim();
    const surface = token("--ds-surface") || "#ffffff";
    const light = luminance(surface) > 0.5;
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
    const hex = probe.fillStyle;
    const match = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!match) return 1;
    const [r, g, b] = [0, 2, 4].map((i) => {
        const c = parseInt(match[1].slice(i, i + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function AssistantAmbient({ className }: { className?: string }) {
    const [look, setLook] = useState<Look | null>(null);

    useEffect(() => {
        const update = () => setLook(readLook());
        update();
        // A brand or theme change (settings page, theme toggle) repaints it.
        const observer = new MutationObserver(update);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
        observer.observe(document.head, { childList: true, subtree: true, characterData: true });
        return () => observer.disconnect();
    }, []);

    if (!look) return null;
    return (
        <div
            aria-hidden
            className={cn(
                "pointer-events-none absolute inset-x-0 top-14 -z-10 h-[min(52vh,460px)] motion-safe:animate-ds-enter",
                "[mask-image:radial-gradient(80%_95%_at_50%_0%,#000_28%,transparent_76%)]",
                className,
            )}
        >
            <GradientASCII
                key={look.colors.join(",")}
                colors={look.colors}
                lightMode={look.light}
                shape="horizon"
                characters=" ·:-+×"
                cellSize={14}
                density={0.56}
                glyphOpacity={look.light ? 0.75 : 0.7}
                gradientOpacity={look.light ? 0.2 : 0.45}
                glow={0.12}
                flicker={0.12}
                flow={0.35}
                speed={0.45}
                grain={0.04}
                softness={0.75}
                scrambleRadius={0.08}
                clickEffect="wave"
                dpr={1}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
            />
        </div>
    );
}
