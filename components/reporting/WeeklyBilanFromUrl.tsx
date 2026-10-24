"use client";

import { useEffect, useState } from "react";
import { WeeklyBilanModal } from "./WeeklyBilanModal";

/**
 * Opens the weekly bilan when the page URL carries ?bilan=<weekStart> — the
 * link of the « Bilans de la semaine » to-do on the manager home.
 */
export function WeeklyBilanFromUrl({ clientId, clientName }: { clientId: string; clientName: string }) {
    const [weekStart, setWeekStart] = useState<string | null>(null);

    useEffect(() => {
        const value = new URLSearchParams(window.location.search).get("bilan");
        if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) setWeekStart(value);
    }, []);

    if (!weekStart) return null;
    return (
        <WeeklyBilanModal
            clientId={clientId}
            clientName={clientName}
            initialWeekStart={weekStart}
            isOpen
            onClose={() => {
                setWeekStart(null);
                const url = new URL(window.location.href);
                url.searchParams.delete("bilan");
                window.history.replaceState(null, "", url.toString());
            }}
        />
    );
}
