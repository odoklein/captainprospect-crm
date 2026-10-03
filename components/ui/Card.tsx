import { cn } from "@/lib/utils";
import { HTMLAttributes, forwardRef } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    /**
     * default — white card, hairline border, soft brand-tinted shadow
     * glass — kept as an alias of default (no blur anywhere)
     * elevated — raised card (popovers inside pages, highlighted blocks)
     * interactive — whole card is clickable: border and shadow respond to hover
     * inset — quiet grey tile, for blocks nested inside a card
     * inverse — brand surface (hero blocks)
     */
    variant?: "default" | "glass" | "elevated" | "interactive" | "inset" | "inverse";
    /** Inner padding; defaults to md (24px). */
    padding?: "none" | "sm" | "md" | "lg";
}

const CARD_VARIANTS: Record<NonNullable<CardProps["variant"]>, string> = {
    default: "bg-surface border border-line shadow-card",
    glass: "bg-surface border border-line shadow-card",
    elevated: "bg-surface border border-line shadow-raised",
    interactive:
        "bg-surface border border-line shadow-card cursor-pointer hover:border-line-strong hover:shadow-raised focus-within:border-line-strong",
    inset: "bg-surface-2 border border-line-subtle shadow-none",
    inverse: "bg-inverse text-inverse-ink border border-inverse-line shadow-raised",
};

const CARD_PADDING: Record<NonNullable<CardProps["padding"]>, string> = {
    none: "p-0",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
};

const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ className, variant = "default", padding = "md", children, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    "rounded-2xl transition-[border-color,box-shadow] duration-200 ease-snappy",
                    CARD_VARIANTS[variant],
                    CARD_PADDING[padding],
                    className
                )}
                {...props}
            >
                {children}
            </div>
        );
    }
);

Card.displayName = "Card";

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> { }

const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn("mb-4 flex flex-col gap-1", className)} {...props} />
    )
);

CardHeader.displayName = "CardHeader";

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> { }

const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
    ({ className, ...props }, ref) => (
        <h3
            ref={ref}
            className={cn("text-base font-semibold tracking-tight text-ink", className)}
            {...props}
        />
    )
);

CardTitle.displayName = "CardTitle";

interface CardDescriptionProps extends HTMLAttributes<HTMLParagraphElement> { }

const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(
    ({ className, ...props }, ref) => (
        <p ref={ref} className={cn("text-sm leading-relaxed text-ink-3", className)} {...props} />
    )
);

CardDescription.displayName = "CardDescription";

interface CardContentProps extends HTMLAttributes<HTMLDivElement> { }

const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn("", className)} {...props} />
    )
);

CardContent.displayName = "CardContent";

interface CardFooterProps extends HTMLAttributes<HTMLDivElement> { }

const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
    ({ className, ...props }, ref) => (
        <div ref={ref} className={cn("mt-5 flex items-center justify-end gap-2 border-t border-line-subtle pt-4", className)} {...props} />
    )
);

CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
