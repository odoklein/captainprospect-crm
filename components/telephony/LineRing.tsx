"use client";

// ============================================
// LINE RING — the phone's state, drawn around the user's avatar at the foot of
// the sidebar, so the most-used phone setting is never a settings page away.
//
//   green ring          calls ring here (thickens with your voice during a call)
//   amber arc           paused: what is left of the pause, draining
//   amber ring          voicemail until you turn the line back on
//   small dot           desktop alerts are not allowed (amber: to allow, rose: blocked)
//
// Press and hold the avatar: the ring fills clockwise, a quarter turn per
// 15 minutes (one tick on phones that vibrate); let go to pause the line for
// that long. A short press still opens the account menu, which offers the same
// choices for the keyboard.
// ============================================

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui";
import { useCallLevels, useSoftphone, isCallActive } from "./SoftphoneProvider";
import {
    HOLD_THRESHOLD_MS, MAX_QUARTERS, QUARTER_MS, holdProgress, pauseLabel, pauseMinutesForHold, type LineStatus,
} from "@/lib/telephony/line-state";
import type { NotificationPermissionState } from "./useNotificationPermission";

/** Press-and-hold on the avatar. `consumeClick()` is true right after a hold, so the click it ends does not open the menu. */
export function useLineHold() {
    const { enabled, pauseLine } = useSoftphone();
    const toast = useToast();
    const [heldMs, setHeldMs] = useState(0);
    const startRef = useRef<number | null>(null);
    const rafRef = useRef(0);
    const quarterRef = useRef(0);
    const suppressClickRef = useRef(false);

    useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

    const tick = useCallback(() => {
        const frame = () => {
            if (startRef.current == null) return;
            const ms = performance.now() - startRef.current;
            setHeldMs(ms);
            // One short buzz each time a quarter (15 min) is reached, where the device can.
            const quarter = ms < HOLD_THRESHOLD_MS ? 0 : Math.min(MAX_QUARTERS, Math.ceil((ms - HOLD_THRESHOLD_MS) / QUARTER_MS));
            if (quarter !== quarterRef.current) {
                quarterRef.current = quarter;
                if (quarter > 0) navigator.vibrate?.(8);
            }
            rafRef.current = requestAnimationFrame(frame);
        };
        frame();
    }, []);

    const end = useCallback(
        (commit: boolean) => {
            if (startRef.current == null) return;
            const ms = performance.now() - startRef.current;
            startRef.current = null;
            quarterRef.current = 0;
            cancelAnimationFrame(rafRef.current);
            setHeldMs(0);
            const minutes = pauseMinutesForHold(ms);
            if (minutes == null) return;
            suppressClickRef.current = true;
            if (!commit) return;
            pauseLine(minutes).then(
                () => toast.success(`Ligne en pause ${pauseLabel(minutes)}`, "Vos appelants tombent sur votre messagerie. La ligne reprend seule, ou dès votre prochain appel."),
                (e: unknown) => toast.error("Pause impossible", e instanceof Error ? e.message : "Réessayez dans un instant."),
            );
        },
        [pauseLine, toast],
    );

    const handlers = {
        onPointerDown: (e: PointerEvent<HTMLElement>) => {
            if (!enabled || e.button !== 0) return;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            suppressClickRef.current = false;
            startRef.current = performance.now();
            tick();
        },
        onPointerUp: () => end(true),
        onPointerCancel: () => end(false),
        onContextMenu: (e: { preventDefault: () => void }) => {
            if (enabled) e.preventDefault(); // a long press on a phone must not open the browser menu
        },
    };

    const consumeClick = useCallback(() => {
        const s = suppressClickRef.current;
        suppressClickRef.current = false;
        return s;
    }, []);

    return { heldMs, holding: heldMs >= HOLD_THRESHOLD_MS, pendingMinutes: pauseMinutesForHold(heldMs), handlers, consumeClick };
}

