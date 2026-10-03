import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SURFACE, TONE_SOLID, type Tone } from "./recipes";

interface SectionHeaderProps {
    title: ReactNode;
    icon?: LucideIcon;
    tone?: Tone;
    count?: ReactNode;
    subtitle?: ReactNode;
    /** Controls on the right: segmented filter, "Voir tout", a button. */
    actions?: ReactNode;
    /** Draws the hairline under the header (default on inside a Section card). */
    divider?: boolean;
    className?: string;
}

/** Card header: tone tile + title + count + one line of context, controls on the right. */
export function SectionHeader({ title, icon: Icon, tone = "primary", count, subtitle, actions, divider = true, className }: SectionHeaderProps) {
    return (
        <div className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2", divider && "border-b border-line-subtle pb-4", className)}>
            <div className="flex min-w-0 items-center gap-3">
                {Icon && (
                    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] shadow-xs", TONE_SOLID[tone])}>
                        <Icon className="size-4" aria-hidden />
                    </span>
                )}
                <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                        <h2 className="truncate text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
                        {count !== undefined && (
                            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-2xs font-bold tabular-nums text-ink-2">{count}</span>
                        )}
                    </div>
                    {subtitle && <p className="mt-0.5 truncate text-xs text-ink-3">{subtitle}</p>}
                </div>
            </div>
            {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

interface SectionProps extends Omit<SectionHeaderProps, "divider" | "className" | "title"> {
    title?: ReactNode;
    children: ReactNode;
    /** Removes the body padding (full-bleed tables and lists). */
    flush?: boolean;
    className?: string;
    bodyClassName?: string;
}

/** A page card with an optional SectionHeader. The unit pages are built from. */
export function Section({ title, children, flush, className, bodyClassName, ...header }: SectionProps) {
    return (
        <section className={cn(SURFACE.card, className)}>
            {title !== undefined && <SectionHeader title={title} {...header} className="px-5 pt-5 sm:px-6" />}
            <div className={cn(!flush && "p-5 sm:p-6", flush && title !== undefined && "pt-1", bodyClassName)}>{children}</div>
        </section>
    );
}

export default Section;
