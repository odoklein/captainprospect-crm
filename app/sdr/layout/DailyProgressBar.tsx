"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

export function DailyProgressBar() {
    const [progress, setProgress] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchProgress = useCallback(async () => {
        try {
            const res = await fetch("/api/sdr/gamification/stats");
            const json = await res.json();
            if (json.success && json.data) {
                setProgress(json.data.dailyGoal?.progress ?? 0);
            }
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProgress();
        const interval = setInterval(fetchProgress, 60000);
        return () => clearInterval(interval);
    }, [fetchProgress]);

    if (loading) return null;

    const getColor = () => {
        if (progress >= 100) return "daily-progress-shimmer";
        if (progress >= 75) return "bg-emerald-500";
        if (progress >= 50) return "bg-blue-500";
        if (progress >= 25) return "bg-amber-500";
        return "bg-red-500";
    };

    return (
        <div className="daily-progress-bar">
            <div
                className={cn("h-full transition-all duration-500", getColor())}
                style={{ width: `${Math.min(100, progress)}%` }}
            />
        </div>
    );
}
