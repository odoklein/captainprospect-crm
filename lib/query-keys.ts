/**
 * Shared React Query keys for cache invalidation across pages and components.
 */
export const CLIENTS_QUERY_KEY = ["manager", "clients"] as const;
export const LEEXI_RECAPS_QUERY_KEY = ["manager", "leexi", "recaps"] as const;
export const MANAGER_FILES_QUERY_KEY = ["manager", "files"] as const;
export const MANAGER_FOLDERS_QUERY_KEY = ["manager", "folders"] as const;
export const MANAGER_DRIVE_QUERY_KEY = ["manager", "drive"] as const;
export const CLIENT_FILES_QUERY_KEY = ["client", "files"] as const;

export function clientDetailQueryKey(clientId: string | null) {
    return ["manager", "client", clientId] as const;
}

// SDR action page & unified action drawer
export function sdrUnifiedDrawerCompanyKey(companyId: string | null) {
    return ["sdr", "unified-drawer", "company", companyId] as const;
}
export function sdrUnifiedDrawerContactKey(contactId: string | null) {
    return ["sdr", "unified-drawer", "contact", contactId] as const;
}
export function sdrUnifiedDrawerActionsKey(contactId: string | null, companyId: string | null) {
    return ["sdr", "unified-drawer", "actions", contactId ?? companyId ?? ""] as const;
}
export function sdrUnifiedDrawerCampaignsKey(missionId: string | null) {
    return ["sdr", "unified-drawer", "campaigns", missionId] as const;
}
export function sdrUnifiedDrawerStatusConfigKey(missionId: string | null) {
    return ["sdr", "unified-drawer", "action-statuses", missionId] as const;
}
export function sdrActionQueueKey(missionId: string | null, listId: string | null, search: string) {
    return ["sdr", "action-queue", missionId, listId ?? "", search] as const;
}
export function sdrDrawerContactKey(contactId: string | null) {
    return ["sdr", "drawer", "contact", contactId] as const;
}
export function sdrDrawerCompanyKey(companyId: string | null) {
    return ["sdr", "drawer", "company", companyId] as const;
}
export function sdrClientBookingKey(missionId: string | null) {
    return ["sdr", "client-booking", missionId] as const;
}
export function sdrUnifiedDrawerMailboxesKey(missionId: string | null) {
    return ["sdr", "unified-drawer", "mailboxes", missionId] as const;
}
export function sdrUnifiedDrawerTemplatesKey(missionId: string | null) {
    return ["sdr", "unified-drawer", "templates", missionId] as const;
}
export function sdrScriptCompanionCampaignsKey(missionId: string | null) {
    return ["sdr", "script-companion", "campaigns", missionId] as const;
}
export function sdrScriptCompanionDataKey(campaignId: string | null) {
    return ["sdr", "script-companion", "data", campaignId] as const;
}
