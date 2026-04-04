"use client";

import { useState, useEffect, useRef } from "react";
import { Focus, Phone, Calendar, Zap, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FocusModeOverlayProps {
    sessionId: string;
    startedAt: string;
    actionCount: number;
    meetingsBooked: number;
    onEnd: () => void;
}

function formatElapsed(startedAt: string): string {
    const ms = Date.now() - new Date(startedAt).getTime();
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

export function FocusModeOverlay({
    sessionId,
    startedAt,
    actionCount,
    meetingsBooked,
    onEnd,
}: FocusModeOverlayProps) {
    const [elapsed, setElapsed] = useState("00:00:00");

    useEffect(() => {
        const interval = setInterval(() => {
            setElapsed(formatElapsed(startedAt));
        }, 1000);
        return () => clearInterval(interval);
    }, [startedAt]);

    // Compute actions per hour
    const elapsedMs = Date.now() - new Date(startedAt).getTime();
    const elapsedHours = elapsedMs / 3600000;
    const actionsPerHour = elapsedHours > 0.05
        ? Math.round(actionCount / elapsedHours)
        : 0;

    return (
        <div className="focus-bar rounded-xl px-4 py-2.5 mb-4 flex items-center justify-between gap-4 text-white flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <Focus className="w-4 h-4 text-indigo-300" />
                    <span className="text-xs font-semibold text-indigo-200 uppercase tracking-wide">Focus Mode</span>
                </div>

                <div className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2.5 py-1">
                    <span className="text-sm font-mono font-bold">{elapsed}</span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-indigo-300" />
                        <span className="font-semibold">{actionCount}</span>
                        <span className="text-indigo-300">appels</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-emerald-300" />
                        <span className="font-semibold">{meetingsBooked}</span>
                        <span className="text-indigo-300">RDV</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5 text-amber-300" />
                        <span className="font-semibold">{actionsPerHour}</span>
                        <span className="text-indigo-300">/h</span>
                    </div>
                </div>
            </div>

            <button
                onClick={onEnd}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-semibold transition-colors"
            >
                <X className="w-3.5 h-3.5" />
                Terminer
            </button>
        </div>
    );
}
