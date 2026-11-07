"use client";

import Image from "next/image";
import { useBrand } from "@/lib/brand/client";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
    /** `full` = symbol + wordmark, `mark` = square symbol only. */
    variant?: "full" | "mark";
    /** `inverse` for the primary colour or any dark surface. */
    tone?: "default" | "inverse";
    /** Rendered height in px; width follows the artwork's ratio. */
    height?: number;
    className?: string;
    priority?: boolean;
};

/**
 * The agency logo. Every place that shows the brand goes through this. The
 * files come from the instance brand (uploads served by /api/brand/assets,
 * else the /public/brand defaults).
 */
export function BrandLogo({ variant = "full", tone = "default", height = 28, className, priority }: BrandLogoProps) {
    const brand = useBrand();
    const { logos } = brand;
    const src =
        variant === "mark"
            ? tone === "inverse" ? logos.markInverse : logos.mark
            : tone === "inverse" ? logos.fullInverse : logos.full;
    // Uploaded files (may be SVG, carry ?v=) are served as-is by our own route.
    const unoptimized = src.startsWith("/api/");
    if (variant === "mark") {
        return (
            <Image
                src={src}
                alt={brand.name}
                width={height}
                height={height}
                priority={priority}
                unoptimized={unoptimized}
                className={cn("shrink-0 select-none object-contain", className)}
                style={{ width: height, height }}
            />
        );
    }
    const width = Math.round((height * logos.fullWidth) / logos.fullHeight);
    return (
        <Image
            src={src}
            alt={brand.name}
            width={width}
            height={height}
            priority={priority}
            unoptimized={unoptimized}
            className={cn("shrink-0 select-none object-contain", className)}
            style={{ width, height }}
        />
    );
}

export default BrandLogo;
