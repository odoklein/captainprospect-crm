"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Trophy,
    AlertTriangle,
    Clock,
    Flame,
    UserX,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Alert {
    type: string;
    severity: "success" | "warning" | "info";
    title: string;
    message: string;
    actionUrl?: string;
    userId?: string;
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: string }> = {
    success: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600" },
    warning: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-600" },
    info: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-600" },
};

const TYPE_ICONS: Record<string, React.ElementType> = {
    performance_drop: AlertTriangle,
    stale_callbacks: Clock,
    goal_milestone: Trophy,
    meeting_celebration: Flame,
    inactive_sdr: UserX,
};

export function SmartAlerts() {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);

    const fetchAlerts = useCallback(async () => {
        try {
            const res = await fetch("/api/manager/smart-alerts");
            const json = await res.json();
            if (json.success) {
                setAlerts(json.data.alerts || []);
            }
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Load dismissed from session storage
        try {
            const saved = sessionStorage.getItem("dismissed_alerts");
            if (saved) setDismissed(new Set(JSON.parse(saved)));
        } catch { /* ignore */ }

        fetchAlerts();
        const interval = setInterval(fetchAlerts, 120000);
        return () => clearInterval(interval);
    }, [fetchAlerts]);

    const dismiss = (key: string) => {
        const next = new Set(dismissed);
        next.add(key);
        setDismissed(next);
        try {
            sessionStorage.setItem("dismissed_alerts", JSON.stringify([...next]));
        } catch { /* ignore */ }
    };

    const visibleAlerts = alerts.filter(
        (a) => !dismissed.has(`${a.type}_${a.userId || "global"}`)
    );

    if (loading || visibleAlerts.length === 0) return null;

    return (
        <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1 mb-4">
            {visibleAlerts.slice(0, 4).map((alert, i) => {
                const styles = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
                const Icon = TYPE_ICONS[alert.type] || AlertTriangle;
                const key = `${alert.type}_${alert.userId || "global"}`;

                const card = (
                    <div
                        key={i}
                        className={cn(
                            "alert-card flex-shrink-0 min-w-[260px] max-w-[320px] relative",
                            styles.bg,
                            styles.border
                        )}
                    >
                        <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismiss(key); }}
                            className="absolute top-2 right-2 p-0.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-white/60 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex items-start gap-3 pr-5">
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", styles.bg)}>
                                <Icon className={cn("w-4 h-4", styles.icon)} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 leading-tight">{alert.title}</p>
                                <p className="text-xs text-slate-600 mt-0.5 leading-snug">{alert.message}</p>
                            </div>
                        </div>
                    </div>
                );

                if (alert.actionUrl) {
                    return (
                        <Link key={i} href={alert.actionUrl} className="flex-shrink-0">
                            {card}
                        </Link>
                    );
                }
                return card;
            })}
        </div>
    );
}
