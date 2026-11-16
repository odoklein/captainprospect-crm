"use client";

import { AlertTriangle, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/recipes";
import { useChangelog } from "./ChangelogProvider";
import { formatWindow } from "./format";

/** Top-bar entry: a quiet icon until something is new, then a count. */
export function ChangelogLauncher() {
    const c = useChangelog();
    if (!c) return null;
    const label = c.unread ? `Nouveautés : ${c.unread} non lue${c.unread > 1 ? "s" : ""}` : "Nouveautés";
    return (
        <button
            type="button"
            onClick={() => c.open()}
            onPointerEnter={c.prefetchPanel}
            onFocus={c.prefetchPanel}
            aria-haspopup="dialog"
            aria-label={label}
            title={label}
            className={cn(
                "relative w-7.5 h-7.5 rounded-lg border flex items-center justify-center shadow-2xs transition-colors duration-150",
                c.unread
                    ? "border-accent-200 bg-accent-50 text-accent-700 hover:bg-accent-100"
                    : "border-line bg-white text-ink-3 hover:text-ink hover:border-line-strong hover:bg-surface-2",
                FOCUS_RING,
            )}
        >
            <Sparkles className="w-3.5 h-3.5" aria-hidden />
            {c.unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-accent-600 text-white text-[10px] font-bold leading-4 text-center ring-2 ring-white tabular-nums">
                    {c.unread > 9 ? "9+" : c.unread}
                </span>
            )}
        </button>
    );
}

/** One slim bar for the most urgent warning (maintenance…), until dismissed. */
export function ChangelogBanner() {
    const c = useChangelog();
    const item = c?.items.find((i) => i.banner);
    if (!c || !item) return null;
    const when = formatWindow(item.startsAt, item.endsAt);
    return (
        <div role="status" className="mx-3 mt-2 sm:mx-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-[13px] text-amber-950">
            <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
            <p className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{item.title}</span>
                {when && <span className="text-amber-800"> · {when}</span>}
            </p>
            <button type="button" onClick={() => c.open(item.id)} className={cn("shrink-0 rounded-md px-2 py-1 text-[12.5px] font-semibold text-amber-900 hover:bg-amber-100", FOCUS_RING)}>
                Détails
            </button>
            <button type="button" onClick={() => c.dismissBanner(item.id)} aria-label="Masquer ce message" className={cn("shrink-0 rounded-md p-1 text-amber-700 hover:bg-amber-100", FOCUS_RING)}>
                <X className="size-3.5" aria-hidden />
            </button>
        </div>
    );
}
