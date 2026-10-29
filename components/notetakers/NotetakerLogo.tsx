import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTETAKERS } from "@/lib/notetakers/catalog";
import { notetakerLogo } from "@/lib/notetakers/guide";

// ============================================
// A note-taker's own app icon (public/integrations/notetakers) on a white
// tile, so dark marks (Fathom, Modjo) and light ones (Grain, Leexi) read the same.
// ============================================

const TILE = {
    xs: "size-4 rounded-[5px]",
    sm: "size-6 rounded-md p-0.5 ring-1 ring-line",
    md: "size-9 rounded-xl p-1 ring-1 ring-line",
    lg: "size-11 rounded-xl p-1.5 ring-1 ring-line",
} as const;

export type NotetakerLogoSize = keyof typeof TILE;

function labelOf(id: string): string {
    return NOTETAKERS.find((n) => n.id === id)?.label ?? id;
}

/** Decorative next to the tool's name (default); pass `labelled` when the logo stands alone. */
export function NotetakerLogo({
    id,
    size = "md",
    labelled,
    className,
}: {
    id: string;
    size?: NotetakerLogoSize;
    labelled?: boolean;
    className?: string;
}) {
    const src = notetakerLogo(id);
    const label = labelOf(id);
    return (
        <span
            title={labelled ? label : undefined}
            className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden bg-white", TILE[size], className)}
        >
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element -- tiny static icon
                <img src={src} alt={labelled ? label : ""} className="size-full rounded-[22%] object-contain" draggable={false} />
            ) : (
                <Mic className="size-1/2 text-ink-3" aria-label={labelled ? label : undefined} aria-hidden={!labelled} />
            )}
        </span>
    );
}

/** A row of logos, « +2 » past `max`. */
export function NotetakerLogoStack({
    ids,
    max = 5,
    size = "sm",
    className,
}: {
    ids: readonly string[];
    max?: number;
    size?: Exclude<NotetakerLogoSize, "xs">;
    className?: string;
}) {
    const shown = ids.slice(0, max);
    const rest = ids.length - shown.length;
    return (
        <span className={cn("inline-flex items-center", className)}>
            <span className="flex items-center gap-1">
                {shown.map((id) => (
                    <NotetakerLogo key={id} id={id} size={size} labelled />
                ))}
            </span>
            {rest > 0 && <span className="ml-1.5 text-xs font-medium text-ink-3">+{rest}</span>}
        </span>
    );
}
