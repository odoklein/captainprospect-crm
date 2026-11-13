import { cn } from "@/lib/utils";

/**
 * A CRM status as the app shows it everywhere: the configured colour as a
 * single dot, the label in ink. Colour never fills a background.
 */
export function StatusLabel({
    label,
    color,
    className,
    muted,
}: {
    label: string;
    color?: string | null;
    className?: string;
    muted?: boolean;
}) {
    return (
        <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
            <span
                className="h-2 w-2 shrink-0 rounded-full ring-1 ring-inset ring-black/5"
                style={{ background: color ?? "var(--ds-line-strong)" }}
                aria-hidden
            />
            <span className={cn("truncate", muted ? "text-ink-3" : "text-ink")}>{label}</span>
        </span>
    );
}
