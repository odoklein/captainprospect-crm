"use client";

import { useCallback, useEffect, useState } from "react";
import { isPastPromptTime } from "@/lib/sdr-daily-report/day";
import type { DailyReportStatus } from "@/lib/sdr-daily-report/types";

const REFRESH_EVERY_MS = 15 * 60 * 1000;

/** null = unknown (network or server error). Unknown never blocks the SDR. */
async function fetchStatus(): Promise<DailyReportStatus | null> {
    try {
        const res = await fetch("/api/sdr/daily-feedback", { cache: "no-store" });
        const json = await res.json();
        return res.ok && json.success ? (json.data as DailyReportStatus) : null;
    } catch {
        return null;
    }
}

/**
 * Drives the mandatory "Retour journée SDR".
 *
 * The server decides whether the report is owed (see GET /api/sdr/daily-feedback);
 * the browser only supplies the clock. If the status can't be loaded the SDR is
 * never blocked — a failing endpoint must not lock anyone out of the CRM.
 */
export function useSdrDailyReport(enabled: boolean) {
    const [status, setStatus] = useState<DailyReportStatus | null>(null);
    const [now, setNow] = useState(() => new Date());
    const [openedByUser, setOpenedByUser] = useState(false);

    // Keeps the last known status when a reload fails.
    const reload = useCallback(() => {
        void fetchStatus().then((next) => {
            if (next) setStatus(next);
        });
    }, []);

    useEffect(() => {
        if (!enabled) return;
        reload();

        const tick = window.setInterval(() => setNow(new Date()), 60 * 1000);
        const refresh = window.setInterval(reload, REFRESH_EVERY_MS);
        const onVisible = () => {
            if (document.visibilityState !== "visible") return;
            setNow(new Date());
            reload();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.clearInterval(tick);
            window.clearInterval(refresh);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [enabled, reload]);

    const submitted = !!status?.report;
    const pastPromptTime = status ? isPastPromptTime(now, status.promptTime) : false;

    // Whether the report is owed depends on whether the SDR has worked today,
    // which may have changed since the last load: re-check once the hour strikes.
    useEffect(() => {
        if (enabled && pastPromptTime) reload();
    }, [enabled, pastPromptTime, reload]);

    /** Owed, overdue and not yet sent: the form can't be dismissed. */
    const mustFill = enabled && !!status && status.required && !submitted && pastPromptTime;

    /** Unlock right away on a successful send instead of waiting for the reload. */
    const markSubmitted = useCallback(
        (report: NonNullable<DailyReportStatus["report"]>) => {
            setStatus((current) => (current ? { ...current, report } : current));
            setOpenedByUser(false);
            reload();
        },
        [reload],
    );

    return {
        status,
        submitted,
        mustFill,
        isOpen: mustFill || openedByUser,
        open: () => setOpenedByUser(true),
        close: () => setOpenedByUser(false),
        markSubmitted,
    };
}
