import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ============================================
// EMAIL HUB PAGE — the padded column every hub page (except the inbox) sits in.
// Title row: what the page is, one line on what it's for, the page's actions.
// ============================================

interface EmailHubPageProps {
    title?: string;
    description?: ReactNode;
    /** Buttons on the right of the title (primary action last). */
    actions?: ReactNode;
    /** Small line above the title, e.g. a back link on a detail page. */
    eyebrow?: ReactNode;
    children: ReactNode;
    className?: string;
    /** narrow — editors and forms; wide — tables and dashboards (default). */
    width?: "narrow" | "wide";
}

export function EmailHubPage({ title, description, actions, eyebrow, children, className, width = "wide" }: EmailHubPageProps) {
    return (
        <div
            className={cn(
                "mx-auto w-full px-4 py-5 sm:px-6 sm:py-6",
                width === "narrow" ? "max-w-[960px]" : "max-w-[1440px]",
                className,
            )}
        >
            {(title || actions || eyebrow) && (
                <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
                    <div className="min-w-0">
                        {eyebrow && <div className="mb-1 text-xs font-medium text-ink-3">{eyebrow}</div>}
                        {title && <h1 className="truncate text-xl font-bold tracking-tight text-ink">{title}</h1>}
                        {description && <p className="mt-0.5 max-w-2xl text-[13px] text-ink-3">{description}</p>}
                    </div>
                    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
                </div>
            )}
            {children}
        </div>
    );
}

export default EmailHubPage;
