"use client";

import { useState, useEffect } from "react";
import {
    Sun,
    Clock,
    Phone,
    AlertTriangle,
    Flame,
    Target,
    X,
    CheckCircle2,
    XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BriefingData {
    greeting: string;
    scheduleBlocks: { mission: string; client: string | null; startTime: string; endTime: string }[];
    callbacksDueToday: number;
    callbacksOverdue: number;
    actionsToday: number;
    dailyGoal: number;
    yesterday: { actions: number; meetings: number; goalMet: boolean };
    streak: { current: number; message: string };
    dailyChallenge: { description: string; metric: string; target: number };
}

export function MorningBriefing() {
    const [data, setData] = useState<BriefingData | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check if already dismissed today
        const today = new Date().toISOString().slice(0, 10);
        const key = `briefing_dismissed_${today}`;
        if (typeof window !== "undefined" && localStorage.getItem(key)) {
            setDismissed(true);
            setLoading(false);
            return;
        }

        (async () => {
            try {
                const res = await fetch("/api/sdr/daily-briefing");
                const json = await res.json();
                if (json.success) setData(json.data);
            } catch {
                // silent
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const handleDismiss = () => {
        setDismissed(true);
        const today = new Date().toISOString().slice(0, 10);
        localStorage.setItem(`briefing_dismissed_${today}`, "1");
    };

    if (loading || dismissed || !data) return null;

    return (
        <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-2xl border border-indigo-100 p-5 mb-5 relative overflow-hidden">
            {/* Dismiss button */}
            <button
                onClick={handleDismiss}
                className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white/60 rounded-lg transition-colors z-10"
            >
                <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                    <Sun className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-slate-900">{data.greeting}</h2>
                    {data.streak.message && (
                        <p className="text-xs text-indigo-600 font-medium">{data.streak.message}</p>
                    )}
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Schedule */}
                <div className="bg-white/70 rounded-xl p-3 border border-white">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Clock className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-[11px] font-semibold text-slate-500 uppercase">Programme</span>
                    </div>
                    {data.scheduleBlocks.length > 0 ? (
                        <div className="space-y-1">
                            {data.scheduleBlocks.slice(0, 3).map((b, i) => (
                                <p key={i} className="text-xs text-slate-700 truncate">
                                    <span className="text-slate-400">{b.startTime}-{b.endTime}</span> {b.mission}
                                </p>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-slate-400">Aucune mission assignée</p>
                    )}
                </div>

                {/* Callbacks */}
                <div className="bg-white/70 rounded-xl p-3 border border-white">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Phone className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-[11px] font-semibold text-slate-500 uppercase">Rappels</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div>
                            <p className="text-xl font-bold text-slate-900">{data.callbacksDueToday}</p>
                            <p className="text-[10px] text-slate-400">prévus</p>
                        </div>
                        {data.callbacksOverdue > 0 && (
                            <div className="flex items-center gap-1 text-red-500">
                                <AlertTriangle className="w-3 h-3" />
                                <span className="text-xs font-semibold">{data.callbacksOverdue} en retard</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Yesterday recap */}
                <div className="bg-white/70 rounded-xl p-3 border border-white">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Flame className="w-3.5 h-3.5 text-orange-500" />
                        <span className="text-[11px] font-semibold text-slate-500 uppercase">Hier</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <p className="text-xl font-bold text-slate-900">{data.yesterday.actions}</p>
                        <div>
                            <div className="flex items-center gap-1">
                                {data.yesterday.goalMet ? (
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                ) : (
                                    <XCircle className="w-3 h-3 text-red-400" />
                                )}
                                <span className={cn("text-[10px] font-medium", data.yesterday.goalMet ? "text-emerald-600" : "text-red-500")}>
                                    {data.yesterday.goalMet ? "Objectif atteint" : "Objectif manqué"}
                                </span>
                            </div>
                            <p className="text-[10px] text-slate-400">{data.yesterday.meetings} RDV</p>
                        </div>
                    </div>
                </div>

                {/* Daily challenge */}
                <div className="bg-white/70 rounded-xl p-3 border border-white">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Target className="w-3.5 h-3.5 text-purple-500" />
                        <span className="text-[11px] font-semibold text-slate-500 uppercase">Défi du jour</span>
                    </div>
                    <p className="text-xs text-slate-700 font-medium leading-snug">{data.dailyChallenge.description}</p>
                </div>
            </div>
        </div>
    );
}
