"use client";

// How the period's calls ended, at a glance: one bar, segments in true
// proportion, each status a filter. The colours are the CRM's own status
// colours; a status without one gets a neutral grey, never a random hue.

import { cn } from "@/lib/utils";

export interface DistributionItem {
    id: string;
    label: string;
    count: number;
    color?: string | null;
}

const NEUTRALS = ["var(--ds-line-strong)", "var(--brand-neutral-400)", "var(--brand-neutral-300)"];

export function StatusDistribution({
    items,
    selected,
    onToggle,
    className,
}: {
    items: DistributionItem[];
    selected: string[];
    onToggle: (id: string) => void;
    className?: string;
}) {
    const total = items.reduce((n, i) => n + i.count, 0);
    if (total === 0) return null;
    const colorOf = (i: DistributionItem, idx: number) => i.color ?? NEUTRALS[idx % NEUTRALS.length];
    const filtering = selected.length > 0;

    return (
        <div className={cn("space-y-3", className)}>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-3" role="img" aria-label="Répartition des appels par statut">
                {items.map((i, idx) => (
                    <span
                        key={i.id}
                        className={cn("h-full transition-opacity duration-150", filtering && !selected.includes(i.id) && "opacity-25")}
                        style={{ width: `${(i.count / total) * 100}%`, background: colorOf(i, idx) }}
                        title={`${i.label} : ${i.count}`}
                    />
                ))}
            </div>
            <ul className="flex flex-wrap gap-1.5">
                {items.map((i, idx) => {
                    const on = selected.includes(i.id);
                    return (
                        <li key={i.id}>
                            <button
                                type="button"
                                onClick={() => onToggle(i.id)}
                                aria-pressed={on}
                                className={cn(
                                    "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                                    on
                                        ? "border-ink bg-ink text-surface"
                                        : filtering
                                          ? "border-line text-ink-3 hover:text-ink"
                                          : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
                                )}
                            >
                                <span className="h-2 w-2 rounded-full" style={{ background: colorOf(i, idx) }} aria-hidden />
                                {i.label}
                                <span className={cn("tabular-nums", on ? "text-surface/70" : "text-ink-4")}>
                                    {i.count} · {Math.round((i.count / total) * 100)} %
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
