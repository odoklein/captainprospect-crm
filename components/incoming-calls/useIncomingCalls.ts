"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IncomingCallDTO } from "@/lib/incoming-calls/present";

const VISIBLE_POLL_MS = 3_000;
// Chrome throttles hidden tabs anyway; switching back to the tab polls at once.
const HIDDEN_POLL_MS = 15_000;
const ERROR_POLL_MS = 30_000;

export type IncomingCall = IncomingCallDTO;

export function isLive(call: IncomingCall): boolean {
    return (call.status === "RINGING" || call.status === "ANSWERED") && !call.stale;
}

/**
 * Polls /api/incoming-calls. Stops for good when the first response says the
 * user has no Allo line, so everyone without one costs a single request.
 * `onArrival` gets each call the first time a poll returns it.
 */
export function useIncomingCalls(active: boolean, onArrival: (call: IncomingCall) => void) {
    const [calls, setCalls] = useState<IncomingCall[]>([]);
    const [enabled, setEnabled] = useState<boolean | null>(null);
    const inFlight = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stopped = useRef(false);
    const seen = useRef<Set<string>>(new Set());
    const onArrivalRef = useRef(onArrival);
    useEffect(() => {
        onArrivalRef.current = onArrival;
    }, [onArrival]);

    const poll = useCallback(async (init = false) => {
        if (inFlight.current || stopped.current) return;
        inFlight.current = true;
        if (timer.current) clearTimeout(timer.current);

        let next = document.hidden ? HIDDEN_POLL_MS : VISIBLE_POLL_MS;
        try {
            const res = await fetch(`/api/incoming-calls${init ? "?init=1" : ""}`, { cache: "no-store" });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.success) {
                next = ERROR_POLL_MS;
            } else {
                if (init && json.data.enabled === false) {
                    stopped.current = true;
                    setEnabled(false);
                    return;
                }
                if (init) setEnabled(true);
                const fresh = json.data.calls as IncomingCall[];
                setCalls(fresh);
                for (const call of fresh) {
                    if (seen.current.has(call.id)) continue;
                    seen.current.add(call.id);
                    onArrivalRef.current(call);
                }
            }
        } catch {
            next = ERROR_POLL_MS;
        } finally {
            inFlight.current = false;
        }
        if (!stopped.current) timer.current = setTimeout(() => void poll(), next);
    }, []);

    useEffect(() => {
        if (!active) return;
        stopped.current = false;
        void poll(true);

        const wake = () => {
            if (!document.hidden) void poll();
        };
        document.addEventListener("visibilitychange", wake);
        window.addEventListener("focus", wake);
        return () => {
            stopped.current = true;
            if (timer.current) clearTimeout(timer.current);
            document.removeEventListener("visibilitychange", wake);
            window.removeEventListener("focus", wake);
        };
    }, [active, poll]);

    const refresh = useCallback(() => void poll(), [poll]);

    /** Optimistic local removal/update so the UI doesn't wait for the next tick. */
    const patchLocal = useCallback((id: string, change: Partial<IncomingCall> | null) => {
        setCalls((prev) =>
            change === null ? prev.filter((c) => c.id !== id) : prev.map((c) => (c.id === id ? { ...c, ...change } : c)),
        );
    }, []);

    return { calls, enabled, refresh, patchLocal };
}

export async function patchIncomingCall(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/incoming-calls/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error || "Mise à jour impossible");
    return json.data.call as IncomingCall;
}

// ============================================
// FORMATTERS
// ============================================

/** "+33612345678" → "+33 6 12 34 56 78"; anything else is returned as typed. */
export function formatPhone(raw: string): string {
    const digits = raw.replace(/[^\d+]/g, "");
    const fr = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(digits);
    if (fr) return `+33 ${fr[1]} ${fr[2]} ${fr[3]} ${fr[4]} ${fr[5]}`;
    const local = /^0(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(digits);
    if (local) return `0${local[1]} ${local[2]} ${local[3]} ${local[4]} ${local[5]}`;
    return raw;
}

export function formatClock(totalSec: number): string {
    const s = Math.max(0, Math.floor(totalSec));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function formatDuration(sec: number | null | undefined): string {
    if (!sec) return "0 s";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s} s`;
    return s ? `${m} min ${String(s).padStart(2, "0")}` : `${m} min`;
}

export function initials(name: string | null | undefined): string {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
