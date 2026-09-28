import type { QueryClient } from "@tanstack/react-query";
import {
    sdrUnifiedDrawerActionsKey,
    sdrUnifiedDrawerCompanyKey,
    sdrUnifiedDrawerContactKey,
} from "@/lib/query-keys";
import type { QueueItem } from "./types";

// Warms the UnifiedActionDrawer's cache while the SDR hovers or arrows onto a
// row, so the drawer opens on data instead of a skeleton. Keys, URLs and payload
// shapes must match components/drawers/UnifiedActionDrawer.tsx exactly.

const STALE = 30_000;

async function getData(url: string, message: string): Promise<unknown> {
    const r = await fetch(url);
    const j = await r.json();
    if (!j.success || !j.data) throw new Error(j.error || message);
    return j.data;
}

export function prefetchDrawerData(queryClient: QueryClient, row: QueueItem): void {
    const { companyId, contactId } = row;
    void queryClient.prefetchQuery({
        queryKey: sdrUnifiedDrawerCompanyKey(companyId),
        queryFn: () => getData(`/api/companies/${companyId}?light=true`, "Impossible de charger la société"),
        staleTime: STALE,
    });
    if (contactId) {
        void queryClient.prefetchQuery({
            queryKey: sdrUnifiedDrawerContactKey(contactId),
            queryFn: () => getData(`/api/contacts/${contactId}`, "Impossible de charger le contact"),
            staleTime: STALE,
        });
    }
    const q = contactId ? `contactId=${contactId}` : `companyId=${companyId}`;
    void queryClient.prefetchQuery({
        queryKey: sdrUnifiedDrawerActionsKey(contactId, companyId),
        queryFn: async () => {
            const r = await fetch(`/api/actions?${q}&limit=10`);
            const j = await r.json();
            if (!j.success || !Array.isArray(j.data)) throw new Error("Impossible de charger l'historique des actions");
            return j.data;
        },
        staleTime: 10_000,
    });
}