/** Short words for the line under the user's name in the sidebar. */
export function lineCaption(line: LineStatus, pendingMinutes: number | null): string {
    if (pendingMinutes) return `Relâchez : pause ${pauseLabel(pendingMinutes)}`;
    if (line.mode === "on") return "Ligne ouverte";
    if (line.mode === "voicemail") return "Messagerie";
    const until = new Date(line.pause!.until).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return `En pause · ${until}`;
}

const R = 11; // corner radius of the ring, concentric with the 8px radius of the avatar
const SIZE = 40;

/**
 * The avatar with its ring. Draws nothing extra when the user has no
 * integrated line and desktop alerts are fine.
 */
export function LineRing({
    children,
    heldMs,
    notifications,
    showNotch,
}: {
    children: ReactNode;
    heldMs: number;
    notifications: NotificationPermissionState;
    /** The dot is only for people whose calls can ring in the CRM. */
    showNotch: boolean;
}) {
    const { enabled, line, call } = useSoftphone();
    const levels = useCallLevels();
    const live = isCallActive(call) && call?.phase === "live";
    const progress = holdProgress(heldMs);
    const notch = showNotch && (notifications === "default" || notifications === "denied");

    let arc: { value: number; className: string; width: number } | null = null;
    if (enabled) {
        if (progress > 0) arc = { value: progress, className: "stroke-white", width: 2.5 };
        else if (line.mode === "on") arc = { value: 1, className: "stroke-emerald-400", width: live ? 2 + Math.min(1, levels.input * 1.6) * 2 : 2 };
        else if (line.mode === "paused") arc = { value: line.remaining, className: "stroke-amber-400", width: 2 };
        else arc = { value: 1, className: "stroke-amber-400", width: 2 };
    }

    return (
        <span className="relative flex-shrink-0 w-8 h-8">
            {children}
            {arc && (
                <svg
                    aria-hidden
                    width={SIZE}
                    height={SIZE}
                    viewBox={`0 0 ${SIZE} ${SIZE}`}
                    className="absolute -left-1 -top-1 pointer-events-none overflow-visible"
                >
                    {/* the track, under paused and held arcs */}
                    {(progress > 0 || line.mode === "paused") && (
                        <rect x={1} y={1} width={SIZE - 2} height={SIZE - 2} rx={R} fill="none" className="stroke-white/15" strokeWidth={2} />
                    )}
                    <rect
                        x={1}
                        y={1}
                        width={SIZE - 2}
                        height={SIZE - 2}
                        rx={R}
                        fill="none"
                        pathLength={100}
                        strokeDasharray={`${Math.max(0, Math.min(1, arc.value)) * 100} 100`}
                        strokeLinecap="round"
                        strokeWidth={arc.width}
                        className={cn(arc.className, progress === 0 && "transition-[stroke-width] duration-75")}
                    />
                    {/* quarter ticks while held: each one is 15 minutes */}
                    {progress > 0 &&
                        [0.25, 0.5, 0.75].map((q) => (
                            <circle key={q} r={1.4} className={progress >= q ? "fill-white" : "fill-white/30"} {...quarterPoint(q)} />
                        ))}
                </svg>
            )}
            {notch && (
                <span
                    aria-hidden
                    className={cn(
                        "absolute -right-1 -top-1 w-2.5 h-2.5 rounded-full ring-2 ring-[var(--ds-inverse)]",
                        notifications === "denied" ? "bg-rose-500" : "bg-amber-400",
                    )}
                />
            )}
        </span>
    );
}

/**
 * Where a quarter of the way round sits on the ring. A rounded square's stroke
 * starts at the end of the top-left corner and runs clockwise, and each quarter
 * is one side plus one corner, so the quarters end just past each corner.
 */
function quarterPoint(q: number): { cx: number; cy: number } {
    if (q === 0.25) return { cx: SIZE - 1, cy: 1 + R };
    if (q === 0.5) return { cx: SIZE - 1 - R, cy: SIZE - 1 };
    return { cx: 1, cy: SIZE - 1 - R };
}
