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
// macOS-style: icons magnify with their distance to the pointer, the hovered
// one shows its label above. Colour is reserved for what needs attention (a
// live call, calls to handle, an open panel); the rest stays quiet grey.
// On phones it folds into one button. Above drawers and the call band.
// ============================================

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { LayoutGrid, type LucideIcon } from "lucide-react";
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
    "fixed z-[90] left-[calc(var(--cp-sidebar-w,0px)+1rem)] bottom-[calc(5.5rem+var(--softphone-dock-h,0px))]";

const BASE = 40; // px, resting icon well
const MAX = 60; // px, icon right under the pointer
const REACH = 140; // px, how far the magnification spreads

function prefersReducedMotion(): boolean {
    return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** Needs the user's attention: drawn in colour; everything else stays grey. */
function attention(item: DockItem): "live" | "danger" | "active" | null {
    if (item.tone === "live") return "live";
    if (item.tone === "danger" && (item.badge ?? 0) > 0) return "danger";
    if (item.active) return "active";
    return null;
}

/**
 * The dock's items as a vertical list, for a workspace that has its own rail
 * (Mode Focus): the shortcuts live in the rail instead of floating over it.
 */
export function DockList({ exclude = [], className }: { exclude?: string[]; className?: string }) {
    const items = useContext(ItemsContext).filter((i) => !exclude.includes(i.id));
    if (items.length === 0) return null;
    return (
        <ul className={cn("flex flex-col gap-0.5", className)} aria-label="Raccourcis">
            {items.map((item) => {
                const Icon = item.icon;
                const a = attention(item);
                return (
                    <li key={item.id}>
                        <button
                            type="button"
                            onClick={item.onClick}
                            aria-pressed={item.active}
                            className={cn(
                                "cp-press group flex h-8 w-full items-center gap-2.5 rounded-control px-2 text-left text-[12.5px] font-medium transition-colors",
                                a === "live"
                                    ? "bg-success-soft text-success-ink"
                                    : a === "danger"
                                      ? "text-danger-ink hover:bg-danger-soft"
                                      : a === "active"
                                        ? "bg-primary-soft text-primary-soft-ink"
                                        : "text-ink-3 hover:bg-surface-2 hover:text-ink",
                            )}
                        >
                            <span className="relative flex h-4 w-4 items-center justify-center">
                                {item.pulse && <span className="absolute inset-[-3px] rounded-full bg-success/30 animate-ping" aria-hidden />}
                                <Icon className="relative h-4 w-4" aria-hidden />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            {item.badge ? (
                                <span key={item.badge} className="cp-pop rounded-full bg-danger px-1.5 text-[10.5px] font-bold leading-[16px] text-white">
                                    {item.badge > 99 ? "99+" : item.badge}
                                </span>
                            ) : null}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}

/**
 * `railed`: the page shows the items in its own rail from `lg` up (DockList),
 * so the floating dock only stays for narrower screens.
 */
export function FloatingDock({ railed = false }: { railed?: boolean }) {
    const items = useContext(ItemsContext);
    const wells = useRef<(HTMLElement | null)[]>([]);
    const [mobileOpen, setMobileOpen] = useState(false);

    // Magnification is written straight to CSS variables: no React render per mouse move.
    const magnify = (clientX: number | null) => {
        if (prefersReducedMotion()) return;
        for (const el of wells.current) {
            if (!el) continue;
            let size = BASE;
            if (clientX !== null) {
                const r = el.getBoundingClientRect();
                const d = Math.abs(clientX - (r.left + r.width / 2));
                const t = Math.max(0, 1 - d / REACH);
                size = BASE + (MAX - BASE) * (0.5 - 0.5 * Math.cos(Math.PI * t)); // smooth falloff
            }
            el.style.setProperty("--well", `${size}px`);
            el.style.setProperty("--icon", `${(size / BASE).toFixed(3)}`);
        }
    };

    if (items.length === 0) return null;
    const totalBadge = items.reduce((n, i) => n + (i.badge ?? 0), 0);
    const anyLive = items.some((i) => i.tone === "live");

    return (
        <>
            {/* Desktop: magnifying dock */}
            <nav
                aria-label="Raccourcis"
                onPointerMove={(e) => magnify(e.clientX)}
                onPointerLeave={() => magnify(null)}
                className={cn(
                    "cp-glass cp-pop fixed z-[90] hidden h-14 items-end gap-2.5 rounded-2xl px-2.5 pb-2 sm:flex",
                    railed && "lg:hidden",
                    "left-[calc(var(--cp-sidebar-w,0px)+1rem)] bottom-[calc(1rem+var(--softphone-dock-h,0px))]",
                )}
            >
                {items.map((item, i) => (
                    <DockButton key={item.id} item={item} wellRef={(el) => (wells.current[i] = el)} />
                ))}
            </nav>

            {/* Phones: one button, items above */}
            <div className="fixed bottom-[calc(1rem+var(--softphone-dock-h,0px))] left-4 z-[90] flex flex-col items-start gap-2 sm:hidden">
                {mobileOpen && (
                    <ul className="cp-glass cp-pop flex flex-col gap-1 rounded-2xl p-1.5">
                        {items.map((item) => {
                            const Icon = item.icon;
                            const a = attention(item);
                            return (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMobileOpen(false);
                                            item.onClick();
                                        }}
                                        className="cp-press flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium text-ink hover:bg-surface-2"
                                    >
                                        <Icon className={cn("h-4 w-4", a === "live" ? "text-success" : a === "danger" ? "text-danger" : a === "active" ? "text-primary" : "text-ink-3")} />
                                        {item.label}
                                        {item.badge ? <span className="ml-auto rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">{item.badge}</span> : null}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
                <button
                    type="button"
                    onClick={() => setMobileOpen((v) => !v)}
                    aria-expanded={mobileOpen}
                    aria-label="Raccourcis"
                    className={cn(
                        "cp-glass cp-press relative flex h-12 w-12 items-center justify-center rounded-full",
                        anyLive && "cp-halo",
                    )}
                    style={anyLive ? { ["--halo" as string]: "var(--ds-success)" } : undefined}
                >
                    <LayoutGrid className="h-5 w-5 text-ink-2" />
                    {totalBadge > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-surface">
                            {totalBadge}
                        </span>
                    )}
                </button>
            </div>
        </>
    );
}

function DockButton({ item, wellRef }: { item: DockItem; wellRef: (el: HTMLElement | null) => void }) {
    const Icon = item.icon;
    const a = attention(item);
    const [hover, setHover] = useState(false);

    return (
        <button
            type="button"
            ref={wellRef}
            onClick={item.onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onFocus={() => setHover(true)}
            onBlur={() => setHover(false)}
            aria-label={item.badge ? `${item.label} (${item.badge})` : item.label}
            aria-pressed={item.active}
            style={{ width: "var(--well, 40px)", height: "var(--well, 40px)" }}
            className={cn(
                "cp-dock-well relative flex shrink-0 items-center justify-center rounded-full",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                a === "live"
                    ? "bg-success text-white shadow-[0_6px_16px_-6px_var(--ds-success)]"
                    : a === "danger"
                      ? "bg-danger text-white shadow-[0_6px_16px_-6px_var(--ds-danger)]"
                      : a === "active"
                        ? "bg-primary text-primary-fg shadow-[0_6px_16px_-6px_var(--ds-primary)]"
                        : "bg-surface-3/80 text-ink-3 hover:text-ink",
            )}
        >
            {item.pulse && <span className="absolute inset-0 rounded-full bg-white/30 animate-ping" aria-hidden />}
            <Icon
                className="relative h-5 w-5"
                style={{ transform: "scale(var(--icon, 1))", transition: "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
                aria-hidden
            />
            {item.badge && a !== "danger" ? (
                <span key={item.badge} className="cp-pop absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-surface">
                    {item.badge > 99 ? "99+" : item.badge}
                </span>
            ) : item.badge ? (
                <span key={item.badge} className="cp-pop absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-danger ring-2 ring-danger/30">
                    {item.badge > 99 ? "99+" : item.badge}
                </span>
            ) : null}
            {hover && (
                <span className="cp-pop pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-surface shadow-raised" role="tooltip">
                    {item.label}
                </span>
            )}
        </button>
    );
}
