"use client";

import { useState, useEffect } from "react";
import { Flame, Trophy, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface GamStats {
    xp: number;
    level: number;
    xpToNext: { current: number; needed: number; progress: number };
    streak: { current: number; longest: number; isActive: boolean };
    dailyGoal: { target: number; actual: number; progress: number };
    recentAchievements: { code: string; name: string; icon: string; tier: string; unlockedAt: string }[];
    rank: { position: number; total: number };
}

export function GamificationBar() {
    const [stats, setStats] = useState<GamStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/sdr/gamification/stats");
                const json = await res.json();
                if (json.success) setStats(json.data);
            } catch {
                // silent
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading || !stats) return null;

    const recentAchievement = stats.recentAchievements[0];
    const wasRecentlyUnlocked = recentAchievement
        ? (Date.now() - new Date(recentAchievement.unlockedAt).getTime()) < 24 * 60 * 60 * 1000
        : false;

    return (
        <Link
            href="/sdr/leaderboard"
            className="block bg-white rounded-2xl border border-slate-200 p-4 hover:border-indigo-200 hover:shadow-sm transition-all mb-5"
        >
            <div className="flex items-center gap-4 flex-wrap">
                {/* Level + XP */}
                <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-500/20">
                        {stats.level}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-700">Niveau {stats.level}</span>
                            <span className="text-[10px] text-slate-400 font-medium">
                                {stats.xpToNext.current}/{stats.xpToNext.needed} XP
                            </span>
                        </div>
                        <div className="xp-bar">
                            <div
                                className="xp-bar-fill"
                                style={{ width: `${stats.xpToNext.progress}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Streak */}
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50">
                    <span className={cn("text-lg", stats.streak.isActive && "streak-flame")}>
                        <Flame className={cn("w-5 h-5", stats.streak.isActive ? "text-orange-500" : "text-slate-300")} />
                    </span>
                    <div>
                        <p className="text-sm font-bold text-slate-900">{stats.streak.current}j</p>
                        <p className="text-[10px] text-slate-400">série</p>
                    </div>
                </div>

                {/* Rank */}
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    <div>
                        <p className="text-sm font-bold text-slate-900">#{stats.rank.position}</p>
                        <p className="text-[10px] text-slate-400">sur {stats.rank.total}</p>
                    </div>
                </div>

                {/* Recent achievement */}
                {recentAchievement && wasRecentlyUnlocked && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 achievement-unlocked">
                        <span className="text-lg">{recentAchievement.icon}</span>
                        <span className="text-xs font-semibold text-amber-700">{recentAchievement.name}</span>
                        <Star className="w-3 h-3 text-amber-500" />
                    </div>
                )}
            </div>
        </Link>
    );
}
