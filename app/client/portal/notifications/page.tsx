"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
    Bell, Check, CheckCheck, Info, AlertTriangle, XCircle,
    CheckCircle2, RefreshCw, Inbox, Clock, ChevronRight,
    Loader2, ArrowRight, Calendar, FileText, Trophy,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";

interface Notification {
    id: string;
    title: string;
    message: string;
    type: "info" | "success" | "warning" | "error";
    link: string | null;
    isRead: boolean;
    createdAt: string;
}

type FilterType = "all" | "unread";

const TYPE_CONFIG = {
    success: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50", border: "border-l-emerald-400", dot: "bg-emerald-400" },
    warning: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50", border: "border-l-amber-400", dot: "bg-amber-400" },
    error:   { icon: XCircle, color: "text-red-500", bg: "bg-red-50", border: "border-l-red-400", dot: "bg-red-400" },
    info:    { icon: Info, color: "text-blue-500", bg: "bg-blue-50", border: "border-l-blue-400", dot: "bg-blue-400" },
};

function getNotificationIcon(title: string, type: string) {
    if (title.includes("RDV") || title.includes("Rappel")) return Calendar;
    if (title.includes("Rapport")) return FileText;
    if (title.includes("Felicitations")) return Trophy;
    if (title.includes("Rappel")) return Clock;
    return TYPE_CONFIG[type as keyof typeof TYPE_CONFIG]?.icon ?? Bell;
}

function formatRelative(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function groupByPeriod(notifications: Notification[]): { label: string; items: Notification[] }[] {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1));

    const groups: { label: string; items: Notification[] }[] = [
        { label: "Aujourd'hui", items: [] },
        { label: "Cette semaine", items: [] },
        { label: "Plus ancien", items: [] },
    ];

    for (const n of notifications) {
        const d = new Date(n.createdAt);
        if (d >= todayStart) groups[0].items.push(n);
        else if (d >= weekStart) groups[1].items.push(n);
        else groups[2].items.push(n);
    }

    return groups.filter((g) => g.items.length > 0);
}

function NotificationCard({
    notification,
    onMarkRead,
    onNavigate,
}: {
    notification: Notification;
    onMarkRead: (id: string) => void;
    onNavigate: (link: string) => void;
}) {
    const config = TYPE_CONFIG[notification.type];
    const Icon = getNotificationIcon(notification.title, notification.type);

    const handleClick = () => {
        if (!notification.isRead) onMarkRead(notification.id);
        if (notification.link) onNavigate(notification.link);
    };

    return (
        <div
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && handleClick()}
            className={cn(
                "group relative rounded-xl border transition-shadow duration-200 cursor-pointer border-l-4",
                notification.isRead
                    ? "bg-white border-line border-l-transparent hover:shadow-md"
                    : cn(
                        "bg-white border-line hover:shadow-md",
                        config.border
                    )
            )}
        >
            <div className="flex items-start gap-4 p-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm", config.bg)}>
                    <Icon className={cn("w-5 h-5", config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <h3 className={cn("text-sm font-bold truncate", notification.isRead ? "text-ink-3" : "text-ink")}>
                                {notification.title}
                            </h3>
                            <p className="text-sm text-ink-3 mt-1 line-clamp-2 leading-relaxed">{notification.message}</p>
                            <div className="flex items-center gap-3 mt-2">
                                <span className="text-xs text-ink-4 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatRelative(notification.createdAt)}
                                </span>
                                {!notification.isRead && (
                                    <span className="px-2.5 py-0.5 text-[10px] font-bold bg-accent-50 text-primary-600 rounded-full border border-primary-500/10">
                                        Nouveau
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            {!notification.isRead && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onMarkRead(notification.id); }}
                                    className="p-1.5 text-ink-4 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                    title="Marquer comme lu"
                                >
                                    <Check className="w-4 h-4" />
                                </button>
                            )}
                            {notification.link && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onNavigate(notification.link!); }}
                                    className="p-1.5 text-ink-4 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                    title="Voir"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                {!notification.isRead && (
                    <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 shadow-sm", (TYPE_CONFIG[notification.type] as typeof TYPE_CONFIG.info).dot ?? "bg-primary")} />
                )}
            </div>
        </div>
    );
}

