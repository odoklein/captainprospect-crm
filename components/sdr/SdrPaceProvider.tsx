"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui";
import {
    formatPaceSummary,
    PACE_STATUS_COPY,
    paceHeadline,
    type PaceResult,
    type PaceStatus,
} from "@/lib/sdr-pace/pace";
import { decidePaceNotification, type NotifyState, type PaceNotification } from "@/lib/sdr-pace/notify";

// ============================================
// SDR PACE PROVIDER
// One poller for the whole SDR area: the dashboard card reads its state, and the
// notifications fire wherever the SDR is (mostly /sdr/action, not the dashboard).
// ============================================

export interface SdrPace extends PaceResult {
    isCallingTime: boolean;
    forgivenPauseMinutes: number;
    config: { dailyQuota: number; targetHours: number };
}

interface SdrPaceContextValue {
    pace: SdrPace | null;
    loading: boolean;
}

const SdrPaceContext = createContext<SdrPaceContextValue>({ pace: null, loading: false });

export function useSdrPace() {
    return useContext(SdrPaceContext);
}

const POLL_INTERVAL_MS = 60 * 1000;
const TOAST_DURATION_MS = 12 * 1000;

const TOAST_TYPE: Record<PaceStatus, "info" | "warning" | "error"> = {
    ON_TRACK: "info",
    BEHIND: "warning",
    LATE: "error",
};

function parisDayKey(): string {
    return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

function storageKey(userId: string): string {
    return `sdr_pace_notified:${userId}:${parisDayKey()}`;
}

function readNotifyState(key: string): NotifyState | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as NotifyState;
        return parsed && typeof parsed.at === "number" && parsed.status in PACE_STATUS_COPY ? parsed : null;
    } catch {
        return null;
    }
}

function writeNotifyState(key: string, state: NotifyState | null) {
    try {
        if (state) localStorage.setItem(key, JSON.stringify(state));
    } catch {
        // storage unavailable (private mode…): worst case the toast repeats after a reload
    }
}

export function SdrPaceProvider({ children }: { children: React.ReactNode }) {
    const { data: session } = useSession();
    const toast = useToast();
    const [pace, setPace] = useState<SdrPace | null>(null);
    const [loading, setLoading] = useState(true);
    const userId = session?.user?.id;

    // The toast API object changes identity with every toast; keep the poller independent of it.
    const toastRef = useRef(toast);
    toastRef.current = toast;

    const notify = useCallback((notification: PaceNotification, data: SdrPace) => {
        const headline = paceHeadline(data);
        const summary = formatPaceSummary(data);
        const status = notification.kind === "CHANGE" ? notification.to : notification.status;

        const transition =
            notification.kind === "CHANGE" && notification.from
                ? `${PACE_STATUS_COPY[notification.from].label} → ${PACE_STATUS_COPY[status].label} — `
                : "";

        toastRef.current.addToast({
            type: TOAST_TYPE[status],
            title: headline.text,
            message: `${transition}${summary}`,
            duration: TOAST_DURATION_MS,
        });
    }, []);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch("/api/sdr/pace", { cache: "no-store" });
            const json = await res.json();
            if (!json.success) return;
            const data = json.data as SdrPace;
            setPace(data);

            // Outside calling time (lunch, before/after the planning) nobody needs a nudge.
            if (!userId || !data.isCallingTime) return;
            const key = storageKey(userId);
            const { notification, next } = decidePaceNotification(readNotifyState(key), data.status, Date.now());
            writeNotifyState(key, next);
            if (notification) notify(notification, data);
        } catch (err) {
            console.error("Failed to fetch SDR pace:", err);
        } finally {
            setLoading(false);
        }
    }, [userId, notify]);

    useEffect(() => {
        if (!userId) return;
        refresh();
        const interval = setInterval(() => {
            if (document.visibilityState === "visible") refresh();
        }, POLL_INTERVAL_MS);
        const onVisible = () => {
            if (document.visibilityState === "visible") refresh();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [userId, refresh]);

    const value = useMemo(() => ({ pace, loading }), [pace, loading]);
    return <SdrPaceContext.Provider value={value}>{children}</SdrPaceContext.Provider>;
}
