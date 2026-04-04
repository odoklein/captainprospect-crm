"use client";

import { useState, useEffect } from "react";
import {
    Trophy,
    Medal,
    Flame,
    Star,
    Loader2,
    Zap,
    Calendar,
    Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { TIER_COLORS, TIER_ORDER } from "@/lib/gamification/achievements";

interface Ranking {
    id: string;
    name: string;
    avatar: string | null;
    xp: number;
    level: number;
    actions: number;
    meetings: number;
    streak: number;
    isCurrentUser: boolean;
}

interface Achievement {
    code: string;
    name: string;
    description: string;
    icon: string;
    tier: string;
    xpReward: number;
    threshold: number;
    metric: string;
    unlocked: boolean;
    unlockedAt: string | null;
    progress: number;
    currentValue: number;
}

const PERIOD_LABELS: Record<string, string> = {
    week: "Semaine",
    month: "Mois",
    alltime: "Tout",
};

function getInitials(name: string) {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

const PODIUM_STYLES = [
    { bg: "from-amber-400 to-amber-600", shadow: "shadow-amber-500/30", ring: "ring-amber-400", label: "1er" },
    { bg: "from-slate-300 to-slate-500", shadow: "shadow-slate-500/20", ring: "ring-slate-300", label: "2e" },
    { bg: "from-orange-300 to-orange-500", shadow: "shadow-orange-500/20", ring: "ring-orange-300", label: "3e" },
];

export default function LeaderboardPage() {
    const [activeTab, setActiveTab] = useState("classement");
    const [period, setPeriod] = useState("week");
    const [rankings, setRankings] = useState<Ranking[]>([]);
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/sdr/gamification/leaderboard?period=${period}`)
            .then((r) => r.json())
            .then((json) => {
                if (json.success) setRankings(json.data.rankings || []);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [period]);

    useEffect(() => {
        fetch("/api/sdr/gamification/achievements")
            .then((r) => r.json())
            .then((json) => {
                if (json.success) setAchievements(json.data.achievements || []);
            })
            .catch(() => {});
    }, []);

    const tabs = [
        { id: "classement", label: "Classement", icon: <Trophy className="w-4 h-4" /> },
        { id: "realisations", label: "Réalisations", icon: <Star className="w-4 h-4" /> },
    ];

    const top3 = rankings.slice(0, 3);
    const rest = rankings.slice(3);

    const groupedAchievements = TIER_ORDER.reduce((acc, tier) => {
        const items = achievements.filter((a) => a.tier === tier);
        if (items.length > 0) acc[tier] = items;
        return acc;
    }, {} as Record<string, Achievement[]>);

    return (
        <div className="min-h-full bg-[#F4F6F9] p-4 md:p-6" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            <PageHeader title="Classement & Réalisations" subtitle="Comparez vos performances avec l'équipe" />

            <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} variant="pills" className="mb-6" />

            {activeTab === "classement" && (
                <div>
                    {/* Period filter */}
                    <div className="flex items-center gap-2 mb-6">
                        {(["week", "month", "alltime"] as const).map((p) => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={cn(
                                    "px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                                    period === p
                                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                        : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-200"
                                )}
                            >
                                {PERIOD_LABELS[p]}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                        </div>
                    ) : (
                        <>
                            {/* Podium */}
                            {top3.length > 0 && (
                                <div className="flex items-end justify-center gap-4 mb-8">
                                    {/* Reorder: 2nd, 1st, 3rd */}
                                    {[1, 0, 2].map((idx) => {
                                        const person = top3[idx];
                                        if (!person) return null;
                                        const style = PODIUM_STYLES[idx];
                                        const isFirst = idx === 0;

                                        return (
                                            <div key={person.id} className="flex flex-col items-center">
                                                <div className={cn(
                                                    "w-16 h-16 rounded-full overflow-hidden ring-4",
                                                    style.ring,
                                                    isFirst && "w-20 h-20"
                                                )}>
                                                    {person.avatar ? (
                                                        <img src={person.avatar} alt={person.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className={cn(
                                                            "w-full h-full bg-gradient-to-br flex items-center justify-center text-white font-bold",
                                                            style.bg
                                                        )}>
                                                            {getInitials(person.name)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className={cn(
                                                    "mt-2 px-3 py-1 rounded-full text-xs font-bold text-white shadow-lg",
                                                    `bg-gradient-to-r ${style.bg} ${style.shadow}`
                                                )}>
                                                    {style.label}
                                                </div>
                                                <p className={cn(
                                                    "mt-2 font-semibold text-slate-900",
                                                    isFirst ? "text-base" : "text-sm",
                                                    person.isCurrentUser && "text-indigo-600"
                                                )}>
                                                    {person.name.split(" ")[0]}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    Nv. {person.level} · {person.xp.toLocaleString()} XP
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Full ranking table */}
                            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase w-12">#</th>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Nom</th>
                                            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Niveau</th>
                                            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">XP</th>
                                            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Actions</th>
                                            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">RDV</th>
                                            <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Série</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {rankings.map((person, i) => (
                                            <tr
                                                key={person.id}
                                                className={cn(
                                                    "hover:bg-slate-50 transition-colors",
                                                    person.isCurrentUser && "bg-indigo-50/50"
                                                )}
                                            >
                                                <td className="px-4 py-3">
                                                    <span className={cn(
                                                        "text-sm font-bold",
                                                        i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-orange-400" : "text-slate-400"
                                                    )}>
                                                        {i + 1}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                                                            {person.avatar ? (
                                                                <img src={person.avatar} alt={person.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full bg-gradient-to-br from-indigo-400 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                                                                    {getInitials(person.name)}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <span className={cn(
                                                            "text-sm font-medium",
                                                            person.isCurrentUser ? "text-indigo-600 font-semibold" : "text-slate-900"
                                                        )}>
                                                            {person.name}
                                                            {person.isCurrentUser && " (vous)"}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
                                                        {person.level}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center text-sm font-medium text-slate-700">
                                                    {person.xp.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-center text-sm text-slate-600">{person.actions}</td>
                                                <td className="px-4 py-3 text-center text-sm text-slate-600">{person.meetings}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <Flame className={cn("w-3.5 h-3.5", person.streak > 0 ? "text-orange-500" : "text-slate-300")} />
                                                        <span className="text-sm font-medium text-slate-700">{person.streak}</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}

            {activeTab === "realisations" && (
                <div className="space-y-8">
                    {Object.entries(groupedAchievements).map(([tier, items]) => (
                        <div key={tier}>
                            <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: TIER_COLORS[tier] || "#64748b" }}>
                                {tier === "bronze" ? "Bronze" : tier === "silver" ? "Argent" : tier === "gold" ? "Or" : "Légendaire"}
                                <span className="text-slate-400 font-normal ml-2">
                                    ({items.filter((a) => a.unlocked).length}/{items.length})
                                </span>
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                                {items.map((a) => (
                                    <div
                                        key={a.code}
                                        className={cn(
                                            "bg-white rounded-xl border p-4 text-center transition-all",
                                            a.unlocked
                                                ? "border-amber-200 hover:shadow-md"
                                                : "border-slate-100 opacity-50"
                                        )}
                                    >
                                        <div className={cn("text-3xl mb-2", !a.unlocked && "grayscale filter")}>{a.icon}</div>
                                        <p className="text-xs font-semibold text-slate-900 mb-0.5">{a.name}</p>
                                        <p className="text-[10px] text-slate-500 leading-snug mb-2">{a.description}</p>
                                        {a.unlocked ? (
                                            <p className="text-[10px] text-emerald-600 font-medium">
                                                +{a.xpReward} XP
                                            </p>
                                        ) : (
                                            <div>
                                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1">
                                                    <div
                                                        className="h-full bg-indigo-400 rounded-full"
                                                        style={{ width: `${a.progress}%` }}
                                                    />
                                                </div>
                                                <p className="text-[10px] text-slate-400">
                                                    {a.currentValue}/{a.threshold} ({a.progress}%)
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
