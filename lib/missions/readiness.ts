// Launch readiness of a mission: one rule set shared by the mission page
// (app/api/missions/[id]) and the manager's cross-client « À traiter » view
// (app/api/clients?view=workspace), so both always agree on what blocks a launch.

export type ReadinessCampaign = {
    id: string;
    name: string;
    icp: string | null;
    pitch: string | null;
    script: string | null;
    isActive?: boolean;
} | null;

export type ListReadiness = {
    hasStrategy: boolean;
    isCustom: boolean;
    isInherited: boolean;
    inheritedCampaignId: string | null | undefined;
    inheritedCampaignName: string | null | undefined;
    hasIcp: boolean;
    hasPitch: boolean;
    hasScript: boolean;
    isReady: boolean;
};

export type MissionReadiness = {
    activeLists: number;
    readyLists: number;
    customStrategyLists: number;
    inheritedStrategyLists: number;
    missingStrategy: number;
    missingIcp: number;
    missingPitch: number;
    missingScript: number;
};

/** The campaign a list falls back to when it has none of its own. */
export function defaultCampaignOf<T extends { isActive?: boolean }>(campaigns: T[]): T | null {
    return campaigns.find((campaign) => campaign.isActive) || campaigns[0] || null;
}

export function computeListReadiness(campaign: ReadinessCampaign, defaultCampaign: ReadinessCampaign): ListReadiness {
    const isCustom = !!campaign;
    const effective = campaign || defaultCampaign;
    const hasIcp = !!effective?.icp?.trim();
    const hasPitch = !!effective?.pitch?.trim();
    const hasScript = !!effective?.script?.trim();
    const hasStrategy = !!effective;
    const isInherited = !campaign && !!defaultCampaign;
    return {
        hasStrategy,
        isCustom,
        isInherited,
        inheritedCampaignId: isInherited ? defaultCampaign?.id : null,
        inheritedCampaignName: isInherited ? defaultCampaign?.name : null,
        hasIcp,
        hasPitch,
        hasScript,
        isReady: hasStrategy && hasIcp && hasPitch && hasScript,
    };
}

export function isActiveList(list: { isActive?: boolean | null; isArchived?: boolean | null }) {
    return list.isActive !== false && list.isArchived !== true;
}

export function summarizeReadiness(lists: { isActive?: boolean | null; isArchived?: boolean | null; readiness: ListReadiness }[]): MissionReadiness {
    const active = lists.filter(isActiveList);
    return {
        activeLists: active.length,
        readyLists: active.filter((list) => list.readiness.isReady).length,
        customStrategyLists: active.filter((list) => list.readiness.isCustom).length,
        inheritedStrategyLists: active.filter((list) => list.readiness.isInherited).length,
        missingStrategy: active.filter((list) => !list.readiness.hasStrategy).length,
        missingIcp: active.filter((list) => list.readiness.hasStrategy && !list.readiness.hasIcp).length,
        missingPitch: active.filter((list) => list.readiness.hasStrategy && !list.readiness.hasPitch).length,
        missingScript: active.filter((list) => list.readiness.hasStrategy && !list.readiness.hasScript).length,
    };
}

/** Number of individual points left to fix before every active list is ready. */
export function openPoints(readiness: MissionReadiness) {
    if (!readiness.activeLists) return 1;
    return readiness.missingStrategy + readiness.missingIcp + readiness.missingPitch + readiness.missingScript;
}
