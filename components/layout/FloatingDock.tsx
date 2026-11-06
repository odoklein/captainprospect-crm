"use client";

// ============================================
// FLOATING DOCK — one home for the app's floating shortcuts.
//
//   useDockItem({ id: "script", label: "Script", icon: FileText, onClick, active })
//   useDockItem(null)   // nothing to show right now
//
// Features register a button while they have something to offer (the script
// of the open prospect, calls left to handle, the idea box…) instead of each
// pinning its own pill to a corner. The dock renders nothing when empty.
//
// Resting state is icons only, so it covers as little of the drawers as
// possible; hovering or focusing a button unfolds its label smoothly.
// It sits above drawers and the softphone dock's reserved band.
// ============================================

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type DockTone = "neutral" | "danger" | "live" | "idea";

export interface DockItem {
    id: string;
    /** Revealed on hover/focus, and the button's accessible name. */
    label: string;
    icon: LucideIcon;
    onClick: () => void;
    /** Small counter on the icon (calls to handle…). */
    badge?: number;
    tone?: DockTone;
    /** Pressed state: the thing it toggles is open. */
    active?: boolean;
    /** Something is happening now (a call ringing). */
    pulse?: boolean;
    /** Lower first. */
    order?: number;
}

type Setter = (id: string, item: DockItem | null) => void;

const SetterContext = createContext<Setter | null>(null);
const ItemsContext = createContext<DockItem[]>([]);

export function FloatingDockProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<Record<string, DockItem>>({});

    const set = useCallback<Setter>((id, item) => {
        setItems((prev) => {
            if (!item) {
                if (!(id in prev)) return prev;
                const next = { ...prev };
                delete next[id];
                return next;
            }
            return { ...prev, [id]: item };
        });
    }, []);

    const sorted = useMemo(
        () => Object.values(items).sort((a, b) => (a.order ?? 50) - (b.order ?? 50)),
        [items],
    );

    return (
        <SetterContext.Provider value={set}>
            <ItemsContext.Provider value={sorted}>{children}</ItemsContext.Provider>
        </SetterContext.Provider>
    );
}

/**
 * Shows `item` in the dock while the calling component is mounted. Pass null
 * to remove it. The item is re-registered on every render, so labels and
 * badges stay live; it is removed on unmount.
 */
export function useDockItem(id: string, item: Omit<DockItem, "id"> | null) {
    const set = useContext(SetterContext);
    useEffect(() => {
        if (!set) return;
        set(id, item ? { ...item, id } : null);
    });
    useEffect(() => {
        if (!set) return;
        return () => set(id, null);
    }, [set, id]);
}

/** Where floating popovers anchored to the dock should sit (above it, same left edge). */
export const DOCK_POPOVER_POSITION =
    "fixed z-[90] left-[calc(var(--cp-sidebar-w,0px)+1rem)] bottom-[calc(4.5rem+var(--softphone-dock-h,0px))]";

export function FloatingDock() {
    const items = useContext(ItemsContext);
    if (items.length === 0) return null;

    return (
        <nav
            aria-label="Raccourcis"
            className={cn(
                "fixed z-[90] left-[calc(var(--cp-sidebar-w,0px)+1rem)] bottom-[calc(1rem+var(--softphone-dock-h,0px))]",
                "flex items-center gap-0.5 rounded-full border border-line bg-surface/90 p-1 shadow-raised backdrop-blur-md",
                "transition-[transform,box-shadow] duration-200 ease-snappy hover:-translate-y-0.5 hover:shadow-overlay",
                "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                "animate-in fade-in slide-in-from-bottom-2 duration-200",
            )}
        >
            {items.map((item) => (
                <DockButton key={item.id} item={item} />
            ))}
        </nav>
    );
}

const TONE_ICON: Record<DockTone, string> = {
    neutral: "text-ink-2",
    danger: "text-danger",
    live: "text-white",
    idea: "text-amber-500",
};

function DockButton({ item }: { item: DockItem }) {
    const Icon = item.icon;
    const tone = item.tone ?? "neutral";
    const live = tone === "live";

    return (
        <button
            type="button"
            onClick={item.onClick}
            aria-label={item.badge ? `${item.label} (${item.badge})` : item.label}
            aria-pressed={item.active}
            className={cn(
                "group relative flex h-10 min-w-10 items-center rounded-full px-[11px] text-[12px] font-semibold",
                "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                live
                    ? "bg-success text-white hover:brightness-110"
                    : item.active
                      ? "bg-primary-soft text-primary-soft-ink"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
        >
            <span className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                {item.pulse && <span className="absolute -inset-1.5 rounded-full bg-white/40 animate-ping" aria-hidden />}
                <Icon
                    className={cn(
                        "relative h-[18px] w-[18px] transition-transform duration-200 ease-snappy group-hover:scale-110 motion-reduce:transition-none",
                        item.active ? "text-primary-soft-ink" : TONE_ICON[tone],
                    )}
                    aria-hidden
                />
                {item.badge ? (
                    <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white tabular-nums ring-2 ring-surface">
                        {item.badge > 99 ? "99+" : item.badge}
                    </span>
                ) : null}
            </span>
            {/* Label unfolds on hover / keyboard focus (grid 0fr → 1fr animates the real width).
                At rest every button is icon-only, so the dock covers as little as possible. */}
            <span
                className={cn(
                    "grid grid-cols-[0fr] transition-[grid-template-columns] duration-200 ease-snappy motion-reduce:transition-none",
                    "group-hover:grid-cols-[1fr] group-focus-visible:grid-cols-[1fr]",
                )}
            >
                <span className="overflow-hidden whitespace-nowrap">
                    <span
                        className={cn(
                            "block pr-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100",
                            item.badge ? "pl-3" : "pl-2",
                        )}
                    >
                        {item.label}
                    </span>
                </span>
            </span>
        </button>
    );
}
