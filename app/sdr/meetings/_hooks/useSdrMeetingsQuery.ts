import { useQuery } from "@tanstack/react-query";
import { SDR_MEETINGS_QUERY_KEY } from "@/lib/query-keys";
import { getPresetRange, toISO } from "@/components/dashboard/DateRangeFilter";
import { fetchJson } from "../_lib/api";
import type { Meeting } from "../_types";

export function useSdrMeetingsQuery() {
    return useQuery({
        queryKey: SDR_MEETINGS_QUERY_KEY,
        queryFn: async () => {
            const { start, end } = getPresetRange("last12months");
            const params = new URLSearchParams({
                startDate: toISO(start),
                endDate: toISO(end),
            });
            return fetchJson<Meeting[]>(`/api/sdr/meetings?${params.toString()}`);
        },
    });
}