export default function ClientPortalNotificationsPage() {
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [filter, setFilter] = useState<FilterType>("all");
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const loadNotifications = useCallback(async (refresh = false) => {
        if (refresh) setIsRefreshing(true);
        else setIsLoading(true);
        try {
            const res = await fetch("/api/notifications");
            const json = await res.json();
            if (json.success) setNotifications(json.data.notifications);
        } catch (error) {
            console.error("Failed to load notifications", error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => { loadNotifications(); }, [loadNotifications]);

    // Poll every 30s when visible
    useEffect(() => {
        const startPolling = () => {
            if (pollRef.current) return;
            pollRef.current = setInterval(() => loadNotifications(true), 30000);
        };
        const stopPolling = () => {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        };
        const handleVisibility = () => {
            if (document.visibilityState === "visible") { loadNotifications(true); startPolling(); }
            else stopPolling();
        };
        document.addEventListener("visibilitychange", handleVisibility);
        startPolling();
        return () => { document.removeEventListener("visibilitychange", handleVisibility); stopPolling(); };
    }, [loadNotifications]);

    const filteredNotifications = useMemo(() => {
        return filter === "unread" ? notifications.filter((n) => !n.isRead) : notifications;
    }, [notifications, filter]);

    const groupedNotifications = useMemo(() => groupByPeriod(filteredNotifications), [filteredNotifications]);

    const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

    const markAsRead = async (id: string) => {
        try {
            await fetch(`/api/notifications/${id}`, { method: "PATCH" });
            setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
        } catch (error) {
            console.error("Failed to mark as read", error);
        }
    };

    const markAllAsRead = async () => {
        try {
            await fetch("/api/notifications", { method: "PATCH" });
            setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        } catch (error) {
            console.error("Failed to mark all as read", error);
        }
    };

    const navigateTo = (link: string) => router.push(link);

    return (
        <div className="min-h-full bg-surface-2 p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 animate-fade-up">
                <div>
                    <h1 className="text-2xl font-bold text-ink tracking-tight">Notifications</h1>
                    <p className="text-sm text-ink-3 mt-1">Alertes et actualités de vos missions</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => loadNotifications(true)}
                        className="w-10 h-10 rounded-xl border border-line flex items-center justify-center text-ink-3 hover:text-primary-600 hover:border-primary-500/30 transition-all duration-200 bg-white hover:shadow-sm"
                        title="Actualiser"
                    >
                        <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
                    </button>
                    {unreadCount > 0 && (
                        <Button onClick={markAllAsRead} variant="outline" size="sm" className="gap-2 rounded-xl hover:border-primary-500/30 hover:text-primary-600 transition-all">
                            <CheckCheck className="w-4 h-4" /> Tout marquer comme lu
                        </Button>
                    )}
                </div>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-2 animate-fade-up" style={{ animationDelay: "80ms" }}>
                <button
                    onClick={() => setFilter("all")}
                    className={cn(
                        "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300",
                        filter === "all"
                            ? "bg-accent-50 text-primary-600 shadow-sm border border-primary-500/10"
                            : "text-ink-3 hover:bg-white/80 hover:text-ink-2"
                    )}
                >
                    <Bell className="w-3.5 h-3.5" /> Toutes
                </button>
                <button
                    onClick={() => setFilter("unread")}
                    className={cn(
                        "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300",
                        filter === "unread"
                            ? "bg-accent-50 text-primary-600 shadow-sm border border-primary-500/10"
                            : "text-ink-3 hover:bg-white/80 hover:text-ink-2"
                    )}
                >
                    <Inbox className="w-3.5 h-3.5" /> Non lues
                    {unreadCount > 0 && (
                        <span className="ml-0.5 px-2 py-0.5 text-[10px] font-bold bg-primary text-white rounded-full">
                            {unreadCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Grouped notifications */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-line shadow-sm">
                    <Loader2 className="w-8 h-8 text-primary-600 animate-spin mb-3" />
                    <p className="text-sm text-ink-3">Chargement des notifications...</p>
                </div>
            ) : groupedNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-line shadow-sm">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                        <Bell className="w-7 h-7 text-ink-4" />
                    </div>
                    <h3 className="text-lg font-semibold text-ink mb-2">
                        {filter === "unread" ? "Aucune notification non lue" : "Aucune notification"}
                    </h3>
                    <p className="text-sm text-ink-3 text-center max-w-sm">
                        {filter === "unread" ? "Vous avez tout lu." : "Les alertes (nouveau RDV, rapport, rappel) apparaîtront ici."}
                    </p>
                    <Link href="/client/portal" className="mt-4">
                        <Button variant="primary" size="sm" className="rounded-xl bg-primary hover:bg-primary-hover shadow-sm">
                            Retour à l&apos;accueil
                        </Button>
                    </Link>
                </div>
            ) : (
                <div className="space-y-6 stagger-children">
                    {groupedNotifications.map((group) => (
                        <div key={group.label}>
                            <div className="sticky top-0 z-10 bg-gradient-to-b from-canvas via-canvas to-transparent pb-3 pt-1">
                                <span className="text-xs font-bold text-ink-3 uppercase tracking-[0.1em]">
                                    {group.label}
                                </span>
                            </div>
                            <div className="space-y-3">
                                {group.items.map((notification) => (
                                    <NotificationCard
                                        key={notification.id}
                                        notification={notification}
                                        onMarkRead={markAsRead}
                                        onNavigate={navigateTo}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
