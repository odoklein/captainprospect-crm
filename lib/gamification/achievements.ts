// ============================================
// ACHIEVEMENT DEFINITIONS
// ============================================

export interface AchievementDef {
    code: string;
    name: string;
    description: string;
    icon: string;
    xpReward: number;
    threshold: number;
    metric: string;
    tier: "bronze" | "silver" | "gold" | "legendary";
}

export const ACHIEVEMENTS: AchievementDef[] = [
    // Actions
    { code: "first_action", name: "Premier Pas", description: "Première action enregistrée", icon: "🎯", threshold: 1, metric: "actions", tier: "bronze", xpReward: 25 },
    { code: "centurion", name: "Centurion", description: "100 actions en une journée", icon: "⚡", threshold: 100, metric: "daily_actions", tier: "gold", xpReward: 200 },
    { code: "thousand_club", name: "Club des 1000", description: "1 000 actions totales", icon: "🏆", threshold: 1000, metric: "actions", tier: "gold", xpReward: 500 },
    { code: "legend", name: "Légende", description: "10 000 actions totales", icon: "👑", threshold: 10000, metric: "actions", tier: "legendary", xpReward: 2000 },
    // Meetings
    { code: "first_meeting", name: "Closer", description: "Premier RDV décroché", icon: "🤝", threshold: 1, metric: "meetings", tier: "bronze", xpReward: 50 },
    { code: "meeting_machine", name: "Machine à RDV", description: "50 RDV décrochés", icon: "🚀", threshold: 50, metric: "meetings", tier: "silver", xpReward: 300 },
    { code: "deal_maker", name: "Deal Maker", description: "100 RDV décrochés", icon: "💎", threshold: 100, metric: "meetings", tier: "gold", xpReward: 1000 },
    // Streaks
    { code: "streak_5", name: "Série Gagnante", description: "5 jours consécutifs d'objectif atteint", icon: "🔥", threshold: 5, metric: "streak", tier: "bronze", xpReward: 100 },
    { code: "streak_20", name: "Inarrêtable", description: "20 jours consécutifs", icon: "💪", threshold: 20, metric: "streak", tier: "silver", xpReward: 500 },
    { code: "streak_50", name: "Machine", description: "50 jours consécutifs", icon: "🏅", threshold: 50, metric: "streak", tier: "gold", xpReward: 1500 },
    // Conversion
    { code: "sniper", name: "Sniper", description: "10% de taux de conversion sur 100+ actions", icon: "🎯", threshold: 10, metric: "conversion", tier: "silver", xpReward: 300 },
    // Focus
    { code: "deep_focus", name: "Deep Focus", description: "5 sessions focus complétées", icon: "🧘", threshold: 5, metric: "focus_sessions", tier: "bronze", xpReward: 100 },
];

export const TIER_ORDER: Record<string, number> = {
    bronze: 0,
    silver: 1,
    gold: 2,
    legendary: 3,
};

export const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    bronze: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    silver: { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-300" },
    gold: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-300" },
    legendary: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-300" },
};
