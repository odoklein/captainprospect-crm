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
    Search,
    Inbox,
    Clock,
    ChevronRight,
    Loader2,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Input } from "@/components/ui";
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
        indigo: "bg-primary-50 text-primary-600 ring-primary-100",
        emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
        amber: "bg-amber-50 text-amber-600 ring-amber-100",
        rose: "bg-rose-50 text-rose-600 ring-rose-100",
        blue: "bg-blue-50 text-blue-600 ring-blue-100",
        purple: "bg-accent-50 text-accent-600 ring-accent-100",
    };

    return (
        <div className="relative overflow-hidden bg-white rounded-2xl border border-slate-200 p-5 group hover:shadow-sm transition-shadow duration-200">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
                    <p className="text-3xl font-bold text-slate-900">{value}</p>
                    {subValue && (
                        <p className="text-sm text-slate-400 mt-1">{subValue}</p>
                    )}
                </div>
                <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center ring-1 ring-inset",
                    colors[color]
                )}>
                    <Icon className="w-6 h-6" />
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
        success: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50" },
        warning: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50" },
        error: { icon: XCircle, color: "text-red-500", bg: "bg-red-50" },
        info: { icon: Info, color: "text-blue-500", bg: "bg-blue-50" },
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
        <div className={cn(
            "group relative bg-white rounded-xl border transition-all duration-200 hover:shadow-md",
            isSelected ? "border-primary-500 ring-2 ring-primary-100" : notification.isRead ? "border-slate-200" : "border-slate-300 bg-primary-50/50"
        )}>
            <div className="flex items-start gap-4 p-4">
                <button
                    onClick={() => onSelect(notification.id)}
                    className={cn(
                        "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors",
                        isSelected ? "bg-primary-500 border-primary-500 text-white" : "border-slate-300 hover:border-primary-400"
                    )}
                >
                    {isSelected && <Check className="w-3 h-3" />}
                </button>

                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", config.bg)}>
                    <Icon className={cn("w-5 h-5", config.color)} />
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <h3 className={cn("text-sm font-semibold truncate", notification.isRead ? "text-slate-700" : "text-slate-900")}>
                                {notification.title}
                            </h3>
                            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{notification.message}</p>
                            <div className="flex items-center gap-3 mt-2">
                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatDate(notification.createdAt)}
                                </span>
                                {!notification.isRead && (
                                    <span className="px-2 py-0.5 text-[10px] font-medium bg-primary-100 text-primary-700 rounded-full">Nouveau</span>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!notification.isRead && (
                                <button onClick={() => onMarkRead(notification.id)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Marquer comme lu">
                                    <Check className="w-4 h-4" />
                                </button>
                            )}
                            {notification.link && (
                                <button onClick={() => onNavigate(notification.link!)} className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="Voir détails">
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            )}
                            <button onClick={() => onDelete(notification.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Supprimer">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {!notification.isRead && <div className="w-2.5 h-2.5 rounded-full bg-primary-500 flex-shrink-0 mt-1" />}
            </div>
        </div>
    );
}

const FILTER_OPTIONS: { value: FilterType; label: string; icon: React.ElementType }[] = [
    { value: "all", label: "Toutes", icon: Bell },
    { value: "unread", label: "Non lues", icon: Inbox },
    { value: "info", label: "Info", icon: Info },
    { value: "success", label: "Succès", icon: CheckCircle2 },
    { value: "warning", label: "Alertes", icon: AlertTriangle },
    { value: "error", label: "Erreurs", icon: XCircle },
];

export default function ManagerNotificationsPage() {
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [filter, setFilter] = useState<FilterType>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

    const filteredNotifications = useMemo(() => {
        return notifications.filter((n) => {
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                if (!n.title.toLowerCase().includes(query) && !n.message.toLowerCase().includes(query)) return false;
            }
            if (filter === "unread") return !n.isRead;
            if (["info", "success", "warning", "error"].includes(filter)) return n.type === filter;
            return true;
        });
    }, [notifications, filter, searchQuery]);

    const stats = useMemo(() => {
        const unread = notifications.filter((n) => !n.isRead).length;
        const today = notifications.filter((n) => new Date(n.createdAt).toDateString() === new Date().toDateString()).length;
        return {
            total: notifications.length,
            unread,
            today,
            readRate: notifications.length > 0 ? Math.round(((notifications.length - unread) / notifications.length) * 100) : 0,
        };
    }, [notifications]);

    const markAsRead = async (id: string) => {
        try {
            await fetch(`/api/notifications/${id}`, { method: "PATCH" });
            setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
        } catch (error) { console.error("Failed to mark as read", error); }
    };

    const markAllAsRead = async () => {
        try {
            await fetch("/api/notifications", { method: "PATCH" });
            setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        } catch (error) { console.error("Failed to mark all as read", error); }
    };

    const deleteNotification = async (id: string) => {
        try {
            await fetch(`/api/notifications/${id}`, { method: "DELETE" });
            setNotifications((prev) => prev.filter((n) => n.id !== id));
            setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
        } catch (error) { console.error("Failed to delete notification", error); }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
    };

    const selectAll = () => {
        setSelectedIds(selectedIds.size === filteredNotifications.length ? new Set() : new Set(filteredNotifications.map((n) => n.id)));
    };

    const markSelectedAsRead = async () => { for (const id of selectedIds) await markAsRead(id); setSelectedIds(new Set()); };
    const deleteSelected = async () => { for (const id of selectedIds) await deleteNotification(id); setSelectedIds(new Set()); };

    return (
        <div className="space-y-6 pb-10">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary-600 flex items-center justify-center">
                        <Bell className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
                        <p className="text-sm text-slate-500">Alertes et notifications reçues</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => loadNotifications(true)} className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors" title="Actualiser">
                        <RefreshCw className={cn("w-4 h-4 text-slate-500", isRefreshing && "animate-spin")} />
                    </button>
                    {stats.unread > 0 && <Button onClick={markAllAsRead} variant="secondary" className="gap-2"><CheckCheck className="w-4 h-4" />Tout marquer comme lu</Button>}
                </div>
            </div>

            <div className="grid grid-cols-4 gap-5">
                <StatCard icon={Bell} label="Total" value={stats.total} subValue="notifications" color="indigo" />
                <StatCard icon={Inbox} label="Non lues" value={stats.unread} subValue="à traiter" color="amber" />
                <StatCard icon={Clock} label="Aujourd'hui" value={stats.today} subValue="nouvelles" color="emerald" />
                <StatCard icon={CheckCircle2} label="Taux de lecture" value={`${stats.readRate}%`} subValue="consultées" color="blue" />
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="border-b border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1">
                            <div className="relative max-w-sm flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Rechercher..." className="pl-9 h-9 text-sm bg-slate-50 border-slate-200 focus:bg-white" />
                            </div>
                            <div className="flex items-center gap-1">
                                {FILTER_OPTIONS.map((opt) => (
                                    <button key={opt.value} onClick={() => setFilter(opt.value)} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all", filter === opt.value ? "bg-primary-100 text-primary-700 shadow-sm" : "text-slate-600 hover:bg-slate-100")}>
                                        <opt.icon className="w-3.5 h-3.5" />{opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {selectedIds.size > 0 && (
                            <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
                                <span className="text-sm text-slate-500">{selectedIds.size} sélectionnée(s)</span>
                                <button onClick={markSelectedAsRead} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Marquer comme lu"><Check className="w-4 h-4" /></button>
                                <button onClick={deleteSelected} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                                <button onClick={() => setSelectedIds(new Set())} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="Désélectionner"><X className="w-4 h-4" /></button>
                            </div>
                        )}
                    </div>
                    {filteredNotifications.length > 0 && (
                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                            <button onClick={selectAll} className={cn("w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors", selectedIds.size === filteredNotifications.length ? "bg-primary-500 border-primary-500 text-white" : selectedIds.size > 0 ? "bg-primary-100 border-primary-400" : "border-slate-300 hover:border-primary-400")}>
                                {selectedIds.size === filteredNotifications.length && <Check className="w-3 h-3" />}
                                {selectedIds.size > 0 && selectedIds.size < filteredNotifications.length && <div className="w-2 h-2 bg-primary-500 rounded-sm" />}
                            </button>
                            <span className="text-sm text-slate-500">{selectedIds.size === filteredNotifications.length ? "Tout désélectionner" : "Tout sélectionner"}</span>
                        </div>
                    )}
                </div>

                <div className="p-4">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Loader2 className="w-8 h-8 text-primary-500 animate-spin mb-3" />
                            <p className="text-sm text-slate-500">Chargement des notifications...</p>
                        </div>
                    ) : filteredNotifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><Bell className="w-8 h-8 text-slate-400" /></div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">{searchQuery || filter !== "all" ? "Aucun résultat" : "Aucune notification"}</h3>
                            <p className="text-sm text-slate-500 text-center max-w-sm">{searchQuery || filter !== "all" ? "Modifiez vos filtres pour voir plus de résultats" : "Vous êtes à jour ! Les nouvelles notifications apparaîtront ici"}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredNotifications.map((notification) => (
                                <NotificationCard key={notification.id} notification={notification} isSelected={selectedIds.has(notification.id)} onSelect={toggleSelect} onMarkRead={markAsRead} onDelete={deleteNotification} onNavigate={(link) => router.push(link)} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
