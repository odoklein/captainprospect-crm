import { cn } from "@/lib/utils";
import type { ListStock } from "@/lib/lists/stock";

// One bar per list, three layers over its contacts (lib/lists/stock):
// treated (solid), still reachable (light), no way to reach them (track).
// It answers « how much is done, how much is left to call, how much is dead ».

export function HealthBar({ stock, className, showLabel = true }: { stock: ListStock; className?: string; showLabel?: boolean }) {
    const total = stock.treated + stock.reachable + stock.dead;
    const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
    const title =
        total > 0
            ? `${stock.treated.toLocaleString("fr-FR")} traités · ${stock.reachable.toLocaleString("fr-FR")} joignables à appeler · ${stock.dead.toLocaleString("fr-FR")} sans téléphone ni email`
            : "Liste vide";
    return (
        <div className={cn("flex min-w-0 items-center gap-2", className)} title={title}>
            <div className="flex h-1.5 w-full min-w-[64px] max-w-[140px] overflow-hidden rounded-full bg-surface-3" role="img" aria-label={title}>
                <span className="h-full bg-primary" style={{ width: `${pct(stock.treated)}%` }} />
                <span className="h-full bg-primary/30" style={{ width: `${pct(stock.reachable)}%` }} />
            </div>
            {showLabel && (
                <span className="w-[68px] shrink-0 text-[12px] text-ink-2 tabular-nums">
                    {stock.treatedPct === null ? "—" : `${stock.treatedPct} % traité`}
                </span>
            )}
        </div>
    );
}
