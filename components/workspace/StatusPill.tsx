import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { FAMILY_DOT, type StatusFamily } from "@/lib/workspace/status-family";

// A status as the workspaces show it (lib/workspace/status-family): the
// configured colour as a dot, the family deciding the weight. Only three
// families get a tint — a meeting, something pending, an alarm — so a column
// of statuses reads at a glance instead of as a wall of colour.

const FAMILY_CLASS: Record<StatusFamily, string> = {
    positive: "bg-success-soft text-success-ink",
    pending: "bg-warning-soft text-warning-ink",
    alert: "bg-danger-soft text-danger-ink",
    negative: "text-ink-2",
    noreach: "text-ink-3",
};

export function StatusPill({
    label,
    color,
    family,
    summary,
    className,
    title,
}: {
    label: string;
    color?: string | null;
    family: StatusFamily;
    /** An AI summary or a transcript exists for this call. */
    summary?: boolean;
    className?: string;
    title?: string;
}) {
    return (
        <span className={cn("inline-flex min-w-0 max-w-full items-center gap-1", className)} title={title ?? label}>
            <span className={cn("inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium", FAMILY_CLASS[family])}>
                <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full ring-1 ring-inset ring-black/5"
                    style={{ background: family === "alert" ? FAMILY_DOT.alert : color ?? FAMILY_DOT[family] }}
                    aria-hidden
                />
                <span className="truncate">{label}</span>
            </span>
            {summary && <Sparkles className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-label="Résumé disponible" />}
        </span>
    );
}
