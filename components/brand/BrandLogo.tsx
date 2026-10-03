import Image from "next/image";
import { brand } from "@/lib/brand";
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
 * The agency logo. Every place that shows the brand goes through this, so a
 * clone only swaps the files listed in brand/brand.config.ts → logos.
 */
export function BrandLogo({ variant = "full", tone = "default", height = 28, className, priority }: BrandLogoProps) {
    const { logos } = brand;
    if (variant === "mark") {
        return (
            <Image
                src={tone === "inverse" ? logos.markInverse : logos.mark}
                alt={brand.name}
                width={height}
                height={height}
                priority={priority}
                className={cn("shrink-0 select-none object-contain", className)}
                style={{ width: height, height }}
            />
        );
    }
    const width = Math.round((height * logos.fullWidth) / logos.fullHeight);
    return (
        <Image
            src={tone === "inverse" ? logos.fullInverse : logos.full}
            alt={brand.name}
            width={width}
            height={height}
            priority={priority}
            className={cn("shrink-0 select-none object-contain", className)}
            style={{ width, height }}
        />
    );
}

export default BrandLogo;
