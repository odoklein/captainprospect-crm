import { useQuery } from "@tanstack/react-query";
import { SDR_MEETINGS_QUERY_KEY } from "@/lib/query-keys";
import { fetchJson } from "../_lib/api";
import type { Meeting } from "../_types";

/** "YYYY-MM" (month the RDV was booked in) or "all". */
export type SdrMeetingsPeriod = string;

export function currentMonthPeriod(now = new Date()): SdrMeetingsPeriod {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Month boundaries in the SDR's own timezone, sent as exact instants. */
function monthRange(period: SdrMeetingsPeriod): { start: Date; end: Date } | null {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) };
}

/** `sdrId` (manager only, enforced server-side) reads another SDR's meetings. */
export function useSdrMeetingsQuery(period: SdrMeetingsPeriod, sdrId?: string) {
    return useQuery({
        queryKey: [...SDR_MEETINGS_QUERY_KEY, period, sdrId ?? "me"],
        queryFn: async () => {
            const range = monthRange(period);
            const params = new URLSearchParams();
            if (sdrId) params.set("sdrId", sdrId);
            if (range) {
                // Bonuses are counted on the day the SDR booked the RDV, not the RDV date.
                params.set("dateField", "createdAt");
                params.set("startDate", range.start.toISOString());
                params.set("endDate", range.end.toISOString());
            }
            const qs = params.toString();
            return fetchJson<Meeting[]>(`/api/sdr/meetings${qs ? `?${qs}` : ""}`);
        },
    });
}
