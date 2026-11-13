"use client";

import { BrandAscii, useBrandAscii } from "@/components/brand/BrandAscii";
import { cn } from "@/lib/utils";

// Ambient background for the assistant's welcome: the brand's ASCII field,
// kept quiet on purpose. It only exists before the first message, never takes
// a click, and fades out before the suggestions and the composer.
export function AssistantAmbient({ className }: { className?: string }) {
    const look = useBrandAscii();
    if (!look || look === "unsupported") return null;
    return (
        <div
            aria-hidden
            className={cn(
                "pointer-events-none absolute inset-x-0 top-14 -z-10 h-[min(52vh,460px)] motion-safe:animate-ds-enter",
                "[mask-image:radial-gradient(80%_95%_at_50%_0%,#000_28%,transparent_76%)]",
                className,
            )}
        >
            <BrandAscii preset="ambient" look={look} />
        </div>
    );
}
