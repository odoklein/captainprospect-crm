"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    Bell,
    Check,
    CheckCheck,
    Info,
    AlertTriangle,
    XCircle,
    CheckCircle2,
    Trash2,
    RefreshCw,
    Filter,
    Search,
    Inbox,
    Clock,
    ChevronRight,
    MoreHorizontal,
    ArrowUpRight,
    ArrowDownRight,
    Archive,
    Settings,
    Loader2,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input } from "@/components/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ============================================
// TYPES
// ============================================

interface Notification {
    id: string;
    title: string;
    message: string;
    type: "info" | "success" | "warning" | "error";
    link: string | null;
    isRead: boolean;
    createdAt: string;
}

type FilterType = "all" | "unread" | "info" | "success" | "warning" | "error";

// ============================================
// STAT CARD
// ============================================

function StatCard({
    icon: Icon,
    label,
    value,
    subValue,
    color,
}: {
    icon: React.ElementType;
    label: string;
    value: string | number;
    subValue?: string;
    color: "indigo" | "emerald" | "amber" | "rose" | "blue" | "purple";
}) {
    const colors = {
        indigo: "bg-primary-600",
        emerald: "bg-emerald-600",
        amber: "bg-amber-600",
        rose: "bg-rose-600",
        blue: "bg-blue-600",
        purple: "bg-accent-600",
    };

    return (
        <div className="relative overflow-hidden bg-white rounded-2xl border border-slate-200 p-5 group hover:shadow-md transition-shadow duration-300">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
                    <p className="text-3xl font-bold text-slate-900">{value}</p>
                    {subValue && (
                        <p className="text-sm text-slate-400 mt-1">{subValue}</p>
                    )}
                </div>
                <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    colors[color]
                )}>
                    <Icon className="w-6 h-6 text-white" />
                </div>
            </div>
        </div>
    );
}

// ============================================
// NOTIFICATION CARD
// ============================================

