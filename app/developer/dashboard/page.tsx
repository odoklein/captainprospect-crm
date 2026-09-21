"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
    FolderKanban,
    CheckSquare,
    Mail,
    Inbox,
    LifeBuoy,
    MessageSquare,
    ArrowRight,
    TrendingUp,
    Clock,
    Sparkles,
    AlertCircle,
    Send,
} from "lucide-react";
import Link from "next/link";

interface Stats {
    projects: number;
    tasks: number;
    pendingTasks: number;
    emailAccounts: number;
    tickets?: number;
    pendingTickets?: number;
}

export default function DeveloperDashboard() {
    const { data: session } = useSession();
    const [stats, setStats] = useState<Stats>({
        projects: 0,
        tasks: 0,
        pendingTasks: 0,
        emailAccounts: 0,
        tickets: 0,
        pendingTickets: 0,
    });
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch("/api/developer/stats");
                const json = await res.json();
                if (json.success) {
                    setStats(json.data);
                }
            } catch (error) {
                console.error("Failed to fetch stats:", error);
            } finally {
                setIsLoaded(true);
            }
        };
        fetchStats();
    }, []);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Bonjour";
        if (hour < 18) return "Bon après-midi";
        return "Bonsoir";
    };

    const cards = [
        {
            title: "Projets actifs",
            value: stats.projects,
            icon: FolderKanban,
            href: "/developer/projects",
            gradient: "from-blue-500 to-blue-600",
            iconBg: "bg-blue-100",
            iconColor: "text-blue-600",
            description: "Projets en cours",
        },
        {
            title: "Mes tâches",
            value: stats.tasks,
            subtitle: `${stats.pendingTasks} en attente`,
            icon: CheckSquare,
            href: "/developer/tasks",
            gradient: "from-emerald-500 to-emerald-600",
            iconBg: "bg-emerald-100",
            iconColor: "text-emerald-600",
            description: "Total assignées",
        },
        {
            title: "Support Technique",
            value: stats.tickets ?? 0,
            subtitle: `${stats.pendingTickets ?? 0} ouverts`,
            icon: LifeBuoy,
            href: "/developer/tickets",
            gradient: "from-amber-500 to-amber-600",
            iconBg: "bg-amber-100",
            iconColor: "text-amber-600",
            description: "Tickets & bugs",
        },
        {
            title: "Mailbox",
            value: stats.emailAccounts,
            subtitle: "Boîte de réception",
            icon: Inbox,
            href: "/developer/mailbox",
            gradient: "from-violet-500 to-violet-600",
            iconBg: "bg-violet-100",
            iconColor: "text-violet-600",
            description: `${stats.emailAccounts} compte${stats.emailAccounts > 1 ? 's' : ''} lié${stats.emailAccounts > 1 ? 's' : ''}`,
        },
    ];

    const quickActions = [
        { label: "Ouvrir la Mailbox", href: "/developer/mailbox", icon: Inbox, desc: "Consulter vos messages et répondre" },
        { label: "Support Technique", href: "/developer/tickets", icon: LifeBuoy, desc: "Résoudre ou créer des tickets" },
        { label: "Nouveau projet", href: "/developer/projects", icon: FolderKanban, desc: "Consulter ou initier un projet" },
        { label: "Mes tâches", href: "/developer/tasks", icon: CheckSquare, desc: "Voir le Kanban et vos priorités" },
        { label: "Discussions d'équipe", href: "/developer/comms", icon: MessageSquare, desc: "Échanger avec vos collaborateurs" },
    ];

    return (
        <div className="space-y-8">
            {/* Premium Welcome Header */}
            <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-8 text-white">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIvPjwvc3ZnPg==')] opacity-50" />
                <div className="relative z-10">
                    <div className="flex items-center gap-2 text-blue-400 text-sm font-medium mb-2">
                        <Sparkles className="w-4 h-4" />
                        <span>Tableau de bord développeur</span>
                    </div>
                    <h1 className="text-3xl font-bold mb-2">
                        {getGreeting()}, {session?.user?.name?.split(" ")[0]} 👋
                    </h1>
                    <p className="text-slate-400 max-w-xl">
                        Bienvenue sur votre espace de travail. Voici un aperçu de vos projets et tâches en cours.
                    </p>
                </div>
                <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-10">
                    <Code2Icon className="w-40 h-40" />
                </div>
            </div>

            {/* Premium Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {cards.map((card, index) => (
                    <Link
                        key={card.title}
                        href={card.href}
                        className="dev-stat-card group"
                        style={{ animationDelay: `${index * 100}ms` }}
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className={`dev-stat-icon ${card.iconBg}`}>
                                <card.icon className={`w-6 h-6 ${card.iconColor}`} />
                            </div>
                            <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all duration-300" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-500 mb-1">{card.title}</p>
                            <p className={`text-4xl font-bold text-slate-900 dev-counter ${isLoaded ? 'animate-in' : ''}`}>
                                {stats.projects !== undefined ? card.value : '-'}
                            </p>
                            {card.subtitle ? (
                                <p className="text-sm text-slate-400 mt-1 flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    {card.subtitle}
                                </p>
                            ) : (
                                <p className="text-sm text-slate-400 mt-1">{card.description}</p>
                            )}
                        </div>
                    </Link>
                ))}
            </div>

            {/* Quick Actions with Premium Design */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Actions rapides</h2>
                        <p className="text-sm text-slate-500">Accédez rapidement à vos outils développeur</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {quickActions.map((action, index) => (
                        <Link
                            key={action.label}
                            href={action.href}
                            className="group flex items-start gap-4 p-4 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all duration-200"
                        >
                            <div className="w-11 h-11 rounded-xl bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors duration-200 flex-shrink-0">
                                <action.icon className="w-5 h-5 text-slate-500 group-hover:text-blue-600 transition-colors duration-200" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors duration-200">
                                    {action.label}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5 truncate">
                                    {action.desc}
                                </p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all duration-200 flex-shrink-0 mt-1" />
                        </Link>
                    ))}
                </div>
            </div>

            {/* Activity Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Activity Placeholder */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Activité récente</h2>
                    <div className="space-y-4">
                        {stats.pendingTasks > 0 ? (
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100">
                                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                                    <Clock className="w-4 h-4 text-amber-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-amber-800">
                                        {stats.pendingTasks} tâche{stats.pendingTasks > 1 ? 's' : ''} en attente
                                    </p>
                                    <p className="text-xs text-amber-600 mt-0.5">
                                        Consultez vos tâches pour voir les détails
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-emerald-800">Tout est à jour !</p>
                                    <p className="text-xs text-emerald-600 mt-0.5">
                                        Aucune tâche en attente
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Performance Metrics */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">Vue d'ensemble</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-100">
                            <div className="flex items-center gap-2 text-blue-600 mb-2">
                                <TrendingUp className="w-4 h-4" />
                                <span className="text-xs font-medium">Projets</span>
                            </div>
                            <p className="text-2xl font-bold text-slate-900">{stats.projects}</p>
                        </div>
                        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-100">
                            <div className="flex items-center gap-2 text-emerald-600 mb-2">
                                <CheckSquare className="w-4 h-4" />
                                <span className="text-xs font-medium">Tâches totales</span>
                            </div>
                            <p className="text-2xl font-bold text-slate-900">{stats.tasks}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Code2Icon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
        </svg>
    );
}
