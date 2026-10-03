import type { Metadata } from "next";
import { brand } from "@/lib/brand";
import { SHADES, anchorShade, contrast } from "@/lib/brand/color";
import { DesignSystemGallery, type RampInfo } from "@/components/design-system/DesignSystemGallery";

export const metadata: Metadata = {
    title: "Design System",
    robots: { index: false, follow: false },
};

function rampInfo(name: string, role: string, ramp: Record<number, string>, seed?: string): RampInfo {
    const anchor = seed ? anchorShade(seed) : null;
    return {
        name,
        role,
        swatches: SHADES.map((shade) => {
            const hex = ramp[shade];
            const onWhite = contrast(hex, "#FFFFFF");
            return {
                shade,
                hex,
                isSeed: shade === anchor,
                onWhite: Math.round(onWhite * 10) / 10,
                textOn: onWhite >= 4.5 ? "white" : "ink",
            };
        }),
    };
}

/**
 * Living reference of the brand and the components. Public on purpose: a
 * clone checks its colours here before auth is even configured. Shows no data.
 */
export default function DesignSystemPage() {
    const p = brand.palette;
    const ramps = [
        rampInfo("primary", "Structure — sidebar, hero, primary actions", p.primary, p.primarySeed),
        rampInfo("accent", "Highlight — active, selection, focus, AI", p.accent, p.accentSeed),
        rampInfo("neutral", "Greys tinted with the primary hue — text, lines, surfaces", p.neutral),
    ];
    return (
        <DesignSystemGallery
            ramps={ramps}
            identity={{
                name: brand.name,
                productName: brand.productName,
                tagline: brand.tagline,
                primarySeed: p.primarySeed,
                accentSeed: p.accentSeed,
                onPrimary: p.onPrimary,
            }}
        />
    );
}