function NotificationCard({
    notification,
    isSelected,
    onSelect,
    onMarkRead,
    onDelete,
    onNavigate,
}: {
    notification: Notification;
    isSelected: boolean;
    onSelect: (id: string) => void;
    onMarkRead: (id: string) => void;
    onDelete: (id: string) => void;
    onNavigate: (link: string) => void;
}) {
    const typeConfig = {
        success: {
            icon: CheckCircle2,
            color: "text-emerald-500",
            bg: "bg-emerald-50",
            border: "border-emerald-200"
        },
        warning: {
            icon: AlertTriangle,
            color: "text-amber-500",
            bg: "bg-amber-50",
            border: "border-amber-200"
        },
        error: {
            icon: XCircle,
            color: "text-red-500",
            bg: "bg-red-50",
            border: "border-red-200"
        },
        info: {
            icon: Info,
            color: "text-blue-500",
            bg: "bg-blue-50",
            border: "border-blue-200"
        },
    };

    const config = typeConfig[notification.type];
    const Icon = config.icon;

    const formatDate = (dateString: string) => {
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
    };

    return (
        <div
            className={cn(
                "group relative bg-white rounded-xl border transition-all duration-200 hover:shadow-md",
                isSelected
                    ? "border-primary-500 ring-2 ring-primary-100"
                    : notification.isRead
                        ? "border-slate-200"
                        : "border-slate-300 bg-primary-50/40"
            )}
        >
            <div className="flex items-start gap-4 p-4">
                {/* Checkbox */}
                <button
                    onClick={() => onSelect(notification.id)}
                    className={cn(
                        "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors",
                        isSelected
                            ? "bg-primary-500 border-primary-500 text-white"
                            : "border-slate-300 hover:border-primary-400"
                    )}
                >
                    {isSelected && <Check className="w-3 h-3" />}
                </button>

                {/* Icon */}
                <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
                    config.bg
                )}>
                    <Icon className={cn("w-5 h-5", config.color)} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <h3 className={cn(
                                "text-sm font-semibold truncate",
                                notification.isRead ? "text-slate-700" : "text-slate-900"
                            )}>
                                {notification.title}
                            </h3>
                            <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                                {notification.message}
                            </p>
                            <div className="flex items-center gap-3 mt-2">
                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatDate(notification.createdAt)}
                                </span>
                                {!notification.isRead && (
                                    <span className="px-2 py-0.5 text-[10px] font-medium bg-primary-100 text-primary-700 rounded-full">
                                        Nouveau
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!notification.isRead && (
                                <button
                                    onClick={() => onMarkRead(notification.id)}
                                    className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                    title="Marquer comme lu"
                                >
                                    <Check className="w-4 h-4" />
                                </button>
                            )}
                            {notification.link && (
                                <button
                                    onClick={() => onNavigate(notification.link!)}
                                    className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                    title="Voir détails"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            )}
                            <button
                                onClick={() => onDelete(notification.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Supprimer"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Unread indicator */}
                {!notification.isRead && (
                    <div className="w-2.5 h-2.5 rounded-full bg-primary-500 flex-shrink-0 mt-1" />
                )}
            </div>
        </div>
    );
}

// ============================================
// FILTER PILLS
// ============================================

const FILTER_OPTIONS: {
    value: FilterType;
    label: string;
    icon: React.ElementType;
}[] = [
        { value: "all", label: "Toutes", icon: Bell },
        { value: "unread", label: "Non lues", icon: Inbox },
        { value: "info", label: "Info", icon: Info },
        { value: "success", label: "Succès", icon: CheckCircle2 },
        { value: "warning", label: "Alertes", icon: AlertTriangle },
        { value: "error", label: "Erreurs", icon: XCircle },
    ];

// ============================================
// MAIN PAGE COMPONENT
// ============================================

export default function NotificationsPage() {
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [filter, setFilter] = useState<FilterType>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Load notifications
    const loadNotifications = useCallback(async (refresh = false) => {
        if (refresh) setIsRefreshing(true);
        else setIsLoading(true);

        try {
            const res = await fetch("/api/notifications");
            const json = await res.json();
            if (json.success) {
                setNotifications(json.data.notifications);
            }
        } catch (error) {
            console.error("Failed to load notifications", error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadNotifications();
    }, [loadNotifications]);

    // Filter notifications
    const filteredNotifications = useMemo(() => {
        return notifications.filter((n) => {
            // Search filter
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                if (!n.title.toLowerCase().includes(query) && !n.message.toLowerCase().includes(query)) {
                    return false;
                }
            }

            // Type filter
            if (filter === "unread") return !n.isRead;
            if (filter === "info" || filter === "success" || filter === "warning" || filter === "error") {
                return n.type === filter;
            }
            return true;
        });
    }, [notifications, filter, searchQuery]);

    // Stats
    const stats = useMemo(() => {
        const unread = notifications.filter((n) => !n.isRead).length;
        const today = notifications.filter((n) => {
            const date = new Date(n.createdAt);
            const now = new Date();
            return date.toDateString() === now.toDateString();
        }).length;

        return {
            total: notifications.length,
            unread,
            today,
            readRate: notifications.length > 0
                ? Math.round(((notifications.length - unread) / notifications.length) * 100)
                : 0,
        };
    }, [notifications]);

    // Actions
    const markAsRead = async (id: string) => {
        try {
            await fetch(`/api/notifications/${id}`, { method: "PATCH" });
            setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
            );
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

    const markSelectedAsRead = async () => {
        for (const id of selectedIds) {
            await markAsRead(id);
        }
        setSelectedIds(new Set());
    };

    const deleteNotification = async (id: string) => {
        try {
            await fetch(`/api/notifications/${id}`, { method: "DELETE" });
            setNotifications((prev) => prev.filter((n) => n.id !== id));
            setSelectedIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        } catch (error) {
            console.error("Failed to delete notification", error);
        }
    };

    const deleteSelected = async () => {
        for (const id of selectedIds) {
            await deleteNotification(id);
        }
        setSelectedIds(new Set());
    };

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const selectAll = () => {
        if (selectedIds.size === filteredNotifications.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredNotifications.map((n) => n.id)));
        }
    };

    const navigateTo = (link: string) => {
        router.push(link);
    };

    return (
        <div className="space-y-6 pb-10">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center">
                            <Bell className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
                            <p className="text-sm text-slate-500">
                                Gérez vos alertes et notifications
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => loadNotifications(true)}
                        className={cn(
                            "p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors",
                            isRefreshing && "animate-pulse"
                        )}
                        title="Actualiser"
                    >
                        <RefreshCw className={cn("w-4 h-4 text-slate-500", isRefreshing && "animate-spin")} />
                    </button>
                    {stats.unread > 0 && (
                        <Button
                            onClick={markAllAsRead}
                            variant="outline"
                            className="gap-2"
                        >
                            <CheckCheck className="w-4 h-4" />
                            Tout marquer comme lu
                        </Button>
                    )}
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-5">
                <StatCard
                    icon={Bell}
                    label="Total"
                    value={stats.total}
                    subValue="notifications"
                    color="indigo"
                />
                <StatCard
                    icon={Inbox}
                    label="Non lues"
                    value={stats.unread}
                    subValue="à traiter"
                    color="amber"
                />
                <StatCard
                    icon={Clock}
                    label="Aujourd'hui"
                    value={stats.today}
                    subValue="nouvelles"
                    color="emerald"
                />
                <StatCard
                    icon={CheckCircle2}
                    label="Taux de lecture"
                    value={`${stats.readRate}%`}
                    subValue="consultées"
                    color="blue"
                />
            </div>

            {/* Main Content */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {/* Toolbar */}
                <div className="border-b border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-4">
                        {/* Left: Search & Filters */}
                        <div className="flex items-center gap-3 flex-1">
                            <div className="relative max-w-sm flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Rechercher..."
                                    className="pl-9 h-9 text-sm bg-slate-50 border-slate-200 focus:bg-white"
                                />
                            </div>
                            <div className="flex items-center gap-1">
                                {FILTER_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setFilter(opt.value)}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                            filter === opt.value
                                                ? "bg-primary-100 text-primary-700 shadow-sm"
                                                : "text-slate-600 hover:bg-slate-100"
                                        )}
                                    >
                                        <opt.icon className="w-3.5 h-3.5" />
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Right: Bulk Actions */}
                        {selectedIds.size > 0 && (
                            <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
                                <span className="text-sm text-slate-500">
                                    {selectedIds.size} sélectionnée(s)
                                </span>
                                <button
                                    onClick={markSelectedAsRead}
                                    className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                    title="Marquer comme lu"
                                >
                                    <Check className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={deleteSelected}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Supprimer"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setSelectedIds(new Set())}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                    title="Désélectionner"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Select All */}
                    {filteredNotifications.length > 0 && (
                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                            <button
                                onClick={selectAll}
                                className={cn(
                                    "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors",
                                    selectedIds.size === filteredNotifications.length
                                        ? "bg-primary-500 border-primary-500 text-white"
                                        : selectedIds.size > 0
                                            ? "bg-primary-100 border-primary-400"
                                            : "border-slate-300 hover:border-primary-400"
                                )}
                            >
                                {selectedIds.size === filteredNotifications.length && <Check className="w-3 h-3" />}
                                {selectedIds.size > 0 && selectedIds.size < filteredNotifications.length && (
                                    <div className="w-2 h-2 bg-primary-500 rounded-sm" />
                                )}
                            </button>
                            <span className="text-sm text-slate-500">
                                {selectedIds.size === filteredNotifications.length
                                    ? "Tout désélectionner"
                                    : "Tout sélectionner"}
                            </span>
                        </div>
                    )}
                </div>

                {/* Notification List */}
                <div className="p-4">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-3" />
                            <p className="text-sm text-slate-500">Chargement des notifications...</p>
                        </div>
                    ) : filteredNotifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                                <Bell className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                {searchQuery || filter !== "all"
                                    ? "Aucun résultat"
                                    : "Aucune notification"}
                            </h3>
                            <p className="text-sm text-slate-500 text-center max-w-sm">
                                {searchQuery || filter !== "all"
                                    ? "Modifiez vos filtres pour voir plus de résultats"
                                    : "Vous êtes à jour ! Les nouvelles notifications apparaîtront ici"}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredNotifications.map((notification) => (
                                <NotificationCard
                                    key={notification.id}
                                    notification={notification}
                                    isSelected={selectedIds.has(notification.id)}
                                    onSelect={toggleSelect}
                                    onMarkRead={markAsRead}
                                    onDelete={deleteNotification}
                                    onNavigate={navigateTo}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
